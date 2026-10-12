import { z } from 'zod';
const httpUrl = z.string().url().refine(value => /^https?:\/\//i.test(value), 'Only HTTP(S) URLs are allowed');
export const resourceTypes = ['AI Tool','Website','Developer Tool','Documentation','Article','Video','Course','GitHub Repository','Dataset','PDF','Document','Template','Design Resource','Automation','Career Resource','Other'] as const;
export const analysisSchema = z.object({
  title: z.string().trim().max(300).default('Untitled resource'), description: z.string().trim().max(5000).nullable().default(null),
  resourceType: z.string().trim().min(1).max(100).default('Other'), categories: z.array(z.string().trim().min(1).max(80)).max(8).default([]), subcategories: z.array(z.string().trim().max(80)).max(8).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).max(16).default([]), topics: z.array(z.string().trim().max(80)).max(12).default([]), capabilities: z.array(z.string().trim().max(160)).max(12).default([]), useCases: z.array(z.string().trim().max(160)).max(12).default([]),
  targetAudience: z.array(z.string().trim().max(80)).max(8).default([]), sourcePlatform: z.string().trim().max(100).nullable().default(null), author: z.string().trim().max(160).nullable().default(null), language: z.string().trim().max(50).nullable().default(null),
  isAITool: z.boolean().default(false), aiCapabilities: z.array(z.string().trim().max(160)).max(12).default([]), summary: z.string().trim().max(3000).nullable().default(null), keywords: z.array(z.string().trim().max(80)).max(20).default([])
});
export type ResourceAnalysis = z.infer<typeof analysisSchema>;
export const saveResourceSchema = analysisSchema.extend({ kind: z.enum(['URL','DOCUMENT']), url: httpUrl.optional().nullable(), normalizedUrl: httpUrl.optional().nullable(), thumbnailUrl: httpUrl.optional().nullable(), faviconUrl: httpUrl.optional().nullable(), document: z.object({ cloudinaryPublicId:z.string(), secureUrl:httpUrl, originalFilename:z.string(), mimeType:z.string(), size:z.number().int().nonnegative() }).optional(), listIds:z.array(z.string().cuid()).max(20).default([]), provenance: z.object({ provider:z.string().nullable(), model:z.string().nullable(), primaryProvider:z.string().nullable(), fallbackProvider:z.string().nullable(), status:z.enum(['SUCCESS','FAILED','MANUAL']) }).optional() });
export const urlSchema = z.object({ url: httpUrl });
