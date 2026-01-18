/**
 * nexus-agents/swe-bench - Harness Executor Helpers
 *
 * Utility functions for SWE-bench harness execution:
 * - Command building
 * - Output parsing
 * - Result transformation
 *
 * @module swe-bench/harness-executor-helpers
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { exec, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ILogger } from '../core/logger.js';
import type { TestCaseResult, InstanceEvaluationResult } from './evaluation-harness-types.js';
import type {
  HarnessExecutionConfig,
  RawHarnessOutput,
  RawInstanceResult,
  RawTestResult,
  HarnessExecutionProgress,
} from './harness-executor-types.js';
import {
  PYTHON_COMMAND,
  HARNESS_SCRIPT,
  MAX_OUTPUT_BUFFER_BYTES,
  QUICK_COMMAND_TIMEOUT_MS,
  HarnessExecutorError,
  mapTestStatus,
  mapResolutionStatus,
} from './harness-executor-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Command Building
// ============================================================================

/**
 * Builds command line arguments for swebench harness.
 */
export function buildHarnessArgs(config: HarnessExecutionConfig): string[] {
  const args: string[] = [
    '--predictions_path',
    config.predictionsPath,
    '--dataset_name',
    `princeton-nlp/SWE-bench_${capitalizeFirst(config.datasetName)}`,
    '--max_workers',
    String(config.maxWorkers),
    '--run_id',
    config.runId,
    '--timeout',
    String(config.timeoutSeconds),
    '--output_dir',
    config.outputDir,
    '--cache_level',
    config.cacheLevel,
  ];

  if (config.instanceIds !== undefined && config.instanceIds.length > 0) {
    args.push('--instance_ids', config.instanceIds.join(','));
  }

  return args;
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (str.length === 0) return str;
  const first = str[0];
  if (first === undefined) return str;
  return first.toUpperCase() + str.slice(1);
}

/**
 * Builds the full command string for harness execution.
 */
export function buildHarnessCommand(config: HarnessExecutionConfig): string {
  const args = buildHarnessArgs(config);
  return `${PYTHON_COMMAND} ${HARNESS_SCRIPT} ${args.join(' ')}`;
}

// ============================================================================
// Version Detection
// ============================================================================

/**
 * Gets the swebench package version.
 */
export async function getSwebenchVersion(logger?: ILogger): Promise<string | null> {
  try {
    const result = await execAsync(
      `${PYTHON_COMMAND} -c "import swebench; print(swebench.__version__)"`,
      { timeout: QUICK_COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BUFFER_BYTES }
    );
    const version = result.stdout.trim();
    if (version) {
      logger?.debug('swebench version detected', { version });
      return version;
    }
  } catch (err) {
    logger?.debug('Failed to get swebench version', { error: String(err) });
  }
  return null;
}

/**
 * Gets the Python version.
 */
export async function getPythonVersion(logger?: ILogger): Promise<string | null> {
  try {
    const result = await execAsync(`${PYTHON_COMMAND} --version`, {
      timeout: QUICK_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BUFFER_BYTES,
    });
    const match = result.stdout.trim().match(/Python\s+(\d+\.\d+\.\d+)/);
    if (match?.[1] !== undefined) {
      logger?.debug('Python version detected', { version: match[1] });
      return match[1];
    }
  } catch (err) {
    logger?.debug('Failed to get Python version', { error: String(err) });
  }
  return null;
}

/**
 * Gets the Docker version.
 */
export async function getDockerVersion(logger?: ILogger): Promise<string | null> {
  try {
    const result = await execAsync('docker version --format "{{.Server.Version}}"', {
      timeout: QUICK_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BUFFER_BYTES,
    });
    const version = result.stdout.trim();
    if (version) {
      logger?.debug('Docker version detected', { version });
      return version;
    }
  } catch (err) {
    logger?.debug('Failed to get Docker version', { error: String(err) });
  }
  return null;
}

// ============================================================================
// Output Parsing
// ============================================================================

