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

import type { ILogger, ModelCapability } from '../core/index.js';
import { ModelCapability as MC } from '../core/index.js';
import { getCliModelName } from '../config/model-config-helpers.js';

/**
 * Supported OpenAI direct-API model identifiers (OpenAI's own dated names).
 *
 * GPT_5_2_CODEX derives from the canonical registry (codex-5.2's cliModelName)
 * because it overlaps with the Codex CLI; the rest are pure-API constants.
 * Since #5091 that entry has been repointed to whatever slug codex serves
 * (`gpt-5.6-luna` as of 2026-09-23), so the key's name lags its value; renaming
 * the key is a public-API change and is tracked separately.
 */
export const OPENAI_MODELS = {
  GPT_5_2: 'gpt-5.2',
  GPT_5_2_INSTANT: 'gpt-5.2-chat-latest',
  GPT_5_2_PRO: 'gpt-5.2-pro',
  /**
   * Registry-derived: resolves to `codex-5.2`'s `cliModelName`, which since
   * 2026-09-23 is `gpt-5.6-luna`, not a "5.2" model. The key name lags its
   * value; renaming it is a public-API change tracked in #5489.
   */
  GPT_5_2_CODEX: getCliModelName('codex-5.2'),
  GPT_4O: 'gpt-4o-2024-11-20',
  GPT_4O_MINI: 'gpt-4o-mini-2024-07-18',
  GPT_4_TURBO: 'gpt-4-turbo-2024-04-09',
  GPT_35_TURBO: 'gpt-3.5-turbo-0125',
} as const;

/**
 * Configuration specific to OpenAIAdapter.
 */
export interface OpenAIAdapterConfig {
  /** Model ID sent unchanged to the API (e.g., 'gpt-4o-2024-11-20'). */
  modelId: string;
  /** API key for OpenAI API (required) */
  apiKey: string;
  /** Base URL for API (optional, defaults to OpenAI's API) */
  baseUrl?: string;
  /** Gateway API surface; omitted uses Chat Completions. */
  apiSurface?: 'chat' | 'responses';
  /** Custom-openai compatibility: send a token cap only when explicitly requested. */
  omitDefaultTokenCap?: boolean;
  /** Fetch implementation, including the gateway's host guard. */
  fetch?: typeof fetch;
  /** Caller diagnostics, shared by direct and gateway adapter clients. */
  logger?: ILogger;
  /** Request timeout in milliseconds (optional) */
  timeout?: number;
  /** Maximum retries for failed requests (optional) */
  maxRetries?: number;
  /** Organization ID (optional) */
  organization?: string;
  /**
   * Compatibility no-op since 11.0: every model ID is sent unchanged.
   * Previously opted out of alias rewriting for OpenAI-compatible gateways.
   */
  verbatimModelId?: boolean;
  /**
   * Headers sent on every request; a `null` value removes a default header
   * (`Authorization: null` drops the bearer). Set by the OpenAI-compatible
   * gateway path for a custom auth header and extra static headers (#6608).
   */
  defaultHeaders?: Readonly<Record<string, string | null>>;
  /**
   * `fetch` options for every request — the gateway path sets a proxy
   * `dispatcher` here when `HTTPS_PROXY` / `HTTP_PROXY` applies (#6608).
   */
  fetchOptions?: Pick<RequestInit, 'dispatcher'>;
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
 * Determines capabilities based on model ID.
 */
export function getModelCapabilities(modelId: string): readonly ModelCapability[] {
  const capabilities: ModelCapability[] = [MC.COMPLETION, MC.STREAMING, MC.TOOL_USE];

  // Vision is available on GPT-4o, GPT-4-turbo, and GPT-5.2 models
  if (
    modelId.includes('gpt-4o') ||
    modelId.includes('gpt-4-turbo') ||
    modelId.includes('gpt-5.2')
  ) {
    capabilities.push(MC.VISION);
  }

  // Extended thinking is available on GPT-5.2 models
  if (modelId.includes('gpt-5.2')) {
    capabilities.push(MC.EXTENDED_THINKING);
  }

  return capabilities;
}
