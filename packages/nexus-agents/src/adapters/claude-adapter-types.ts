/**
 * nexus-agents/adapters - Claude Adapter Types
 *
 * Type definitions and constants for the Claude/Anthropic adapter.
 *
 * @module adapters/claude-adapter-types
 */

import { getCliModelName } from '../config/model-config-helpers.js';

/**
 * Supported Claude model identifiers.
 *
 * Derived from `config/in-tree-data.ts` via `getCliModelName()` (which reads
 * the ModelRegistry — see `config/model-registry.ts`). Do not hardcode
 * model-version strings here; update the registry.
 */
export const CLAUDE_MODELS = {
  OPUS_4: getCliModelName('claude-opus'),
  SONNET_4: getCliModelName('claude-sonnet'),
  HAIKU_4: getCliModelName('claude-haiku'),
} as const;

/**
 * Legacy version-suffix aliases mapped to the current registry cliModelName.
 *
 * Values come from `CLAUDE_MODELS` so they stay in sync with the canonical
 * registry. Add legacy entries here, never the version strings themselves.
 */
export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4': CLAUDE_MODELS.OPUS_4,
  'claude-sonnet-4': CLAUDE_MODELS.SONNET_4,
  'claude-haiku-4': CLAUDE_MODELS.HAIKU_4,
  // Legacy alias — pre-4.x users routed to the current haiku.
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
