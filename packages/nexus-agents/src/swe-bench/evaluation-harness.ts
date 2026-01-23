/**
 * nexus-agents/swe-bench - Evaluation Harness
 *
 * Main evaluation harness implementation that orchestrates:
 * - Patch application in isolated environments
 * - Test execution and result collection
 * - Scoring and metrics calculation
 *
 * @module swe-bench/evaluation-harness
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import * as os from 'node:os';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { SWEBenchPrediction } from './types.js';
import type {
  IEvaluationHarness,
  EvaluationHarnessConfig,
  EvaluationRunResult,
  InstanceEvaluationResult,
  EvaluationValidationResult,
  EvaluationProgress,
  EvaluationProgressCallback,
  EvaluationMetrics,
  RepositoryMetrics,
} from './evaluation-harness-types.js';
import { DEFAULT_EVALUATION_CONFIG, EvaluationHarnessError } from './evaluation-harness-types.js';
import { HarnessExecutor, createHarnessExecutor } from './harness-executor.js';
import type { HarnessExecutionConfig } from './harness-executor-types.js';
import { validateEnvironment } from './environment-validator.js';
import { writePredictions } from './prediction-writer.js';

// ============================================================================
// Evaluation Harness Implementation
// ============================================================================

/**
 * Main SWE-bench evaluation harness.
 *
 * Coordinates the evaluation pipeline:
 * 1. Validate environment prerequisites
 * 2. Load and validate predictions
 * 3. Execute harness in Docker containers
 * 4. Aggregate and report results
 */
