/**
 * CLI Timeout Helpers
 *
 * Task complexity estimation for timeout selection.
 * Separated from timeout values (which live in config/timeouts.ts).
 *
 * @module cli-adapters/cli-timeout-helpers
 * (Source: Issue #984 — Centralize timeout configuration)
 */

import type { TaskComplexity } from '../config/timeouts.js';
import { getCliTimeout } from '../config/timeouts.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

/**
 * Estimate task complexity from task description.
 *
 * Heuristics based on testing:
 * - Simple: Single function, quick query, < 5 files
 * - Standard: Multi-file changes, moderate analysis
 * - Complex: Codebase-wide, deep analysis, architecture
 *
 * @param taskDescription - Description of the task
 * @returns Estimated complexity
 */
export function estimateTaskComplexity(taskDescription: string): TaskComplexity {
  const lower = taskDescription.toLowerCase();

  // Complex indicators
  const complexIndicators = [
    'codebase',
    'architecture',
    'refactor',
    'all files',
    'entire',
    'comprehensive',
    'deep analysis',
    'system-wide',
    'security',
    'audit',
    'vulnerability',
  ];
  if (complexIndicators.some((indicator) => lower.includes(indicator))) {
    return 'complex';
  }

  // Simple indicators
  const simpleIndicators = ['single', 'quick', 'one function', 'simple', 'small', 'brief', 'short'];
  if (simpleIndicators.some((indicator) => lower.includes(indicator))) {
    return 'simple';
  }

  // Default to standard
  return 'standard';
}

// ============================================================================
// Adaptive Timeout (#1534)
// ============================================================================

/** Minimum successful outcomes required before adaptive timeout kicks in. */
export const ADAPTIVE_TIMEOUT_MIN_SAMPLES = 10;

/** Safety margin applied to p95 duration (p95 * margin = adaptive timeout). */
export const ADAPTIVE_TIMEOUT_MARGIN = 1.2;

/**
 * Compute p95 of a sorted array of numbers.
 * Returns the value at the 95th percentile index.
 */
function computeP95(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(idx, sorted.length - 1)] as number;
}

/** Options for adaptive timeout computation. */
export interface AdaptiveTimeoutOptions {
  /** Override the outcome store (for testing). */
  readonly store?: import('../orchestration/outcomes/outcome-store.js').OutcomeStore;
}

/**
 * Get adaptive timeout for a CLI + task description pair.
 *
 * Uses historical outcome data to compute p95 execution duration.
 * When sufficient samples exist, returns max(static_timeout, p95 * 1.2).
 * Falls back to static keyword-based timeout when data is sparse.
 *
 * @param cli - CLI name
 * @param taskDescription - Task description for complexity + category detection
 * @param options - Optional overrides (e.g., custom store for testing)
 * @returns Timeout in milliseconds (never less than static timeout)
 */
export function getAdaptiveTimeout(
  cli: string,
  taskDescription: string,
  options?: AdaptiveTimeoutOptions
): number {
  const complexity = estimateTaskComplexity(taskDescription);
  const staticTimeout = getCliTimeout(cli, complexity);

  const match = detectTaskCategory(taskDescription);
  if (match === null) return staticTimeout;

  const store = options?.store ?? getOutcomeStore();
  const outcomes = store.query({
    cli,
    category: match.category,
    success: true,
  });

  if (outcomes.length < ADAPTIVE_TIMEOUT_MIN_SAMPLES) return staticTimeout;

  const durations = outcomes.map((o) => o.durationMs).sort((a, b) => a - b);
  const p95 = computeP95(durations);
  const adaptiveTimeout = Math.round(p95 * ADAPTIVE_TIMEOUT_MARGIN);

  return Math.max(staticTimeout, adaptiveTimeout);
}
