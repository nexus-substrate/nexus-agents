/**
 * Simulation Guard — fail-closed gate for `simulateVotes: true`.
 *
 * Simulated votes are random and exist only for unit tests and demos.
 * Outside a test runner a `simulateVotes: true` request is REJECTED unless
 * the operator explicitly opts in via `NEXUS_ALLOW_SIMULATE=1` — the field
 * is caller-supplied on the MCP input schemas, so warn-and-proceed let a
 * steered caller manufacture a governance approval from a random panel.
 * (Source: Issue #2317, #2319; fail-closed rework #4170)
 *
 * The guard NEVER throws: call sites sit inside pipeline try blocks whose
 * catch paths categorize as `internal` — a thrown denial would be
 * miscategorized. It returns a structured verdict instead.
 *
 * @module mcp/tools/simulation-guard
 */

import type { ILogger } from '../../core/index.js';
import { toolStructuredError, type ToolResult } from './tool-result.js';

const WARNED = new Set<string>();

/** Explicit opt-in env var permitting simulated votes outside test runners (#4170). */
export const ALLOW_SIMULATE_ENV = 'NEXUS_ALLOW_SIMULATE';

/** Returns true when running under vitest or another test runner. */
export function isTestRunner(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/**
 * Verdict of {@link checkSimulationAllowed}. `optedIn` distinguishes the
 * test-runner path (false — nothing to surface) from the explicit
 * `NEXUS_ALLOW_SIMULATE=1` path (true — callers stamp `simulated: true`
 * on their output so a demo result can never pass as a real decision).
 */
export type SimulationCheckResult =
  | { readonly allowed: true; readonly optedIn: boolean }
  | { readonly allowed: false; readonly reason: string };

/**
 * Decide whether a `simulateVotes: true` request may proceed (#4170):
 *
 * - test runner (VITEST/NODE_ENV) → allowed, `optedIn: false`;
 * - `NEXUS_ALLOW_SIMULATE=1`      → allowed, `optedIn: true`, with the
 *   one-shot RANDOM-output warning logged per (tool, process);
 * - otherwise                     → NOT allowed, with a reason naming the
 *   opt-in env var. Never throws — see the module doc.
 */
export function checkSimulationAllowed(toolName: string, logger: ILogger): SimulationCheckResult {
  if (isTestRunner()) return { allowed: true, optedIn: false };
  if (process.env[ALLOW_SIMULATE_ENV] === '1') {
    warnOnce(toolName, logger);
    return { allowed: true, optedIn: true };
  }
  return {
    allowed: false,
    reason:
      `[${toolName}] simulateVotes=true is rejected outside test runners: simulated votes ` +
      `are RANDOM and must not produce real decisions (#4170). ` +
      `Set ${ALLOW_SIMULATE_ENV}=1 to explicitly opt in (demos only).`,
  };
}

/**
 * Shared denial envelope for a failed {@link checkSimulationAllowed}: the
 * three call sites (consensus_vote, run_pipeline, run_dev_pipeline) must
 * reject identically — `permission` category, detail naming the opt-in.
 */
export function simulationDeniedResult(reason: string): ToolResult {
  return toolStructuredError({
    errorCategory: 'permission',
    message: reason,
    detail: { optIn: `${ALLOW_SIMULATE_ENV}=1` },
  });
}

/**
 * One-shot warning per (tool, process) pair for the explicit opt-in path.
 * `simulateVotes: true` output is random; the warning keeps an opted-in demo
 * run from being silently mistaken for a real decision (#2319).
 */
function warnOnce(toolName: string, logger: ILogger): void {
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
