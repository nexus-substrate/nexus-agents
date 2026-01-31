/**
 * nexus-agents/cli - Workflow Run Types
 *
 * Type definitions for the workflow run CLI command.
 *
 * @module cli/workflow-run-types
 * (Source: Issue #67, extracted from workflow-run.ts for #272)
 * (Source: Issue #584 - CommandResult consolidation)
 */

import type { CommandResult } from '../core/index.js';

// Re-export ANSI colors from consolidated module
export { colors } from './ansi-output.js';

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
 * Extends CommandResult base pattern with workflow-specific fields.
 *
 * Note: Direct properties are maintained for backward compatibility.
 * New code should use the CommandResult pattern from core module.
 */
export interface WorkflowRunResult extends CommandResult {
  /** Always present - human-readable message */
  readonly message: string;
  /** Workflow name that was executed */
  readonly workflowName?: string;
  /** Whether this was a dry run */
  readonly dryRun: boolean;
  /** Validation errors if any */
  readonly validationErrors?: string[];
  /** Execution ID for tracking */
  readonly executionId?: string;
  /** Number of steps executed */
  readonly steps?: number;
}

/**
 * Parsed workflow inputs.
 */
export type ParsedInputs = Record<string, unknown>;