/**
 * Parses raw harness JSON output.
 */
export function parseHarnessOutput(output: string, logger?: ILogger): RawHarnessOutput | null {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!isValidHarnessOutput(parsed)) {
      logger?.warn('Invalid harness output structure');
      return null;
    }
    return parsed;
  } catch (err) {
    logger?.warn('Failed to parse harness output', { error: String(err) });
    return null;
  }
}

/**
 * Type guard for RawHarnessOutput.
 */
function isValidHarnessOutput(obj: unknown): obj is RawHarnessOutput {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.run_id === 'string' &&
    typeof o.dataset_name === 'string' &&
    typeof o.model_name_or_path === 'string' &&
    Array.isArray(o.instance_results)
  );
}

/**
 * Parses harness log file for results.
 */
export async function parseHarnessLogFile(
  logPath: string,
  logger?: ILogger
): Promise<RawHarnessOutput | null> {
  try {
    const content = await fs.readFile(logPath, 'utf-8');
    return parseHarnessOutput(content, logger);
  } catch (err) {
    logger?.warn('Failed to read harness log file', { logPath, error: String(err) });
    return null;
  }
}

/**
 * Extracts progress information from harness stdout line.
 */
export function parseProgressLine(
  line: string,
  _currentProgress: HarnessExecutionProgress
): Partial<HarnessExecutionProgress> | null {
  // Pattern: [X/Y] instance_id - status
  const progressMatch = line.match(/\[(\d+)\/(\d+)\]\s+(\S+)/);
  if (progressMatch) {
    const completed = progressMatch[1];
    const total = progressMatch[2];
    const instanceId = progressMatch[3];
    if (completed !== undefined && total !== undefined && instanceId !== undefined) {
      return {
        completedCount: parseInt(completed, 10),
        totalCount: parseInt(total, 10),
        currentInstanceId: instanceId,
        latestLog: line,
      };
    }
  }

  // Pattern: Resolved: X/Y
  const resolvedMatch = line.match(/Resolved:\s*(\d+)\/(\d+)/);
  if (resolvedMatch) {
    const resolved = resolvedMatch[1];
    if (resolved !== undefined) {
      return { resolvedCount: parseInt(resolved, 10), latestLog: line };
    }
  }

  return null;
}

// ============================================================================
// Result Transformation
// ============================================================================

/**
 * Transforms a raw test result to typed TestCaseResult.
 */
export function transformTestResult(raw: RawTestResult): TestCaseResult {
  const result: TestCaseResult = {
    testName: raw.test_name,
    status: mapTestStatus(raw.status),
    durationMs: raw.duration_ms ?? 0,
  };

  if (raw.error_message !== undefined && raw.error_message !== '') {
    return { ...result, errorMessage: raw.error_message };
  }

  if (raw.stack_trace !== undefined && raw.stack_trace !== '') {
    return { ...result, stackTrace: raw.stack_trace };
  }

  return result;
}

/**
 * Transforms a raw instance result to typed InstanceEvaluationResult.
 */
export function transformInstanceResult(raw: RawInstanceResult): InstanceEvaluationResult {
  const testResults: TestCaseResult[] = raw.test_results?.map(transformTestResult) ?? [];

  const result: InstanceEvaluationResult = {
    instanceId: raw.instance_id,
    modelNameOrPath: raw.model_name_or_path,
    resolved: raw.resolved,
    status: mapResolutionStatus(raw),
    testResults,
    testsPassed: raw.tests_passed,
    testsFailed: raw.tests_failed,
    testsTotal: raw.tests_total,
    patchApplied: raw.patch_applied,
    durationMs: raw.duration_ms,
  };

  // Add optional fields only if present
  if (raw.patch_error !== undefined && raw.patch_error !== '') {
    return { ...result, patchError: raw.patch_error };
  }

  if (raw.log_path !== undefined && raw.log_path !== '') {
    return { ...result, logPath: raw.log_path };
  }

  if (raw.container_id !== undefined && raw.container_id !== '') {
    return { ...result, containerId: raw.container_id };
  }

  return result;
}

