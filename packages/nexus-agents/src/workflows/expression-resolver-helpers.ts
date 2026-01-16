/**
 * nexus-agents/workflows - Expression Resolver Helpers
 *
 * Pure helper functions for expression resolution.
 * Extracted from expression-resolver.ts to maintain file size limits.
 */

import type { WorkflowExecutionContext } from './execution-context.js';
import type { StepResult } from '../core/index.js';
import { ValidationError } from '../core/index.js';
import type { ParsedExpression, ResolveResult } from './expression-resolver-types.js';

/**
 * Safely accesses a nested property in an object.
 *
 * @param obj - The object to access
 * @param path - Array of property names
 * @returns The value at the path or undefined
 */
export function getNestedValue(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Resolves an inputs expression.
 *
 * @param path - Property path within inputs
 * @param context - Execution context
 * @returns Resolve result
 */
export function resolveInputs(path: string[], context: WorkflowExecutionContext): ResolveResult {
  const value = getNestedValue(context.inputs, path);
  if (value === undefined) {
    return {
      success: false,
      error: `Input '${path.join('.')}' not found`,
    };
  }
  return { success: true, value };
}

/**
 * Resolves a steps expression.
 *
 * @param path - Property path (stepId.output[.field...])
 * @param context - Execution context
 * @returns Resolve result
 */
export function resolveSteps(path: string[], context: WorkflowExecutionContext): ResolveResult {
  if (path.length < 2) {
    return {
      success: false,
      error: 'Steps expression requires at least stepId and output',
    };
  }

  const stepId = path[0];
  const outputKey = path[1];
  const rest = path.slice(2);

  if (stepId === undefined || outputKey === undefined) {
    return {
      success: false,
      error: 'Steps expression requires stepId and output',
    };
  }

  const stepResult: StepResult | undefined = context.stepResults.get(stepId);

  if (stepResult === undefined) {
    return {
      success: false,
      error: `Step '${stepId}' has not completed`,
    };
  }

  if (stepResult.status !== 'success') {
    return {
      success: false,
      error: `Step '${stepId}' did not complete successfully`,
    };
  }

  if (outputKey !== 'output') {
    return {
      success: false,
      error: `Invalid step property '${outputKey}', only 'output' is supported`,
    };
  }

  if (rest.length === 0) {
    return { success: true, value: stepResult.output };
  }

  const value = getNestedValue(stepResult.output, rest);
  if (value === undefined) {
    return {
      success: false,
      error: `Output field '${rest.join('.')}' not found in step '${stepId}'`,
    };
  }

  return { success: true, value };
}

/**
 * Resolves a variables expression.
 *
 * @param path - Property path within variables
 * @param context - Execution context
 * @returns Resolve result
 */
export function resolveVariables(path: string[], context: WorkflowExecutionContext): ResolveResult {
  if (path.length === 0) {
    return {
      success: false,
      error: 'Variables expression requires a variable name',
    };
  }

  const varName = path[0];
  const rest = path.slice(1);

  if (varName === undefined) {
    return {
      success: false,
      error: 'Variables expression requires a variable name',
    };
  }

  const varValue = context.variables.get(varName);

  if (varValue === undefined) {
    return {
      success: false,
      error: `Variable '${varName}' not found`,
    };
  }

  if (rest.length === 0) {
    return { success: true, value: varValue };
  }

  const value = getNestedValue(varValue, rest);
  if (value === undefined) {
    return {
      success: false,
      error: `Variable field '${rest.join('.')}' not found`,
    };
  }

  return { success: true, value };
}

/**
 * Converts a resolved value to a string for interpolation.
 */
export function valueToString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Resolves a single expression and returns the value.
 *
 * @param expression - Expression content (without $\{\{ \}\})
 * @param context - Execution context
 * @param parseExpression - Function to parse the expression
 * @param resolveExpression - Function to resolve the parsed expression
 * @returns Resolved value
 * @throws ValidationError if resolution fails
 */
export function resolveSingleExpression(
  expression: string,
  context: WorkflowExecutionContext,
  parseExpression: (expr: string) => ParsedExpression | null,
  resolveExpression: (parsed: ParsedExpression, ctx: WorkflowExecutionContext) => ResolveResult
): unknown {
  const parsed = parseExpression(expression);
  if (parsed === null) {
    throw new ValidationError(`Invalid expression syntax: ${expression}`);
  }
  const result = resolveExpression(parsed, context);
  if (!result.success) {
    throw new ValidationError(result.error ?? `Failed to resolve: ${expression}`);
  }
  return result.value;
}
