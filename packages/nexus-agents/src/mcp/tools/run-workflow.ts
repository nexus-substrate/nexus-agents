/**
 * nexus-agents/mcp - Run Workflow Tool
 *
 * MCP tool for executing workflow templates with the workflow engine.
 * Supports both built-in templates and custom template paths.
 *
 * @module mcp/tools/run-workflow
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Result } from '../../core/index.js';
import type { WorkflowDefinition, StepResult } from '../../core/index.js';
import { WorkflowError, ParseError } from '../../core/index.js';
import type {
  RunWorkflowInput,
  WorkflowToolResult,
  StepResultSummary,
  DryRunResult,
  RunWorkflowDeps,
} from './run-workflow-types.js';
import { RunWorkflowInputSchema } from './run-workflow-types.js';

// Re-export types for backward compatibility
export type {
  RunWorkflowInput,
  WorkflowToolResult,
  StepResultSummary,
  DryRunResult,
  RunWorkflowDeps,
} from './run-workflow-types.js';
export { RunWorkflowInputSchema } from './run-workflow-types.js';

/**
 * Check if a template identifier is a file path.
 * @param template - Template identifier
 * @returns True if it's a file path
 */
function isFilePath(template: string): boolean {
  return (
    template.includes('/') ||
    template.includes('\\') ||
    template.endsWith('.yaml') ||
    template.endsWith('.yml')
  );
}

/**
 * Convert StepResult to StepResultSummary for tool output.
 * @param result - Full step result
 * @returns Simplified summary
 */
function toStepResultSummary(result: StepResult): StepResultSummary {
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

/**
 * Validate workflow inputs against definitions.
 * @param workflow - Workflow definition
 * @param inputs - Provided inputs
 * @returns Validation result
 */
function validateWorkflowInputs(
  workflow: WorkflowDefinition,
  inputs: Record<string, unknown>
): { valid: boolean; missing: string[]; errors: string[] } {
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
 * @param name - Input name
 * @param value - Input value
 * @param expectedType - Expected type
 * @returns Error message or null if valid
 */
function validateInputType(name: string, value: unknown, expectedType: string): string | null {
  const validator = TYPE_VALIDATORS[expectedType];
  if (validator === undefined || validator(value)) {
    return null;
  }
  return `Input '${name}' expected ${expectedType}, got ${getActualTypeDescription(value)}`;
}

/**
 * Load workflow definition from template name or path.
 * @param deps - Tool dependencies
 * @param template - Template name or path
 * @returns Result with workflow definition
 */
async function loadWorkflow(
  deps: RunWorkflowDeps,
  template: string
): Promise<Result<WorkflowDefinition, WorkflowError | ParseError>> {
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

/**
 * Execute dry run validation.
 * @param workflow - Workflow definition
 * @param inputs - Provided inputs
 * @returns Dry run result
 */
function executeDryRun(
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

/**
 * Execute workflow and convert result.
 * @param deps - Tool dependencies
 * @param workflow - Workflow definition
 * @param inputs - Workflow inputs
 * @returns Tool result
 */
async function executeWorkflow(
  deps: RunWorkflowDeps,
  workflow: WorkflowDefinition,
  inputs: Record<string, unknown>
): Promise<Result<WorkflowToolResult, WorkflowError>> {
  const { workflowEngine, logger } = deps;

  logger?.info('Executing workflow', {
    workflowName: workflow.name,
    inputCount: Object.keys(inputs).length,
  });

  const startTime = Date.now();
  const result = await workflowEngine.execute(workflow, inputs);

  if (!result.ok) {
    logger?.error('Workflow execution failed', result.error, {
      workflowName: workflow.name,
    });

    return {
      ok: false,
      error: result.error,
    };
  }

  const workflowResult = result.value;

  logger?.info('Workflow completed', {
    workflowName: workflow.name,
    durationMs: Date.now() - startTime,
    stepCount: workflowResult.stepResults.length,
  });

  return {
    ok: true,
    value: {
      executionId: workflowResult.executionId,
      workflowName: workflowResult.workflowName,
      status: 'completed',
      stepResults: workflowResult.stepResults.map(toStepResultSummary),
      output: workflowResult.output,
      durationMs: workflowResult.totalDurationMs,
    },
  };
}

/** MCP tool response type */
type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** Create a successful JSON response */
function successResponse(data: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Create an error response */
function errorResponse(message: string): ToolResponse {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Create a failed workflow result */
function createFailedResult(workflowName: string, errorMessage: string): ToolResponse {
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
function formatValidationErrors(validation: { missing: string[]; errors: string[] }): string {
  const messages = [
    ...validation.missing.map((m) => `Missing required input: ${m}`),
    ...validation.errors,
  ];
  return messages.join('\n');
}

/**
 * Handle tool execution and format response.
 * @param deps - Tool dependencies
 * @param args - Validated tool arguments
 * @returns MCP tool response
 */
async function handleRunWorkflow(
  deps: RunWorkflowDeps,
  args: RunWorkflowInput
): Promise<ToolResponse> {
  const { template, inputs, dryRun } = args;
  deps.logger?.debug('run_workflow called', { template, dryRun, inputKeys: Object.keys(inputs) });

  const loadResult = await loadWorkflow(deps, template);
  if (!loadResult.ok) {
    return errorResponse(loadResult.error.message);
  }

  const workflow = loadResult.value;

  if (dryRun) {
    return successResponse(executeDryRun(workflow, inputs));
  }

  const validation = validateWorkflowInputs(workflow, inputs);
  if (!validation.valid) {
    return errorResponse(formatValidationErrors(validation));
  }

  const executeResult = await executeWorkflow(deps, workflow, inputs);
  if (!executeResult.ok) {
    return createFailedResult(workflow.name, executeResult.error.message);
  }

  return successResponse(executeResult.value);
}

/** Input schema for registerTool */
const toolInputSchema = {
  template: z.string().min(1).describe('Workflow template name (e.g., code-review) or file path'),
  inputs: z.record(z.unknown()).describe('Workflow inputs as key-value pairs'),
  dryRun: z.boolean().optional().default(false).describe('Validate workflow without executing'),
};

/**
 * Register the run_workflow tool with an MCP server.
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerRunWorkflowTool(server: McpServer, deps: RunWorkflowDeps): void {
  server.registerTool(
    'run_workflow',
    {
      description:
        'Execute a workflow template with provided inputs, supporting built-in templates and custom paths',
      inputSchema: toolInputSchema,
    },
    async (args) => {
      // Rate limiting check
      const acquired = deps.rateLimiter.tryAcquire();
      if (!acquired) {
        const state = deps.rateLimiter.getState();
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms.`,
            },
          ],
        };
      }

      const validated = RunWorkflowInputSchema.safeParse(args);
      if (!validated.success) {
        const errorMessage = validated.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Validation error: ${errorMessage}` }],
        };
      }
      return handleRunWorkflow(deps, validated.data);
    }
  );
}
