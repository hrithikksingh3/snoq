import { Readable } from 'node:stream';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rate-limits.js';
import { saveResourceSchema, urlSchema } from '../schemas/resource.schemas.js';
import { assertPublicHttpUrl, extractUrl, normalizeUrl } from '../services/url-extractor.service.js';
import { aiService } from '../providers/ai/ai.service.js';
import { resourceService } from '../services/resource.service.js';
import { uploadDocument } from '../services/cloudinary.service.js';
import { validateDocumentUpload } from '../services/upload-validation.service.js';
import { prisma } from '../lib/prisma.js';
import { consumeAiCredit, creditStatus } from '../services/billing.service.js';

const idSchema = z.string().cuid();
const resourceQuerySchema = z.object({
  search: z.string().trim().max(200).optional(), category: z.string().trim().max(80).optional(), type: z.string().trim().max(100).optional(),
  kind: z.enum(['URL', 'DOCUMENT']).optional(), favorite: z.enum(['true', 'false']).optional(), archived: z.enum(['true', 'false']).optional(),
  list: z.string().cuid().optional(), sort: z.enum(['newest', 'oldest', 'title', 'updated', 'favorites']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(), limit: z.coerce.number().int().min(6).max(48).optional(),
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

function format(result: Awaited<ReturnType<typeof aiService.analyzeResource>>) {
  return { analysis: result.analysis, ai: { status: result.fallbackUsed ? 'FALLBACK_USED' : 'SUCCESS', provider: result.provider, model: result.model, fallbackUsed: result.fallbackUsed } };
}

function fallbackDocumentAnalysis(file: Express.Multer.File) {
  return { analysis: { title: file.originalname.replace(/\.[^.]+$/, ''), description: null, resourceType: 'Document', categories: [], subcategories: [], tags: [], topics: [], capabilities: [], useCases: [], targetAudience: [], sourcePlatform: null, author: null, language: null, isAITool: false, aiCapabilities: [], summary: null, keywords: [] }, ai: { status: 'FAILED', provider: null, model: null, fallbackUsed: false }, document: { originalFilename: file.originalname, mimeType: file.mimetype, size: file.size } };
}

function parseMultipartPayload(value: unknown) {
  try { return JSON.parse(String(value ?? '{}')); } catch { throw Object.assign(new Error('The document details are not valid JSON'), { status: 400 }); }
}

async function streamDocument(req: Parameters<typeof resourceService.getDocument>[0], id: string, disposition: 'inline' | 'attachment', res: import('express').Response) {
  const resource = await resourceService.getDocument(req, id);
  if (!resource?.document) throw Object.assign(new Error('Document not found'), { status: 404 });
  const remote = await fetch(resource.document.secureUrl, { signal: AbortSignal.timeout(20_000) });
  if (!remote.ok || !remote.body) throw Object.assign(new Error('Document preview is temporarily unavailable'), { status: 502 });
  const filename = resource.document.originalFilename.replace(/[\r\n"\\]/g, '_');
  res.setHeader('content-type', resource.document.mimeType);
  res.setHeader('content-disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  Readable.fromWeb(remote.body as never).pipe(res);
}

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);

resourcesRouter.get('/', async (req, res) => res.json(await resourceService.list(req.auth!.userId, resourceQuerySchema.parse(req.query))));
resourcesRouter.get('/:id', async (req, res) => {
  const resource = await resourceService.get(req.auth!.userId, idSchema.parse(req.params.id));
  if (!resource) return res.status(404).json({ message: 'Resource not found' });
  return res.json({ resource });
});
resourcesRouter.get('/:id/document/view', async (req, res) => streamDocument(req.auth!.userId, idSchema.parse(req.params.id), 'inline', res));
resourcesRouter.get('/:id/document/download', async (req, res) => streamDocument(req.auth!.userId, idSchema.parse(req.params.id), 'attachment', res));

resourcesRouter.post('/', upload.single('file'), async (req, res) => {
  const body = req.file ? parseMultipartPayload(req.body.payload) : req.body;
  const data = saveResourceSchema.parse(body);
  if (data.kind === 'URL') {
    if (!data.url) throw Object.assign(new Error('A URL resource needs a source URL'), { status: 400 });
    await assertPublicHttpUrl(data.url);
    data.normalizedUrl = normalizeUrl(data.url);
  }
  if (data.kind === 'DOCUMENT') {
    const file = req.file;
    if (!file) throw Object.assign(new Error('Choose a document before saving'), { status: 400 });
    validateDocumentUpload(file);
    const document = await uploadDocument(file.buffer, file.originalname, file.mimetype);
    data.document = { cloudinaryPublicId: document.publicId, secureUrl: document.secureUrl, originalFilename: file.originalname, mimeType: file.mimetype, size: file.size };
  }
  const resource = await resourceService.save(req.auth!.userId, data);
  res.status(201).json({ resource });
});
resourcesRouter.patch('/:id', async (req, res) => res.json({ resource: await resourceService.update(req.auth!.userId, idSchema.parse(req.params.id), saveResourceSchema.partial().parse(req.body)) }));
resourcesRouter.delete('/:id', async (req, res) => { await resourceService.remove(req.auth!.userId, idSchema.parse(req.params.id)); res.status(204).send(); });
resourcesRouter.post('/:id/favorite', async (req, res) => res.json({ resource: await resourceService.action(req.auth!.userId, idSchema.parse(req.params.id), 'favorite') }));
resourcesRouter.post('/:id/archive', async (req, res) => res.json({ resource: await resourceService.action(req.auth!.userId, idSchema.parse(req.params.id), 'archive') }));
resourcesRouter.post('/:id/restore', async (req, res) => res.json({ resource: await resourceService.action(req.auth!.userId, idSchema.parse(req.params.id), 'restore') }));

resourcesRouter.post('/analyze-url', aiLimiter, async (req, res) => {
  const { url } = urlSchema.parse(req.body);
  const normalizedUrl = normalizeUrl(url);
  await assertPublicHttpUrl(normalizedUrl);
  const duplicate = await prisma.resource.findFirst({ where: { userId: req.auth!.userId, normalizedUrl }, select: { id: true } });
  if (duplicate) return res.status(409).json({ message: 'This resource already exists in your vault', resourceId: duplicate.id });
  const allowance = await creditStatus(req.auth!.userId);
  if (!allowance.remaining) return res.status(402).json({ message: `Your ${allowance.plan.name} plan has no AI assists remaining. Choose a plan to continue.`, usage: allowance });
  const extraction = await extractUrl(normalizedUrl);
  try {
    const result = await aiService.analyzeResource({ sourceType: 'url', url: normalizedUrl, extracted: extraction });
    const usage = await consumeAiCredit(req.auth!.userId);
    return res.json({ ...format(result), usage, extraction: { status: extraction.status }, source: { url, normalizedUrl, thumbnailUrl: extraction.thumbnailUrl, faviconUrl: extraction.faviconUrl } });
  } catch {
    return res.json({ analysis: { title: extraction.title || 'Untitled resource', description: extraction.description || null, resourceType: 'Website', categories: [], subcategories: [], tags: [], topics: [], capabilities: [], useCases: [], targetAudience: [], sourcePlatform: extraction.sourcePlatform || null, author: extraction.author || null, language: null, isAITool: false, aiCapabilities: [], summary: null, keywords: [] }, ai: { status: 'FAILED', provider: null, model: null, fallbackUsed: false }, extraction: { status: extraction.status }, source: { url, normalizedUrl, thumbnailUrl: extraction.thumbnailUrl, faviconUrl: extraction.faviconUrl } });
  }
});

resourcesRouter.post('/analyze-document', aiLimiter, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'A supported document is required' });
  validateDocumentUpload(file);
  const allowance = await creditStatus(req.auth!.userId);
  if (!allowance.remaining) return res.status(402).json({ message: `Your ${allowance.plan.name} plan has no AI assists remaining. Choose a plan to continue.`, usage: allowance });
  const text = /^(text\/|application\/(json|csv))/.test(file.mimetype) ? file.buffer.toString('utf8', 0, 12_000) : undefined;
  try {
    const result = await aiService.analyzeResource({ sourceType: 'document', filename: file.originalname, mimeType: file.mimetype, extracted: { title: file.originalname.replace(/\.[^.]+$/, ''), text, status: text ? 'SUCCESS' : 'PARTIAL' } });
    const usage = await consumeAiCredit(req.auth!.userId);
    return res.json({ ...format(result), usage, document: { originalFilename: file.originalname, mimeType: file.mimetype, size: file.size } });
  } catch { return res.json(fallbackDocumentAnalysis(file)); }
});
