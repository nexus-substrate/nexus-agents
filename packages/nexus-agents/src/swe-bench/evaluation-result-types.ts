/**
 * nexus-agents/swe-bench - Evaluation Result Types
 *
 * Per-instance and aggregate result types for SWE-bench evaluation.
 *
 * @module swe-bench/evaluation-result-types
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { SWEBenchVariant } from './types.js';
import type { EvaluationHarnessConfig } from './evaluation-config-types.js';

/**
 * Test execution status for a single test case.
 */
export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped' | 'timeout';

/**
 * Result of a single test case execution.
 */
export interface TestCaseResult {
  /** Test name/identifier. */
  readonly testName: string;
  /** Test status. */
  readonly status: TestStatus;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Error message if failed/error. */
  readonly errorMessage?: string;
  /** Stack trace if available. */
  readonly stackTrace?: string;
}

/**
 * Resolution status for an instance.
 */
export type ResolutionStatus = 'resolved' | 'unresolved' | 'error' | 'timeout';

/**
 * Detailed evaluation result for a single instance.
 */
export interface InstanceEvaluationResult {
  /** Instance ID being evaluated. */
  readonly instanceId: string;
  /** Model that generated the prediction. */
  readonly modelNameOrPath: string;
  /** Whether the issue was resolved. */
  readonly resolved: boolean;
  /** Resolution status category. */
  readonly status: ResolutionStatus;
  /** Individual test results. */
  readonly testResults: readonly TestCaseResult[];
  /** Number of tests that passed. */
  readonly testsPassed: number;
  /** Number of tests that failed. */
  readonly testsFailed: number;
  /** Total number of tests. */
  readonly testsTotal: number;
  /** Whether the patch applied cleanly. */
  readonly patchApplied: boolean;
  /** Patch application error if any. */
  readonly patchError?: string;
  /** Total evaluation duration in milliseconds. */
  readonly durationMs: number;
  /** Docker container ID used. */
  readonly containerId?: string;
  /** Log file path for this instance. */
  readonly logPath?: string;
}

/**
 * Aggregate metrics for an evaluation run.
 */
export interface EvaluationMetrics {
  /** Total instances in dataset. */
  readonly totalInstances: number;
  /** Instances with predictions. */
  readonly predictedInstances: number;
  /** Instances successfully resolved. */
  readonly resolvedInstances: number;
  /** Resolution rate (resolved / predicted). */
  readonly resolutionRate: number;
  /** Instances where patch applied cleanly. */
  readonly patchesApplied: number;
  /** Patch application rate. */
  readonly patchApplicationRate: number;
  /** Instances that timed out. */
  readonly timeouts: number;
  /** Instances with evaluation errors. */
  readonly errors: number;
  /** Average evaluation time per instance (ms). */
  readonly avgDurationMs: number;
  /** Total evaluation time (ms). */
  readonly totalDurationMs: number;
}

/**
 * Per-repository breakdown of results.
 */
export interface RepositoryMetrics {
  /** Repository name (e.g., "django/django"). */
  readonly repository: string;
  /** Total instances from this repo. */
  readonly totalInstances: number;
  /** Resolved instances. */
  readonly resolvedInstances: number;
  /** Resolution rate for this repo. */
  readonly resolutionRate: number;
}

/**
 * Complete evaluation run result.
 */
export interface EvaluationRunResult {
  /** Run identifier. */
  readonly runId: string;
  /** Dataset variant evaluated. */
  readonly datasetName: SWEBenchVariant;
  /** Model being evaluated. */
  readonly modelNameOrPath: string;
  /** Evaluation start timestamp (ISO 8601). */
  readonly startedAt: string;
  /** Evaluation completion timestamp (ISO 8601). */
  readonly completedAt: string;
  /** Aggregate metrics. */
  readonly metrics: EvaluationMetrics;
  /** Per-repository breakdown. */
  readonly repositoryMetrics: readonly RepositoryMetrics[];
  /** Per-instance results. */
  readonly instanceResults: readonly InstanceEvaluationResult[];
  /** Configuration used. */
  readonly config: EvaluationHarnessConfig;
  /** Harness version used. */
  readonly harnessVersion?: string;
}
