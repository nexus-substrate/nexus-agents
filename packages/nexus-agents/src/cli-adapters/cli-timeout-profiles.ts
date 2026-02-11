/**
 * CLI Timeout Profiles - Configurable timeouts per CLI tool.
 *
 * @deprecated Import from `config/timeouts.js` instead (Issue #984).
 * This file re-exports from the canonical source for backward compatibility.
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
import { estimateTaskComplexity as _estimateTaskComplexity } from './cli-timeout-helpers.js';

// Re-export types for backward compatibility
export type { TimeoutProfile, TaskComplexity };

/**
 * @deprecated Use `CLI_TIMEOUTS` from `config/timeouts.js` instead.
 */
export const CLI_TIMEOUT_PROFILES: Record<string, TimeoutProfile> = {
  claude: CLI_TIMEOUTS.claude,
  gemini: CLI_TIMEOUTS.gemini,
  codex: CLI_TIMEOUTS.codex,
};

/**
 * @deprecated Use `CLI_TIMEOUTS.default` from `config/timeouts.js` instead.
 */
export const DEFAULT_TIMEOUT_PROFILE: TimeoutProfile = CLI_TIMEOUTS.default;

/**
 * @deprecated Use `getCliTimeout()` from `config/timeouts.js` instead.
 */
export function getTimeoutForTask(cli: string, complexity: TaskComplexity): number {
  return getCliTimeout(cli, complexity);
}

/**
 * Estimate task complexity from task description.
 *
 * @deprecated Use `estimateTaskComplexity()` from `cli-timeout-helpers.js` instead.
 */
export function estimateTaskComplexity(taskDescription: string): TaskComplexity {
  return _estimateTaskComplexity(taskDescription);
}

/**
 * Get timeout with automatic complexity estimation.
 *
 * @deprecated Use `getCliTimeout()` + `estimateTaskComplexity()` from canonical modules.
 */
export function getTimeoutForTaskAuto(cli: string, taskDescription: string): number {
  const complexity = _estimateTaskComplexity(taskDescription);
  return getCliTimeout(cli, complexity);
}
