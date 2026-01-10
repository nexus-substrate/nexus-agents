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

/**
 * Configuration schema for CompositeRouter.
 */
export const CompositeRouterConfigSchema = z.object({
  /** Enable budget filtering stage (default: true) */
  enableBudgetFilter: z.boolean().default(true),
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
});

export type CompositeRouterConfig = z.infer<typeof CompositeRouterConfigSchema>;

/**
 * Default configuration.
 */
export const DEFAULT_COMPOSITE_CONFIG: CompositeRouterConfig = {
  enableBudgetFilter: true,
  enableTopsisRanking: true,
  enableLinUCBSelection: true,
  linucbAlpha: 1.0,
  maxDecisionTimeMs: 50,
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
  /** LinUCB arm statistics */
  readonly banditStats: ReadonlyArray<{ name: string; pullCount: number; avgReward: number }>;
}

/**
 * Internal pipeline result type.
 */
export interface PipelineResult {
  candidates: CliName[];
  withinBudget: boolean | undefined;
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
  topsisScore: number | undefined;
  ucbScore: number | undefined;
}
