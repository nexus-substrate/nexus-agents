/**
 * nexus-agents/workflows - Step Executor Helpers
 *
 * Pure helper functions for step execution:
 * - Condition evaluation
 * - Timeout and retry utilities
 * - Error handling utilities
 */

import type { WorkflowStep } from '../core/index.js';
import { WorkflowError, TimeoutError, ErrorCode } from '../core/index.js';
import type { WorkflowExecutionContext } from './execution-context.js';

/** Maximum retry delay (capped with exponential backoff). */
export const MAX_RETRY_DELAY_MS = 30_000;

// ============================================================================
// Condition Evaluation Helpers
// ============================================================================

/**
 * Checks for simple boolean-like conditions.
 */
export function checkSimpleCondition(condition: string): boolean | null {
  if (condition === 'always' || condition === 'true') return true;
  if (condition === 'never' || condition === 'false') return false;
  return null;
}

/**
 * Checks for step status conditions like: steps.stepId.status == 'success'
 */
export function checkStepStatusCondition(
  condition: string,
  context: WorkflowExecutionContext
): boolean | null {
  const match = condition.match(/^steps\.(\w+)\.status\s*==\s*['"](\w+)['"]$/i);
  if (match === null) return null;

  const stepId = match[1];
  const expectedStatus = match[2]?.toLowerCase();
  if (stepId === undefined || expectedStatus === undefined) return false;

  const stepResult = context.stepResults.get(stepId);
  return stepResult?.status === expectedStatus;
}

/**
 * Checks for step output existence conditions like: steps.stepId.output
 */
export function checkStepOutputCondition(
  condition: string,
  context: WorkflowExecutionContext
): boolean | null {
  const match = condition.match(/^steps\.(\w+)\.output$/i);
  if (match === null) return null;

  const stepId = match[1];
  if (stepId === undefined) return false;

  const stepResult = context.stepResults.get(stepId);
  return stepResult?.output !== undefined;
}

/**
 * Evaluates a condition string against the workflow execution context.
 * Returns true for unrecognized conditions (default truthy).
 */
export function evaluateCondition(condition: string, context: WorkflowExecutionContext): boolean {
  const trimmed = condition.trim();
  const lower = trimmed.toLowerCase();

  const simple = checkSimpleCondition(lower);
  if (simple !== null) return simple;

  const status = checkStepStatusCondition(trimmed, context);
  if (status !== null) return status;

  const output = checkStepOutputCondition(trimmed, context);
  if (output !== null) return output;

  return true; // Default: treat unrecognized as truthy
}

// ============================================================================
// Timeout and Retry Utilities
// ============================================================================

/**
 * Creates a promise that rejects after the specified timeout.
 */
export function createTimeout(ms: number, stepId: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Step '${stepId}' timed out after ${String(ms)}ms`));
    }, ms);
  });
}

/**
 * Calculates retry delay with exponential backoff, capped at MAX_RETRY_DELAY_MS.
 */
export function calculateRetryDelay(attempt: number, baseDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

// Re-export from canonical source for backward compatibility
export { sleep } from '../utils/async-utils.js';

// ============================================================================
// Formatting and Error Utilities
// ============================================================================

/**
 * Formats a value for display in task descriptions.
 * Truncates long strings/objects to 100 characters.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    return value.length > 100 ? `${value.substring(0, 100)}...` : value;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 100 ? `${json.substring(0, 100)}...` : json;
  }
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : '[complex]';
}

/**
 * Builds a task description from step definition and resolved inputs.
 */
export function buildTaskDescription(step: WorkflowStep, inputs: Record<string, unknown>): string {
  const inputSummary = Object.entries(inputs)
    .map(([key, value]) => `- ${key}: ${formatValue(value)}`)
    .join('\n');

  return `Execute action: ${step.action}\n\nInputs:\n${inputSummary}`;
}

/**
 * Extracts the error message from an error, unwrapping WorkflowError causes.
 */
export function extractErrorMessage(error: Error | undefined): string {
  if (error === undefined) return 'Unknown error';
  if (error instanceof WorkflowError && error.cause instanceof Error) {
    return extractErrorMessage(error.cause);
  }
  return error.message;
}

/**
 * Determines if an error should not be retried.
 */
export function isNonRetryableError(error: Error): boolean {
  if (error.name === 'ValidationError') return true;
  if (error instanceof WorkflowError) {
    const code = error.code;
    return (
      code === ErrorCode.VALIDATION_ERROR ||
      code === ErrorCode.WORKFLOW_PARSE_ERROR ||
      code === ErrorCode.INVALID_INPUT
    );
  }
  return false;
}
