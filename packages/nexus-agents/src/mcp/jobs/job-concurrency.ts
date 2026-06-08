/**
 * Per-tool async-job concurrency cap (#3044 / epic #2631 Stage 3).
 *
 * Tracks in-flight async-mode dispatches in-process so a noisy caller
 * can't queue 1,000 long-running `run_workflow` invocations behind a
 * slow CLI and exhaust adapter slots. The cap is per-tool (each
 * registered tool gets its own slot count) and per-process — restarting
 * the MCP server resets the count, which is fine because the orphan
 * background promises die with it.
 *
 * Configuration order, lowest priority first:
 *   1. The per-tool default in `DEFAULT_JOB_CAPS` below.
 *   2. Environment override `NEXUS_JOB_MAX_CONCURRENT_<TOOL_UPPER>` —
 *      tool name is uppercased + `_` for the env-var match. A value of
 *      `0` disables async-mode for that tool entirely (`tryAcquire`
 *      always returns busy).
 *
 * The Contrarian-vote flag from #3041 specifically asked for the cap
 * to land BEFORE async-mode expands past `orchestrate` (which has a
 * natural ceiling because it's depth-guarded). This module is the
 * primitive that satisfies that ask for `run_workflow` and later tools.
 *
 * @module mcp/jobs/job-concurrency
 */

import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'job-concurrency' });

/**
 * Default concurrent-job caps per tool. Numbers are starting points
 * informed by typical workload shape, NOT measured ceilings — re-tune
 * after observing actual job duration distributions in #2703 telemetry.
 *
 * `0` would disable async-mode for that tool; absence means "no cap"
 * (currently no tool falls into this category).
 */
export const DEFAULT_JOB_CAPS: Readonly<Record<string, number>> = {
  orchestrate: 3,
  run_workflow: 3,
  consensus_vote: 2,
  execute_expert: 4,
  // #3726: run_dev_pipeline is a heavy multi-agent pipeline (plan→vote→
  // decompose→implement→qa→security, each a live LLM call). Cap low — 2
  // concurrent real runs already saturate adapter slots on most hosts.
  run_dev_pipeline: 2,
  // #3730: run_pipeline is a multi-stage adaptive orchestrator with per-stage
  // experts (live LLM calls). Same shape as run_dev_pipeline — cap low at 2.
  run_pipeline: 2,
};

/**
 * Default total cross-tool cap (defensive backstop, #3046 Stage 5).
 * Per-tool caps prevent a noisy single tool; the global cap prevents
 * 5 tools × 3 jobs each from saturating the host's adapter slots.
 *
 * Env override: `NEXUS_JOB_MAX_CONCURRENT_TOTAL`. Defaults to 10 —
 * comfortably above the sum of per-tool defaults (3+3+2+4=12 is also
 * fine because no realistic workload fills every tool simultaneously)
 * but stops runaway parallel fan-outs.
 */
export const DEFAULT_GLOBAL_JOB_CAP = 10;

/** In-flight count per tool. Reset on process restart. */
const inFlight = new Map<string, number>();

/** Returns the configured per-tool cap — env override beats default. */
export function getJobCap(toolName: string): number {
  const envKey = `NEXUS_JOB_MAX_CONCURRENT_${toolName.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined && envValue !== '') {
    const parsed = Number(envValue);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
    logger.warn('Invalid env override for job cap — ignoring', {
      tool: toolName,
      envKey,
      envValue,
    });
  }
  return DEFAULT_JOB_CAPS[toolName] ?? DEFAULT_GLOBAL_JOB_CAP;
}

/**
 * Returns the global cross-tool cap (#3046 Stage 5). Env override:
 * `NEXUS_JOB_MAX_CONCURRENT_TOTAL`. A value of `0` disables async-mode
 * across ALL tools simultaneously.
 */
export function getGlobalJobCap(): number {
  const envValue = process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'];
  if (envValue !== undefined && envValue !== '') {
    const parsed = Number(envValue);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
    logger.warn('Invalid env override for global job cap — ignoring', {
      envKey: 'NEXUS_JOB_MAX_CONCURRENT_TOTAL',
      envValue,
    });
  }
  return DEFAULT_GLOBAL_JOB_CAP;
}

/** Sum of in-flight counts across all tools (Stage 5 observability). */
export function getTotalInFlight(): number {
  let total = 0;
  for (const count of inFlight.values()) total += count;
  return total;
}

/** Current in-flight count for a tool (testing + observability helper). */
export function getInFlight(toolName: string): number {
  return inFlight.get(toolName) ?? 0;
}

/**
 * Attempt to acquire one slot. Returns `true` on success (caller MUST
 * `release()` exactly once when the job finishes / fails). Returns
 * `false` when EITHER cap is full — per-tool cap OR cross-tool global
 * cap (#3046 Stage 5). Caller responds synchronously with the busy
 * envelope (`{ status: 'busy', retryAfterMs }`).
 *
 * Atomicity note: Node.js is single-threaded between awaits, so this
 * read-then-write pattern is safe as long as no `await` interleaves
 * — and it doesn't here.
 */
export function tryAcquire(toolName: string): boolean {
  const cap = getJobCap(toolName);
  // Cap of 0 disables async-mode for the tool.
  if (cap === 0) return false;
  const current = inFlight.get(toolName) ?? 0;
  if (current >= cap) return false;
  // #3046 Stage 5: global cap check. Prevents 5 tools × 3 jobs each
  // saturating adapter slots even when each per-tool cap is satisfied.
  const globalCap = getGlobalJobCap();
  if (globalCap === 0) return false;
  if (getTotalInFlight() >= globalCap) return false;
  inFlight.set(toolName, current + 1);
  return true;
}

/**
 * Release one slot. Idempotent only in the trivial sense (calling twice
 * is a bug — the counter would underflow). Callers should pair every
 * `tryAcquire` returning `true` with exactly one `release` in a
 * `finally` block to be safe on both success and rejection paths.
 */
export function release(toolName: string): void {
  const current = inFlight.get(toolName) ?? 0;
  if (current === 0) {
    logger.warn('release() called with no in-flight count — caller bug', { tool: toolName });
    return;
  }
  inFlight.set(toolName, current - 1);
}

/**
 * Suggested retry interval for a busy response. Linear in current
 * load — at full cap, suggest 30s; halved as load shrinks. Pure
 * convenience for clients implementing exponential backoff.
 */
export function suggestRetryAfterMs(toolName: string): number {
  const cap = getJobCap(toolName);
  if (cap === 0) return 0; // never retry — async-mode is disabled
  const current = inFlight.get(toolName) ?? 0;
  // 30s base, scaled by fullness (clamped to [5s, 60s]).
  const base = 30_000 * (current / Math.max(1, cap));
  return Math.min(60_000, Math.max(5_000, base));
}

/** Reset all counters. Test-only — do not call from production code. */
export function _resetForTests(): void {
  inFlight.clear();
}
