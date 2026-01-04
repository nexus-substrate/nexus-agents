/**
 * @nexus-agents/workflows - Execution Context
 *
 * Manages execution state and variable resolution for workflow steps.
 * Provides context isolation and result tracking during workflow execution.
 */

import { z } from 'zod';
import type { StepResult } from '@nexus-agents/core';
import { ValidationError } from '@nexus-agents/core';

/**
 * Full execution context for a running workflow.
 * Tracks step results, variables, and provides input resolution.
 * This is the comprehensive context used by the step executor.
 */
export interface WorkflowExecutionContext {
  /** Workflow definition ID */
  readonly workflowId: string;
  /** Unique execution instance ID */
  readonly executionId: string;
  /** Initial workflow inputs */
  readonly inputs: Record<string, unknown>;
  /** Results from completed steps (stepId -> result) */
  readonly stepResults: Map<string, StepResult>;
  /** Runtime variables set during execution */
  readonly variables: Map<string, unknown>;
  /** Execution start time */
  readonly startedAt: Date;
  /** Whether execution has been cancelled */
  cancelled: boolean;
}

/**
 * Schema for validating workflow inputs.
 */
export const WorkflowInputsSchema = z.record(z.unknown());

/**
 * Options for creating an execution context.
 */
export interface CreateExecutionContextOptions {
  /** Workflow definition ID */
  workflowId: string;
  /** Workflow inputs */
  inputs: Record<string, unknown>;
  /** Optional custom execution ID (auto-generated if not provided) */
  executionId?: string;
}

/**
 * Generate a unique execution ID.
 */
function generateExecutionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `exec_${timestamp}_${random}`;
}

/**
 * Creates a new execution context for a workflow run.
 *
 * @param options - Context creation options
 * @returns A new WorkflowExecutionContext instance
 */
export function createExecutionContext(
  options: CreateExecutionContextOptions
): WorkflowExecutionContext {
  const { workflowId, inputs, executionId } = options;

  return {
    workflowId,
    executionId: executionId ?? generateExecutionId(),
    inputs: { ...inputs },
    stepResults: new Map<string, StepResult>(),
    variables: new Map<string, unknown>(),
    startedAt: new Date(),
    cancelled: false,
  };
}

/**
 * Stores a step result in the execution context.
 *
 * @param context - The execution context
 * @param stepId - The step identifier
 * @param result - The step result to store
 */
export function storeStepResult(
  context: WorkflowExecutionContext,
  stepId: string,
  result: StepResult
): void {
  context.stepResults.set(stepId, result);
}

/**
 * Retrieves a step result from the execution context.
 *
 * @param context - The execution context
 * @param stepId - The step identifier
 * @returns The step result or undefined if not found
 */
export function getStepResult(
  context: WorkflowExecutionContext,
  stepId: string
): StepResult | undefined {
  return context.stepResults.get(stepId);
}

/**
 * Sets a variable in the execution context.
 *
 * @param context - The execution context
 * @param name - Variable name
 * @param value - Variable value
 */
export function setVariable(context: WorkflowExecutionContext, name: string, value: unknown): void {
  context.variables.set(name, value);
}

/**
 * Gets a variable from the execution context.
 *
 * @param context - The execution context
 * @param name - Variable name
 * @returns The variable value or undefined
 */
export function getVariable(context: WorkflowExecutionContext, name: string): unknown {
  return context.variables.get(name);
}

/**
 * Gets all completed step IDs.
 *
 * @param context - The execution context
 * @returns Array of completed step IDs
 */
export function getCompletedSteps(context: WorkflowExecutionContext): string[] {
  return Array.from(context.stepResults.keys());
}

/**
 * Checks if a step has been completed.
 *
 * @param context - The execution context
 * @param stepId - The step identifier
 * @returns True if step is completed
 */
export function isStepCompleted(context: WorkflowExecutionContext, stepId: string): boolean {
  return context.stepResults.has(stepId);
}

/**
 * Checks if all specified steps are completed.
 *
 * @param context - The execution context
 * @param stepIds - Array of step identifiers to check
 * @returns True if all specified steps are completed
 */
export function areStepsCompleted(context: WorkflowExecutionContext, stepIds: string[]): boolean {
  return stepIds.every((stepId) => isStepCompleted(context, stepId));
}

/**
 * Gets the execution duration in milliseconds.
 *
 * @param context - The execution context
 * @returns Duration in milliseconds
 */
export function getExecutionDuration(context: WorkflowExecutionContext): number {
  return Date.now() - context.startedAt.getTime();
}

/**
 * Marks the execution as cancelled.
 *
 * @param context - The execution context
 */
export function cancelExecution(context: WorkflowExecutionContext): void {
  context.cancelled = true;
}

/**
 * Checks if the execution has been cancelled.
 *
 * @param context - The execution context
 * @returns True if cancelled
 */
export function isCancelled(context: WorkflowExecutionContext): boolean {
  return context.cancelled;
}

/**
 * Creates a snapshot of the current context state.
 * Useful for debugging and logging.
 *
 * @param context - The execution context
 * @returns A plain object snapshot
 */
export function snapshotContext(context: WorkflowExecutionContext): Record<string, unknown> {
  const stepResults: Record<string, StepResult> = {};
  for (const [key, value] of context.stepResults) {
    stepResults[key] = value;
  }

  const variables: Record<string, unknown> = {};
  for (const [key, value] of context.variables) {
    variables[key] = value;
  }

  return {
    workflowId: context.workflowId,
    executionId: context.executionId,
    inputs: context.inputs,
    stepResults,
    variables,
    startedAt: context.startedAt.toISOString(),
    durationMs: getExecutionDuration(context),
    cancelled: context.cancelled,
  };
}

/**
 * Validates that required inputs are present.
 *
 * @param inputs - The inputs to validate
 * @param required - Array of required input names
 * @returns Validation error or null if valid
 */
export function validateRequiredInputs(
  inputs: Record<string, unknown>,
  required: string[]
): ValidationError | null {
  const missing: string[] = [];

  for (const name of required) {
    if (!(name in inputs) || inputs[name] === undefined) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    return new ValidationError(`Missing required inputs: ${missing.join(', ')}`, {
      context: { missingInputs: missing },
    });
  }

  return null;
}
