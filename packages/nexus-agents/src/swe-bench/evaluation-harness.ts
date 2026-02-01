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

import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import type { SWEBenchPrediction } from './types.js';
import type {
  IEvaluationHarness,
  EvaluationHarnessConfig,
  EvaluationRunResult,
  InstanceEvaluationResult,
  EvaluationValidationResult,
  EvaluationProgressCallback,
} from './evaluation-harness-types.js';
import { DEFAULT_EVALUATION_CONFIG, EvaluationHarnessError } from './evaluation-harness-types.js';
import { HarnessExecutor, createHarnessExecutor } from './harness-executor.js';
import type { HarnessExecutionConfig } from './harness-executor-types.js';
import { validateEnvironment } from './environment-validator.js';
import { writePredictions } from './prediction-writer.js';
import {
  calculateMetrics,
  calculateRepositoryMetrics,
  extractModelName,
  createProgressAdapter,
  getMemoryInfo,
  getCpuCores,
} from './evaluation-harness-helpers.js';

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
    const memoryInfo = getMemoryInfo();
    const cpuCores = getCpuCores();

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
    const startedAt = getTimeProvider().nowIso();
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

    const completedAt = getTimeProvider().nowIso();
    const metrics = calculateMetrics(result.instanceResults);
    const repositoryMetrics = calculateRepositoryMetrics(result.instanceResults);

    const runResult: EvaluationRunResult = {
      runId: effectiveConfig.runId,
      datasetName: effectiveConfig.datasetName,
      modelNameOrPath: extractModelName(predictions),
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
      runId: `single-${prediction.instance_id}-${String(getTimeProvider().now())}`,
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

    const harnessProgress = createProgressAdapter(predictions.length, onProgress);

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
