import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { userExportLimiter } from '../middleware/rate-limits.js';
import { sendVaultExportEmail } from '../services/mail.service.js';
import { buildVaultExcel, buildVaultPdf, collectVaultExport, type ExportScope, vaultExportLimits } from '../services/vault-export.service.js';
import { ensureEntitlement } from '../services/billing.service.js';

const scopeSchema = z.object({
  scope: z.enum(['VAULT', 'LIST']).default('VAULT'),
  listId: z.string().cuid().optional(),
}).superRefine((value, context) => {
  if (value.scope === 'LIST' && !value.listId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['listId'], message: 'Choose a list to export' });
});

function readScope(input: unknown): ExportScope {
  const parsed = scopeSchema.parse(input);
  return parsed.scope === 'LIST' ? { kind: 'LIST', listId: parsed.listId! } : { kind: 'VAULT' };
}

function reportName(scope: ExportScope, extension: 'pdf' | 'xlsx') {
  return `snoq-${scope.kind === 'LIST' ? 'list' : 'vault'}-export.${extension}`;
}

export const exportsRouter = Router();
exportsRouter.use(requireAuth, userExportLimiter);
exportsRouter.use(async (req, _res, next) => {
  const entitlement = await ensureEntitlement(req.auth!.userId);
  if (entitlement.plan.priceInr <= 0 || !entitlement.plan.reportExportsEnabled) return next(Object.assign(new Error(`Upgrade your plan to use PDF, Excel, and emailed reports. Reports are not available on the ${entitlement.plan.name} plan.`), { status: 402 }));
  next();
});

exportsRouter.get('/download/:format', async (req, res) => {
  const format = z.enum(['pdf', 'xlsx']).parse(req.params.format);
  const scope = readScope(req.query);
  const data = await collectVaultExport(req.auth!.userId, scope, format === 'pdf' ? vaultExportLimits.pdf : vaultExportLimits.excel);
  res.set({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="${reportName(scope, format)}"`,
  });
  if (format === 'xlsx') {
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await buildVaultExcel(data));
    return;
  }
  res.type('application/pdf').send(await buildVaultPdf(data));
});

exportsRouter.post('/email', async (req, res) => {
  const scope = readScope(req.body);
  const format = z.object({ format: z.enum(['pdf', 'xlsx']) }).parse(req.body).format;
  const data = await collectVaultExport(req.auth!.userId, scope, format === 'pdf' ? vaultExportLimits.pdf : vaultExportLimits.excel);
  const attachment = format === 'pdf' ? await buildVaultPdf(data) : await buildVaultExcel(data);
  await sendVaultExportEmail(data.owner.email, {
    recipientName: data.owner.name,
    collectionName: data.title,
    resourceCount: data.resourceTotal,
    scope: data.scope,
    format,
    attachment,
  });
  res.json({ message: `Your private ${format === 'pdf' ? 'PDF' : 'Excel'} report has been emailed to your account address.` });
});