/**
 * Transforms raw harness output to typed results.
 */
export function transformHarnessOutput(raw: RawHarnessOutput): {
  instanceResults: InstanceEvaluationResult[];
  resolvedCount: number;
  totalCount: number;
} {
  const instanceResults = raw.instance_results.map(transformInstanceResult);
  const resolvedCount = instanceResults.filter((r) => r.resolved).length;
  return {
    instanceResults,
    resolvedCount,
    totalCount: instanceResults.length,
  };
}

// ============================================================================
// File Validation
// ============================================================================

/**
 * Checks if a single prediction line is valid.
 */
function isValidPredictionLine(line: string): boolean {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return (
      typeof parsed.instance_id === 'string' &&
      typeof parsed.model_name_or_path === 'string' &&
      typeof parsed.model_patch === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Counts valid prediction lines in content.
 */
function countValidPredictions(content: string): number {
  const lines = content.trim().split('\n').filter(Boolean);
  return lines.filter(isValidPredictionLine).length;
}

/**
 * Validates that the predictions file exists and is readable.
 */
export async function validatePredictionsFile(
  predictionsPath: string,
  logger?: ILogger
): Promise<{ valid: boolean; lineCount: number; error?: string }> {
  try {
    const stat = await fs.stat(predictionsPath);
    if (!stat.isFile()) {
      return { valid: false, lineCount: 0, error: 'Path is not a file' };
    }

    const content = await fs.readFile(predictionsPath, 'utf-8');
    const validCount = countValidPredictions(content);

    if (validCount === 0) {
      return { valid: false, lineCount: 0, error: 'No valid predictions found' };
    }

    logger?.debug('Predictions file validated', { lineCount: validCount, path: predictionsPath });
    return { valid: true, lineCount: validCount };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { valid: false, lineCount: 0, error: errorMsg };
  }
}

/**
 * Ensures output directory exists.
 */
export async function ensureOutputDir(outputDir: string, logger?: ILogger): Promise<void> {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    logger?.debug('Output directory ensured', { path: outputDir });
  } catch (err) {
    logger?.warn('Failed to create output directory', { path: outputDir, error: String(err) });
    throw new HarnessExecutorError(
      `Failed to create output directory: ${outputDir}`,
      'EXECUTION_FAILED',
      err
    );
  }
}

// ============================================================================
// Process Management
// ============================================================================

/**
 * Spawns the harness process with proper handling.
 */
export function spawnHarnessProcess(
  config: HarnessExecutionConfig,
  logger?: ILogger
): ChildProcess {
  const args = [HARNESS_SCRIPT.split(' ')[0] ?? '-m', ...HARNESS_SCRIPT.split(' ').slice(1)];
  args.push(...buildHarnessArgs(config));

  logger?.info('Spawning harness process', { command: PYTHON_COMMAND, args });

  const proc = spawn(PYTHON_COMMAND, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  return proc;
}

/**
 * Calculates estimated remaining time based on progress.
 */
export function calculateEstimatedRemaining(
  completedCount: number,
  totalCount: number,
  elapsedMs: number
): number | undefined {
  if (completedCount === 0 || totalCount === 0) return undefined;
  const avgTimePerInstance = elapsedMs / completedCount;
  const remaining = totalCount - completedCount;
  return Math.round(avgTimePerInstance * remaining);
}

/**
 * Creates initial progress state.
 */
export function createInitialProgress(totalCount: number): HarnessExecutionProgress {
  return {
    state: 'idle',
    completedCount: 0,
    totalCount,
    resolvedCount: 0,
    elapsedMs: 0,
  };
}

/**
 * Gets the expected results file path.
 */
export function getResultsFilePath(config: HarnessExecutionConfig): string {
  return path.join(config.outputDir, config.runId, 'results.json');
}
