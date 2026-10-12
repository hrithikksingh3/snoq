import crypto from 'node:crypto';
import { Prisma, ResourceKind } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { ResourceAnalysis } from '../schemas/resource.schemas.js';

type Saved = ResourceAnalysis & { kind: 'URL' | 'DOCUMENT'; url?: string | null; normalizedUrl?: string | null; thumbnailUrl?: string | null; faviconUrl?: string | null; isFavorite?: boolean; listIds?: string[]; document?: { cloudinaryPublicId: string; secureUrl: string; originalFilename: string; mimeType: string; size: number }; provenance?: { provider: string | null; model: string | null; primaryProvider: string | null; fallbackProvider: string | null; status: 'SUCCESS' | 'FAILED' | 'MANUAL' } };
const include = { categories: { include: { category: true } }, tags: { include: { tag: true } }, document: { select: { originalFilename: true, mimeType: true, size: true } }, analysis: true, lists: { include: { list: true } } } satisfies Prisma.ResourceInclude;
const clean = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean).map((value) => value.slice(0, 80)))];

async function verifiedListIds(userId: string, listIds: string[] = []) {
  const ids = [...new Set(listIds)];
  if (!ids.length) return ids;
  const count = await prisma.resourceList.count({ where: { userId, id: { in: ids } } });
  if (count !== ids.length) throw Object.assign(new Error('One or more selected lists are unavailable'), { status: 400 });
  return ids;
}

