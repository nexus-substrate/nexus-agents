/**
 * nexus-agents/testing - Mock Adapter Helpers
 *
 * Pure helper functions and constants for MockCliAdapter.
 * Extracted to keep mock-adapter.ts under 400 lines.
 */

import { getRandomProvider } from '../../core/index.js';
import type {
  CliName,
  CliErrorCode,
  CliError,
  CliResponse,
  ModelInfo,
} from '../../cli-adapters/types.js';
import type { MockAdapterConfig } from './mock-adapter-types.js';

/**
 * Default configuration values for MockCliAdapter.
 */
export const DEFAULT_CONFIG: MockAdapterConfig = {
  name: 'claude',
  defaultResponse: 'Mock response',
  defaultLatencyMs: 0,
  failureRate: 0,
  responses: new Map(),
};

/**
 * Model information lookup by CLI name.
 */
export const MODEL_INFO_BY_NAME: Readonly<Record<CliName, ModelInfo>> = {
  claude: {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    contextWindow: 200_000,
    maxOutput: 64_000,
    costPerMillionInput: 3.0,
    costPerMillionOutput: 15.0,
  },
  gemini: {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    costPerMillionInput: 0.075,
    costPerMillionOutput: 0.3,
  },
  codex: {
    id: 'gpt-5-codex',
    name: 'GPT-5 Codex',
    contextWindow: 400_000,
    maxOutput: 32_000,
    costPerMillionInput: 2.0,
    costPerMillionOutput: 8.0,
  },
};

/**
 * Error codes that are considered retryable.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<CliErrorCode> = new Set<CliErrorCode>([
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
]);

/**
 * Creates a CLI error with automatic retryable detection.
 */
export function createCliError(code: CliErrorCode, message: string, cliName: CliName): CliError {
  return {
    code,
    message,
    cli: cliName,
    retryable: RETRYABLE_ERROR_CODES.has(code),
  };
}

/**
 * Creates a CLI response with estimated token usage.
 */
export function createCliResponse(text: string, latencyMs: number, modelId: string): CliResponse {
  return {
    text,
    durationMs: latencyMs,
    model: modelId,
    usage: {
      inputTokens: Math.floor(text.length / 4),
      outputTokens: Math.floor(text.length / 4),
    },
  };
}

/**
 * Determines if a request should fail based on failure rate.
 * @param failureRate - Probability of failure (0-1)
 * @returns true if request should fail
 */
export function shouldFailByRate(failureRate: number): boolean {
  if (failureRate <= 0) {
    return false;
  }
  if (failureRate >= 1) {
    return true;
  }
  return getRandomProvider().random() < failureRate;
}

// Re-export from canonical source for backward compatibility
export { delay } from '../../utils/async-utils.js';

/**
 * Merges response maps, with source overriding defaults.
 */
export function mergeResponseMaps(
  defaults: Map<string, string>,
  source: Map<string, string> | undefined
): Map<string, string> {
  const merged = new Map<string, string>();
  defaults.forEach((value, key) => {
    merged.set(key, value);
  });
  if (source !== undefined) {
    source.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
}

/**
 * Calculates effective latency respecting task timeout.
 */
export function calculateEffectiveLatency(
  defaultLatency: number,
  taskTimeout: number | undefined
): number {
  if (taskTimeout !== undefined && taskTimeout < defaultLatency) {
    return taskTimeout;
  }
  return defaultLatency;
}
