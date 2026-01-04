/**
 * nexus-agents/core - Workflow Types
 *
 * Interface for workflow execution engine.
 */

import type { Result } from '../result.js';
import type { WorkflowError } from '../errors.js';
import type { AgentRole } from './agent.js';

/**
 * Workflow input definition.
 */
export interface InputDefinition {
  /** Input name */
  name: string;
  /** Input type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Description */
  description?: string;
  /** Whether required */
  required?: boolean;
  /** Default value */
  default?: unknown;
}

/**
 * Single step in a workflow.
 */
export interface WorkflowStep {
  /** Unique step identifier */
  id: string;
  /** Agent role to execute this step */
  agent: AgentRole;
  /** Action to perform */
  action: string;
  /** Inputs for the step */
  inputs: Record<string, unknown>;
  /** Step dependencies (wait for these to complete) */
  dependsOn?: string[];
  /** Execute in parallel with dependencies */
  parallel?: boolean;
  /** Number of retry attempts */
  retries?: number;
  /** Timeout in ms */
  timeout?: number;
  /** Condition for execution */
  condition?: string;
}

/**
 * Workflow definition (loaded from template).
 */
export interface WorkflowDefinition {
  /** Workflow name */
  name: string;
  /** Version */
  version: string;
  /** Description */
  description?: string;
  /** Input definitions */
  inputs: InputDefinition[];
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Global timeout in ms */
  timeout?: number;
}

/**
 * Result of step execution.
 */
export interface StepResult {
  /** Step ID */
  stepId: string;
  /** Step output */
  output: unknown;
  /** Duration in ms */
  durationMs: number;
  /** Status */
  status: 'success' | 'failed' | 'skipped';
  /** Error message if failed */
  error?: string;
}

/**
 * Result of workflow execution.
 */
export interface WorkflowResult {
  /** Execution ID */
  executionId: string;
  /** Workflow name */
  workflowName: string;
  /** Step results */
  stepResults: StepResult[];
  /** Final output */
  output: unknown;
  /** Total duration in ms */
  totalDurationMs: number;
}

/**
 * Workflow execution status.
 */
export type ExecutionStatus =
  | { state: 'pending' }
  | { state: 'running'; currentStep: string; progress: number }
  | { state: 'completed'; result: WorkflowResult }
  | { state: 'failed'; error: string; failedStep?: string }
  | { state: 'cancelled'; cancelledAt: string };

/**
 * Workflow template metadata.
 */
export interface WorkflowTemplate {
  /** Template name */
  name: string;
  /** Version */
  version: string;
  /** Description */
  description?: string;
  /** File path */
  path: string;
  /** Category */
  category?: string;
}

/**
 * Parse error for workflow templates.
 */
export class ParseError extends Error {
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(message: string, options?: { line?: number; column?: number }) {
    super(message);
    this.name = 'ParseError';
    this.line = options?.line;
    this.column = options?.column;
  }
}

/**
 * Workflow engine interface.
 */
export interface IWorkflowEngine {
  /**
   * Load workflow template from file.
   * @param path - Path to template file
   * @returns Result with WorkflowDefinition or ParseError
   */
  loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>>;

  /**
   * Execute a workflow with inputs.
   * @param workflow - Workflow definition
   * @param inputs - Input values
   * @returns Result with WorkflowResult or WorkflowError
   */
  execute(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
  ): Promise<Result<WorkflowResult, WorkflowError>>;

  /**
   * Get execution status.
   * @param executionId - Execution ID to check
   * @returns Current execution status
   */
  getStatus(executionId: string): ExecutionStatus;

  /**
   * Cancel a running workflow.
   * @param executionId - Execution ID to cancel
   * @returns Result with void or WorkflowError
   */
  cancel(executionId: string): Promise<Result<void, WorkflowError>>;

  /**
   * List available workflow templates.
   * @returns Array of available templates
   */
  listTemplates(): Promise<WorkflowTemplate[]>;
}
