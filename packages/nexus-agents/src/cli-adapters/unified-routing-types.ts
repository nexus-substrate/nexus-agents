/**
 * Unified Routing Types
 *
 * Standardized routing decision types for all routers.
 * Issue #574: Consolidate router implementations behind unified interface.
 *
 * @module cli-adapters/unified-routing-types
 * (Source: Issue #574, System Mandate Loop H)
 */

import { z } from 'zod';
import type { CliName } from './types-core.js';
import type { ComplexityLevel } from '../core/task-analysis/shared-task-analyzer.js';
import { clamp01 } from '../utils/math-utils.js';

// ============================================================================
// Base Routing Decision Types
// ============================================================================

/**
 * Routing strategy that produced the decision.
 */
export type RoutingStrategy =
  | 'composite'
  | 'quality'
  | 'budget'
  | 'confidence_cascade'
  | 'agreement_cascade'
  | 'zero_router'
  | 'preference'
  | 'topsis'
  | 'linucb'
  | 'direct';

/**
 * Unified routing decision - base type for all routing decisions.
 * All router implementations should produce or map to this type.
 *
 * This provides a consistent interface for:
 * - Observability and metrics collection
 * - Audit logging
 * - Decision history tracking
 * - Cross-router comparison
 */
export interface UnifiedRoutingDecision {
  /** Selected CLI for task execution */
  readonly selectedCli: CliName;

  /** Confidence in the routing decision (0-1) */
  readonly confidence: number;

  /** Human-readable reason for the decision */
  readonly reason: string;

  /** Strategy/router that produced this decision */
  readonly strategy: RoutingStrategy;

  /** Time taken to make the routing decision in milliseconds */
  readonly decisionTimeMs: number;

  /** Alternative CLIs considered, in ranked order */
  readonly alternatives: readonly CliName[];

  /** Stages/phases executed during routing (for multi-stage routers) */
  readonly stagesExecuted: readonly string[];

  /** Whether the decision is within budget constraints (if applicable) */
  readonly withinBudget?: boolean | undefined;

  /** Estimated task complexity (if analyzed) */
  readonly estimatedComplexity?: ComplexityLevel | undefined;

  /** Estimated token count for the task (if analyzed) */
  readonly estimatedTokens?: number | undefined;

  /** TOPSIS score (if TOPSIS ranking was used) */
  readonly topsisScore?: number | undefined;

  /** LinUCB/UCB score (if bandit selection was used) */
  readonly ucbScore?: number | undefined;

  /** Cascade-specific: stage at which decision was resolved */
  readonly resolvedAtStage?: number | undefined;

  /** Cascade-specific: whether consensus was reached */
  readonly consensusReached?: boolean | undefined;

  /** Cascade-specific: agreement score (0-1) */
  readonly agreementScore?: number | undefined;

