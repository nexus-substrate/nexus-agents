/**
 * nexus-agents/swe-bench - Harness Process Runner
 *
 * Process execution and result parsing logic for the harness executor.
 *
 * @module swe-bench/harness-process-runner
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { ChildProcess } from 'node:child_process';
import type { ILogger } from '../core/logger.js';
import type {
  HarnessExecutionConfig,
  HarnessExecutionResult,
  HarnessExecutionProgress,
  HarnessProgressCallback,
} from './harness-executor-types.js';
import { DEFAULT_HARNESS_TIMEOUT_MS, HarnessExecutorError } from './harness-executor-types.js';
import {
  spawnHarnessProcess,
  parseProgressLine,
  parseHarnessLogFile,
  transformHarnessOutput,
  calculateEstimatedRemaining,
  createInitialProgress,
  getResultsFilePath,
} from './harness-executor-helpers.js';

/**
 * Result type without timestamp fields (added by executor).
 */
export type HarnessProcessResult = Omit<
  HarnessExecutionResult,
  'startedAt' | 'completedAt' | 'harnessVersion'
>;

/**
 * Context for managing harness process execution.
 */
export interface HarnessProcessContext {
  readonly logger: ILogger;
  currentProcess: ChildProcess | null;
  isCancelled: boolean;
}

/**
 * Sets up process event handlers for stdout/stderr collection.
 */
export function setupProcessHandlers(
  proc: ChildProcess,
  config: HarnessExecutionConfig,
  progress: HarnessExecutionProgress,
  startTime: number,
  onProgress: HarnessProgressCallback | undefined
): { stderrCollector: { value: string }; timeoutId: NodeJS.Timeout } {
  const stderrCollector = { value: '' };

  proc.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    handleStdoutChunk(chunk, progress, startTime, onProgress);
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
 * Handles stdout chunks for progress updates.
 */
export function handleStdoutChunk(
  chunk: string,
  currentProgress: HarnessExecutionProgress,
  startTime: number,
  onProgress: HarnessProgressCallback | undefined
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
 * Options for handling process close event.
 */
export interface ProcessCloseOptions {
  code: number | null;
  config: HarnessExecutionConfig;
  stderr: string;
  context: HarnessProcessContext;
  resolve: (v: HarnessProcessResult) => void;
  reject: (e: HarnessExecutorError) => void;
}

/**
 * Handles process close event and resolves/rejects the promise.
 */
export function handleProcessClose(options: ProcessCloseOptions): void {
  const { code, config, stderr, context, resolve, reject } = options;

  if (context.isCancelled) {
    reject(new HarnessExecutorError('Execution cancelled', 'CANCELLED'));
    return;
  }

  handleProcessExitAsync(code, config, stderr, context.logger)
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
 * Handles the async portion of process exit.
 */
export async function handleProcessExitAsync(
  code: number | null,
  config: HarnessExecutionConfig,
  stderr: string,
  logger: ILogger
): Promise<HarnessProcessResult> {
  if (code !== 0) {
    logger.error('Harness process failed', new Error(stderr), { exitCode: code });
    throw new HarnessExecutorError(
      `Harness process exited with code ${String(code)}`,
      'EXECUTION_FAILED'
    );
  }

  // Parse results from output file
  return parseResultsFile(config, logger);
}

/**
 * Parses the results file after execution.
 */
export async function parseResultsFile(
  config: HarnessExecutionConfig,
  logger: ILogger
): Promise<HarnessProcessResult> {
  const resultsPath = getResultsFilePath(config);
  logger.info('Parsing results file', { path: resultsPath });

  const rawOutput = await parseHarnessLogFile(resultsPath, logger);
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

/**
 * Runs the harness process and collects output.
 */
export function runHarnessProcess(
  config: HarnessExecutionConfig,
  totalInstances: number,
  context: HarnessProcessContext,
  onProgress: HarnessProgressCallback | undefined
): Promise<HarnessProcessResult> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    let progress = createInitialProgress(totalInstances);
    progress = { ...progress, state: 'starting' };
    onProgress?.(progress);

    const proc = spawnHarnessProcess(config, context.logger);
    context.currentProcess = proc;

    const { stderrCollector, timeoutId } = setupProcessHandlers(
      proc,
      config,
      progress,
      startTime,
      onProgress
    );

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      context.currentProcess = null;
      handleProcessClose({
        code,
        config,
        stderr: stderrCollector.value,
        context,
        resolve,
        reject,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      context.currentProcess = null;
      reject(new HarnessExecutorError(`Process error: ${err.message}`, 'EXECUTION_FAILED', err));
    });
  });
}
