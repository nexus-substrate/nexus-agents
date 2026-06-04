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
