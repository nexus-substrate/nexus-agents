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
  inputs: z.record(z.unknown()).describe('Workflow inputs as key-value pairs'),
  dryRun: z.boolean().optional().default(false).describe('Validate workflow without executing'),
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
