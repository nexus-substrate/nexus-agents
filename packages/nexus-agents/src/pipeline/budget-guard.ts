/**
 * BudgetGuard — per-run token-budget enforcement for the agent pipeline (#3395).
 *
 * Wraps the existing, tested `BudgetCircuitBreaker` (the single budget authority
 * — see #3150 / #3177) and exposes the two operations the stage path needs:
 * `record(tokensUsed)` after each expert call and `isExhausted()` before the
 * next one. When no budget is configured the guard is a no-op (`isExhausted()`
 * always false, `record()` does nothing), so the default path is byte-for-byte
 * unchanged — enforcement is strictly opt-in.
 *
 * Behaviour on overrun is a graceful short-circuit, NOT a thrown abort: once the
 * breaker opens, subsequent expert calls return a failure result (the stages
 * already degrade on failure), which stops further token spend without unwinding
 * the pipeline mid-flight. Hard-stop, not silent model downgrade — the
 * consensus_vote on #3395 deferred graceful fallback to #3394.
 *
 * @module pipeline/budget-guard
 */
import { createBudgetCircuitBreaker } from '../workflows/budget-circuit-breaker.js';
import type { BudgetCircuitBreaker } from '../workflows/budget-circuit-breaker.js';

/** Opt-in per-run budget configuration (absent → enforcement off). */
export interface AgentBudgetConfig {
  /** Hard token ceiling for the whole run. */
  readonly maxTokens: number;
  /** Fraction of `maxTokens` at which the circuit opens (default 0.95). */
  readonly criticalThreshold?: number;
}

/** Per-run token-budget guard. A no-budget guard never reports exhaustion. */
export class BudgetGuard {
  private readonly breaker: BudgetCircuitBreaker | undefined;

  constructor(breaker?: BudgetCircuitBreaker) {
    this.breaker = breaker;
  }

  /** Record tokens consumed by a completed call (best-effort; undefined ignored). */
  record(tokensUsed: number | undefined): void {
    if (this.breaker === undefined || tokensUsed === undefined || tokensUsed <= 0) return;
    this.breaker.recordUsage(tokensUsed);
  }

  /** True once the budget circuit has opened — callers should stop spending. */
  isExhausted(): boolean {
    return this.breaker?.getState() === 'open';
  }

  /** Whether a budget is actually being enforced (vs the no-op default). */
  get enforced(): boolean {
    return this.breaker !== undefined;
  }
}

/**
 * Build a {@link BudgetGuard} from optional config. Returns a no-op guard when
 * `budget` is undefined, so callers can construct unconditionally.
 */
export function createBudgetGuard(budget?: AgentBudgetConfig): BudgetGuard {
  if (budget === undefined) return new BudgetGuard();
  const breaker = createBudgetCircuitBreaker(budget.maxTokens, {
    ...(budget.criticalThreshold !== undefined
      ? { criticalThreshold: budget.criticalThreshold }
      : {}),
  });
  return new BudgetGuard(breaker);
}

/** Default overrun tolerance: allow actual spend up to 1.5× the plan estimate. */
export const DEFAULT_BUDGET_TOLERANCE = 1.5;

/** Env var overriding the overrun tolerance multiplier (#3262). */
const BUDGET_TOLERANCE_ENV = 'NEXUS_BUDGET_TOLERANCE';

/**
 * Resolve the overrun-tolerance multiplier from `NEXUS_BUDGET_TOLERANCE` (#3262).
 * A multiplier of `t` lets a run spend up to `t ×` its plan estimate before the
 * budget trips. Falls back to {@link DEFAULT_BUDGET_TOLERANCE} when the env var
 * is unset, non-numeric/NaN, or below 1 (a sub-1 tolerance would trip below the
 * estimate itself — never intended) — it is clamped to ≥ 1, never to a NaN.
 */
export function resolveBudgetTolerance(): number {
  const raw = process.env[BUDGET_TOLERANCE_ENV];
  if (raw === undefined || raw.trim() === '') return DEFAULT_BUDGET_TOLERANCE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_BUDGET_TOLERANCE;
  return parsed;
}

/**
 * Build an estimate-relative {@link AgentBudgetConfig} (#3262): cap a run at
 * `ceil(estimateTokens × tolerance)`. Returns `undefined` — yielding the
 * existing no-op guard via {@link createBudgetGuard} — when the estimate is
 * absent or unusable (not finite, or ≤ 0) or the tolerance is unusable
 * (not finite, or < 1). This is a deliberate FAIL-OPEN: a run with no trustworthy
 * estimate is left unguarded rather than capped at a garbage ceiling. Callers
 * should log when they pass an absent/invalid estimate so the no-op is visible.
 */
export function estimateRelativeBudget(
  estimateTokens: number | undefined,
  tolerance: number = DEFAULT_BUDGET_TOLERANCE
): AgentBudgetConfig | undefined {
  if (estimateTokens === undefined || !Number.isFinite(estimateTokens) || estimateTokens <= 0) {
    return undefined;
  }
  if (!Number.isFinite(tolerance) || tolerance < 1) return undefined;
  return { maxTokens: Math.ceil(estimateTokens * tolerance) };
}
