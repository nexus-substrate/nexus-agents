/**
 * nexus-agents/cli-adapters - CompositeRouter Types
 *
 * Type definitions for the CompositeRouter module.
 *
 * @module cli-adapters/composite-router-types
 * (Source: Issue #166, Epic #164)
 */

import { z } from 'zod';
import type { ICliAdapter, CliName } from './types.js';
import type { TaskProfile } from '../core/index.js';
import type { PreferenceRouterConfig } from './preference-router-types.js';
import type { ZeroRouterConfig, DifficultyEstimate, ModelTier } from './zero-router-types.js';
import type { LatencyTrackerConfig, LatencyTrackerStats } from './latency-tracker-types.js';
import type { RoutingMemoryConfig, RoutingMemoryStats } from '../context/routing-memory.js';
import type {
  RoutingRecord,
  OutcomeRecord,
  RoutingMetrics,
} from '../observability/routing-metrics-types.js';
import type { IOrchestrationObserver } from '../agents/observability/orchestration-observer-types.js';
import type { ConfidenceCascadeConfig } from './routing/stages/confidence-cascade-stage.js';
import type { CapabilityMatchConfig } from './routing/stages/capability-match-stage.js';
import type { QualityConstraintConfig } from './routing/stages/quality-constraint-stage.js';

/**
 * Interface for routing metrics collection.
 * Allows dependency injection of RoutingMetricsCollector.
 * (Source: Issue #559 - Wire RoutingMetricsCollector to CompositeRouter)
 */
export interface IRoutingMetricsCollector {
  /** Record a routing decision. */
  recordDecision(record: RoutingRecord): void;
  /** Record an outcome for a routing decision. */
  recordOutcome(record: OutcomeRecord): void;
  /** Get metrics for a time period. */
  getMetrics(periodHours?: number): RoutingMetrics;
}

/**
 * Configuration schema for CompositeRouter.
 */
export const CompositeRouterConfigSchema = z.object({
  /** Enable confidence cascade stage (default: false) (Issue #755, ADR-0005) */
  enableConfidenceCascade: z.boolean().default(false),
  /** Enable budget filtering stage (default: true) */
  enableBudgetFilter: z.boolean().default(true),
  /** Enable capability match stage (default: false) (Issue #755, ADR-0005) */
  enableCapabilityMatch: z.boolean().default(false),
  /** Enable ZeroRouter difficulty-based routing stage (default: true) (Issue #473) */
  enableZeroRouter: z.boolean().default(true),
  /** Enable preference-trained routing stage (default: false) */
  enablePreferenceRouting: z.boolean().default(false),
  /** Enable TOPSIS ranking stage (default: true) */
  enableTopsisRanking: z.boolean().default(true),
  /** Enable LinUCB selection stage (default: true) */
  enableLinUCBSelection: z.boolean().default(true),
  /** Enable quality constraint stage (default: false) (Issue #755, ADR-0005) */
  enableQualityConstraint: z.boolean().default(false),
  /** Enable latency tracking for routing decisions (default: true) (Issue #361) */
  enableLatencyTracking: z.boolean().default(true),
  /** Enable routing memory for learned routing (default: false) (Issue #463, #461) */
  enableRoutingMemory: z.boolean().default(false),
  /** Weight for latency score in final routing (0-1, default: 0.2) */
  latencyScoreWeight: z.number().min(0).max(1).default(0.2),
  /** Budget constraints (optional) */
  budgetConstraints: z
    .object({
      maxTokens: z.number().positive(),
      maxCostUsd: z.number().positive(),
      maxLatencyMs: z.number().positive(),
    })
    .partial()
    .optional(),
  /** LinUCB exploration parameter (default: 1.0) */
  linucbAlpha: z.number().positive().default(1.0),
  /** Billing mode: 'plan' zeroes cost weight, 'api' preserves current behavior (default: 'plan') */
  billingMode: z.enum(['plan', 'api']).default('plan'),
  /** Enable capacity-aware load balancing (deprioritize exhausted CLIs) (default: true) (Issue #807) */
  enableCapacityBalancing: z.boolean().default(true),
  /** Maximum routing decision time in ms (default: 50) */
  maxDecisionTimeMs: z.number().positive().default(50),
  /** Minimum preference data points before using learned routing (default: 10) */
  preferenceMinDataPoints: z.number().int().positive().default(10),
});

export type CompositeRouterConfig = z.infer<typeof CompositeRouterConfigSchema>;

/**
 * Extended config type that includes preference router and ZeroRouter config.
 */
export interface CompositeRouterConfigWithPreference extends CompositeRouterConfig {
  /** Confidence cascade stage configuration (optional) (Issue #755) */
  confidenceCascadeConfig?: Partial<ConfidenceCascadeConfig>;
  /** Capability match stage configuration (optional) (Issue #755) */
  capabilityMatchConfig?: Partial<CapabilityMatchConfig>;
  /** Quality constraint stage configuration (optional) (Issue #755) */
  qualityConstraintConfig?: Partial<QualityConstraintConfig>;
  /** Preference router configuration (optional, uses defaults if not provided) */
  preferenceRouterConfig?: Partial<PreferenceRouterConfig>;
  /** ZeroRouter configuration (optional, uses defaults if not provided) */
  zeroRouterConfig?: Partial<ZeroRouterConfig>;
  /** Latency tracker configuration (optional, uses defaults if not provided) (Issue #361) */
  latencyTrackerConfig?: Partial<LatencyTrackerConfig>;
  /** Routing memory configuration (optional, uses defaults if not provided) (Issue #463) */
  routingMemoryConfig?: Partial<RoutingMemoryConfig>;
  /** Routing metrics collector for observability (optional) (Issue #559) */
  metricsCollector?: IRoutingMetricsCollector;
  /** Orchestration observer for routing decision tracking (optional) (Issue #587) */
  orchestrationObserver?: IOrchestrationObserver;
}

