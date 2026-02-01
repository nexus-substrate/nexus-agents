/**
 * nexus-agents/swe-bench - Harness File Operations
 *
 * File validation and process management for SWE-bench harness.
 *
 * @module swe-bench/harness-file-operations
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ILogger } from '../core/logger.js';
import type { HarnessExecutionConfig, HarnessExecutionProgress } from './harness-executor-types.js';
import { PYTHON_COMMAND, HARNESS_SCRIPT, HarnessExecutorError } from './harness-executor-types.js';
import { capitalize } from '../utils/text-utils.js';

// Alias for backward compatibility
const capitalizeFirst = capitalize;

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
 * Builds the full command string for harness execution.
 */
export function buildHarnessCommand(config: HarnessExecutionConfig): string {
  const args = buildHarnessArgs(config);
  return `${PYTHON_COMMAND} ${HARNESS_SCRIPT} ${args.join(' ')}`;
}

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
