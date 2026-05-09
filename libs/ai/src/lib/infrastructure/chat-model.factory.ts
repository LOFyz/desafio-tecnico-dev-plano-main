import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export function createChatModel(): LanguageModel {
  const provider = process.env['AI_PROVIDER'] ?? 'nvidia';
  const model = process.env['AI_MODEL'] ?? 'meta/llama-3.3-70b-instruct';
  const apiKey = process.env['AI_API_KEY'];
  const baseURL = process.env['AI_BASE_URL'];

  if (!apiKey) {
    throw new Error('AI_API_KEY is required to start the AI agent');
  }

  switch (provider) {
    case 'nvidia':
      // NVIDIA NIM exposes the OpenAI-compatible /chat/completions endpoint
      // but NOT /responses. The default `provider(model)` call uses the
      // Responses API; we explicitly pick `.chat()` so the request hits
      // /chat/completions where NVIDIA can answer.
      return createOpenAI({
        apiKey,
        baseURL: baseURL ?? NVIDIA_BASE_URL,
      }).chat(model);
    case 'openai':
      return createOpenAI({ apiKey, baseURL })(model);
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
