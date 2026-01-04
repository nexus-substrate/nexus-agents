/**
 * nexus-agents/workflows - Expression Resolver
 *
 * Parses and resolves ${{ }} template expressions in workflow step inputs.
 * Supports accessing workflow inputs, step outputs, and variables.
 *
 * Expression syntax:
 * - ${{ inputs.name }} - Access workflow input
 * - ${{ steps.stepId.output }} - Access step output
 * - ${{ steps.stepId.output.field }} - Access nested field in step output
 * - ${{ variables.name }} - Access runtime variable
 */

import type { WorkflowExecutionContext } from './execution-context.js';
import type { StepResult } from '../core/index.js';
import { ValidationError } from '../core/index.js';

/**
 * Regular expression to match ${{ expression }} patterns.
 * Captures the expression content between ${{ and }}.
 */
const EXPRESSION_PATTERN = /\$\{\{\s*([^}]+)\s*\}\}/g;

/**
 * Types of expression references.
 */
export type ExpressionType = 'inputs' | 'steps' | 'variables';

/**
 * Parsed expression structure.
 */
export interface ParsedExpression {
  /** Original expression string */
  original: string;
  /** Expression type (inputs, steps, variables) */
  type: ExpressionType;
  /** Path segments after the type */
  path: string[];
}

/**
 * Result of expression resolution.
 */
export interface ResolveResult {
  /** Whether resolution succeeded */
  success: boolean;
  /** Resolved value if successful */
  value?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Parses an expression string into its components.
 *
 * @param expression - The expression content (without ${{ }})
 * @returns Parsed expression or null if invalid
 */
export function parseExpression(expression: string): ParsedExpression | null {
  const trimmed = expression.trim();
  const parts = trimmed.split('.');

  if (parts.length < 2) {
    return null;
  }

  const type = parts[0];
  if (type !== 'inputs' && type !== 'steps' && type !== 'variables') {
    return null;
  }

  return {
    original: expression,
    type: type as ExpressionType,
    path: parts.slice(1),
  };
}

/**
 * Safely accesses a nested property in an object.
 *
 * @param obj - The object to access
 * @param path - Array of property names
 * @returns The value at the path or undefined
 */
function getNestedValue(obj: unknown, path: string[]): unknown {
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
function resolveInputs(path: string[], context: WorkflowExecutionContext): ResolveResult {
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
function resolveSteps(path: string[], context: WorkflowExecutionContext): ResolveResult {
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
function resolveVariables(path: string[], context: WorkflowExecutionContext): ResolveResult {
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
 * Resolves a single parsed expression against the context.
 *
 * @param parsed - Parsed expression
 * @param context - Execution context
 * @returns Resolve result
 */
export function resolveExpression(
  parsed: ParsedExpression,
  context: WorkflowExecutionContext
): ResolveResult {
  switch (parsed.type) {
    case 'inputs':
      return resolveInputs(parsed.path, context);
    case 'steps':
      return resolveSteps(parsed.path, context);
    case 'variables':
      return resolveVariables(parsed.path, context);
  }
}

/**
 * Checks if a value contains expression patterns.
 *
 * @param value - Value to check
 * @returns True if value contains expressions
 */
export function containsExpressions(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Reset regex state before testing (global flag causes lastIndex to persist)
  EXPRESSION_PATTERN.lastIndex = 0;
  return EXPRESSION_PATTERN.test(value);
}

/**
 * Resolves a single expression and returns the value.
 */
function resolveSingleExpression(expression: string, context: WorkflowExecutionContext): unknown {
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

/**
 * Converts a resolved value to a string for interpolation.
 */
function valueToString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Resolves all expressions in a string value.
 *
 * If the entire string is a single expression, returns the resolved value.
 * If the string contains multiple expressions or mixed content, returns a string
 * with all expressions replaced by their resolved values.
 */
export function resolveStringExpressions(
  value: string,
  context: WorkflowExecutionContext
): unknown {
  EXPRESSION_PATTERN.lastIndex = 0;

  // Check if the entire value is a single expression
  const fullMatch = value.match(/^\$\{\{\s*([^}]+)\s*\}\}$/);
  if (fullMatch?.[1] !== undefined) {
    return resolveSingleExpression(fullMatch[1], context);
  }

  // Handle multiple expressions or mixed content
  let resolvedString = value;
  EXPRESSION_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = EXPRESSION_PATTERN.exec(value)) !== null) {
    const expression = match[1];
    if (expression === undefined) continue;

    const resolved = resolveSingleExpression(expression, context);
    resolvedString = resolvedString.replace(match[0], valueToString(resolved));
  }

  return resolvedString;
}

/**
 * Recursively resolves expressions in a value.
 *
 * Handles strings, arrays, and objects. Primitives other than strings
 * are returned unchanged.
 *
 * @param input - Value containing potential expressions
 * @param context - Execution context
 * @returns Resolved value
 * @throws ValidationError if resolution fails
 */
export function resolveInput(input: unknown, context: WorkflowExecutionContext): unknown {
  // Handle strings with expressions
  if (typeof input === 'string') {
    if (containsExpressions(input)) {
      return resolveStringExpressions(input, context);
    }
    return input;
  }

  // Handle arrays
  if (Array.isArray(input)) {
    return input.map((item) => resolveInput(item, context));
  }

  // Handle objects
  if (input !== null && typeof input === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      resolved[key] = resolveInput(value, context);
    }
    return resolved;
  }

  // Return primitives unchanged
  return input;
}

/**
 * Validates that all expressions in a value can be resolved.
 * Does not actually resolve them, just checks validity.
 *
 * @param input - Value containing potential expressions
 * @param context - Execution context
 * @returns Array of validation errors (empty if all valid)
 */
export function validateExpressions(input: unknown, context: WorkflowExecutionContext): string[] {
  const errors: string[] = [];

  function validate(value: unknown): void {
    if (typeof value === 'string' && containsExpressions(value)) {
      try {
        resolveStringExpressions(value, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        validate(item);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value)) {
        validate(v);
      }
    }
  }

  validate(input);
  return errors;
}

/**
 * Extracts all expression references from a value.
 * Useful for determining step dependencies.
 *
 * @param input - Value containing potential expressions
 * @returns Array of parsed expressions
 */
export function extractExpressions(input: unknown): ParsedExpression[] {
  const expressions: ParsedExpression[] = [];

  function extract(value: unknown): void {
    if (typeof value === 'string') {
      // Reset regex state
      EXPRESSION_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = EXPRESSION_PATTERN.exec(value)) !== null) {
        const exprContent = match[1];
        if (exprContent !== undefined) {
          const parsed = parseExpression(exprContent);
          if (parsed !== null) {
            expressions.push(parsed);
          }
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        extract(item);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value)) {
        extract(v);
      }
    }
  }

  extract(input);
  return expressions;
}

/**
 * Gets all step IDs referenced in expressions within a value.
 *
 * @param input - Value containing potential expressions
 * @returns Array of referenced step IDs
 */
export function getReferencedSteps(input: unknown): string[] {
  const stepIds = new Set<string>();
  const expressions = extractExpressions(input);

  for (const expr of expressions) {
    const firstPath = expr.path[0];
    if (expr.type === 'steps' && firstPath !== undefined) {
      stepIds.add(firstPath);
    }
  }

  return Array.from(stepIds);
}
