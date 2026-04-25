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
 * Derived from the canonical model registry (Issue #807).
 */

import { buildMockModelInfo } from '../../config/model-config-helpers.js';
import { createCliError as sharedCreateCliError } from '../../cli-adapters/cli-error-helpers.js';

export const MODEL_INFO_BY_NAME: Readonly<Record<CliName, ModelInfo>> = buildMockModelInfo();

/**
 * Creates a CLI error with automatic retryable detection.
 * Delegates to the canonical helper in cli-adapters/cli-error-helpers.ts
 * so retryable-code classification stays in one place (#2181).
 */
export function createCliError(code: CliErrorCode, message: string, cliName: CliName): CliError {
  return sharedCreateCliError(code, message, cliName);
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
