/**
 * nexus-agents/adapters - Claude Adapter Types
 *
 * Type definitions and constants for the Claude/Anthropic adapter.
 *
 * @module adapters/claude-adapter-types
 */

/**
 * Supported Claude model identifiers.
 */
export const CLAUDE_MODELS = {
  OPUS_4: 'claude-opus-4-20250514',
  SONNET_4: 'claude-sonnet-4-20250514',
  HAIKU_3: 'claude-3-haiku-20240307',
} as const;

/**
 * Model aliases for convenience.
 */
export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4': CLAUDE_MODELS.OPUS_4,
  'claude-sonnet-4': CLAUDE_MODELS.SONNET_4,
  'claude-haiku-3': CLAUDE_MODELS.HAIKU_3,
} as const;

/**
 * Configuration specific to ClaudeAdapter.
 */
export interface ClaudeAdapterConfig {
  /** Model ID (e.g., 'claude-sonnet-4' or full model identifier) */
  modelId: string;
  /** API key for Anthropic API (required) */
  apiKey: string;
  /** Base URL for API (optional, defaults to Anthropic's API) */
  baseUrl?: string;
  /** Request timeout in milliseconds (optional) */
  timeout?: number;
  /** Maximum retries for failed requests (optional) */
  maxRetries?: number;
}

/**
 * Characters per token estimate for Claude models.
 * Claude uses a custom tokenizer, but ~3.5 chars/token is a reasonable estimate
 * for English text.
 * (Source: Anthropic documentation on token counting)
 */
export const CLAUDE_CHARS_PER_TOKEN = 3.5;

/**
 * Default maximum tokens for Claude models.
 */
export const DEFAULT_MAX_TOKENS = 4096;
