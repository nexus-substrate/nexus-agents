/**
 * Cascade Router Base
 *
 * Abstract base class for cascade routing patterns.
 * Extracts common functionality from ConfidenceRouter and AgreementCascadeRouter.
 *
 * Issue #574: Consolidate router implementations behind unified interface.
 *
 * @module cli-adapters/cascade-router-base
 * (Source: Issue #574, System Mandate Loop H)
 */

import type { Result } from '../core/index.js';
import { err, getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { CliTask, CliResponse, CliError, CliName, ICliAdapter } from './types.js';
import type { UnifiedRoutingDecision, RoutingStrategy } from './unified-routing-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Base configuration for cascade routers.
 */
export interface CascadeRouterBaseConfig {
  /** Maximum number of stages to execute (default: 3) */
  readonly maxStages?: number;
  /**
   * Timeout per model execution in milliseconds (default: 120000).
   *
   * The doc said 30000 until #5767. The default was raised to 120s in #1484
   * because cascade tasks are standard+ complexity and 30s cut architecture,
   * security and research work short; the note recording that sits on the
   * constant below, where a reader hovering this field never sees it. A caller
   * sizing an outer deadline from the documented 30s was budgeting for a
   * quarter of the real one.
   */
  readonly modelTimeoutMs?: number;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Default cascade router configuration.
 */
export const DEFAULT_CASCADE_BASE_CONFIG: Required<Omit<CascadeRouterBaseConfig, 'logger'>> = {
  maxStages: 3,
  // Cascade tasks are typically standard+ complexity (#1484).
  // Previous 30s default caused premature timeouts for architecture,
  // security, and research tasks that need 120-600s.
  modelTimeoutMs: 120_000,
};

/**
 * Result from executing a single model.
 */
export interface ModelExecutionResult {
  /** The CLI that was executed */
  readonly cli: CliName;
  /** Whether execution succeeded */
  readonly success: boolean;
  /** Response if successful */
  readonly response?: CliResponse | undefined;
  /** Error message if failed */
  readonly error?: string | undefined;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Result from a cascade stage.
 */
export interface CascadeStageResult {
  /** Stage name/identifier */
  readonly stageName: string;
  /** Models executed in this stage */
  readonly modelsExecuted: readonly CliName[];
  /** Individual model results */
  readonly modelResults: readonly ModelExecutionResult[];
  /** Whether stage should stop cascade (consensus/threshold reached) */
  readonly shouldStop: boolean;
  /** Selected response if stopping */
  readonly selectedResponse?: CliResponse | undefined;
  /** Selected CLI if stopping */
  readonly selectedCli?: CliName | undefined;
  /** Stage-specific score (confidence, agreement, etc.) */
  readonly score: number;
  /** Stage duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Final cascade result.
 */
export interface CascadeExecutionResult {
  /** The selected response */
  readonly response: CliResponse;
  /** The CLI that produced the response */
  readonly selectedCli: CliName;
  /** Stage at which cascade stopped (0-indexed) */
  readonly stoppedAtStage: number;
  /** Total stages executed */
  readonly stagesExecuted: number;
  /** All models that contributed */
  readonly contributingModels: readonly CliName[];
  /** History of all stages */
  readonly stageHistory: readonly CascadeStageResult[];
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;
  /** Estimated cost savings (0-1) */
  readonly estimatedCostSavings: number;
  /** Final score (confidence, agreement, etc.) */
  readonly finalScore: number;
}

/**
 * Interface for cascade router implementations.
 */
export interface ICascadeRouter {
  /** Execute the cascade routing. */
  execute(task: CliTask): Promise<Result<CascadeExecutionResult, CliError>>;

  /** Get the routing strategy identifier. */
  getStrategy(): RoutingStrategy;

  /** Convert cascade result to unified routing decision. */
  toUnifiedDecision(result: CascadeExecutionResult, decisionTimeMs: number): UnifiedRoutingDecision;
}

// ============================================================================
// Abstract Base Class
// ============================================================================

/**
 * Abstract base class for cascade routers.
 *
 * Provides common functionality for:
 * - Model execution with timeout
 * - Stage history tracking
 * - Cost savings calculation
 * - Unified decision conversion
 *
 * Subclasses must implement:
 * - executeStage(): Execute models and determine if cascade should stop
 * - getStageModels(): Get models for each stage
 * - calculateScore(): Calculate stage-specific score
 */
export abstract class CascadeRouterBase implements ICascadeRouter {
  protected readonly adapters: Map<CliName, ICliAdapter>;
  protected readonly config: Required<Omit<CascadeRouterBaseConfig, 'logger'>>;
  protected readonly log: ILogger;

  constructor(adapters: Map<CliName, ICliAdapter>, config?: CascadeRouterBaseConfig) {
    this.adapters = adapters;
    this.config = { ...DEFAULT_CASCADE_BASE_CONFIG, ...config };
    this.log = config?.logger ?? createLogger({ component: this.constructor.name });
  }

  /**
   * Execute the cascade routing.
   */
  async execute(task: CliTask): Promise<Result<CascadeExecutionResult, CliError>> {
    const startTime = getTimeProvider().now();
    const stageHistory: CascadeStageResult[] = [];
    let totalCostWeight = 0;
    const maxCostWeight = this.getTotalCostWeight();

    for (let stageIndex = 0; stageIndex < this.config.maxStages; stageIndex++) {
      const stageModels = this.getStageModels(stageIndex);
      if (stageModels.length === 0) {
        break;
      }

      const stageName = this.getStageName(stageIndex);
      this.log.info('Executing cascade stage', { stage: stageName, models: stageModels });

      const stageResult = await this.executeStage(task, stageIndex, stageModels);
      stageHistory.push(stageResult);
      totalCostWeight += this.getStageCostWeight(stageIndex);

      if (stageResult.shouldStop && stageResult.selectedResponse !== undefined) {
        const costSavings = (maxCostWeight - totalCostWeight) / maxCostWeight;

        return {
          ok: true,
          value: {
            response: stageResult.selectedResponse,
            selectedCli: stageResult.selectedCli ?? stageModels[0] ?? ('unknown' as CliName),
            stoppedAtStage: stageIndex,
            stagesExecuted: stageIndex + 1,
            contributingModels: this.collectContributingModels(stageHistory),
            stageHistory,
            totalDurationMs: getTimeProvider().now() - startTime,
            estimatedCostSavings: costSavings,
            finalScore: stageResult.score,
          },
        };
      }

      this.log.debug('Stage did not reach threshold', {
        stage: stageName,
        score: stageResult.score,
      });
    }

    // Cascade exhausted without stopping - use fallback
    return this.buildFallbackResult(stageHistory, startTime);
  }

  /**
   * Get the routing strategy identifier.
   */
  abstract getStrategy(): RoutingStrategy;

  /**
   * Execute a single stage of the cascade.
   * Subclasses implement the specific logic (confidence check, agreement check, etc.)
   */
  protected abstract executeStage(
    task: CliTask,
    stageIndex: number,
    models: readonly CliName[]
  ): Promise<CascadeStageResult>;

  /**
   * Get the models to execute at a given stage.
   */
  protected abstract getStageModels(stageIndex: number): readonly CliName[];

  /**
   * Get the name for a stage.
   */
  protected getStageName(stageIndex: number): string {
    return `stage-${String(stageIndex)}`;
  }

  /**
   * Get the cost weight for a stage (for cost savings calculation).
   */
  protected getStageCostWeight(_stageIndex: number): number {
    return 1;
  }

  /**
   * Get total cost weight across all stages.
   */
  protected getTotalCostWeight(): number {
    let total = 0;
    for (let i = 0; i < this.config.maxStages; i++) {
      const models = this.getStageModels(i);
      if (models.length === 0) break;
      total += this.getStageCostWeight(i);
    }
    return total;
  }

  /**
   * Execute a single model with timeout.
   */
  protected async executeModel(model: CliName, task: CliTask): Promise<ModelExecutionResult> {
    const startTime = getTimeProvider().now();
    const adapter = this.adapters.get(model);

    if (adapter === undefined) {
      return {
        cli: model,
        success: false,
        error: 'Adapter not found',
        durationMs: getTimeProvider().now() - startTime,
      };
    }

    try {
      const result = await this.executeWithTimeout(adapter, task);

      if (result.ok) {
        return {
          cli: model,
          success: true,
          response: result.value,
          durationMs: getTimeProvider().now() - startTime,
        };
      } else {
        return {
          cli: model,
          success: false,
          error: result.error.message,
          durationMs: getTimeProvider().now() - startTime,
        };
      }
    } catch (error) {
      return {
        cli: model,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: getTimeProvider().now() - startTime,
      };
    }
  }

  /**
   * Execute multiple models in parallel.
   */
  protected async executeModelsParallel(
    models: readonly CliName[],
    task: CliTask
  ): Promise<readonly ModelExecutionResult[]> {
    const results = await Promise.all(models.map((model) => this.executeModel(model, task)));
    return results;
  }

  /**
   * Execute adapter with timeout.
   */
  protected executeWithTimeout(
    adapter: ICliAdapter,
    task: CliTask
  ): Promise<Result<CliResponse, CliError>> {
    return new Promise((resolve) => {
      const timeoutMs = this.config.modelTimeoutMs;
      const timeout = setTimeout(() => {
        resolve(
          err({
            code: 'TIMEOUT',
            message: `Model timed out after ${String(timeoutMs)}ms`,
            cli: adapter.name,
            retryable: true,
          })
        );
      }, timeoutMs);

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
   * Build fallback result when cascade exhausts without stopping.
   */
  protected buildFallbackResult(
    stageHistory: readonly CascadeStageResult[],
    startTime: number
  ): Result<CascadeExecutionResult, CliError> {
    const bestResult = this.selectBestFromHistory(stageHistory);

    if (bestResult === undefined) {
      return err({
        code: 'EXECUTION_ERROR',
        message: 'All models failed to produce a response',
        cli: 'unknown' as CliName,
        retryable: true,
      });
    }

    this.log.warn('Cascade completed without reaching threshold', {
      stagesExecuted: stageHistory.length,
      finalScore: stageHistory[stageHistory.length - 1]?.score ?? 0,
    });

    return {
      ok: true,
      value: {
        response: bestResult.response,
        selectedCli: bestResult.cli,
        stoppedAtStage: stageHistory.length - 1,
        stagesExecuted: stageHistory.length,
        contributingModels: [bestResult.cli],
        stageHistory,
        totalDurationMs: getTimeProvider().now() - startTime,
        estimatedCostSavings: 0,
        finalScore: stageHistory[stageHistory.length - 1]?.score ?? 0,
      },
    };
  }

  /**
   * Select the best response from stage history.
   * Default: select the last successful response from the latest stage.
   * Subclasses can override for custom selection logic.
   */
  protected selectBestFromHistory(
    stageHistory: readonly CascadeStageResult[]
  ): { response: CliResponse; cli: CliName } | undefined {
    // Iterate stages from last to first
    for (let i = stageHistory.length - 1; i >= 0; i--) {
      const stage = stageHistory[i];
      if (stage === undefined) continue;

      // Find first successful result in this stage
      for (const result of stage.modelResults) {
        if (result.success && result.response !== undefined) {
          return { response: result.response, cli: result.cli };
        }
      }
    }
    return undefined;
  }

  /**
   * Collect all contributing models from stage history.
   */
  protected collectContributingModels(
    stageHistory: readonly CascadeStageResult[]
  ): readonly CliName[] {
    const models = new Set<CliName>();
    for (const stage of stageHistory) {
      for (const result of stage.modelResults) {
        if (result.success) {
          models.add(result.cli);
        }
      }
    }
    return Array.from(models);
  }

  /**
   * Convert cascade result to unified routing decision.
   */
  toUnifiedDecision(
    result: CascadeExecutionResult,
    decisionTimeMs: number
  ): UnifiedRoutingDecision {
    const stoppedStage = String(result.stoppedAtStage);
    const scoreStr = result.finalScore.toFixed(2);
    return {
      selectedCli: result.selectedCli,
      confidence: result.finalScore,
      reason: `Cascade resolved at stage ${stoppedStage} with score ${scoreStr}`,
      strategy: this.getStrategy(),
      decisionTimeMs,
      alternatives: result.contributingModels.filter((m) => m !== result.selectedCli),
      stagesExecuted: result.stageHistory.map((s) => s.stageName),
      resolvedAtStage: result.stoppedAtStage,
      consensusReached: result.estimatedCostSavings > 0,
      agreementScore: result.finalScore,
      metadata: {
        estimatedCostSavings: result.estimatedCostSavings,
        totalDurationMs: result.totalDurationMs,
      },
    };
  }
}
