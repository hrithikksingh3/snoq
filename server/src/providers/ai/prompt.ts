import type { ResourceAnalysisInput } from './types.js';

export function resourcePrompt(input: ResourceAnalysisInput) {
  return `Analyze this ${input.sourceType} for a personal resource vault. Return ONLY a concise valid JSON object with these fields: {"title":string,"description":string|null,"resourceType":"AI Tool"|"Website"|"Developer Tool"|"Documentation"|"Article"|"Video"|"Course"|"GitHub Repository"|"Dataset"|"PDF"|"Document"|"Template"|"Design Resource"|"Automation"|"Career Resource"|"Other","categories":string[],"tags":string[],"sourcePlatform":string|null,"author":string|null,"summary":string|null,"keywords":string[]}. Use empty arrays or null when unknown. Do not add markdown or explanations.\nSOURCE CONTEXT:\n${JSON.stringify(input).slice(0, 12000)}`;
}
