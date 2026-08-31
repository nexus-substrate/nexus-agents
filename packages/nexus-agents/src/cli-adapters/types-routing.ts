/**
 * nexus-agents/cli-adapters - Routing Type Definitions
 *
 * Routing types: Confidence, Cascade, Budget constraints, etc.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { Result } from '../core/index.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import type { CliName, CliResponse, CliError } from './types-core.js';
import type { CliTask, ICliAdapter } from './types-capability.js';

// ============================================================================
// Confidence-Aware Cascade Routing (Issue #99)
// Based on SATER pattern (arXiv:2510.05164)
// ============================================================================

/**
 * Confidence estimation result.
 * (Source: Issue #99 - SATER pattern, arXiv:2510.05164)
 */
export interface ConfidenceEstimate {
  readonly score: number;
  readonly factors: ConfidenceFactors;
  readonly shouldEscalate: boolean;
  readonly reason: string;
}

export interface ConfidenceFactors {
  readonly lengthFactor: number;
  readonly hedgingFactor: number;
  readonly structureFactor: number;
  readonly uncertaintyFactor: number;
}

export interface CascadeOptions {
  readonly confidenceThreshold?: number;
  readonly fastModel?: CliName;
  readonly expensiveModel?: CliName;
  readonly maxEscalations?: number;
  readonly cacheResponses?: boolean;
}

export interface CascadeResult {
  readonly response: CliResponse;
  readonly escalated: boolean;
  readonly escalationCount: number;
  readonly modelsUsed: readonly CliName[];
  readonly confidenceHistory: readonly ConfidenceEstimate[];
  readonly totalCostUsd?: number;
  readonly totalDurationMs: number;
}

/**
 * Confidence-aware cascade router interface.
 * Routes tasks through fast models first, escalating to expensive models
 * only when confidence is below threshold.
 * (Source: Issue #99 - SATER pattern, arXiv:2510.05164)
 */
export interface IConfidenceRouter {
  estimateConfidence(task: CliTask, response: CliResponse): ConfidenceEstimate;
  shouldEscalate(confidence: ConfidenceEstimate, threshold: number): boolean;
  executeWithCascade(
    task: CliTask,
    options?: CascadeOptions
  ): Promise<Result<CascadeResult, CliError>>;
}

// ============================================================================
// Budget-Constrained Task Routing (Issue #102)
// Based on PILOT pattern (arXiv:2508.21141)
// ============================================================================

/**
 * Budget constraints for task routing.
 * (Source: Issue #102 - PILOT pattern, arXiv:2508.21141)
 */
export interface BudgetConstraint {
  /** Maximum tokens per task */
  readonly maxTokens?: number;
  /** Maximum cost per task in USD */
  readonly maxCostUsd?: number;
  /** Maximum latency per request in milliseconds */
  readonly maxLatencyMs?: number;
}

/**
 * Session-level budget tracking.
 */
/**
 * How many debits against a session budget rested on a measurement rather than
 * an estimate, counted per dimension (#5240).
 *
 * Per-dimension rather than a single flag because the two genuinely diverge: a
 * non-Claude adapter reports token usage and no cost, so one debit is measured
 * on tokens and estimated on cost. Collapsing them would either discard a real
 * token measurement or assert a cost nobody reported.
 *
 * All four are zero on a fresh or reset budget — nothing measured is not the
 * same as fully measured.
 */
export interface BudgetCoverage {
  /** Debits whose token count came from the adapter's reported usage. */
  readonly measuredTokenDebits: number;
  /** Debits whose token count was the router's estimate. */
  readonly estimatedTokenDebits: number;
  /** Debits whose cost came from a vendor-reported figure. */
  readonly measuredCostDebits: number;
  /** Debits whose cost was the router's estimate. */
  readonly estimatedCostDebits: number;
}

export interface SessionBudget {
  /** Total token budget for the session */
  readonly tokenBudget: number;
  /** Total cost budget for the session in USD */
  readonly costBudgetUsd: number;
  /** Tokens used so far */
  readonly tokensUsed: number;
  /** Cost spent so far in USD */
  readonly costSpentUsd: number;
  /** Remaining tokens */
  readonly tokensRemaining: number;
  /** Remaining cost budget in USD */
  readonly costRemainingUsd: number;
  /** Budget utilization percentage (0-100) */
  readonly utilizationPercent: number;
  /**
   * Whether what this budget accumulated was measured or estimated (#5240).
   *
   * `executeWithBudget` debits `usage?.totalTokens ?? estimatedTokens` and
   * `costUsd ?? estimatedCostUsd`, so each figure holds EITHER a measurement or
   * the router's own estimate. Without these counts a reader of
   * `utilizationPercent` cannot tell which, and the two dimensions differ in
   * practice: every vendor except Claude reports tokens but no cost.
   */
  readonly coverage: BudgetCoverage;
  /** Session start time */
  readonly startedAt: Date;
  /** Time until budget resets (if applicable) */
  readonly resetsAt?: Date;
}

