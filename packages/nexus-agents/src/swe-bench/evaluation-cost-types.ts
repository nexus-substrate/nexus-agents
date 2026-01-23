/**
 * nexus-agents/swe-bench - Evaluation Cost Types
 *
 * Token usage and cost estimation types for evaluation reports.
 *
 * @module swe-bench/evaluation-cost-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { StatisticalSummary } from './evaluation-statistics-types.js';

/**
 * Token usage by evaluation phase.
 */
export interface TokensByPhase {
  /** Exploration/reading phase. */
  readonly exploration: number;
  /** Planning phase. */
  readonly planning: number;
  /** Implementation phase. */
  readonly implementation: number;
  /** Retry/iteration phase. */
  readonly retry: number;
}

/**
 * Token usage breakdown.
 */
export interface TokenUsageBreakdown {
  /** Total input tokens. */
  readonly totalInputTokens: number;
  /** Total output tokens. */
  readonly totalOutputTokens: number;
  /** Total tokens. */
  readonly totalTokens: number;
  /** Per-instance token stats. */
  readonly perInstance: StatisticalSummary;
  /** Tokens by phase. */
  readonly byPhase: TokensByPhase;
}

/**
 * Model pricing information.
 */
export interface ModelPricing {
  /** Model name. */
  readonly modelName: string;
  /** Price per 1M input tokens (USD). */
  readonly inputPricePerMillion: number;
  /** Price per 1M output tokens (USD). */
  readonly outputPricePerMillion: number;
  /** Price effective date. */
  readonly priceDate: string;
}

/**
 * Cost estimation for the evaluation.
 */
export interface CostEstimate {
  /** Total estimated cost (USD). */
  readonly totalCostUsd: number;
  /** Cost per instance (USD). */
  readonly perInstanceCostUsd: number;
  /** Cost per resolved instance (USD). */
  readonly perResolvedInstanceCostUsd: number;
  /** Model pricing used for estimate. */
  readonly pricingModel: ModelPricing;
}
