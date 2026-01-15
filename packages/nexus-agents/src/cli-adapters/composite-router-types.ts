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
import type { TaskProfile } from './task-analyzer.js';
import type { PreferenceRouterConfig } from './preference-router-types.js';

/**
 * Configuration schema for CompositeRouter.
 */
export const CompositeRouterConfigSchema = z.object({
  /** Enable budget filtering stage (default: true) */
  enableBudgetFilter: z.boolean().default(true),
  /** Enable preference-trained routing stage (default: false) */
  enablePreferenceRouting: z.boolean().default(false),
  /** Enable TOPSIS ranking stage (default: true) */
  enableTopsisRanking: z.boolean().default(true),
  /** Enable LinUCB selection stage (default: true) */
  enableLinUCBSelection: z.boolean().default(true),
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
  /** Maximum routing decision time in ms (default: 50) */
  maxDecisionTimeMs: z.number().positive().default(50),
  /** Minimum preference data points before using learned routing (default: 10) */
  preferenceMinDataPoints: z.number().int().positive().default(10),
});

export type CompositeRouterConfig = z.infer<typeof CompositeRouterConfigSchema>;

/**
 * Extended config type that includes preference router config.
 */
export interface CompositeRouterConfigWithPreference extends CompositeRouterConfig {
  /** Preference router configuration (optional, uses defaults if not provided) */
  preferenceRouterConfig?: Partial<PreferenceRouterConfig>;
}

/**
 * Default configuration.
 */
export const DEFAULT_COMPOSITE_CONFIG: CompositeRouterConfig = {
  enableBudgetFilter: true,
  enablePreferenceRouting: false,
  enableTopsisRanking: true,
  enableLinUCBSelection: true,
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
  /** Preference routing score (if preference routing enabled) */
  readonly preferenceScore?: number | undefined;
  /** Selected tier from preference routing */
  readonly preferenceTier?: 'strong' | 'weak' | undefined;
  /** TOPSIS score (if TOPSIS ranking enabled) */
  readonly topsisScore?: number | undefined;
  /** LinUCB UCB score (if LinUCB enabled) */
  readonly ucbScore?: number | undefined;
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
}

/**
 * Internal pipeline result type.
 */
export interface PipelineResult {
  candidates: CliName[];
  withinBudget: boolean | undefined;
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  topsisRanking: CliName[];
  topsisScore: number | undefined;
  selectedCli: CliName;
  ucbScore: number | undefined;
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
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  topsisScore: number | undefined;
  ucbScore: number | undefined;
}