  /** Additional metadata for extensibility */
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Zod schema for UnifiedRoutingDecision validation.
 */
export const UnifiedRoutingDecisionSchema = z.object({
  selectedCli: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  strategy: z.enum([
    'composite',
    'quality',
    'budget',
    'confidence_cascade',
    'agreement_cascade',
    'zero_router',
    'preference',
    'topsis',
    'linucb',
    'direct',
  ]),
  decisionTimeMs: z.number().nonnegative(),
  alternatives: z.array(z.string()).readonly(),
  stagesExecuted: z.array(z.string()).readonly(),
  withinBudget: z.boolean().optional(),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex', 'expert']).optional(),
  estimatedTokens: z.number().int().positive().optional(),
  topsisScore: z.number().optional(),
  ucbScore: z.number().optional(),
  resolvedAtStage: z.number().int().nonnegative().optional(),
  consensusReached: z.boolean().optional(),
  agreementScore: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Routing Decision Builder
// ============================================================================

/**
 * Mutable version of UnifiedRoutingDecision for builder use.
 */
type MutableRoutingDecision = {
  -readonly [K in keyof UnifiedRoutingDecision]: UnifiedRoutingDecision[K];
};

/**
 * Builder for creating UnifiedRoutingDecision objects.
 * Provides a fluent API for constructing decisions.
 */
export class RoutingDecisionBuilder {
  private decision: Partial<MutableRoutingDecision> = {
    alternatives: [],
    stagesExecuted: [],
  };

  /**
   * Set the selected CLI.
   */
  withSelectedCli(cli: CliName): this {
    this.decision.selectedCli = cli;
    return this;
  }

  /**
   * Set the confidence score.
   */
  withConfidence(confidence: number): this {
    this.decision.confidence = clamp01(confidence);
    return this;
  }

  /**
   * Set the routing reason.
   */
  withReason(reason: string): this {
    this.decision.reason = reason;
    return this;
  }

  /**
   * Set the routing strategy.
   */
  withStrategy(strategy: RoutingStrategy): this {
    this.decision.strategy = strategy;
    return this;
  }

  /**
   * Set the decision time.
   */
  withDecisionTime(ms: number): this {
    this.decision.decisionTimeMs = ms;
    return this;
  }

  /**
   * Set the alternative CLIs.
   */
  withAlternatives(alternatives: readonly CliName[]): this {
    this.decision.alternatives = alternatives;
    return this;
  }

  /**
   * Set the stages executed.
   */
  withStagesExecuted(stages: readonly string[]): this {
    this.decision.stagesExecuted = stages;
    return this;
  }

  /**
   * Set budget constraint result.
   */
  withBudgetStatus(withinBudget: boolean): this {
    this.decision.withinBudget = withinBudget;
    return this;
  }

  /**
   * Set complexity estimate.
   */
  withComplexity(complexity: ComplexityLevel): this {
    this.decision.estimatedComplexity = complexity;
    return this;
  }

  /**
   * Set token estimate.
   */
  withTokenEstimate(tokens: number): this {
    this.decision.estimatedTokens = tokens;
    return this;
  }

  /**
   * Set TOPSIS score.
   */
  withTopsisScore(score: number): this {
    this.decision.topsisScore = score;
    return this;
  }

  /**
   * Set UCB score.
   */
  withUcbScore(score: number): this {
    this.decision.ucbScore = score;
    return this;
  }

  /**
   * Set cascade-specific fields.
   */
  withCascadeInfo(info: {
    resolvedAtStage?: number;
    consensusReached?: boolean;
    agreementScore?: number;
  }): this {
    this.decision.resolvedAtStage = info.resolvedAtStage;
    this.decision.consensusReached = info.consensusReached;
    this.decision.agreementScore = info.agreementScore;
    return this;
  }

  /**
   * Add metadata.
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.decision.metadata = { ...this.decision.metadata, ...metadata };
    return this;
  }

  /**
   * Build the UnifiedRoutingDecision.
   * Throws if required fields are missing.
   */
  build(): UnifiedRoutingDecision {
    if (this.decision.selectedCli === undefined) {
      throw new Error('selectedCli is required');
    }
    if (this.decision.confidence === undefined) {
      throw new Error('confidence is required');
    }
    if (this.decision.reason === undefined) {
      throw new Error('reason is required');
    }
    if (this.decision.strategy === undefined) {
      throw new Error('strategy is required');
    }
    if (this.decision.decisionTimeMs === undefined) {
      throw new Error('decisionTimeMs is required');
    }

    return this.decision as UnifiedRoutingDecision;
  }
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Creates a new RoutingDecisionBuilder.
 */
export function createRoutingDecisionBuilder(): RoutingDecisionBuilder {
  return new RoutingDecisionBuilder();
}

/**
 * Creates a minimal UnifiedRoutingDecision for simple routing scenarios.
 */
export function createSimpleRoutingDecision(
  selectedCli: CliName,
  reason: string,
  decisionTimeMs: number
): UnifiedRoutingDecision {
  return {
    selectedCli,
    confidence: 1.0,
    reason,
    strategy: 'direct',
    decisionTimeMs,
    alternatives: [],
    stagesExecuted: ['direct'],
  };
}
