/**
 * nexus-agents/mcp - Run Graph Workflow Tool
 *
 * MCP tool for executing graph-based workflows with checkpointing,
 * event streaming, and audit trail integration.
 *
 * @module mcp/tools/run-graph-workflow
 * (Source: Issue #840 — Expose graph workflows via MCP tool)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError, getTimeProvider } from '../../core/index.js';
import { toolError, toolSuccess, type ToolResult, type BaseMcpToolDeps } from './tool-result.js';
import { executeGraph } from '../../orchestration/graph/index.js';
import type { CompiledGraph, GraphEvent, GraphState } from '../../orchestration/graph/index.js';
import { createCheckpointStore } from '../../orchestration/graph/index.js';
import { getGraphRegistry, getGraphWorkflowList } from './run-graph-workflow-templates.js';
import { createAuditTrail, createGraphAuditBridge } from '../../security/audit-trail.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../../config/timeouts.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { createMcpNotifier } from '../mcp-notifier.js';
import { getToolMemory } from './tool-memory.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';

// ============================================================================
// Types & Schema
// ============================================================================

export const RunGraphWorkflowInputSchema = z.object({
  workflow: z.string().min(1).max(100).describe('Name of the predefined graph workflow to execute'),
  inputs: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .describe('Input values for the workflow'),
  enableCheckpointing: z
    .boolean()
    .optional()
    .default(true)
    .describe('Enable checkpoint saving between steps'),
  enableAuditTrail: z
    .boolean()
    .optional()
    .default(false)
    .describe('Enable audit trail event logging'),
});

export type RunGraphWorkflowInput = z.infer<typeof RunGraphWorkflowInputSchema>;

export interface RunGraphWorkflowDeps extends BaseMcpToolDeps {
  /** MCP notifier for client-visible logging (Issue #974) */
  readonly notifier?: IMcpNotifier | undefined;
}

export interface RunGraphWorkflowResponse {
  readonly workflow: string;
  readonly status: 'completed' | 'failed';
  readonly finalState: Readonly<GraphState>;
  readonly stepsExecuted: number;
  readonly nodesExecuted: number;
  readonly durationMs: number;
  readonly events: readonly GraphEventSummary[];
  readonly checkpointCount: number;
  readonly error?: string | undefined;
}

interface GraphEventSummary {
  readonly type: string;
  readonly nodeId?: string | undefined;
  readonly detail?: string | undefined;
}

// ============================================================================
// Handler
// ============================================================================

/** Resolves a compiled graph from the registry by workflow name. */
function resolveGraph(
  workflow: string,
  startTime: number
): { ok: true; graph: CompiledGraph } | { ok: false; error: RunGraphWorkflowResponse } {
  const registry = getGraphRegistry();
  const factory = registry.get(workflow);

  if (factory === undefined) {
    const available = [...registry.keys()].join(', ');
    return {
      ok: false,
      error: createErrorResponse({
        workflow,
        startTime,
        error: `Unknown workflow '${workflow}'. Available: ${available}`,
      }),
    };
  }

  const graph = factory();
  if (graph === undefined) {
    return {
      ok: false,
      error: createErrorResponse({
        workflow,
        startTime,
        error: `Failed to compile workflow '${workflow}'`,
      }),
    };
  }

  return { ok: true, graph };
}

/** Creates the event listener that collects summaries and optionally bridges to audit trail. */
function createEventCollector(
  events: GraphEventSummary[],
  enableAuditTrail: boolean
): (event: GraphEvent) => void {
  const auditBridge = enableAuditTrail ? createGraphAuditBridge(createAuditTrail()) : undefined;
  return (event: GraphEvent): void => {
    events.push(toEventSummary(event));
    auditBridge?.(event);
  };
}

