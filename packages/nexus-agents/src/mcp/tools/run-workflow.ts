/**
 * nexus-agents/mcp - Run Workflow Tool
 *
 * MCP tool for executing workflow templates with the workflow engine.
 * Supports both built-in templates and custom template paths.
 *
 * @module mcp/tools/run-workflow
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Result } from '../../core/index.js';
import {
  getErrorMessage,
  WorkflowError,
  ParseError,
  createLogger,
  getTimeProvider,
} from '../../core/index.js';

import type { WorkflowDefinition, IWorkflowEngine } from '../../core/index.js';
import {
  wrapToolWithTimeout,
  toSdkCallbackWithBudgetCheck,
  getToolTimeout,
} from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { createMcpNotifier, NOOP_NOTIFIER } from '../mcp-notifier.js';
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
import { getToolMemory } from './tool-memory.js';
import { getToolAnnotations } from '../tool-annotations.js';
// #3044 / epic #2631 Stage 3 — async-mode dispatch via the shared `runAsJob`
// helper (#3729).
import { runAsJob } from '../jobs/run-as-job.js';
import { randomUUID } from 'node:crypto';

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
  inputs: Record<string, unknown>,
  options?: { phaseTimeoutMs?: number }
): Promise<Result<WorkflowToolResult, WorkflowError>> {
  const { workflowEngine, logger } = deps;

  logger?.info('Executing workflow', {
    workflowName: workflow.name,
    inputCount: Object.keys(inputs).length,
    ...(options?.phaseTimeoutMs !== undefined ? { phaseTimeoutMs: options.phaseTimeoutMs } : {}),
  });

  const startTime = getTimeProvider().now();
  // Pass the third arg only when phaseTimeoutMs is set — keeps the
  // `(workflow, inputs)` call shape for existing tests that
  // toHaveBeenCalledWith exactly two args (vitest treats explicit
  // `undefined` as a third arg).
  const result =
    options?.phaseTimeoutMs !== undefined
      ? await workflowEngine.execute(workflow, inputs, { phaseTimeoutMs: options.phaseTimeoutMs })
      : await workflowEngine.execute(workflow, inputs);

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
    durationMs: getTimeProvider().now() - startTime,
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

// ============================================================================
// Memory Recording (Issue #753)
// ============================================================================

/** Records successful workflow execution. Best-effort. */
function recordWorkflowSuccess(template: string, stepsCompleted: number, duration: number): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Workflow: ${template}`,
      challenges: [],
      durationMs: duration,
    });
    memory.recordLearning({
      pattern: `Workflow ${template} completed in ${String(stepsCompleted)} steps`,
      context: `duration=${String(duration)}ms`,
      confidence: 0.75,
      source: 'run-workflow',
    });
    void memory.runPromotionPipeline().catch((error: unknown) => {
      createLogger({ tool: 'run-workflow' }).warn('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    createLogger({ tool: 'run-workflow' }).warn('Failed to record workflow success', {
      error: getErrorMessage(error),
      template,
    });
  }
}

/** Records workflow execution failure. Best-effort. */
function recordWorkflowError(template: string, errorMessage: string): void {
  try {
    getToolMemory().recordError({
      error: `Workflow ${template}: ${errorMessage.slice(0, 100)}`,
      solution: 'Pending - workflow failed',
      filePattern: 'mcp/tools/run-workflow',
    });
  } catch (error: unknown) {
    createLogger({ tool: 'run-workflow' }).warn('Failed to record workflow error', {
      error: getErrorMessage(error),
      template,
    });
  }
}

/**
 * Build the failure envelope, threading `executionId` + `durationMs` from
 * the engine-enriched WorkflowError context so timed-out runs are
 * queryable via `query_trace` (#2931). Falls back to the legacy
 * 'unknown'/0 shape only when an upstream path didn't enrich the error.
 */
function buildFailureEnvelope(
  workflowName: string,
  error: { message: string; context?: Record<string, unknown> | undefined }
): ToolResponse {
  const ctx = error.context;
  const executionId = typeof ctx?.['executionId'] === 'string' ? ctx['executionId'] : undefined;
  const durationMs = typeof ctx?.['durationMs'] === 'number' ? ctx['durationMs'] : undefined;
  return createFailedResult(workflowName, error.message, {
    ...(executionId !== undefined ? { executionId } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
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
  const { template, inputs, dryRun, timeoutMs } = args;
  deps.logger?.debug('run_workflow called', {
    template,
    dryRun,
    inputKeys: Object.keys(inputs),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });

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

  // #3017: thread the caller-supplied timeoutMs (if any) through to the
  // workflow engine. Wins over both `workflow.timeout` and the engine's
  // `defaultTimeoutMs` for known-long templates.
  const executeResult = await executeWorkflow(
    deps,
    workflow,
    inputs,
    timeoutMs !== undefined ? { phaseTimeoutMs: timeoutMs } : undefined
  );
  if (!executeResult.ok) {
    recordWorkflowError(template, executeResult.error.message);
    return buildFailureEnvelope(workflow.name, executeResult.error);
  }

  recordWorkflowSuccess(
    template,
    executeResult.value.stepResults.length,
    executeResult.value.durationMs
  );
  return successResponse(executeResult.value);
}

/** Input schema for registerTool */
const toolInputSchema = {
  template: z.string().min(1).describe('Workflow template name (e.g., code-review) or file path'),
  inputs: z.record(z.string().max(100), z.unknown()).describe('Workflow inputs as key-value pairs'),
  dryRun: z.boolean().optional().default(false).describe('Validate workflow without executing'),
  // #3017
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(1_800_000)
    .optional()
    .describe('Per-phase execution timeout in ms (overrides workflow.timeout, bound [1s, 30min])'),
  // #3044 / epic #2631 Stage 3
  mode: z
    .enum(['sync', 'async'])
    .optional()
    .describe(
      'Dispatch mode (default: sync). "async" returns { jobId } immediately; poll via get_job_result.'
    ),
};

/**
 * Dispatch the workflow on a background promise + return a pending
 * envelope. Mirrors `dispatchAsyncOrchestrate` in orchestrate.ts (PR
 * #3048) — same protocol, different runner. Concurrency cap is enforced
 * via `tryAcquire('run_workflow')`; over-cap returns the `busy`
 * envelope synchronously so the caller can back off.
 *
 * Per-phase `timeoutMs` is preserved into the background dispatch
 * (the #3017 override still applies in async mode).
 */
/** Replay envelope for run_workflow idempotency (#3042 Stage 1c). */
function buildRunWorkflowReplayEnvelope(jobId: string): ToolResponse {
  return successResponse({
    status: 'replay',
    jobId,
    pollTool: 'get_job_result',
    note: 'Idempotency key matched a prior dispatch — poll get_job_result for current status.',
  });
}

/** Collision envelope for run_workflow idempotency (#3042 Stage 1c). */
function buildRunWorkflowCollisionEnvelope(existingJobId: string): ToolResponse {
  return errorResponse(
    `Idempotency key already used with different inputs. Existing jobId: ${existingJobId}. Use a fresh key or omit it.`
  );
}

function dispatchAsyncRunWorkflow(deps: RunWorkflowDeps, args: RunWorkflowInput): ToolResponse {
  // #3729: dispatch via the shared `runAsJob` helper — the exact sequence this
  // function used to inline (idempotency → busy-on-cap → pending + register →
  // detached run with complete/failed + release-in-finally → pending
  // envelope). run_workflow's only diffs are the freshJobId and the
  // `ToolResponse`-shaped envelopes (structurally identical to ToolResult but
  // built via successResponse/errorResponse for the workflow path).
  return runAsJob<RunWorkflowInput, ToolResponse, ToolResponse>({
    toolName: 'run_workflow',
    input: args,
    idempotencyKey: args.idempotencyKey,
    freshJobId: () => `job-rw-${randomUUID()}`,
    // `handleRunWorkflow` already encapsulates the full sync path (dry-run +
    // validation + recording); recording its whole envelope as the job result
    // preserves the success/error discriminator + stepResults for polling.
    run: (_jobId, input) => handleRunWorkflow(deps, input),
    toEnvelope: {
      pending: (jobId) =>
        successResponse({
          status: 'pending',
          jobId,
          pollTool: 'get_job_result',
          note: 'Poll via get_job_result({ jobId }) until status !== "pending".',
        }),
      busy: (retryAfterMs) =>
        successResponse({
          status: 'busy',
          retryAfterMs,
          note: 'Async-mode concurrency cap reached for run_workflow. Retry later or use mode: "sync".',
        }),
      replay: buildRunWorkflowReplayEnvelope,
      collision: buildRunWorkflowCollisionEnvelope,
    },
    ...(deps.logger !== undefined ? { logger: deps.logger } : {}),
  });
}

/**
 * Creates the core handler logic for run_workflow tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 *
 * @param deps - Tool dependencies
 * @returns Context-aware handler function
 */
function createRunWorkflowHandler(
  deps: RunWorkflowDeps
): (args: unknown, ctx: HandlerContext) => Promise<ToolResponse> {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResponse> => {
    const validated = RunWorkflowInputSchema.safeParse(args);
    if (!validated.success) {
      const errorMessage = validated.error.issues
        .map((e: { path: PropertyKey[]; message: string }) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return errorResponse(`Validation error: ${errorMessage}`);
    }

    ctx.logger.debug('Running workflow', {
      template: validated.data.template,
      dryRun: validated.data.dryRun,
      ...(validated.data.mode !== undefined ? { mode: validated.data.mode } : {}),
    });
    notifier.info('run_workflow', { event: 'workflow_start', template: validated.data.template });
    const startMs = getTimeProvider().now();

    // #3044 / epic #2631 Stage 3 — async-mode dispatch. Returns
    // immediately with a pending envelope or a busy envelope. dryRun
    // is fast enough to stay synchronous regardless of mode (no point
    // backgrounding a sub-second validation).
    if (validated.data.mode === 'async' && !validated.data.dryRun) {
      const asyncResult = dispatchAsyncRunWorkflow(deps, validated.data);
      notifier.info('run_workflow', {
        event: 'workflow_dispatched_async',
        template: validated.data.template,
      });
      return asyncResult;
    }

    const result = await handleRunWorkflow(deps, validated.data);

    // Notify on completion (only for non-error responses)
    if (result.isError !== true) {
      notifier.info('run_workflow', {
        event: 'workflow_complete',
        template: validated.data.template,
        durationMs: getTimeProvider().now() - startMs,
      });
    }

    return result;
  };
}

/**
 * Register the run_workflow tool with an MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerRunWorkflowTool(server: McpServer, deps: RunWorkflowDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_workflow' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createRunWorkflowHandler(depsWithNotifier), {
    toolName: 'run_workflow',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621)
  const timeoutMs = getToolTimeout('run_workflow', deps.security);
  const wrappedHandler = wrapToolWithTimeout('run_workflow', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'run_workflow',
    {
      description:
        'Run a LINEAR (single-path) workflow template by name with typed inputs. For DAG-shaped workflows with branching, checkpoints, or rollback, use `run_graph_workflow` instead.',
      inputSchema: toolInputSchema,

      annotations: getToolAnnotations('run_workflow'),
    },
    toSdkCallbackWithBudgetCheck(wrappedHandler, 'run_workflow', timeoutMs, logger)
  );
  logger.info('Registered run_workflow tool with secure handler and timeout protection');
}

/**
 * Creates a mock workflow engine for testing purposes only.
 *
 * WARNING: This is a test stub that returns errors for all operations except
 * listTemplates(). Do NOT use in production - use createRealWorkflowEngine()
 * from workflows/workflow-engine-factory.ts instead.
 *
 * This mock is useful for:
 * - Unit testing MCP tools without a real workflow engine
 * - Integration tests that need a predictable workflow engine
 *
 * @returns IWorkflowEngine stub that fails execute/load operations
 * @see createRealWorkflowEngine for production usage
 */
export function createMockWorkflowEngine(): IWorkflowEngine {
  return {
    loadTemplate(path: string) {
      return Promise.resolve({
        ok: false as const,
        error: new ParseError(`Mock workflow engine cannot load templates. Path: ${path}`),
      });
    },

    execute(workflow) {
      return Promise.resolve({
        ok: false as const,
        error: new WorkflowError(`Mock workflow engine cannot execute workflows`, {
          context: { workflowName: workflow.name },
        }),
      });
    },

    getStatus(_executionId: string) {
      return { state: 'pending' as const };
    },

    cancel(_executionId: string) {
      return Promise.resolve({
        ok: false as const,
        error: new WorkflowError('Mock workflow engine cannot cancel executions'),
      });
    },

    /**
     * Returns empty list - mock engine has no templates.
     * (Source: Issue #536 - Consistent behavior with execute/load failures)
     */
    listTemplates() {
      return Promise.resolve([]);
    },

    getTemplateByName() {
      return Promise.resolve(undefined);
    },
  };
}
