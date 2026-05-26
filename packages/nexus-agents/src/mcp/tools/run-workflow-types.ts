/**
 * nexus-agents/mcp - Run Workflow Tool Types
 *
 * Type definitions for the run_workflow MCP tool.
 *
 * @module mcp/tools/run-workflow-types
 */

import { z } from 'zod';
import type { IWorkflowEngine } from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import type { BaseMcpToolDeps } from './tool-result.js';

// ============================================================================
// Input Schema
// ============================================================================

/**
 * Input schema for the run_workflow tool.
 */
export const RunWorkflowInputSchema = z.object({
  template: z.string().min(1).describe('Workflow template name (e.g., code-review) or file path'),
  inputs: z.record(z.string(), z.unknown()).describe('Workflow inputs as key-value pairs'),
  dryRun: z.boolean().optional().default(false).describe('Validate workflow without executing'),
  /**
   * Per-phase execution timeout in milliseconds (closes #3017). Wins over
   * both `workflow.timeout` (set in the template YAML) and the engine's
   * `defaultTimeoutMs`. Use for known-long workflow templates (e.g.,
   * security-audit over a large repo) where the default phase budget
   * isn't enough. Bounded to [1s, 30min] to prevent both flapping
   * cancellations and unbounded hangs that would defeat the
   * timeout-mismatch telemetry.
   */
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(1_800_000)
    .optional()
    .describe('Per-phase execution timeout in ms (overrides workflow.timeout)'),
  /**
   * Async-mode dispatch (#3044, Stage 3 of epic #2631). Default `sync` —
   * backward-compat invariant; existing callers see no behavior change.
   * `async` returns `{ status: 'pending', jobId }` immediately; caller
   * polls `get_job_result(jobId)` for the structured payload. Sidesteps
   * the MCP-SDK 60s client-request timeout that's the #2631 root cause
   * (per #2703 telemetry: run_workflow was the gate-firing tool at
   * 28.6% timeout-shaped errors).
   *
   * Per the #3041 vote's binding staging order this lands AFTER
   * Stage 1's protocol (#3048) was validated on orchestrate. Concurrency
   * cap is enforced in-process via NEXUS_JOB_MAX_CONCURRENT_RUN_WORKFLOW;
   * over-cap returns `{ status: 'busy', retryAfterMs }` synchronously.
   *
   * Kept optional (no `.default()`) so the inferred type doesn't force
   * `mode: 'sync'` on every existing call site / test fixture. The
   * handler treats `undefined` as `'sync'`.
   */
  mode: z
    .enum(['sync', 'async'])
    .optional()
    .describe('Dispatch mode (default: sync). Use "async" for long-running workflows.'),
  /**
   * Idempotency key for async-mode replay-safety (#3042 Stage 1c / epic
   * #2631). When set: identical (key, inputs) returns the existing job;
   * same key with different inputs fails closed with
   * `idempotency_key_collision`. Sync mode ignores this.
   */
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId.'
    ),
});

export type RunWorkflowInput = z.infer<typeof RunWorkflowInputSchema>;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Workflow execution result returned by the tool.
 */
export interface WorkflowToolResult {
  executionId: string;
  workflowName: string;
  status: 'completed' | 'failed';
  stepResults: StepResultSummary[];
  output: unknown;
  durationMs: number;
}

/**
 * Simplified step result for tool output.
 */
export interface StepResultSummary {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

/**
 * Dry run validation result.
 */
export interface DryRunResult {
  valid: boolean;
  workflowName: string;
  stepCount: number;
  inputsProvided: string[];
  inputsRequired: string[];
  inputsMissing: string[];
  validationErrors: string[];
}

// ============================================================================
// Dependencies
// ============================================================================

/**
 * Dependencies required by the run_workflow tool.
 */
export interface RunWorkflowDeps extends BaseMcpToolDeps {
  workflowEngine: IWorkflowEngine;
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
}
