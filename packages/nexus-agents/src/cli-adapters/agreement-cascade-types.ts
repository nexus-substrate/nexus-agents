/**
 * Agreement-Based Cascade Router Types
 *
 * Type definitions and constants for agreement-based cascade routing.
 *
 * @module cli-adapters/agreement-cascade-types
 * (Source: Issue #121, arXiv:2410.10347)
 */

import { z } from 'zod';
import type { ILogger } from '../core/logger.js';
import type { CliTask, CliResponse, CliError, CliName } from './types.js';
import type { Result } from '../core/index.js';

/**
 * Configuration for agreement-based cascading.
 */
export interface AgreementCascadeConfig {
  /** Agreement threshold (0-1) - minimum fraction of models that must agree */
  readonly agreementThreshold: number;
  /** Maximum cascade stages before accepting best response */
  readonly maxStages: number;
  /** Timeout per model execution in ms */
  readonly modelTimeoutMs: number;
  /** Logger instance */
  readonly logger?: ILogger;
}

export const AgreementCascadeConfigSchema = z.object({
  agreementThreshold: z.number().min(0.5).max(1).default(0.7),
  maxStages: z.number().int().min(1).max(5).default(3),
  modelTimeoutMs: z.number().int().min(1000).max(300000).default(60000),
});

/**
 * Default configuration values.
 */
export const DEFAULT_CASCADE_CONFIG: Required<Omit<AgreementCascadeConfig, 'logger'>> = {
  agreementThreshold: 0.7,
  maxStages: 3,
  modelTimeoutMs: 60000,
};

/**
 * A stage in the cascade with models of similar cost/capability.
 */
export interface CascadeStage {
  /** Stage identifier */
  readonly name: string;
  /** Models to run at this stage */
  readonly models: readonly CliName[];
  /** Relative cost weight (for metrics) */
  readonly costWeight: number;
}

/**
 * Result of running a cascade stage.
 */
export interface StageResult {
  /** Responses from models that completed */
  readonly responses: ReadonlyMap<CliName, CliResponse>;
  /** Models that failed or timed out */
  readonly failures: ReadonlyMap<CliName, string>;
  /** Whether agreement threshold was met */
  readonly hasAgreement: boolean;
  /** The consensus response if agreement was reached */
  readonly consensusResponse?: CliResponse | undefined;
  /** Agreement score (0-1) */
  readonly agreementScore: number;
  /** Stage execution time in ms */
  readonly durationMs: number;
}

/**
 * Result of the full cascade execution.
 */
export interface CascadeResult {
  /** Final response to return */
  readonly response: CliResponse;
  /** Stage at which agreement was reached (or final stage) */
  readonly resolvedAtStage: number;
  /** Total number of stages executed */
  readonly stagesExecuted: number;
  /** Whether consensus was reached or we fell back to best response */
  readonly consensusReached: boolean;
  /** Models that contributed to the final response */
  readonly contributingModels: readonly CliName[];
  /** Total execution time in ms */
  readonly totalDurationMs: number;
  /** Estimated cost savings vs always using expensive model */
  readonly estimatedCostSavings: number;
  /** History of stage results */
  readonly stageHistory: readonly StageResult[];
}

/**
 * Agreement-based cascade router interface.
 */
export interface IAgreementCascadeRouter {
  /**
   * Execute a task using agreement-based cascading.
   */
  execute(task: CliTask, stages: readonly CascadeStage[]): Promise<Result<CascadeResult, CliError>>;

  /**
   * Check agreement between multiple model responses.
   */
  checkAgreement(responses: ReadonlyMap<CliName, CliResponse>): AgreementResult;
}

/**
 * Result of agreement check.
 */
export interface AgreementResult {
  /** Agreement score (0-1) */
  readonly score: number;
  /** Whether threshold is met */
  readonly hasAgreement: boolean;
  /** Clusters of agreeing responses */
  readonly clusters: readonly ResponseCluster[];
  /** The largest cluster's representative response */
  readonly consensusResponse?: CliResponse | undefined;
}

/**
 * A cluster of similar responses.
 */
export interface ResponseCluster {
  /** Models in this cluster */
  readonly models: readonly CliName[];
  /** Representative response for the cluster */
  readonly response: CliResponse;
  /** Similarity score within cluster */
  readonly internalSimilarity: number;
}
