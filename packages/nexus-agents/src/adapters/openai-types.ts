/**
 * nexus-agents/adapters - OpenAI Type Helpers
 *
 * Type definitions and constants for the OpenAI direct-API SDK adapter.
 *
 * **Architectural boundary (#2200 Child 3):** these constants do NOT live
 * in `config/in-tree-data.ts`. The canonical registry's `cliName`
 * dimension targets CLI tools (`claude` / `gemini` / `codex` / `opencode`)
 * — there is no `openai` CLI binary. Adding `'openai'` to the CLI_NAMES
 * enum would force a fifth case in 4+ exhaustive switches across the
 * codebase, violating the semantic of "CLI tool name."
 *
 * The OpenAI direct adapter is conceptually different from CLI adapters:
 * it talks to the OpenAI HTTPS API directly, not via a subprocess CLI.
 * Its model identifiers are OpenAI's own (`gpt-4o-2024-11-20`,
 * `gpt-3.5-turbo-0125`, etc.) — these are upstream API constants, not
 * versions WE chose. They drift only when OpenAI ships new dated releases.
 *
 * This file is the single source of truth for OpenAI direct-API model
 * identifiers. The model-string drift fitness-guard (#2199) treats it as
 * a documented architectural exception in the allowlist.
 */

import type { ModelCapability } from '../core/index.js';
import { ModelCapability as MC } from '../core/index.js';
import { getCliModelName } from '../config/model-config-helpers.js';

/**
 * Supported OpenAI direct-API model identifiers (OpenAI's own dated names).
 *
 * GPT_5_2_CODEX derives from the canonical registry (codex-5.2's cliModelName)
 * because it overlaps with the Codex CLI; the rest are pure-API constants.
 * Since #5091 that entry points at `gpt-5.3-codex-spark` (codex no longer
 * serves gpt-5.2-codex), so the key's name lags its value; renaming the key is
 * a public-API change and is tracked separately.
 */
export const OPENAI_MODELS = {
  GPT_5_2: 'gpt-5.2',
  GPT_5_2_INSTANT: 'gpt-5.2-chat-latest',
  GPT_5_2_PRO: 'gpt-5.2-pro',
  /**
   * Registry-derived: resolves to `codex-5.2`'s `cliModelName`, which since
   * #5091 is `gpt-5.3-codex-spark`, not a "5.2" model. The key name lags its
   * value; renaming it is a public-API change tracked in #5489.
   */
  GPT_5_2_CODEX: getCliModelName('codex-5.2'),
  GPT_4O: 'gpt-4o-2024-11-20',
  GPT_4O_MINI: 'gpt-4o-mini-2024-07-18',
  GPT_4_TURBO: 'gpt-4-turbo-2024-04-09',
  GPT_35_TURBO: 'gpt-3.5-turbo-0125',
} as const;

/**
 * User-friendly OpenAI aliases → dated model identifiers.
 *
 * Identity-only mappings (e.g., `'gpt-5.2-pro' → 'gpt-5.2-pro'`) were
 * removed in #2200 Child 3 — `resolveModelId` already passes unknown ids
 * through unchanged via `?? modelId`. Only entries that translate a
 * shorthand into a dated version remain.
 */
export const OPENAI_MODEL_ALIASES: Record<string, string> = {
  'gpt-5.2-instant': OPENAI_MODELS.GPT_5_2_INSTANT,
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

// Note: Token estimation moved to core/token-estimator.ts (unified TokenEstimator)

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
