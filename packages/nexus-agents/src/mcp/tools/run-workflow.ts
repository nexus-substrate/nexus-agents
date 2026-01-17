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
import type { WorkflowDefinition } from '../../core/index.js';
import { WorkflowError, createLogger } from '../../core/index.js';
import { wrapToolWithTimeout } from '../middleware/tool-wrapper.js';
import type {
  RunWorkflowInput,
  WorkflowToolResult,
  RunWorkflowDeps,
} from './run-workflow-types.js';
import { RunWorkflowInputSchema } from './run-workflow-types.js';
import {
  type ToolResponse,
  loadWorkflow,
  validateWorkflowInputs,
  executeDryRun,
  toStepResultSummary,
  successResponse,
  errorResponse,
  createFailedResult,
  formatValidationErrors,
} from './run-workflow-helpers.js';

// Re-export types for backward compatibility
export type {
  RunWorkflowInput,
  WorkflowToolResult,
  StepResultSummary,
  DryRunResult,
  RunWorkflowDeps,
} from './run-workflow-types.js';
export { RunWorkflowInputSchema } from './run-workflow-types.js';

// Re-export helper functions
export {
  isFilePath,
  toStepResultSummary,
  validateInputType,
  validateWorkflowInputs,
  loadWorkflow,
  executeDryRun,
  successResponse,
  errorResponse,
  createFailedResult,
  formatValidationErrors,
} from './run-workflow-helpers.js';
export type { ToolResponse, InputValidationResult } from './run-workflow-helpers.js';

/**
 * Execute workflow and convert result.
 *
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

/**
 * Handle tool execution and format response.
 *
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
 * Creates the handler for the run_workflow tool.
 *
 * @param deps - Tool dependencies
 * @returns Handler function
 */
function createRunWorkflowHandler(deps: RunWorkflowDeps): (args: unknown) => Promise<ToolResponse> {
  return async (args: unknown): Promise<ToolResponse> => {
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
  };
}

/**
 * Register the run_workflow tool with an MCP server.
 *
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerRunWorkflowTool(server: McpServer, deps: RunWorkflowDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_workflow' });

  // Wrap handler with timeout protection (Issue #271, CVE-2026-0621)
  const handler = createRunWorkflowHandler(deps);
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs;
  const wrappedHandler = wrapToolWithTimeout(
    'run_workflow',
    handler,
    timeoutMs !== undefined ? { timeoutMs, logger } : { logger }
  );

  // Type assertion needed: MCP SDK expects index signature, our ToolResult is structurally compatible
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  server.registerTool(
    'run_workflow',
    {
      description:
        'Execute a workflow template with provided inputs, supporting built-in templates and custom paths',
      inputSchema: toolInputSchema,
    },
    wrappedHandler as any
  );
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  logger.info('Registered run_workflow tool with timeout protection');
}
