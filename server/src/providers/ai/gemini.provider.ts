import { ZodError } from 'zod';
import { env } from '../../config/env.js';
import { analysisSchema } from '../../schemas/resource.schemas.js';
import { resourcePrompt } from './prompt.js';
import { AIProviderError, type AIProvider, type ResourceAnalysisInput } from './types.js';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';

  isConfigured() { return Boolean(env.GEMINI_API_KEY); }

  async analyzeResource(input: ResourceAnalysisInput) {
    if (!this.isConfigured()) throw new AIProviderError('AUTHENTICATION_ERROR', 'Gemini is not configured');
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: resourcePrompt(input) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw classify(await response.text(), response.status);
      const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new AIProviderError('INVALID_RESPONSE', 'Gemini returned no content');
      return { analysis: analysisSchema.parse(JSON.parse(text)), model: env.GEMINI_MODEL };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof SyntaxError || error instanceof ZodError) throw new AIProviderError('INVALID_RESPONSE', 'Gemini returned an invalid analysis');
      if (error instanceof DOMException && error.name === 'TimeoutError') throw new AIProviderError('TIMEOUT', 'Gemini timed out');
      throw new AIProviderError('PROVIDER_ERROR', 'Gemini unavailable');
    }
  }
}

function classify(body: string, status: number) {
  const value = body.toLowerCase();
  if (status === 429 && value.includes('quota')) return new AIProviderError('QUOTA_EXCEEDED', 'Gemini quota exceeded');
  if (status === 429) return new AIProviderError('RATE_LIMIT', 'Gemini rate limited');
  if (status === 401 || status === 403) return new AIProviderError('AUTHENTICATION_ERROR', 'Gemini authentication failed');
  if (status === 404) return new AIProviderError('MODEL_UNAVAILABLE', 'The configured Gemini model is unavailable');
  if (status >= 500) return new AIProviderError('PROVIDER_ERROR', 'Gemini unavailable');
  return new AIProviderError('INVALID_REQUEST', 'Gemini rejected the request');
}
