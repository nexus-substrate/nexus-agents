/**
 * CLI Timeout Profiles
 *
 * Provides CLI-specific timeout configurations based on real-world performance testing.
 *
 * @module config/defaults-timeout-profiles
 */

import type { KnownCliName, TaskComplexity, TimeoutProfile } from './defaults-types.js';
import { isKnownCliName } from './defaults-types.js';

// ============================================================================
// Timeout Profiles
// ============================================================================

/**
 * CLI-specific timeout profiles based on real-world performance testing.
 *
 * Values derived from testing documented in Issue #357:
 * - Claude: 30-120s depending on complexity
 * - Gemini: 15-90s (times out on complex file analysis >60s)
 * - Codex: 10-60s (optimized for code generation)
 */
export const TIMEOUT_PROFILES = {
  claude: { simple: 30_000, standard: 60_000, complex: 120_000 },
  gemini: { simple: 15_000, standard: 45_000, complex: 120_000 },
  codex: { simple: 10_000, standard: 30_000, complex: 90_000 },
  /** Default profile for unknown CLIs */
  default: { simple: 30_000, standard: 60_000, complex: 120_000 },
} as const satisfies Record<KnownCliName, TimeoutProfile>;

// ============================================================================
// Timeout Profile Accessors
// ============================================================================

/**
 * Gets the timeout profile for a specific CLI.
 *
 * @param cli - CLI name (claude, gemini, codex)
 * @returns TimeoutProfile for the CLI
 */
export function getTimeoutProfile(cli: string): TimeoutProfile {
  if (isKnownCliName(cli)) {
    return TIMEOUT_PROFILES[cli];
  }
  return TIMEOUT_PROFILES.default;
}

/**
 * Gets timeout for a task based on CLI and complexity.
 *
 * @param cli - CLI name
 * @param complexity - Task complexity level
 * @returns Timeout in milliseconds
 */
export function getTimeoutForCli(cli: string, complexity: TaskComplexity): number {
  const profile = getTimeoutProfile(cli);
  return profile[complexity];
}
