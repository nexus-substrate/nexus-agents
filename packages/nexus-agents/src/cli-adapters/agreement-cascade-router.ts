/**
 * Agreement-Based Cascade Router
 *
 * Implements optimal cascade routing based on arxiv:2410.10347
 * "A Unified Approach to Routing and Cascading for LLMs".
 *
 * Key technique: Run query through multiple models at each cascade stage.
 * If models agree, use the cheaper response. If they disagree, escalate.
 *
 * This differs from confidence-based routing (SATER) which estimates
 * confidence from a single response. Agreement-based cascading uses
 * ensemble voting for more reliable escalation decisions.
 *
 * @module cli-adapters/agreement-cascade-router
 * (Source: Issue #121, arXiv:2410.10347)
 */

import { z } from 'zod';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { createLogger } from '../core/logger.js';
import type { ILogger } from '../core/logger.js';
import type { CliTask, CliResponse, CliError, CliName, ICliAdapter } from './types.js';

const logger = createLogger({ component: 'agreement-cascade-router' });

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

/**
 * Agreement-based cascade router implementation.
 */
export class AgreementCascadeRouter implements IAgreementCascadeRouter {
  private readonly adapters: Map<CliName, ICliAdapter>;
  private readonly config: Required<Omit<AgreementCascadeConfig, 'logger'>>;
  private readonly log: ILogger;

  constructor(adapters: Map<CliName, ICliAdapter>, config?: Partial<AgreementCascadeConfig>) {
    this.adapters = adapters;
    const parsed = AgreementCascadeConfigSchema.safeParse(config ?? {});
    if (!parsed.success) {
      throw new Error(`Invalid cascade config: ${parsed.error.message}`);
    }
    this.config = { ...DEFAULT_CASCADE_CONFIG, ...parsed.data };
    this.log = config?.logger ?? logger;
  }

  async execute(
    task: CliTask,
    stages: readonly CascadeStage[]
  ): Promise<Result<CascadeResult, CliError>> {
    const startTime = Date.now();
    const stageHistory: StageResult[] = [];
    let totalCostWeight = 0;
    const maxCostWeight = stages.reduce((sum, s) => sum + s.costWeight, 0);

    for (let i = 0; i < Math.min(stages.length, this.config.maxStages); i++) {
      const stage = stages[i];
      if (stage === undefined) continue;

      this.log.info('Executing cascade stage', { stage: stage.name, models: stage.models });
      const stageResult = await this.executeStage(task, stage);
      stageHistory.push(stageResult);
      totalCostWeight += stage.costWeight;

      if (stageResult.hasAgreement && stageResult.consensusResponse !== undefined) {
        return this.buildConsensusResult({
          stageResult,
          stageIndex: i,
          stageHistory,
          startTime,
          totalCostWeight,
          maxCostWeight,
        });
      }

      this.log.debug('No agreement at stage', {
        stage: stage.name,
        agreementScore: stageResult.agreementScore,
        threshold: this.config.agreementThreshold,
      });
    }

    return this.buildFallbackResult(stageHistory, startTime);
  }

  /** Builds result when consensus is reached. */
  private buildConsensusResult(opts: {
    stageResult: StageResult;
    stageIndex: number;
    stageHistory: StageResult[];
    startTime: number;
    totalCostWeight: number;
    maxCostWeight: number;
  }): Result<CascadeResult, CliError> {
    const { stageResult, stageIndex, stageHistory, startTime, totalCostWeight, maxCostWeight } =
      opts;
    const costSavings = (maxCostWeight - totalCostWeight) / maxCostWeight;
    this.log.info('Agreement reached', { agreementScore: stageResult.agreementScore });

    // consensusResponse is guaranteed to exist when called (checked by caller)
    const response = stageResult.consensusResponse ?? { text: '', model: 'unknown' };

    return ok({
      response,
      resolvedAtStage: stageIndex,
      stagesExecuted: stageIndex + 1,
      consensusReached: true,
      contributingModels: Array.from(stageResult.responses.keys()),
      totalDurationMs: Date.now() - startTime,
      estimatedCostSavings: costSavings,
      stageHistory,
    });
  }

