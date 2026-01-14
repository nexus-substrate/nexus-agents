/**
 * nexus-agents/cli - Workflow Run Types
 *
 * Type definitions for the workflow run CLI command.
 *
 * @module cli/workflow-run-types
 * (Source: Issue #67, extracted from workflow-run.ts for #272)
 */

/**
 * ANSI color codes for terminal output.
 */
export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Options for the workflow run command.
 */
export interface WorkflowRunOptions {
  /** Workflow name or path */
  readonly name: string;
  /** Input JSON string or file path */
  readonly input: string | undefined;
  /** Dry run mode (validate without executing) */
  readonly dryRun: boolean | undefined;
  /** Verbose output */
  readonly verbose: boolean | undefined;
}

/**
 * Result of workflow run command.
 */
export interface WorkflowRunResult {
  readonly success: boolean;
  readonly message: string;
  readonly workflowName?: string;
  readonly dryRun: boolean;
  readonly validationErrors?: string[];
  readonly executionId?: string;
  readonly steps?: number;
}

/**
 * Parsed workflow inputs.
 */
export type ParsedInputs = Record<string, unknown>;
