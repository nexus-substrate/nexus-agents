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