  /** Builds fallback result when no consensus was reached. */
  private buildFallbackResult(
    stageHistory: StageResult[],
    startTime: number
  ): Result<CascadeResult, CliError> {
    const finalStage = stageHistory[stageHistory.length - 1];
    const bestResponse = this.selectBestResponse(stageHistory);

    if (bestResponse === undefined) {
      return err({
        code: 'EXECUTION_ERROR',
        message: 'All models failed to produce a response',
        cli: 'unknown' as CliName,
        retryable: true,
      });
    }

    this.log.warn('Cascade completed without consensus', {
      stagesExecuted: stageHistory.length,
      finalAgreementScore: finalStage?.agreementScore ?? 0,
    });

    return ok({
      response: bestResponse.response,
      resolvedAtStage: stageHistory.length - 1,
      stagesExecuted: stageHistory.length,
      consensusReached: false,
      contributingModels: [bestResponse.model],
      totalDurationMs: Date.now() - startTime,
      estimatedCostSavings: 0,
      stageHistory,
    });
  }

  /**
   * Execute a single cascade stage with multiple models.
   */
  private async executeStage(task: CliTask, stage: CascadeStage): Promise<StageResult> {
    const startTime = Date.now();
    const responses = new Map<CliName, CliResponse>();
    const failures = new Map<CliName, string>();

    // Execute all models in the stage in parallel
    const execPromises = stage.models.map(async (modelName) => {
      const adapter = this.adapters.get(modelName);
      if (adapter === undefined) {
        failures.set(modelName, 'Adapter not found');
        return;
      }

      try {
        const result = await this.executeWithTimeout(adapter, task);
        if (result.ok) {
          responses.set(modelName, result.value);
        } else {
          failures.set(modelName, result.error.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failures.set(modelName, message);
      }
    });

    await Promise.all(execPromises);

    // Check agreement
    const agreement = this.checkAgreement(responses);

    return {
      responses,
      failures,
      hasAgreement: agreement.hasAgreement,
      consensusResponse: agreement.consensusResponse,
      agreementScore: agreement.score,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute adapter with timeout.
   */
  private async executeWithTimeout(
    adapter: ICliAdapter,
    task: CliTask
  ): Promise<Result<CliResponse, CliError>> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(
          err({
            code: 'TIMEOUT',
            message: `Model timed out after ${String(this.config.modelTimeoutMs)}ms`,
            cli: adapter.name,
            retryable: true,
          })
        );
      }, this.config.modelTimeoutMs);

      adapter
        .execute(task)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          resolve(
            err({
              code: 'EXECUTION_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
              cli: adapter.name,
              retryable: true,
            })
          );
        });
    });
  }

  /**
   * Check agreement between model responses using semantic similarity.
   */
  checkAgreement(responses: ReadonlyMap<CliName, CliResponse>): AgreementResult {
    if (responses.size === 0) {
      return { score: 0, hasAgreement: false, clusters: [] };
    }

    if (responses.size === 1) {
      const [model, response] = Array.from(responses.entries())[0] as [CliName, CliResponse];
      return {
        score: 1,
        hasAgreement: true,
        clusters: [{ models: [model], response, internalSimilarity: 1 }],
        consensusResponse: response,
      };
    }

    // Cluster responses by similarity
    const clusters = this.clusterResponses(responses);

    // Find the largest cluster
    const sortedClusters = [...clusters].sort((a, b) => b.models.length - a.models.length);
    const largestCluster = sortedClusters[0];

    if (largestCluster === undefined) {
      return { score: 0, hasAgreement: false, clusters };
    }

    // Agreement score = fraction of models in largest cluster
    const agreementScore = largestCluster.models.length / responses.size;
    const hasAgreement = agreementScore >= this.config.agreementThreshold;

    return {
      score: agreementScore,
      hasAgreement,
      clusters,
      consensusResponse: hasAgreement ? largestCluster.response : undefined,
    };
  }

  /**
   * Cluster responses by semantic similarity.
   * Uses simplified token overlap as similarity metric.
   */
  private clusterResponses(responses: ReadonlyMap<CliName, CliResponse>): ResponseCluster[] {
    const entries = Array.from(responses.entries());
    const clusters: ResponseCluster[] = [];
    const assigned = new Set<CliName>();

    for (const [model, response] of entries) {
      if (assigned.has(model)) continue;

      // Start a new cluster with this response
      const clusterModels: CliName[] = [model];
      assigned.add(model);

      // Find similar responses
      for (const [otherModel, otherResponse] of entries) {
        if (assigned.has(otherModel)) continue;

        const similarity = this.calculateSimilarity(response.text, otherResponse.text);
        if (similarity >= 0.7) {
          clusterModels.push(otherModel);
          assigned.add(otherModel);
        }
      }

      clusters.push({
        models: clusterModels,
        response,
        internalSimilarity: this.calculateClusterSimilarity(clusterModels, responses),
      });
    }

    return clusters;
  }

  /**
   * Calculate similarity between two responses using token overlap.
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const tokens1 = this.tokenize(text1);
    const tokens2 = this.tokenize(text2);

    if (tokens1.size === 0 || tokens2.size === 0) {
      return 0;
    }

    // Jaccard similarity
    const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Tokenize text into a set of normalized tokens.
   */
  private tokenize(text: string): Set<string> {
    // Extract meaningful tokens (words, code identifiers)
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    return new Set(tokens);
  }

  /**
   * Calculate average pairwise similarity within a cluster.
   */
  private calculateClusterSimilarity(
    models: readonly CliName[],
    responses: ReadonlyMap<CliName, CliResponse>
  ): number {
    if (models.length <= 1) return 1;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const resp1 = responses.get(models[i] as CliName);
        const resp2 = responses.get(models[j] as CliName);
        if (resp1 !== undefined && resp2 !== undefined) {
          totalSimilarity += this.calculateSimilarity(resp1.text, resp2.text);
          pairCount++;
        }
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  /**
   * Select the best response from all stage results.
   */
  private selectBestResponse(
    stageHistory: readonly StageResult[]
  ): { response: CliResponse; model: CliName } | undefined {
    // Prefer responses from later stages (more capable models)
    for (let i = stageHistory.length - 1; i >= 0; i--) {
      const stage = stageHistory[i];
      if (stage === undefined) continue;

      // Find the response with best characteristics
      const candidates = Array.from(stage.responses.entries());
      if (candidates.length > 0) {
        // Sort by response length (longer responses often more complete)
        candidates.sort((a, b) => b[1].text.length - a[1].text.length);
        const best = candidates[0];
        if (best !== undefined) {
          return { response: best[1], model: best[0] };
        }
      }
    }

    return undefined;
  }
}

/**
 * Creates default cascade stages for typical usage.
 * Fast -> Balanced -> Powerful progression.
 */
export function createDefaultCascadeStages(): CascadeStage[] {
  return [
    {
      name: 'fast',
      models: ['gemini'] as CliName[], // Fast, cheap
      costWeight: 1,
    },
    {
      name: 'balanced',
      models: ['gemini', 'codex'] as CliName[], // Multiple models for agreement
      costWeight: 3,
    },
    {
      name: 'powerful',
      models: ['claude', 'gemini'] as CliName[], // High capability
      costWeight: 10,
    },
  ];
}

/**
 * Creates an agreement-based cascade router.
 */
export function createAgreementCascadeRouter(
  adapters: Map<CliName, ICliAdapter>,
  config?: Partial<AgreementCascadeConfig>
): IAgreementCascadeRouter {
  return new AgreementCascadeRouter(adapters, config);
}
