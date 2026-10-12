import type { ResourceAnalysis } from '../../schemas/resource.schemas.js';
export type ResourceAnalysisInput = { sourceType: 'url' | 'document'; url?: string; filename?: string; mimeType?: string; extracted: { title?: string; description?: string; author?: string; sourcePlatform?: string; canonicalUrl?: string; faviconUrl?: string; thumbnailUrl?: string; text?: string; status: 'SUCCESS'|'PARTIAL'|'FAILED' } };
export type AIResult = { analysis: ResourceAnalysis; provider: string; model: string; fallbackUsed: boolean };
export interface AIProvider { readonly id: string; isConfigured(): boolean; analyzeResource(input: ResourceAnalysisInput): Promise<{ analysis: ResourceAnalysis; model: string }>; }
export class AIProviderError extends Error { constructor(public type: 'RATE_LIMIT'|'QUOTA_EXCEEDED'|'AUTHENTICATION_ERROR'|'INVALID_REQUEST'|'MODEL_UNAVAILABLE'|'TIMEOUT'|'PROVIDER_ERROR'|'INVALID_RESPONSE'|'UNKNOWN', message: string) { super(message); } }
