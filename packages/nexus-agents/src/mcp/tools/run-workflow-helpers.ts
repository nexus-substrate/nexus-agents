/**
 * nexus-agents/mcp - Run Workflow Helpers
 *
 * Helper functions for workflow validation, loading, and response formatting.
 * Extracted from run-workflow.ts to maintain file size limits.
 *
 * @module mcp/tools/run-workflow-helpers
 * (Source: Issue #339)
 */

import type { Result } from '../../core/index.js';
import type { WorkflowDefinition, StepResult } from '../../core/index.js';
import { WorkflowError } from '../../core/index.js';
import type { StepResultSummary, DryRunResult, RunWorkflowDeps } from './run-workflow-types.js';

// ============================================================================
// Path Detection
// ============================================================================

/**
 * Check if a template identifier is a file path.
 *
 * @param template - Template identifier
 * @returns True if it's a file path
 */
export function isFilePath(template: string): boolean {
  return (
    template.includes('/') ||
    template.includes('\\') ||
    template.endsWith('.yaml') ||
    template.endsWith('.yml')
  );
}

// ============================================================================
// Step Result Conversion
// ============================================================================

/**
 * Convert StepResult to StepResultSummary for tool output.
 *
 * @param result - Full step result
 * @returns Simplified summary
 */
export function toStepResultSummary(result: StepResult): StepResultSummary {
  const summary: StepResultSummary = {
    stepId: result.stepId,
    status: result.status,
    durationMs: result.durationMs,
  };
  if (result.error !== undefined) {
    summary.error = result.error;
  }
  return summary;
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Type validator functions for each expected type.
 */
const TYPE_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  string: (v): boolean => typeof v === 'string',
  number: (v): boolean => typeof v === 'number',
  boolean: (v): boolean => typeof v === 'boolean',
  object: (v): boolean => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v): boolean => Array.isArray(v),
};

/**
 * Get the actual type description for error messages.
 */
function getActualTypeDescription(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Validate that an input value matches its expected type.
 *
 * @param name - Input name
 * @param value - Input value
 * @param expectedType - Expected type
 * @returns Error message or null if valid
 */
export function validateInputType(
  name: string,
  value: unknown,
  expectedType: string
): string | null {
  const validator = TYPE_VALIDATORS[expectedType];
  if (validator === undefined || validator(value)) {
    return null;
  }
  return `Input '${name}' expected ${expectedType}, got ${getActualTypeDescription(value)}`;
}

/**
 * Validation result for workflow inputs.
 */
export interface InputValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
}

/**
 * Validate workflow inputs against definitions.
 *
 * @param workflow - Workflow definition
 * @param inputs - Provided inputs
 * @returns Validation result
 */
export function validateWorkflowInputs(
  workflow: WorkflowDefinition,
  inputs: Record<string, unknown>
): InputValidationResult {
  const missing: string[] = [];
  const errors: string[] = [];
  const providedKeys = new Set(Object.keys(inputs));

  for (const inputDef of workflow.inputs) {
    const isRequired = inputDef.required === true;
    const hasValue = providedKeys.has(inputDef.name);
    const hasDefault = inputDef.default !== undefined;

    if (isRequired && !hasValue && !hasDefault) {
      missing.push(inputDef.name);
    }

    // Type validation for provided values
    if (hasValue) {
      const value = inputs[inputDef.name];
      const typeError = validateInputType(inputDef.name, value, inputDef.type);
      if (typeError !== null) {
        errors.push(typeError);
      }
    }
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors,
  };
}

// ============================================================================
// Workflow Loading
// ============================================================================

/**
 * Load workflow definition from template name or path.
 *
 * @param deps - Tool dependencies
 * @param template - Template name or path
 * @returns Result with workflow definition
 */
export async function loadWorkflow(
  deps: RunWorkflowDeps,
  template: string
): Promise<Result<WorkflowDefinition, WorkflowError>> {
  const { workflowEngine, logger } = deps;

  if (isFilePath(template)) {
    logger?.debug('Loading workflow from file', { path: template });
    const result = await workflowEngine.loadTemplate(template);
    if (!result.ok) {
      return {
        ok: false,
        error: new WorkflowError(`Failed to load template from path: ${result.error.message}`, {
          context: { path: template },
        }),
      };
    }
    return result;
  }

  // Load from built-in templates
  logger?.debug('Looking up built-in template', { name: template });
  const templates = await workflowEngine.listTemplates();
  const found = templates.find((t) => t.name === template);

  if (found === undefined) {
    const availableNames = templates.map((t) => t.name).join(', ');
    return {
      ok: false,
      error: new WorkflowError(`Template not found: ${template}`, {
        context: {
          template,
          availableTemplates: availableNames,
        },
      }),
    };
  }

  // Load the template by path
  const result = await workflowEngine.loadTemplate(found.path);
  if (!result.ok) {
    return {
      ok: false,
      error: new WorkflowError(`Failed to load template: ${result.error.message}`, {
        context: { template, path: found.path },
      }),
    };
  }

  return result;
}

// ============================================================================
// Dry Run
// ============================================================================

/**
 * Execute dry run validation.
 *
 * @param workflow - Workflow definition
 * @param inputs - Provided inputs
 * @returns Dry run result
 */
export function executeDryRun(
  workflow: WorkflowDefinition,
  inputs: Record<string, unknown>
): DryRunResult {
  const validation = validateWorkflowInputs(workflow, inputs);
  const requiredInputs = workflow.inputs.filter((i) => i.required === true).map((i) => i.name);
  const providedInputs = Object.keys(inputs);

  return {
    valid: validation.valid,
    workflowName: workflow.name,
    stepCount: workflow.steps.length,
    inputsProvided: providedInputs,
    inputsRequired: requiredInputs,
    inputsMissing: validation.missing,
    validationErrors: validation.errors,
  };
}

// ============================================================================
// Response Formatting
// ============================================================================

/** MCP tool response type */
export type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** Create a successful JSON response */
export function successResponse(data: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Create an error response */
export function errorResponse(message: string): ToolResponse {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Create a failed workflow result */
export function createFailedResult(workflowName: string, errorMessage: string): ToolResponse {
  const result = {
    executionId: 'unknown',
    workflowName,
    status: 'failed',
    stepResults: [],
    output: null,
    durationMs: 0,
    error: errorMessage,
  };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/** Format validation errors into a message */
export function formatValidationErrors(validation: InputValidationResult): string {
  const messages = [
    ...validation.missing.map((m) => `Missing required input: ${m}`),
    ...validation.errors,
  ];
  return messages.join('\n');
}