export const resourceService = {
  async list(userId: string, query: { search?: string; category?: string; type?: string; kind?: string; favorite?: string; archived?: string; list?: string; sort?: string; page?: string | number; limit?: string | number }) {
    const archived = query.archived === 'true';
    const where: Prisma.ResourceWhereInput = { userId, archivedAt: archived ? { not: null } : null };
    if (query.type) where.resourceType = query.type;
    if (query.kind === 'URL' || query.kind === 'DOCUMENT') where.kind = query.kind;
    if (query.favorite === 'true') where.isFavorite = true;
    if (query.category) where.categories = { some: { category: { name: query.category } } };
    if (query.list) where.lists = { some: { listId: query.list } };
    if (query.search) { const q = query.search; where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { tags: { some: { tag: { name: { contains: q, mode: 'insensitive' } } } } }, { categories: { some: { category: { name: { contains: q, mode: 'insensitive' } } } } }]; }
    const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(48, Math.max(6, Number.parseInt(String(query.limit ?? '18'), 10) || 18));
    const orderBy: Prisma.ResourceOrderByWithRelationInput[] = query.sort === 'oldest'
      ? [{ createdAt: 'asc' }]
      : query.sort === 'title'
        ? [{ title: 'asc' }, { createdAt: 'desc' }]
        : query.sort === 'updated'
          ? [{ updatedAt: 'desc' }]
          : query.sort === 'favorites'
            ? [{ isFavorite: 'desc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];
    const [resources, total] = await prisma.$transaction([
      prisma.resource.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.resource.count({ where }),
    ]);
    return { resources, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  },

  async get(userId: string, id: string) { return prisma.resource.findFirst({ where: { id, userId }, include }); },
  async getDocument(userId: string, id: string) { return prisma.resource.findFirst({ where: { id, userId }, select: { document: { select: { secureUrl: true, originalFilename: true, mimeType: true } } } }); },

  async save(userId: string, data: Saved) {
    if (data.normalizedUrl) { const existing = await prisma.resource.findFirst({ where: { userId, normalizedUrl: data.normalizedUrl } }); if (existing) throw Object.assign(new Error('This resource already exists in your vault'), { status: 409, resourceId: existing.id }); }
    const categoryNames = clean(data.categories); const tagNames = clean([...data.tags, ...data.topics, ...data.keywords]); const listIds = await verifiedListIds(userId, data.listIds);
    return prisma.resource.create({ data: { userId, kind: data.kind as ResourceKind, title: data.title, description: data.description, url: data.url, normalizedUrl: data.normalizedUrl, resourceType: data.resourceType, sourcePlatform: data.sourcePlatform, summary: data.summary, author: data.author, thumbnailUrl: data.thumbnailUrl, faviconUrl: data.faviconUrl, language: data.language, isAITool: data.isAITool, lastAnalyzedAt: data.provenance?.status === 'SUCCESS' ? new Date() : undefined, categories: { create: categoryNames.map((name) => ({ category: { connectOrCreate: { where: { name }, create: { name } } } })) }, tags: { create: tagNames.map((name) => ({ tag: { connectOrCreate: { where: { name }, create: { name } } } })) }, lists: { create: listIds.map((listId) => ({ list: { connect: { id: listId } } })) }, document: data.document ? { create: { cloudinaryPublicId: data.document.cloudinaryPublicId, secureUrl: data.document.secureUrl, originalFilename: data.document.originalFilename, mimeType: data.document.mimeType, size: data.document.size } } : undefined, analysis: data.provenance ? { create: { provider: data.provenance.provider, model: data.provenance.model, primaryProvider: data.provenance.primaryProvider, fallbackProvider: data.provenance.fallbackProvider, status: data.provenance.status, sourceType: data.kind, result: data as unknown as Prisma.InputJsonValue } } : undefined }, include });
  },

  async update(userId: string, id: string, data: Partial<Saved>) {
    const exists = await this.get(userId, id); if (!exists) throw Object.assign(new Error('Resource not found'), { status: 404 });
    const categories = data.categories ? clean(data.categories) : undefined; const tags = data.tags ? clean([...data.tags, ...(data.topics ?? []), ...(data.keywords ?? [])]) : undefined; const listIds = data.listIds ? await verifiedListIds(userId, data.listIds) : undefined;
    return prisma.resource.update({ where: { id }, data: { title: data.title, description: data.description, resourceType: data.resourceType, sourcePlatform: data.sourcePlatform, summary: data.summary, author: data.author, language: data.language, isAITool: data.isAITool, isFavorite: data.isFavorite, categories: categories ? { deleteMany: {}, create: categories.map((name) => ({ category: { connectOrCreate: { where: { name }, create: { name } } } })) } : undefined, tags: tags ? { deleteMany: {}, create: tags.map((name) => ({ tag: { connectOrCreate: { where: { name }, create: { name } } } })) } : undefined, lists: listIds ? { deleteMany: {}, create: listIds.map((listId) => ({ list: { connect: { id: listId } } })) } : undefined }, include });
  },

  async action(userId: string, id: string, action: 'favorite' | 'archive' | 'restore') { const exists = await this.get(userId, id); if (!exists) throw Object.assign(new Error('Resource not found'), { status: 404 }); return prisma.resource.update({ where: { id }, data: action === 'favorite' ? { isFavorite: !exists.isFavorite } : { archivedAt: action === 'archive' ? new Date() : null }, include }); },
  async remove(userId: string, id: string) { const result = await prisma.resource.deleteMany({ where: { id, userId } }); if (!result.count) throw Object.assign(new Error('Resource not found'), { status: 404 }); },
  async dashboard(userId: string) {
    const active = { userId, archivedAt: null };
    const [resources, documents, favorites, categorizedResources, recent] = await Promise.all([
      prisma.resource.count({ where: active }),
      prisma.resource.count({ where: { ...active, kind: 'DOCUMENT' } }),
      prisma.resource.count({ where: { ...active, isFavorite: true } }),
      prisma.resource.findMany({ where: active, select: { categories: { orderBy: { categoryId: 'asc' }, take: 1, select: { category: { select: { name: true } } } } } }),
      prisma.resource.findMany({ where: active, include, take: 6, orderBy: { createdAt: 'desc' } }),
    ]);
    const distribution = new Map<string, number>();
    for (const resource of categorizedResources) {
      const name = resource.categories[0]?.category.name ?? 'Uncategorized';
      distribution.set(name, (distribution.get(name) ?? 0) + 1);
    }
    const categoryDistribution = [...distribution.entries()].sort(([, a], [, b]) => b - a).slice(0, 6).map(([name, value]) => ({ name, value }));
    return { stats: { resources, documents, favorites, categories: categoryDistribution.length }, categoryDistribution, recent };
  },
  contentHash(buffer: Buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); },
};
