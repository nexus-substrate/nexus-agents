/**
 * nexus-agents/cli-adapters - Budget Router Types
 *
 * Type definitions for budget-constrained routing based on PILOT pattern.
 *
 * @module cli-adapters/budget-router-types
 * (Source: Issue #102, arXiv:2401.02987)
 */

import { z } from 'zod';

/**
 * Budget constraint for a routing decision.
 */
export interface BudgetConstraint {
  /** Maximum tokens to use for this task */
  readonly maxTokens?: number | undefined;
  /** Maximum cost in USD for this task */
  readonly maxCostUSD?: number | undefined;
  /** Maximum latency in milliseconds */
  readonly maxLatencyMs?: number | undefined;
}

/**
 * Zod schema for budget constraint validation.
 */
export const BudgetConstraintSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxCostUSD: z.number().positive().optional(),
  maxLatencyMs: z.number().positive().optional(),
});

/**
 * Session budget tracking.
 */
export interface SessionBudget {
  /** Total tokens budget for the session */
  readonly totalTokens: number;
  /** Total cost budget in USD */
  readonly totalCostUSD: number;
  /** Tokens used so far */
  usedTokens: number;
  /** Cost spent so far in USD */
  usedCostUSD: number;
  /** Session start time */
  readonly startTime: number;
  /** Session ID */
  readonly sessionId: string;
}

/**
 * Zod schema for session budget validation.
 */
export const SessionBudgetSchema = z.object({
  totalTokens: z.number().int().positive(),
  totalCostUSD: z.number().positive(),
  usedTokens: z.number().int().min(0).default(0),
  usedCostUSD: z.number().min(0).default(0),
  startTime: z.number().int().positive(),
  sessionId: z.string().min(1),
});

/**
 * Budget exhaustion warning level.
 */
export type BudgetWarningLevel = 'none' | 'low' | 'critical' | 'exhausted';

/**
 * Budget status for a session.
 */
export interface BudgetStatus {
  /** Remaining tokens */
  readonly remainingTokens: number;
  /** Remaining cost in USD */
  readonly remainingCostUSD: number;
  /** Token utilization percentage (0-100) */
  readonly tokenUtilizationPercent: number;
  /** Cost utilization percentage (0-100) */
  readonly costUtilizationPercent: number;
  /** Warning level */
  readonly warningLevel: BudgetWarningLevel;
}

/**
 * Cost model for an adapter.
 */
export interface AdapterCostModel {
  /** Cost per 1K input tokens in USD */
  readonly inputTokenCost: number;
  /** Cost per 1K output tokens in USD */
  readonly outputTokenCost: number;
  /** Average latency in milliseconds */
  readonly avgLatencyMs: number;
  /** Quality score (0-1) */
  readonly qualityScore: number;
}

/**
 * Default cost models for known adapters.
 */
export const DEFAULT_COST_MODELS: Readonly<Record<string, AdapterCostModel>> = {
  claude: {
    inputTokenCost: 0.015,
    outputTokenCost: 0.075,
    avgLatencyMs: 2000,
    qualityScore: 0.95,
  },
  gemini: {
    inputTokenCost: 0.00125,
    outputTokenCost: 0.005,
    avgLatencyMs: 1500,
    qualityScore: 0.85,
  },
  codex: {
    inputTokenCost: 0.003,
    outputTokenCost: 0.015,
    avgLatencyMs: 1000,
    qualityScore: 0.8,
  },
  opencode: {
    inputTokenCost: 0.003,
    outputTokenCost: 0.012,
    avgLatencyMs: 1500,
    qualityScore: 0.82,
  },
};

/**
 * LinUCB bandit context for a routing decision.
 * Note: isCodeTask/isReasoningTask use numeric 0/1 for bandit algorithm compatibility.
 */
/**
 * The value a bandit feature takes when nothing measured it (#5284).
 *
 * `0.5`, not `0`, for two documented reasons — see `composite-router-helpers`:
 * zero would read as "budget untouched", which is a *claim* rather than an
 * absence; and `warmStart`/`seedPriors` replay historical outcomes at `0.5`, so
 * an unmeasured feature must match the context those weights were reconstructed
 * against.
 *
 * It lives here, beside {@link BanditContext}, because every producer of that
 * type needs it. It previously existed as a module-private constant in the live
 * path only, which is how the persisted path in `meta-shadow-selector` came to
 * write `0` under a comment reading "left neutral".
 */
export const NEUTRAL_BANDIT_FEATURE = 0.5;

export interface BanditContext {
  /** Task complexity score (0-1) */
  readonly taskComplexity: number;
  /** Required context length normalized (0-1) */
  readonly contextLengthNormalized: number;
  /** Is code generation task (0 or 1) */
  readonly isCodeTask: number;
  /** Is reasoning task (0 to 1, supports fractional values) */
  readonly isReasoningTask: number;
  /** Budget utilization (0-1) */
  readonly budgetUtilization: number;
  /** Time pressure (0-1, higher = more urgent) */
  readonly timePressure: number;
}

/**
 * LinUCB bandit configuration.
 */
export interface LinUCBConfig {
  /** Number of arms (adapters) */
  readonly numArms: number;
  /** Feature dimension */
  readonly featureDim: number;
  /** Exploration parameter (higher = more exploration) */
  readonly alpha: number;
  /** Regularization parameter */
  readonly lambda: number;
}

/**
 * Default LinUCB configuration.
 */
export const DEFAULT_LINUCB_CONFIG: LinUCBConfig = {
  numArms: 4,
  featureDim: 6,
  alpha: 1.0,
  lambda: 1.0,
};

/**
 * Zod schema for LinUCB config validation.
 */
export const LinUCBConfigSchema = z.object({
  numArms: z.number().int().positive().default(4),
  featureDim: z.number().int().positive().default(6),
  alpha: z.number().positive().default(1.0),
  lambda: z.number().positive().default(1.0),
});

/**
 * Budget routing decision.
 */
export interface BudgetRoutingDecision {
  /** Selected adapter name */
  readonly adapterName: string;
  /** Estimated cost for this task */
  readonly estimatedCostUSD: number;
  /** Estimated tokens for this task */
  readonly estimatedTokens: number;
  /** UCB score for selection */
  readonly ucbScore: number;
  /** Confidence in selection (0-1) */
  readonly confidence: number;
  /** Reason for selection */
  readonly reason: string;
  /** Whether budget allows this selection */
  readonly budgetAllowed: boolean;
}

/**
 * Budget exceeded error details.
 */
export interface BudgetExceededDetails {
  /** Type of budget exceeded */
  readonly budgetType: 'tokens' | 'cost' | 'latency';
  /** Requested amount */
  readonly requested: number;
  /** Available amount */
  readonly available: number;
  /** Suggested alternative adapter */
  readonly suggestedAlternative?: string | undefined;
}