/**
 * Budget exceeded error details.
 */
export interface BudgetExceededError extends CliError {
  readonly code: 'BUDGET_EXCEEDED';
  /** Which budget constraint was exceeded */
  readonly constraint: 'tokens' | 'cost' | 'latency';
  /** Budget limit that was exceeded */
  readonly limit: number;
  /** Current usage when limit was hit */
  readonly current: number;
  /** Suggested action */
  readonly suggestion: string;
}

/**
 * Budget warning when approaching limits.
 */
export interface BudgetWarning {
  /** Warning level */
  readonly level: 'info' | 'warning' | 'critical';
  /** Warning message */
  readonly message: string;
  /** Which budget is affected */
  readonly constraint: 'tokens' | 'cost' | 'latency';
  /** Current utilization percentage */
  readonly utilizationPercent: number;
  /** Estimated remaining capacity */
  readonly estimatedRemaining: number;
}

/**
 * Result of budget-aware routing decision.
 */
export interface BudgetRoutingResult {
  /** Selected adapter (if within budget) */
  readonly adapter: ICliAdapter | null;
  /** Whether the task can be executed within budget */
  readonly withinBudget: boolean;
  /** Estimated cost for this task */
  readonly estimatedCostUsd: number;
  /** Estimated tokens for this task */
  readonly estimatedTokens: number;
  /**
   * Expected latency of the selected adapter, in ms (#4907).
   *
   * Absent when no adapter was selected — there is then no latency to report,
   * and `0` would read as instantaneous. Present only when `adapter` is
   * non-null, so it is the profile latency of the model that would actually
   * run, not an aggregate over candidates.
   */
  readonly estimatedLatencyMs?: number | undefined;
  /** Any budget warnings */
  readonly warnings: readonly BudgetWarning[];
  /** Budget after this task (if executed) */
  readonly projectedBudget: SessionBudget;
}

/**
 * Budget router options.
 */
export interface BudgetRouterOptions {
  /** Default per-task budget constraints */
  readonly defaultConstraints?: BudgetConstraint;
  /** Session budget configuration */
  readonly sessionBudget?: {
    readonly tokenBudget?: number;
    readonly costBudgetUsd?: number;
    readonly resetIntervalMs?: number;
  };
  /** Warning thresholds (percentage of budget used) */
  readonly warningThresholds?: {
    readonly info?: number;
    readonly warning?: number;
    readonly critical?: number;
  };
  /** Whether to block tasks that exceed budget (vs. warn only) */
  readonly enforceHardLimits?: boolean;
  /**
   * Per-task-class cost ceilings in USD per task (#4196), keyed by
   * `TaskCategory` from `detectTaskCategory` (e.g. `code_generation`).
   * Keys are the TaskCategory enum (#4214) so a typo'd class is a compile
   * error rather than a silently ignored entry.
   * Absent/empty → no ceiling (default OFF/unlimited). Enforced only under
   * api billing mode by the composite pipeline; a candidate whose registry
   * pricing is missing FAILS a configured ceiling (fail-closed).
   */
  readonly taskClassCostCeilings?: Readonly<Partial<Record<TaskCategory, number>>>;
}

/**
 * Budget-aware task router interface.
 * Routes tasks with respect to token, cost, and latency budgets.
 * (Source: Issue #102 - PILOT pattern, arXiv:2508.21141)
 */
export interface IBudgetRouter {
  /** Get current session budget status */
  getSessionBudget(): SessionBudget;

  /** Update session budget (e.g., after task completion) */
  updateBudget(usage: { tokens?: number; costUsd?: number }): void;

  /** Reset session budget (e.g., on new session or timer) */
  resetBudget(): void;

  /** Check if task is within budget constraints */
  checkBudget(task: CliTask, constraint?: BudgetConstraint): BudgetRoutingResult;

  /**
   * Route task with budget awareness.
   * Returns the best adapter within budget, or error if budget exceeded.
   */
  routeWithBudget(
    task: CliTask,
    budget?: BudgetConstraint
  ): Promise<Result<BudgetRoutingResult, BudgetExceededError>>;

  /**
   * Execute task with budget tracking.
   * Combines routing and execution, updating budget on completion.
   */
  executeWithBudget(
    task: CliTask,
    budget?: BudgetConstraint
  ): Promise<Result<CliResponse & { budgetAfter: SessionBudget }, CliError>>;
}
