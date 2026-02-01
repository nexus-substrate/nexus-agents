/**
 * nexus-agents/testing/framework - Run Result Builder
 *
 * Builds test run results from executed task results.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import * as os from 'node:os';
import { getTimeProvider } from '../../core/index.js';
import type { ICliAdapter, CliName } from '../../cli-adapters/types.js';
import type {
  TaskTestResult,
  TestRunResult,
  EnvironmentInfo,
  TestRunnerConfig,
  TaskFilter,
  AggregatedMetrics,
} from './types.js';
import { VERSION } from '../../version.js';
import { computeAggregatedMetrics } from './test-metrics.js';

/**
 * Options for building a test run result.
 */
export interface RunResultOptions {
  /** Unique run ID */
  readonly runId: string;
  /** Configuration */
  readonly config: TestRunnerConfig;
  /** Start time */
  readonly startTime: Date;
  /** End time */
  readonly endTime: Date;
  /** Task results */
  readonly results: TaskTestResult[];
  /** Optional filter */
  readonly filter?: TaskFilter;
  /** CLI adapters for environment info */
  readonly adapters: Map<CliName, ICliAdapter>;
}

/**
 * Computes success and failure counts.
 */
function computeResultCounts(results: readonly TaskTestResult[]): {
  successCount: number;
  failureCount: number;
} {
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;
  return { successCount, failureCount };
}

/**
 * Determines if the run was successful.
 */
function determineSuccess(failureCount: number, stopOnFailure: boolean): boolean {
  return failureCount === 0 || !stopOnFailure;
}

/**
 * Creates the failure summary string.
 */
function createFailureSummary(failureCount: number, total: number): string | undefined {
  if (failureCount > 0) {
    return `${String(failureCount)} of ${String(total)} tasks failed`;
  }
  return undefined;
}

/**
 * Gets environment information for metadata.
 */
export async function getEnvironmentInfo(
  adapters: Map<CliName, ICliAdapter>
): Promise<EnvironmentInfo> {
  const cliVersions = new Map<CliName, string>();

  for (const [name, adapter] of adapters) {
    try {
      const version = await adapter.getVersion();
      cliVersions.set(name, version);
    } catch {
      cliVersions.set(name, 'unknown');
    }
  }

  return {
    nodeVersion: process.version,
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    frameworkVersion: VERSION,
    cliVersions,
    capturedAt: getTimeProvider().nowIso(),
  };
}

/**
 * Parameters for building the base result.
 */
interface BaseResultParams {
  readonly options: RunResultOptions;
  readonly metrics: AggregatedMetrics;
  readonly environment: EnvironmentInfo;
  readonly success: boolean;
}

/**
 * Builds the base result object.
 */
function buildBaseResult(params: BaseResultParams): TestRunResult {
  const { options, metrics, environment, success } = params;
  const durationMs = options.endTime.getTime() - options.startTime.getTime();

  return {
    runId: options.runId,
    runName: options.config.runName ?? 'Evaluation Run',
    taskResults: options.results,
    metrics,
    environment,
    startTime: options.startTime.toISOString(),
    endTime: options.endTime.toISOString(),
    durationMs,
    success,
  };
}

/**
 * Builds a complete test run result.
 */
export async function buildTestRunResult(options: RunResultOptions): Promise<TestRunResult> {
  const { failureCount } = computeResultCounts(options.results);
  const success = determineSuccess(failureCount, options.config.stopOnFailure);
  const metrics = computeAggregatedMetrics(options.results);
  const environment = await getEnvironmentInfo(options.adapters);

  const base = buildBaseResult({ options, metrics, environment, success });

  // Add optional properties
  const failureSummary = createFailureSummary(failureCount, options.results.length);

  if (options.filter !== undefined && failureSummary !== undefined) {
    return { ...base, filter: options.filter, failureSummary };
  }
  if (options.filter !== undefined) {
    return { ...base, filter: options.filter };
  }
  if (failureSummary !== undefined) {
    return { ...base, failureSummary };
  }

  return base;
}
