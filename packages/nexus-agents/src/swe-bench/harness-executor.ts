/**
 * nexus-agents/swe-bench - Harness Executor
 *
 * Executes the SWE-bench evaluation harness and parses results.
 * Integrates with environment-validator for pre-flight checks.
 *
 * @module swe-bench/harness-executor
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
  HarnessExecutionProgress,
  HarnessProgressCallback,
} from './harness-executor-types.js';
import {
  DEFAULT_HARNESS_EXECUTION_CONFIG,
  DEFAULT_HARNESS_TIMEOUT_MS,
  HarnessExecutorError,
} from './harness-executor-types.js';
import {
  getSwebenchVersion,
  getPythonVersion,
  getDockerVersion,
  validatePredictionsFile,
  ensureOutputDir,
  spawnHarnessProcess,
  parseProgressLine,
  parseHarnessLogFile,
  transformHarnessOutput,
  calculateEstimatedRemaining,
  createInitialProgress,
  getResultsFilePath,
} from './harness-executor-helpers.js';

// Re-export types for convenience
export type {
  HarnessExecutionConfig,
  HarnessExecutionResult,
  HarnessValidationResult,
  HarnessExecutionProgress,
  HarnessProgressCallback,
  IHarnessExecutor,
} from './harness-executor-types.js';

export {
  HarnessExecutorError,
  DEFAULT_HARNESS_EXECUTION_CONFIG,
} from './harness-executor-types.js';

// ============================================================================
// Harness Executor Implementation
// ============================================================================

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

    // Pre-flight validation
    const validationResult = await this.validate();
    if (!validationResult.ready) {
      throw new HarnessExecutorError(
        `Environment not ready: ${validationResult.errors.join(', ')}`,
        'HARNESS_NOT_FOUND'
      );
    }

    // Validate predictions file
    const predictionsValidation = await validatePredictionsFile(
      effectiveConfig.predictionsPath,
      this.logger
    );
    if (!predictionsValidation.valid) {
      throw new HarnessExecutorError(
        `Invalid predictions file: ${predictionsValidation.error ?? 'unknown error'}`,
        'INVALID_PREDICTIONS'
      );
    }

    // Ensure output directory exists
    await ensureOutputDir(effectiveConfig.outputDir, this.logger);

    // Execute harness
    const result = await this.runHarnessProcess(
      effectiveConfig,
      predictionsValidation.lineCount,
      onProgress
    );

    const completedAt = new Date().toISOString();

    const executionResult: HarnessExecutionResult = {
      ...result,
      startedAt,
      completedAt,
    };

    // Only add harnessVersion if present
    if (validationResult.swebenchVersion !== undefined) {
      return { ...executionResult, harnessVersion: validationResult.swebenchVersion };
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

  /**
   * Sets up process event handlers.
   */
  private setupProcessHandlers(
    proc: ChildProcess,
    config: HarnessExecutionConfig,
    progress: HarnessExecutionProgress,
    startTime: number,
    onProgress?: HarnessProgressCallback
  ): { stderrCollector: { value: string }; timeoutId: NodeJS.Timeout } {
    const stderrCollector = { value: '' };

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      this.handleStdoutChunk(chunk, progress, startTime, onProgress);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderrCollector.value += data.toString();
    });

    const timeoutId = setTimeout(
      () => {
        proc.kill('SIGTERM');
      },
      config.timeoutSeconds * 1000 || DEFAULT_HARNESS_TIMEOUT_MS
    );

    return { stderrCollector, timeoutId };
  }

  /**
   * Runs the harness process and collects output.
   */
  private async runHarnessProcess(
    config: HarnessExecutionConfig,
    totalInstances: number,
    onProgress?: HarnessProgressCallback
  ): Promise<Omit<HarnessExecutionResult, 'startedAt' | 'completedAt' | 'harnessVersion'>> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      let progress = createInitialProgress(totalInstances);
      progress = { ...progress, state: 'starting' };
      onProgress?.(progress);

      const proc = spawnHarnessProcess(config, this.logger);
      this.currentProcess = proc;

      const { stderrCollector, timeoutId } = this.setupProcessHandlers(
        proc,
        config,
        progress,
        startTime,
        onProgress
      );

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        this.currentProcess = null;
        this.onProcessClose(code, config, stderrCollector.value, resolve, reject);
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        this.currentProcess = null;
        reject(new HarnessExecutorError(`Process error: ${err.message}`, 'EXECUTION_FAILED', err));
      });
    });
  }

  /**
   * Handles process close event.
   */
  private onProcessClose(
    code: number | null,
    config: HarnessExecutionConfig,
    stderr: string,
    resolve: (
      v: Omit<HarnessExecutionResult, 'startedAt' | 'completedAt' | 'harnessVersion'>
    ) => void,
    reject: (e: HarnessExecutorError) => void
  ): void {
    if (this.isCancelled) {
      reject(new HarnessExecutorError('Execution cancelled', 'CANCELLED'));
      return;
    }

    this.handleProcessExitAsync(code, config, stderr)
      .then((result) => {
        resolve(result);
      })
      .catch((err: unknown) => {
        if (err instanceof HarnessExecutorError) {
          reject(err);
        } else {
          reject(new HarnessExecutorError('Unexpected error', 'UNKNOWN', err));
        }
      });
  }

  /**
   * Handles stdout chunks for progress updates.
   */
  private handleStdoutChunk(
    chunk: string,
    currentProgress: HarnessExecutionProgress,
    startTime: number,
    onProgress?: HarnessProgressCallback
  ): void {
    const lines = chunk.split('\n').filter(Boolean);
    let updatedProgress: HarnessExecutionProgress = {
      ...currentProgress,
      state: 'running',
    };

    for (const line of lines) {
      const progressUpdate = parseProgressLine(line, updatedProgress);
      if (progressUpdate !== null) {
        updatedProgress = { ...updatedProgress, ...progressUpdate };
      }
    }

    const elapsedMs = Math.round(performance.now() - startTime);
    const estimatedRemaining = calculateEstimatedRemaining(
      updatedProgress.completedCount,
      updatedProgress.totalCount,
      elapsedMs
    );

    const finalProgress: HarnessExecutionProgress = {
      ...updatedProgress,
      elapsedMs,
    };

    // Only add estimatedRemainingMs if calculated
    if (estimatedRemaining !== undefined) {
      onProgress?.({ ...finalProgress, estimatedRemainingMs: estimatedRemaining });
    } else {
      onProgress?.(finalProgress);
    }
  }

  /**
   * Context for process exit handling.
   */
  private async handleProcessExitAsync(
    code: number | null,
    config: HarnessExecutionConfig,
    stderr: string
  ): Promise<Omit<HarnessExecutionResult, 'startedAt' | 'completedAt' | 'harnessVersion'>> {
    if (code !== 0) {
      this.logger.error('Harness process failed', new Error(stderr), { exitCode: code });
      throw new HarnessExecutorError(
        `Harness process exited with code ${String(code)}`,
        'EXECUTION_FAILED'
      );
    }

    // Parse results from output file
    return this.parseResultsFile(config);
  }

  /**
   * Parses the results file after execution.
   */
  private async parseResultsFile(
    config: HarnessExecutionConfig
  ): Promise<Omit<HarnessExecutionResult, 'startedAt' | 'completedAt' | 'harnessVersion'>> {
    const resultsPath = getResultsFilePath(config);
    this.logger.info('Parsing results file', { path: resultsPath });

    const rawOutput = await parseHarnessLogFile(resultsPath, this.logger);
    if (rawOutput === null) {
      throw new HarnessExecutorError(`Failed to parse results from: ${resultsPath}`, 'PARSE_ERROR');
    }

    const { instanceResults, resolvedCount, totalCount } = transformHarnessOutput(rawOutput);
    const resolutionRate = totalCount > 0 ? resolvedCount / totalCount : 0;

    return {
      success: true,
      runId: config.runId,
      datasetName: config.datasetName,
      modelNameOrPath: rawOutput.model_name_or_path,
      totalInstances: totalCount,
      resolvedInstances: resolvedCount,
      resolutionRate,
      instanceResults,
      logPath: resultsPath,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new harness executor instance.
 */
export function createHarnessExecutor(logger?: ILogger): HarnessExecutor {
  return new HarnessExecutor(logger);
}

/**
 * Validates the environment and returns a configured executor if ready.
 */
export async function createValidatedExecutor(
  logger?: ILogger
): Promise<{ executor: HarnessExecutor; validation: HarnessValidationResult }> {
  const executor = createHarnessExecutor(logger);
  const validation = await executor.validate();
  return { executor, validation };
}

/**
 * Quick execution helper for simple use cases.
 */
export async function executeHarness(
  predictionsPath: string,
  options: Partial<HarnessExecutionConfig> = {},
  onProgress?: HarnessProgressCallback
): Promise<HarnessExecutionResult> {
  const executor = createHarnessExecutor();
  const config: HarnessExecutionConfig = {
    ...DEFAULT_HARNESS_EXECUTION_CONFIG,
    ...options,
    predictionsPath,
  };
  return executor.execute(config, onProgress);
}
