/**
 * CLI Timeout Profiles - Configurable timeouts per CLI tool.
 *
 * Delegates to `config/timeouts.ts` (canonical source, Issue #984).
 * This file provides backward-compatible re-exports.
 *
 * @module cli-adapters/cli-timeout-profiles
 * (Source: Issue #357, CLI delegation testing 2026-01-18)
 */

import {
  CLI_TIMEOUTS,
  getCliTimeout,
  type TaskComplexity,
  type TimeoutProfile,
} from '../config/timeouts.js';
import {
  estimateTaskComplexity as _estimateTaskComplexity,
  getAdaptiveTimeout,
} from './cli-timeout-helpers.js';

// Re-export types for backward compatibility
export type { TimeoutProfile, TaskComplexity };

/** Per-CLI timeout profiles. Canonical source: `config/timeouts.ts`. */
export const CLI_TIMEOUT_PROFILES: Record<string, TimeoutProfile> = {
  claude: CLI_TIMEOUTS.claude,
  gemini: CLI_TIMEOUTS.gemini,
  codex: CLI_TIMEOUTS.codex,
};

/** Default timeout profile. Canonical source: `config/timeouts.ts`. */
export const DEFAULT_TIMEOUT_PROFILE: TimeoutProfile = CLI_TIMEOUTS.default;

/** Get timeout for a task. Canonical source: `config/timeouts.ts`. */
export function getTimeoutForTask(cli: string, complexity: TaskComplexity): number {
  return getCliTimeout(cli, complexity);
}

/** Estimate task complexity from description. Canonical: `cli-timeout-helpers.ts`. */
export function estimateTaskComplexity(taskDescription: string): TaskComplexity {
  return _estimateTaskComplexity(taskDescription);
}

/**
 * Get timeout with automatic complexity estimation.
 * Uses adaptive timeout from outcome history when sufficient data exists (#1534).
 */
export function getTimeoutForTaskAuto(cli: string, taskDescription: string): number {
  return getAdaptiveTimeout(cli, taskDescription);
}