/** Executes a named graph workflow with full integration. */
async function handleRunGraphWorkflow(
  input: RunGraphWorkflowInput,
  logger: ILogger
): Promise<RunGraphWorkflowResponse> {
  const startTime = getTimeProvider().now();
  const resolved = resolveGraph(input.workflow, startTime);
  if (!resolved.ok) return resolved.error;

  const events: GraphEventSummary[] = [];
  const checkpointStore = input.enableCheckpointing ? createCheckpointStore() : undefined;
  const onEvent = createEventCollector(events, input.enableAuditTrail);
  const executionId = `graph-${input.workflow}-${String(Date.now())}`;

  logger.info('Executing graph workflow', {
    workflow: input.workflow,
    executionId,
    checkpointing: input.enableCheckpointing,
    auditTrail: input.enableAuditTrail,
  });

  const result = await executeGraph(resolved.graph, input.inputs, {
    ...(checkpointStore !== undefined ? { checkpointStore } : {}),
    executionId,
    onEvent,
    timeout: CLI_SUBPROCESS_TIMEOUTS.graphWorkflowMs,
  });

  const durationMs = getTimeProvider().now() - startTime;
  const checkpointCount = checkpointStore?.size() ?? 0;

  if (!result.ok) {
    return createErrorResponse({
      workflow: input.workflow,
      startTime,
      error: result.error.message,
      events,
      checkpointCount,
    });
  }

  return {
    workflow: input.workflow,
    status: 'completed',
    finalState: result.value.finalState,
    stepsExecuted: result.value.stepsExecuted,
    nodesExecuted: result.value.nodeResults.length,
    durationMs,
    events,
    checkpointCount,
  };
}

// ============================================================================
// Registration
// ============================================================================

const GRAPH_WORKFLOW_DESCRIPTION =
  'Execute a predefined graph-based workflow with checkpointing, event streaming, and audit trail support';

const GRAPH_WORKFLOW_SCHEMA = {
  workflow: z
    .string()
    .min(1)
    .max(100)
    .describe(
      'Workflow name: echo, pipeline, code-review, security-scan. Use "list" for available workflows.'
    ),
  inputs: z.record(z.string(), z.unknown()).optional().describe('Input values for the workflow'),
  enableCheckpointing: z.boolean().optional().describe('Enable checkpoint saving'),
  enableAuditTrail: z.boolean().optional().describe('Enable audit trail logging'),
};

/** Creates the handler for run_graph_workflow tool. */
function createGraphWorkflowHandler(
  logger: ILogger,
  notifier: IMcpNotifier
): (args: unknown, ctx: HandlerContext) => Promise<ToolResult> {
  return async (args: unknown, _ctx: HandlerContext): Promise<ToolResult> => {
    const parsed = RunGraphWorkflowInputSchema.safeParse(args);
    if (!parsed.success) {
      return toolError(`Validation error: ${formatZodError(parsed.error)}`);
    }
    if (parsed.data.workflow === 'list') {
      return toolSuccess(JSON.stringify(getGraphWorkflowList(), null, 2));
    }
    notifier.info('run_graph_workflow', {
      event: 'graph_workflow_start',
      workflow: parsed.data.workflow,
    });
    const result = await handleRunGraphWorkflow(parsed.data, logger);
    const succeeded = result.status === 'completed';
    notifier.info('run_graph_workflow', {
      event: succeeded ? 'graph_workflow_complete' : 'graph_workflow_failed',
      workflow: result.workflow,
      nodeCount: result.nodesExecuted,
      durationMs: result.durationMs,
    });

    // Record to memory and outcome store (Issue #1174)
    recordGraphWorkflowResult(result);

    const text = JSON.stringify(result, null, 2);
    return succeeded ? toolSuccess(text) : toolError(text);
  };
}

