import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export function createChatModel(): BaseChatModel {
  const provider = process.env['AI_PROVIDER'] ?? 'nvidia';
  const model = process.env['AI_MODEL'] ?? 'meta/llama-3.3-70b-instruct';
  const apiKey = process.env['AI_API_KEY'];
  const baseURL = process.env['AI_BASE_URL'];

  if (!apiKey) {
    throw new Error('AI_API_KEY is required to start the AI agent');
  }

  switch (provider) {
    case 'nvidia':
      return new ChatOpenAI({
        apiKey,
        model,
        configuration: { baseURL: baseURL ?? NVIDIA_BASE_URL },
      });
    case 'openai':
      return new ChatOpenAI({
        apiKey,
        model,
        configuration: baseURL ? { baseURL } : undefined,
      });
    case 'anthropic':
      return new ChatAnthropic({ apiKey, model });
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