/**
 * Default configuration.
 */
export const DEFAULT_COMPOSITE_CONFIG: CompositeRouterConfig = {
  enableConfidenceCascade: false, // Issue #755 - New replacement stage (disabled for backward compatibility)
  enableBudgetFilter: true,
  enableCapabilityMatch: false, // Issue #755 - New replacement stage (disabled for backward compatibility)
  enableZeroRouter: true, // Issue #473 - Enable by default (699 lines of tests, fully implemented)
  enablePreferenceRouting: false,
  enableTopsisRanking: true,
  enableLinUCBSelection: true,
  enableQualityConstraint: false, // Issue #755 - New replacement stage (disabled for backward compatibility)
  enableLatencyTracking: true,
  enableRoutingMemory: false,
  enableCapacityBalancing: true, // Issue #807 - Deprioritize exhausted CLIs
  latencyScoreWeight: 0.2,
  billingMode: 'plan',
  linucbAlpha: 1.0,
  maxDecisionTimeMs: 50,
  preferenceMinDataPoints: 10,
};

/**
 * Routing decision with full explanation.
 */
export interface CompositeRoutingDecision {
  /** Selected CLI adapter */
  readonly adapter: ICliAdapter;
  /** Selected CLI name */
  readonly cliName: CliName;
  /** Overall confidence in decision (0-1) */
  readonly confidence: number;
  /** Human-readable explanation */
  readonly reason: string;
  /** Stages executed */
  readonly stagesExecuted: readonly string[];
  /** Decision time in milliseconds */
  readonly decisionTimeMs: number;
  /** Budget feasibility (if budget filter enabled) */
  readonly withinBudget?: boolean | undefined;
  /** ZeroRouter difficulty estimate (if ZeroRouter enabled) */
  readonly difficultyEstimate?: DifficultyEstimate | undefined;
  /** ZeroRouter recommended model tier (if ZeroRouter enabled) */
  readonly difficultyTier?: ModelTier | undefined;
  /** Preference routing score (if preference routing enabled) */
  readonly preferenceScore?: number | undefined;
  /** Selected tier from preference routing */
  readonly preferenceTier?: 'strong' | 'weak' | undefined;
  /** TOPSIS score (if TOPSIS ranking enabled) */
  readonly topsisScore?: number | undefined;
  /** LinUCB UCB score (if LinUCB enabled) */
  readonly ucbScore?: number | undefined;
  /** Latency score (if latency tracking enabled) (Issue #361) */
  readonly latencyScore?: number | undefined;
  /** Alternative adapters in ranked order */
  readonly alternatives: readonly CliName[];
  /** Task analysis used for routing */
  readonly taskProfile: TaskProfile;
}

/**
 * Error from composite routing.
 */
export class CompositeRoutingError extends Error {
  readonly stage: string;

  constructor(message: string, stage: string, cause?: Error) {
    super(message, { cause });
    this.name = 'CompositeRoutingError';
    this.stage = stage;
  }
}

/**
 * Router statistics for observability.
 */
export interface CompositeRouterStats {
  /** Total routing decisions made */
  readonly totalDecisions: number;
  /** Decisions per CLI */
  readonly decisionsPerCli: Readonly<Record<CliName, number>>;
  /** Average decision time in ms */
  readonly avgDecisionTimeMs: number;
  /** Budget filter rejection rate */
  readonly budgetRejectionRate: number;
  /** Preference routing statistics */
  readonly preferenceStats?: {
    /** Whether preference routing is enabled */
    readonly enabled: boolean;
    /** Whether sufficient data for preference routing */
    readonly hasSufficientData: boolean;
    /** Total preference data points collected */
    readonly dataPointCount: number;
    /** Strong model preference rate */
    readonly strongModelPreferenceRate: number;
  };
  /** LinUCB arm statistics */
  readonly banditStats: ReadonlyArray<{ name: string; pullCount: number; avgReward: number }>;
  /** Latency tracking statistics (Issue #361) */
  readonly latencyStats?: LatencyTrackerStats | undefined;
  /** Routing memory statistics (Issue #463) */
  readonly routingMemoryStats?: RoutingMemoryStats | undefined;
}

/**
 * Internal pipeline result type.
 */
export interface PipelineResult {
  candidates: CliName[];
  withinBudget: boolean | undefined;
  difficultyEstimate: DifficultyEstimate | undefined;
  difficultyTier: ModelTier | undefined;
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  topsisRanking: CliName[];
  topsisScore: number | undefined;
  selectedCli: CliName;
  ucbScore: number | undefined;
  latencyScore: number | undefined;
  /** Routing memory recommendation (Issue #489) */
  memoryRecommendation: CliName | undefined;
  /** Routing memory confidence (Issue #489) */
  memoryConfidence: number | undefined;
}

/**
 * Parameters for building routing decision.
 */
export interface BuildDecisionParams {
  taskProfile: TaskProfile;
  selectedCli: CliName;
  candidates: CliName[];
  topsisRanking: CliName[];
  stagesExecuted: string[];
  startTime: number;
  withinBudget: boolean | undefined;
  difficultyEstimate: DifficultyEstimate | undefined;
  difficultyTier: ModelTier | undefined;
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  topsisScore: number | undefined;
  ucbScore: number | undefined;
  latencyScore: number | undefined;
}