/** Registers the run_graph_workflow tool with an MCP server. @category MCP */
export function registerRunGraphWorkflowTool(server: McpServer, deps: RunGraphWorkflowDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_graph_workflow' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const handler = createGraphWorkflowHandler(logger, notifier);

  const secureHandler = createSecureHandler(handler, {
    toolName: 'run_graph_workflow',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('run_graph_workflow', deps.security);
  const wrapped = wrapToolWithTimeout('run_graph_workflow', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'run_graph_workflow',
    { description: GRAPH_WORKFLOW_DESCRIPTION, inputSchema: GRAPH_WORKFLOW_SCHEMA },
    toSdkCallback(wrapped)
  );
  logger.info('Registered run_graph_workflow tool');
}

// ============================================================================
// Helpers
// ============================================================================

function toEventSummary(event: GraphEvent): GraphEventSummary {
  const hasNodeId = 'nodeId' in event;
  if (hasNodeId) {
    return { type: event.type, nodeId: event.nodeId, detail: formatDetail(event) };
  }
  return { type: event.type, detail: formatDetail(event) };
}

function formatDetail(event: GraphEvent): string {
  switch (event.type) {
    case 'node_started':
      return `Starting ${event.nodeId}`;
    case 'node_completed':
      return `${event.nodeId} in ${String(event.durationMs)}ms`;
    case 'node_error':
      return `${event.nodeId}: ${event.error}`;
    case 'step_completed':
      return `${String(event.nodesExecuted)} nodes`;
    case 'execution_complete':
      return `${String(event.totalSteps)} steps, ${String(event.durationMs)}ms`;
    case 'state_updated':
      return event.updatedKeys.join(', ');
    case 'hook_started':
      return `${event.hookPhase}: ${event.hookName} on ${event.nodeId}`;
    case 'hook_completed':
      return `${event.hookPhase}: ${event.hookName} on ${event.nodeId} in ${String(event.durationMs)}ms`;
    case 'hook_failed':
      return `${event.hookPhase}: ${event.hookName} on ${event.nodeId}: ${event.error}`;
  }
}

interface ErrorResponseOpts {
  readonly workflow: string;
  readonly startTime: number;
  readonly error: string;
  readonly events?: readonly GraphEventSummary[];
  readonly checkpointCount?: number;
}

function createErrorResponse(opts: ErrorResponseOpts): RunGraphWorkflowResponse {
  return {
    workflow: opts.workflow,
    status: 'failed',
    finalState: {},
    stepsExecuted: 0,
    nodesExecuted: 0,
    durationMs: getTimeProvider().now() - opts.startTime,
    events: opts.events ?? [],
    checkpointCount: opts.checkpointCount ?? 0,
    error: opts.error,
  };
}

// ============================================================================
// Recording Helpers (Issue #1174)
// ============================================================================

const graphLogger = createLogger({ tool: 'run-graph-workflow' });

/** Maps workflow name to task category for accurate weather report tracking. */
function workflowToCategory(
  workflow: string
): 'code_review' | 'security_review' | 'code_generation' {
  if (workflow.includes('security') || workflow.includes('audit')) return 'security_review';
  if (workflow.includes('review')) return 'code_review';
  return 'code_generation';
}

/** Records graph workflow result to memory and outcome store. Best-effort. */
function recordGraphWorkflowResult(result: RunGraphWorkflowResponse): void {
  const succeeded = result.status === 'completed';
  try {
    const memory = getToolMemory();
    if (succeeded) {
      memory.recordTask({
        approach: `Graph workflow: ${result.workflow} (${String(result.nodesExecuted)} nodes)`,
        challenges: [],
        durationMs: result.durationMs,
      });
      memory.recordLearning({
        pattern: `graph_workflow → ${result.workflow}`,
        context: `nodes=${String(result.nodesExecuted)} duration=${String(result.durationMs)}ms`,
        confidence: 0.8,
        source: 'manual',
      });
    } else {
      memory.recordError({
        error: `Graph workflow ${result.workflow} failed: ${result.error ?? 'unknown'}`,
        solution: 'Check workflow inputs and node handlers',
        filePattern: 'mcp/tools/run-graph-workflow',
      });
    }
  } catch (error: unknown) {
    graphLogger.debug('Failed to record graph result', { error: String(error) });
  }
  try {
    const store = getOutcomeStore();
    store.append({
      id: `graph-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: DEFAULT_CLI,
      category: workflowToCategory(result.workflow),
      model: 'graph-workflow',
      success: succeeded,
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
      source: 'manual',
      ...(!succeeded && result.error !== undefined
        ? {
            failureCategory: categorizeOutcomeErrorMessage(result.error),
            errorMessage: result.error.slice(0, 500),
          }
        : {}),
    });
  } catch (storeErr: unknown) {
    graphLogger.debug('Failed to record outcome to store', {
      error: storeErr instanceof Error ? storeErr.message : String(storeErr),
    });
  }
}
