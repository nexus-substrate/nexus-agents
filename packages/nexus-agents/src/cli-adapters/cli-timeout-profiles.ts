/**
 * CLI Timeout Profiles - Configurable timeouts per CLI tool.
 *
 * Based on real-world testing:
 * - Claude: 30-120s depending on complexity
 * - Gemini: 15-90s (times out on complex file analysis >60s)
 * - Codex: 10-60s (optimized for code generation)
 *
 * @module cli-adapters/cli-timeout-profiles
 * (Source: Issue #357, CLI delegation testing 2026-01-18)
 */

/** Timeout profile for a CLI tool. */
export interface TimeoutProfile {
  /** Timeout for simple tasks (single function, quick analysis). */
  simple: number;
  /** Timeout for standard tasks (multi-file changes, moderate analysis). */
  standard: number;
  /** Timeout for complex tasks (codebase-wide changes, deep analysis). */
  complex: number;
}

/** Timeout profiles per CLI tool based on real-world performance testing. */
export const CLI_TIMEOUT_PROFILES: Record<string, TimeoutProfile> = {
  claude: { simple: 30_000, standard: 60_000, complex: 120_000 },
  gemini: { simple: 15_000, standard: 45_000, complex: 90_000 },
  codex: { simple: 10_000, standard: 30_000, complex: 60_000 },
};

/** Default profile used when CLI is unknown. */
export const DEFAULT_TIMEOUT_PROFILE: TimeoutProfile = {
  simple: 30_000,
  standard: 60_000,
  complex: 120_000,
};

/** Task complexity levels for timeout selection. */
export type TaskComplexity = 'simple' | 'standard' | 'complex';

/**
 * Get timeout for a task based on CLI and complexity.
 *
 * @param cli - CLI tool name (claude, gemini, codex)
 * @param complexity - Task complexity level
 * @returns Timeout in milliseconds
 */
export function getTimeoutForTask(cli: string, complexity: TaskComplexity): number {
  const profile = CLI_TIMEOUT_PROFILES[cli] ?? DEFAULT_TIMEOUT_PROFILE;
  return profile[complexity];
}

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

/**
 * Get timeout with automatic complexity estimation.
 *
 * @param cli - CLI tool name
 * @param taskDescription - Task description for complexity estimation
 * @returns Timeout in milliseconds
 */
export function getTimeoutForTaskAuto(cli: string, taskDescription: string): number {
  const complexity = estimateTaskComplexity(taskDescription);
  return getTimeoutForTask(cli, complexity);
}
