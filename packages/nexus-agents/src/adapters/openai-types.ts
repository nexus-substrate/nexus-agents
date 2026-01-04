/**
 * nexus-agents/adapters - OpenAI Type Helpers
 *
 * Type definitions and constants for OpenAI adapter.
 */

import type { ModelCapability } from '../core/index.js';
import { ModelCapability as MC } from '../core/index.js';

/**
 * Supported OpenAI model identifiers.
 */
export const OPENAI_MODELS = {
  GPT_5_2: 'gpt-5.2',
  GPT_5_2_INSTANT: 'gpt-5.2-chat-latest',
  GPT_5_2_PRO: 'gpt-5.2-pro',
  GPT_5_2_CODEX: 'gpt-5.2-codex',
  GPT_4O: 'gpt-4o-2024-11-20',
  GPT_4O_MINI: 'gpt-4o-mini-2024-07-18',
  GPT_4_TURBO: 'gpt-4-turbo-2024-04-09',
  GPT_35_TURBO: 'gpt-3.5-turbo-0125',
} as const;

/**
 * Model aliases for convenience.
 */
export const OPENAI_MODEL_ALIASES: Record<string, string> = {
  // GPT-5.2 aliases
  'gpt-5.2': OPENAI_MODELS.GPT_5_2,
  'gpt-5.2-instant': OPENAI_MODELS.GPT_5_2_INSTANT,
  'gpt-5.2-chat-latest': OPENAI_MODELS.GPT_5_2_INSTANT,
  'gpt-5.2-pro': OPENAI_MODELS.GPT_5_2_PRO,
  'gpt-5.2-codex': OPENAI_MODELS.GPT_5_2_CODEX,
  // GPT-4o aliases
  'gpt-4o': OPENAI_MODELS.GPT_4O,
  'gpt-4o-mini': OPENAI_MODELS.GPT_4O_MINI,
  'gpt-4-turbo': OPENAI_MODELS.GPT_4_TURBO,
  'gpt-3.5-turbo': OPENAI_MODELS.GPT_35_TURBO,
} as const;

/**
 * Configuration specific to OpenAIAdapter.
 */
export interface OpenAIAdapterConfig {
  /** Model ID (e.g., 'gpt-4o' or full model identifier) */
  modelId: string;
  /** API key for OpenAI API (required) */
  apiKey: string;
  /** Base URL for API (optional, defaults to OpenAI's API) */
  baseUrl?: string;
  /** Request timeout in milliseconds (optional) */
  timeout?: number;
  /** Maximum retries for failed requests (optional) */
  maxRetries?: number;
  /** Organization ID (optional) */
  organization?: string;
}

/**
 * Characters per token estimate for OpenAI models.
 * ~4 chars/token is the standard estimate for English text.
 * (Source: OpenAI documentation on tokenization)
 */
export const OPENAI_CHARS_PER_TOKEN = 4;

/**
 * Default maximum tokens for OpenAI models.
 */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Tool call type for extracting function info.
 */
export interface FunctionToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Type guard for function tool calls.
 * Note: typeof null === 'object' is true, so we need to check tc !== null
 */
export function isFunctionToolCall(toolCall: unknown): toolCall is FunctionToolCall {
  if (typeof toolCall !== 'object' || toolCall === null) {
    return false;
  }
  const tc = toolCall as Record<string, unknown>;
  return tc['type'] === 'function' && typeof tc['function'] === 'object' && tc['function'] !== null;
}

/**
 * Resolves model alias to full model identifier.
 */
export function resolveModelId(modelId: string): string {
  return OPENAI_MODEL_ALIASES[modelId] ?? modelId;
}

/**
 * Determines capabilities based on model ID.
 */
export function getModelCapabilities(modelId: string): readonly ModelCapability[] {
  const capabilities: ModelCapability[] = [MC.COMPLETION, MC.STREAMING, MC.TOOL_USE];

  const resolvedId = resolveModelId(modelId);

  // Vision is available on GPT-4o, GPT-4-turbo, and GPT-5.2 models
  if (
    resolvedId.includes('gpt-4o') ||
    resolvedId.includes('gpt-4-turbo') ||
    resolvedId.includes('gpt-5.2')
  ) {
    capabilities.push(MC.VISION);
  }

  // Extended thinking is available on GPT-5.2 models
  if (resolvedId.includes('gpt-5.2')) {
    capabilities.push(MC.EXTENDED_THINKING);
  }

  return capabilities;
}