export class EvaluationHarness implements IEvaluationHarness {
  private readonly logger: ILogger;
  private readonly executor: HarnessExecutor;
  private isCancelled = false;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'evaluation-harness' });
    this.executor = createHarnessExecutor(this.logger);
  }

  /**
   * Validates that the evaluation environment is ready.
   */
  async validate(): Promise<EvaluationValidationResult> {
    this.logger.info('Validating evaluation environment');

    const envResult = await validateEnvironment(this.logger);
    const memoryInfo = this.getMemoryInfo();
    const cpuCores = this.getCpuCores();

    const ready = envResult.valid;
    const errors: string[] = [...envResult.errors];
    const warnings: string[] = [...envResult.warnings];

    const result: EvaluationValidationResult = {
      ready,
      dockerAvailable: envResult.docker.running,
      harnessInstalled: envResult.swebench.installed,
      availableDiskSpace: envResult.diskSpace.available,
      availableMemory: memoryInfo.free,
      cpuCores,
      errors,
      warnings,
    };

    // Add optional fields only if they have values
    if (envResult.docker.version !== undefined) {
      (result as { dockerVersion: string }).dockerVersion = envResult.docker.version;
    }
    if (envResult.swebench.version !== undefined) {
      (result as { harnessVersion: string }).harnessVersion = envResult.swebench.version;
    }

    return result;
  }

  /**
   * Runs evaluation on a set of predictions.
   */
  async evaluate(
    predictions: readonly SWEBenchPrediction[],
    config: EvaluationHarnessConfig,
    onProgress?: EvaluationProgressCallback
  ): Promise<EvaluationRunResult> {
    this.isCancelled = false;
    const startedAt = new Date().toISOString();
    const effectiveConfig = { ...DEFAULT_EVALUATION_CONFIG, ...config };

    this.logger.info('Starting evaluation', {
      runId: effectiveConfig.runId,
      predictionsCount: predictions.length,
      datasetName: effectiveConfig.datasetName,
    });

    // Pre-flight validation
    const validation = await this.validate();
    if (!validation.ready) {
      throw new EvaluationHarnessError(
        `Environment not ready: ${validation.errors.join(', ')}`,
        'DOCKER_NOT_AVAILABLE'
      );
    }

    // Write predictions to temporary file
    const predictionsPath = await this.writePredictionsFile(predictions, effectiveConfig);

    // Execute harness
    const result = await this.executeHarness(
      predictionsPath,
      predictions,
      effectiveConfig,
      onProgress
    );

    const completedAt = new Date().toISOString();
    const metrics = this.calculateMetrics(result.instanceResults);
    const repositoryMetrics = this.calculateRepositoryMetrics(result.instanceResults);

    const runResult: EvaluationRunResult = {
      runId: effectiveConfig.runId,
      datasetName: effectiveConfig.datasetName,
      modelNameOrPath: this.extractModelName(predictions),
      startedAt,
      completedAt,
      metrics,
      repositoryMetrics,
      instanceResults: result.instanceResults,
      config: effectiveConfig,
    };

    // Add optional harnessVersion only if present
    if (result.harnessVersion !== undefined) {
      return { ...runResult, harnessVersion: result.harnessVersion };
    }

    return runResult;
  }

  /**
   * Evaluates a single instance for testing/debugging.
   */
  async evaluateInstance(
    prediction: SWEBenchPrediction,
    config: EvaluationHarnessConfig
  ): Promise<InstanceEvaluationResult> {
    this.logger.info('Evaluating single instance', {
      instanceId: prediction.instance_id,
    });

    const singleConfig: EvaluationHarnessConfig = {
      ...config,
      instanceIds: [prediction.instance_id],
      runId: `single-${prediction.instance_id}-${String(Date.now())}`,
    };

    const result = await this.evaluate([prediction], singleConfig);
    const instanceResult = result.instanceResults.find(
      (r) => r.instanceId === prediction.instance_id
    );

    if (instanceResult === undefined) {
      throw new EvaluationHarnessError(
        `No result found for instance: ${prediction.instance_id}`,
        'UNKNOWN'
      );
    }

    return instanceResult;
  }

  /**
   * Cancels an in-progress evaluation.
   */
  async cancel(): Promise<void> {
    this.logger.info('Cancelling evaluation');
    this.isCancelled = true;
    await this.executor.cancel();
  }

  /**
   * Gets the harness version.
   */
  async getVersion(): Promise<string> {
    return this.executor.getVersion();
  }

  /**
   * Writes predictions to a temporary JSONL file.
   */
  private async writePredictionsFile(
    predictions: readonly SWEBenchPrediction[],
    config: EvaluationHarnessConfig
  ): Promise<string> {
    const predictionsPath = config.predictionsPath;

    const writeResult = await writePredictions([...predictions], predictionsPath);
    if (!writeResult.ok) {
      throw new EvaluationHarnessError(
        `Failed to write predictions: ${writeResult.error.message}`,
        'INVALID_PREDICTIONS_FORMAT',
        writeResult.error
      );
    }

    this.logger.debug('Predictions written', {
      path: predictionsPath,
      count: predictions.length,
    });

    return predictionsPath;
  }

  /**
   * Executes the harness and transforms progress updates.
   */
  private async executeHarness(
    predictionsPath: string,
    predictions: readonly SWEBenchPrediction[],
    config: EvaluationHarnessConfig,
    onProgress?: EvaluationProgressCallback
  ): Promise<{
    instanceResults: readonly InstanceEvaluationResult[];
    harnessVersion?: string;
  }> {
    const harnessConfig: HarnessExecutionConfig = {
      predictionsPath,
      datasetName: config.datasetName,
      maxWorkers: config.maxWorkers,
      runId: config.runId,
      timeoutSeconds: config.timeoutSeconds,
      outputDir: config.outputDir,
      useDocker: config.mode === 'docker',
      cacheLevel: config.cacheLevel,
      ...(config.instanceIds !== undefined && config.instanceIds.length > 0
        ? { instanceIds: config.instanceIds }
        : {}),
    };

    const harnessProgress = this.createProgressAdapter(predictions.length, onProgress);

    const result = await this.executor.execute(harnessConfig, harnessProgress);

    const returnValue: {
      instanceResults: readonly InstanceEvaluationResult[];
      harnessVersion?: string;
    } = {
      instanceResults: result.instanceResults,
    };

    if (result.harnessVersion !== undefined) {
      return { ...returnValue, harnessVersion: result.harnessVersion };
    }

    return returnValue;
  }

  /**
   * Creates a progress adapter from harness progress to evaluation progress.
   */
  private createProgressAdapter(
    totalPredictions: number,
    onProgress?: EvaluationProgressCallback
  ): ((progress: unknown) => void) | undefined {
    if (onProgress === undefined) {
      return undefined;
    }

    return (harnessProgress: unknown) => {
      const hp = harnessProgress as {
        currentInstanceId?: string;
        completedCount: number;
        totalCount: number;
        resolvedCount: number;
        elapsedMs: number;
        estimatedRemainingMs?: number;
        state: string;
      };

      const evaluationProgress: EvaluationProgress = {
        currentInstanceId: hp.currentInstanceId ?? '',
        currentIndex: hp.completedCount,
        totalInstances: hp.totalCount || totalPredictions,
        completedInstances: hp.completedCount,
        resolvedSoFar: hp.resolvedCount,
        currentResolutionRate: hp.completedCount > 0 ? hp.resolvedCount / hp.completedCount : 0,
        estimatedRemainingMs: hp.estimatedRemainingMs ?? 0,
        phase: this.mapStateToPhase(hp.state),
      };

      onProgress(evaluationProgress);
    };
  }

  /**
   * Maps harness state to evaluation phase.
   */
  private mapStateToPhase(state: string): EvaluationProgress['phase'] {
    const phaseMap: Record<string, EvaluationProgress['phase']> = {
      idle: 'initializing',
      starting: 'loading_predictions',
      running: 'evaluating',
      parsing: 'aggregating',
      completed: 'complete',
      failed: 'complete',
      cancelled: 'complete',
    };
    return phaseMap[state] ?? 'evaluating';
  }

  /**
   * Calculates aggregate metrics from instance results.
   */
  private calculateMetrics(results: readonly InstanceEvaluationResult[]): EvaluationMetrics {
    const totalInstances = results.length;
    const predictedInstances = totalInstances;
    const resolvedInstances = results.filter((r) => r.resolved).length;
    const patchesApplied = results.filter((r) => r.patchApplied).length;
    const timeouts = results.filter((r) => r.status === 'timeout').length;
    const errors = results.filter((r) => r.status === 'error').length;

    const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    const avgDurationMs = totalInstances > 0 ? Math.round(totalDurationMs / totalInstances) : 0;

    return {
      totalInstances,
      predictedInstances,
      resolvedInstances,
      resolutionRate: predictedInstances > 0 ? resolvedInstances / predictedInstances : 0,
      patchesApplied,
      patchApplicationRate: predictedInstances > 0 ? patchesApplied / predictedInstances : 0,
      timeouts,
      errors,
      avgDurationMs,
      totalDurationMs,
    };
  }

  /**
   * Calculates per-repository metrics.
   */
  private calculateRepositoryMetrics(
    results: readonly InstanceEvaluationResult[]
  ): readonly RepositoryMetrics[] {
    const repoMap = new Map<string, { total: number; resolved: number }>();

    for (const result of results) {
      const repo = this.extractRepoFromInstanceId(result.instanceId);
      const current = repoMap.get(repo) ?? { total: 0, resolved: 0 };
      current.total++;
      if (result.resolved) {
        current.resolved++;
      }
      repoMap.set(repo, current);
    }

    return Array.from(repoMap.entries()).map(([repository, stats]) => ({
      repository,
      totalInstances: stats.total,
      resolvedInstances: stats.resolved,
      resolutionRate: stats.total > 0 ? stats.resolved / stats.total : 0,
    }));
  }

  /**
   * Extracts repository name from instance ID.
   * Instance IDs follow format: "owner__repo-issue_number"
   * Handles hyphenated names like "scikit-learn__scikit-learn-9876"
   */
  private extractRepoFromInstanceId(instanceId: string): string {
    const doubleUnderscoreIdx = instanceId.indexOf('__');
    const lastDashIdx = instanceId.lastIndexOf('-');

    if (doubleUnderscoreIdx !== -1 && lastDashIdx > doubleUnderscoreIdx) {
      const owner = instanceId.slice(0, doubleUnderscoreIdx);
      const repoAndIssue = instanceId.slice(doubleUnderscoreIdx + 2);
      const repoName = repoAndIssue.slice(0, repoAndIssue.lastIndexOf('-'));
      return `${owner}/${repoName}`;
    }

    // Fallback for unexpected formats
    return 'unknown';
  }

  /**
   * Extracts model name from predictions.
   */
  private extractModelName(predictions: readonly SWEBenchPrediction[]): string {
    const first = predictions[0];
    return first?.model_name_or_path ?? 'unknown';
  }

  /**
   * Gets memory information.
   */
  private getMemoryInfo(): { total: number; free: number } {
    return {
      total: os.totalmem(),
      free: os.freemem(),
    };
  }

  /**
   * Gets CPU core count.
   */
  private getCpuCores(): number {
    return os.cpus().length;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new evaluation harness instance.
 */
export function createEvaluationHarness(logger?: ILogger): EvaluationHarness {
  return new EvaluationHarness(logger);
}

/**
 * Validates environment and returns harness if ready.
 */
export async function createValidatedHarness(
  logger?: ILogger
): Promise<Result<EvaluationHarness, EvaluationHarnessError>> {
  const harness = createEvaluationHarness(logger);
  const validation = await harness.validate();

  if (!validation.ready) {
    return err(
      new EvaluationHarnessError(
        `Environment not ready: ${validation.errors.join(', ')}`,
        'DOCKER_NOT_AVAILABLE'
      )
    );
  }

  return ok(harness);
}

/**
 * Quick evaluation helper for simple use cases.
 */
export async function evaluatePredictions(
  predictions: readonly SWEBenchPrediction[],
  options: Partial<EvaluationHarnessConfig> = {},
  onProgress?: EvaluationProgressCallback
): Promise<EvaluationRunResult> {
  const harness = createEvaluationHarness();
  const config: EvaluationHarnessConfig = {
    ...DEFAULT_EVALUATION_CONFIG,
    ...options,
  };
  return harness.evaluate(predictions, config, onProgress);
}
