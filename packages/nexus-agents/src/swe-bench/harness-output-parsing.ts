/**
 * nexus-agents/swe-bench - Harness Output Parsing
 *
 * Output parsing utilities for SWE-bench harness results.
 *
 * @module swe-bench/harness-output-parsing
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import * as fs from 'node:fs/promises';
import type { ILogger } from '../core/logger.js';
import type { TestCaseResult, InstanceEvaluationResult } from './evaluation-harness-types.js';
import type {
  RawHarnessOutput,
  RawInstanceResult,
  RawTestResult,
  HarnessExecutionProgress,
} from './harness-executor-types.js';
import { mapTestStatus, mapResolutionStatus } from './harness-executor-types.js';

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
