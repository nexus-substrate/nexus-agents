/**
 * nexus-agents/mcp - Run Workflow Helpers
 *
 * Helper functions for workflow validation, loading, and response formatting.
 * Extracted from run-workflow.ts to maintain file size limits.
 *
 * @module mcp/tools/run-workflow-helpers
 * (Source: Issue #339)
 */

import { resolve, sep } from 'node:path';
import type { Result } from '../../core/index.js';
import type { WorkflowDefinition, StepResult } from '../../core/index.js';
import { WorkflowError, SecurityError } from '../../core/index.js';
import { getBuiltInTemplatesPath } from '../../workflows/template-loader.js';
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
// Path Validation (Security - Issue #353)
// ============================================================================

/**
 * Validates that a file path is within one of the allowed root directories.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 *
 * @param userPath - The user-provided file path
 * @param allowedRoots - Array of allowed root directories
 * @returns Result with validated absolute path or SecurityError
 */
export function validateWorkflowPath(
  userPath: string,
  allowedRoots: string[]
): Result<string, SecurityError> {
  if (allowedRoots.length === 0) {
    return {
      ok: false,
      error: new SecurityError('No allowed directories configured for workflow templates', {
        context: { userPath },
      }),
    };
  }

  // Resolve the user path to an absolute path
  const resolvedPath = resolve(userPath);

  // Check if the resolved path is within any of the allowed roots
  for (const root of allowedRoots) {
    const resolvedRoot = resolve(root);
    // Path must be exactly the root OR start with root + separator
    if (resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + sep)) {
      return { ok: true, value: resolvedPath };
    }
  }

  return {
    ok: false,
    error: new SecurityError('Path traversal detected: path escapes allowed directories', {
      context: { userPath, allowedDirectories: allowedRoots.map((r) => resolve(r)) },
    }),
  };
}

/**
 * Get allowed directories for workflow templates.
 * Combines security config allowedPaths with built-in templates directory.
 *
 * @param deps - Tool dependencies containing security config
 * @returns Array of allowed directory paths
 */
export function getAllowedWorkflowDirs(deps: RunWorkflowDeps): string[] {
  const allowedDirs: string[] = [];

  // Add built-in templates directory (always allowed)
  allowedDirs.push(getBuiltInTemplatesPath());

  // Add security config allowedPaths if configured
  const securityPaths = deps.security?.allowedPaths;
  if (securityPaths !== undefined && securityPaths.length > 0) {
    allowedDirs.push(...securityPaths);
  } else {
    // Fall back to current working directory if no explicit config
    allowedDirs.push(process.cwd());
  }

  return allowedDirs;
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
 * Load workflow from a file path with security validation.
 * (Security fix: Issue #353)
 */
async function loadWorkflowFromPath(
  deps: RunWorkflowDeps,
  filePath: string
): Promise<Result<WorkflowDefinition, WorkflowError | SecurityError>> {
  const { workflowEngine, logger } = deps;

  // Validate path before loading (Security - Issue #353)
  const allowedDirs = getAllowedWorkflowDirs(deps);
  const pathValidation = validateWorkflowPath(filePath, allowedDirs);
  if (!pathValidation.ok) {
    logger?.warn('Workflow path validation failed', {
      path: filePath,
      error: pathValidation.error.message,
    });
    return { ok: false, error: pathValidation.error };
  }

  const validatedPath = pathValidation.value;
  const result = await workflowEngine.loadTemplate(validatedPath);
  if (!result.ok) {
    return {
      ok: false,
      error: new WorkflowError(`Failed to load template from path: ${result.error.message}`, {
        context: { path: validatedPath },
      }),
    };
  }
  return result;
}

/**
 * Load workflow from a built-in template name.
 */
async function loadWorkflowFromName(
  deps: RunWorkflowDeps,
  name: string
): Promise<Result<WorkflowDefinition, WorkflowError>> {
  const { workflowEngine, logger } = deps;

  logger?.debug('Looking up built-in template', { name });
  const templates = await workflowEngine.listTemplates();
  const found = templates.find((t) => t.name === name);

  if (found === undefined) {
    const availableNames = templates.map((t) => t.name).join(', ');
    return {
      ok: false,
      error: new WorkflowError(`Template not found: ${name}`, {
        context: { template: name, availableTemplates: availableNames },
      }),
    };
  }

  // Built-in templates are pre-validated, load directly
  const result = await workflowEngine.loadTemplate(found.path);
  if (!result.ok) {
    return {
      ok: false,
      error: new WorkflowError(`Failed to load template: ${result.error.message}`, {
        context: { template: name, path: found.path },
      }),
    };
  }
  return result;
}

/**
 * Load workflow definition from template name or path.
 *
 * Validates file paths against allowed directories to prevent path traversal attacks.
 * (Security fix: Issue #353)
 *
 * @param deps - Tool dependencies
 * @param template - Template name or path
 * @returns Result with workflow definition or error
 */
export async function loadWorkflow(
  deps: RunWorkflowDeps,
  template: string
): Promise<Result<WorkflowDefinition, WorkflowError | SecurityError>> {
  const { logger } = deps;

  if (isFilePath(template)) {
    logger?.debug('Loading workflow from file', { path: template });
    return loadWorkflowFromPath(deps, template);
  }

  return loadWorkflowFromName(deps, template);
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
