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

import type { Result } from '../core/index.js';
import { ok, err, getTimeProvider } from '../core/index.js';
import { createLogger } from '../core/logger.js';
import type { ILogger } from '../core/logger.js';
import type { CliTask, CliResponse, CliError, CliName, ICliAdapter } from './types.js';
import type {
  AgreementCascadeConfig,
  CascadeStage,
  StageResult,
  CascadeResult,
  IAgreementCascadeRouter,
  AgreementResult,
} from './agreement-cascade-types.js';
import { AgreementCascadeConfigSchema, DEFAULT_CASCADE_CONFIG } from './agreement-cascade-types.js';
import { clusterResponses, selectBestResponse } from './agreement-cascade-helpers.js';

// Re-export types for backward compatibility
export type {
  AgreementCascadeConfig,
  CascadeStage,
  StageResult,
  CascadeResult,
  IAgreementCascadeRouter,
  AgreementResult,
  ResponseCluster,
} from './agreement-cascade-types.js';
export { AgreementCascadeConfigSchema, DEFAULT_CASCADE_CONFIG } from './agreement-cascade-types.js';
export { createDefaultCascadeStages } from './agreement-cascade-helpers.js';

const logger = createLogger({ component: 'agreement-cascade-router' });

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
    const startTime = getTimeProvider().now();
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
      totalDurationMs: getTimeProvider().now() - startTime,
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
    const bestResponse = selectBestResponse(stageHistory);

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
      totalDurationMs: getTimeProvider().now() - startTime,
      estimatedCostSavings: 0,
      stageHistory,
    });
  }

  /**
   * Execute a single cascade stage with multiple models.
   */
  private async executeStage(task: CliTask, stage: CascadeStage): Promise<StageResult> {
    const startTime = getTimeProvider().now();
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
      durationMs: getTimeProvider().now() - startTime,
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
      const [model, response] = [...responses][0] as [CliName, CliResponse];
      return {
        score: 1,
        hasAgreement: true,
        clusters: [{ models: [model], response, internalSimilarity: 1 }],
        consensusResponse: response,
      };
    }

    // Cluster responses by similarity
    const clusters = clusterResponses(responses);

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
