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
  HAIKU_4: 'claude-haiku-4-5-20251001',
} as const;

/**
 * Model aliases for convenience.
 */
export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4': CLAUDE_MODELS.OPUS_4,
  'claude-sonnet-4': CLAUDE_MODELS.SONNET_4,
  'claude-haiku-4': CLAUDE_MODELS.HAIKU_4,
  // Legacy alias
  'claude-haiku-3': CLAUDE_MODELS.HAIKU_4,
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

// Note: Token estimation moved to core/token-estimator.ts (unified TokenEstimator)

/**
 * Default maximum tokens for Claude models.
 */
export const DEFAULT_MAX_TOKENS = 4096;
