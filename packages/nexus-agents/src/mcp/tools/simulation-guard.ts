/**
 * Simulation Guard — runtime safety net for `simulateVotes: true`.
 *
 * Simulated votes are random and exist only for unit tests and demos.
 * If a caller passes `simulateVotes: true` outside a test runner, this module
 * emits a one-shot stderr warning so the misuse cannot be silent.
 * (Source: Issue #2317, #2319)
 *
 * @module mcp/tools/simulation-guard
 */

import type { ILogger } from '../../core/index.js';

const WARNED = new Set<string>();

/** Returns true when running under vitest or another test runner. */
export function isTestRunner(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/**
 * If `simulate` is true and we are not in a test runner, log a one-shot
 * warning per (tool, process) pair via the supplied logger. Returns the
 * `simulate` value unchanged so it can be used inline.
 *
 * Why: `simulateVotes: true` is a unit-test affordance; using it as a
 * fallback when adapters are unavailable produces random "decisions" that
 * silently corrupt downstream behavior. A loud warning is the minimum
 * defense; #2319 also stops simulated runs from polluting tool memory.
 */
export function warnIfSimulatedOutsideTests(toolName: string, logger: ILogger): void {
  if (isTestRunner()) return;
  if (WARNED.has(toolName)) return;
  WARNED.add(toolName);
  logger.warn(
    `[${toolName}] simulateVotes=true: output is RANDOM and reserved for tests/demos. Do not treat the result as a real decision.`
  );
}

/** Test-only: clear the warned-set so repeated tests can re-trigger the warning. */
export function _resetWarned(): void {
  WARNED.clear();
}
