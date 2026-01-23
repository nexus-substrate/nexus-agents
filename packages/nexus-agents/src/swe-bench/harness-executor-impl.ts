/**
 * nexus-agents/swe-bench - Harness Executor Implementation
 *
 * Core implementation of the SWE-bench evaluation harness executor.
 * Executes the official SWE-bench evaluation harness and parses results.
 *
 * @module swe-bench/harness-executor-impl
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { ChildProcess } from 'node:child_process';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { InstanceEvaluationResult } from './evaluation-harness-types.js';
import type {
  IHarnessExecutor,
  HarnessExecutionConfig,
  HarnessExecutionResult,
  HarnessValidationResult,
  HarnessProgressCallback,
} from './harness-executor-types.js';
import {
  DEFAULT_HARNESS_EXECUTION_CONFIG,
  HarnessExecutorError,
} from './harness-executor-types.js';
import {
  getSwebenchVersion,
  getPythonVersion,
  getDockerVersion,
  validatePredictionsFile,
  ensureOutputDir,
} from './harness-executor-helpers.js';
import { runHarnessProcess } from './harness-process-runner.js';

/**
 * SWE-bench harness executor.
 *
 * Executes the official SWE-bench evaluation harness and parses results.
 * Uses Docker containers to run test evaluations in isolated environments.
 */
export class HarnessExecutor implements IHarnessExecutor {
  private readonly logger: ILogger;
  private currentProcess: ChildProcess | null = null;
  private isCancelled = false;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'harness-executor' });
  }

  /**
   * Validates that the environment is ready for harness execution.
   */
  async validate(): Promise<HarnessValidationResult> {
    this.logger.info('Validating harness environment');
    const errors: string[] = [];

    const [pythonVersion, swebenchVersion, dockerVersion] = await Promise.all([
      getPythonVersion(this.logger),
      getSwebenchVersion(this.logger),
      getDockerVersion(this.logger),
    ]);

    const pythonAvailable = pythonVersion !== null;
    const swebenchInstalled = swebenchVersion !== null;
    const dockerAvailable = dockerVersion !== null;

    if (!pythonAvailable) {
      errors.push('Python 3 is not available');
    }

    if (!swebenchInstalled) {
      errors.push('swebench package is not installed. Install with: pip install swebench');
    }

    if (!dockerAvailable) {
      errors.push('Docker is not available or not running');
    }

    const ready = errors.length === 0;

    this.logger.info('Validation complete', { ready, errorCount: errors.length });

    const result: HarnessValidationResult = {
      ready,
      pythonAvailable,
      swebenchInstalled,
      dockerAvailable,
      errors,
    };

    // Add optional version fields only if present
    if (pythonVersion !== null) {
      return { ...result, pythonVersion };
    }
    if (swebenchVersion !== null) {
      return { ...result, swebenchVersion };
    }
    if (dockerVersion !== null) {
      return { ...result, dockerVersion };
    }

    return result;
  }

  /**
   * Executes the SWE-bench harness on predictions.
   */
  async execute(
    config: HarnessExecutionConfig,
    onProgress?: HarnessProgressCallback
  ): Promise<HarnessExecutionResult> {
    this.isCancelled = false;
    const startedAt = new Date().toISOString();
    const effectiveConfig = { ...DEFAULT_HARNESS_EXECUTION_CONFIG, ...config };

    this.logger.info('Starting harness execution', {
      runId: effectiveConfig.runId,
      datasetName: effectiveConfig.datasetName,
      predictionsPath: effectiveConfig.predictionsPath,
    });

    const { validationResult, lineCount } = await this.prepareExecution(effectiveConfig);

    const result = await this.runHarness(effectiveConfig, lineCount, onProgress);

    return this.buildExecutionResult(result, startedAt, validationResult.swebenchVersion);
  }

  /**
   * Prepares execution by validating environment and predictions.
   */
  private async prepareExecution(config: HarnessExecutionConfig): Promise<{
    validationResult: HarnessValidationResult;
    lineCount: number;
  }> {
    const validationResult = await this.validate();
    if (!validationResult.ready) {
      throw new HarnessExecutorError(
        `Environment not ready: ${validationResult.errors.join(', ')}`,
        'HARNESS_NOT_FOUND'
      );
    }

    const predictionsValidation = await validatePredictionsFile(
      config.predictionsPath,
      this.logger
    );
    if (!predictionsValidation.valid) {
      throw new HarnessExecutorError(
        `Invalid predictions file: ${predictionsValidation.error ?? 'unknown error'}`,
        'INVALID_PREDICTIONS'
      );
    }

    await ensureOutputDir(config.outputDir, this.logger);

    return { validationResult, lineCount: predictionsValidation.lineCount };
  }

  /**
   * Runs the harness process.
   */
  private async runHarness(
    config: HarnessExecutionConfig,
    lineCount: number,
    onProgress?: HarnessProgressCallback
  ): Promise<Omit<HarnessExecutionResult, 'startedAt' | 'completedAt' | 'harnessVersion'>> {
    const context = {
      logger: this.logger,
      currentProcess: this.currentProcess,
      isCancelled: this.isCancelled,
    };

    const result = await runHarnessProcess(config, lineCount, context, onProgress);
    this.currentProcess = context.currentProcess;

    return result;
  }

  /**
   * Builds the final execution result.
   */
  private buildExecutionResult(
    result: Omit<HarnessExecutionResult, 'startedAt' | 'completedAt' | 'harnessVersion'>,
    startedAt: string,
    swebenchVersion?: string
  ): HarnessExecutionResult {
    const completedAt = new Date().toISOString();
    const executionResult: HarnessExecutionResult = { ...result, startedAt, completedAt };

    if (swebenchVersion !== undefined) {
      return { ...executionResult, harnessVersion: swebenchVersion };
    }

    return executionResult;
  }

  /**
   * Executes evaluation for a single instance.
   */
  async executeInstance(
    instanceId: string,
    config: HarnessExecutionConfig
  ): Promise<InstanceEvaluationResult> {
    this.logger.info('Executing single instance', { instanceId });

    const singleConfig: HarnessExecutionConfig = {
      ...config,
      instanceIds: [instanceId],
      maxWorkers: 1,
      runId: `single-${instanceId}-${String(Date.now())}`,
    };

    const result = await this.execute(singleConfig);

    const instanceResult = result.instanceResults.find((r) => r.instanceId === instanceId);
    if (instanceResult === undefined) {
      throw new HarnessExecutorError(`No result found for instance: ${instanceId}`, 'PARSE_ERROR');
    }

    return instanceResult;
  }

  /**
   * Cancels an in-progress execution.
   */
  async cancel(): Promise<void> {
    this.logger.info('Cancelling harness execution');
    this.isCancelled = true;

    const proc = this.currentProcess;
    if (proc !== null) {
      proc.kill('SIGTERM');
      // Give it a moment to clean up
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Check again in case process exited during wait
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }
  }

  /**
   * Gets the harness version.
   */
  async getVersion(): Promise<string> {
    const version = await getSwebenchVersion(this.logger);
    return version ?? 'unknown';
  }
}
