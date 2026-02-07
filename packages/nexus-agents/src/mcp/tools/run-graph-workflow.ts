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
import { createLogger, getTimeProvider } from '../../core/index.js';
import {
  GraphBuilder,
  executeGraph,
  overwrite,
  append,
  START,
  END,
} from '../../orchestration/graph/index.js';
import type { CompiledGraph, GraphEvent, GraphState } from '../../orchestration/graph/index.js';
import { createCheckpointStore } from '../../orchestration/graph/index.js';
import { createAuditTrail, createGraphAuditBridge } from '../../security/audit-trail.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';

// ============================================================================
// Types & Schema
// ============================================================================

export const RunGraphWorkflowInputSchema = z.object({
  workflow: z.string().min(1).max(100).describe('Name of the predefined graph workflow to execute'),
  inputs: z.record(z.unknown()).optional().default({}).describe('Input values for the workflow'),
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

export interface RunGraphWorkflowDeps {
  readonly logger?: ILogger | undefined;
  readonly rateLimiter: RateLimiter;
  readonly security?: SecurityConfig | undefined;
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
// Predefined Graph Registry
// ============================================================================

type GraphFactory = () => CompiledGraph | undefined;

/** Registry of predefined graph workflows. */
function getGraphRegistry(): ReadonlyMap<string, GraphFactory> {
  return new Map<string, GraphFactory>([
    ['echo', createEchoGraph],
    ['pipeline', createPipelineGraph],
  ]);
}

function createEchoGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('input', overwrite(''))
    .addState('output', overwrite(''))
    .addNode('echo', (state) => Promise.resolve({ output: `echo: ${String(state['input'])}` }))
    .addEdge(START, 'echo')
    .addEdge('echo', END)
    .compile();
  return result.ok ? result.value : undefined;
}

function createPipelineGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('input', overwrite(''))
    .addState('steps', append<string>())
    .addState('output', overwrite(''))
    .addNode('validate', (state) =>
      Promise.resolve({ steps: [`validated: ${String(state['input'])}`] })
    )
    .addNode('process', (state) => {
      const steps = state['steps'] as string[];
      return Promise.resolve({
        steps: [`processed ${String(steps.length)} inputs`],
        output: `done: ${String(state['input'])}`,
      });
    })
    .addEdge(START, 'validate')
    .addEdge('validate', 'process')
    .addEdge('process', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Handler
// ============================================================================

/** Executes a named graph workflow with full integration. */
async function handleRunGraphWorkflow(
  input: RunGraphWorkflowInput,
  logger: ILogger
): Promise<RunGraphWorkflowResponse> {
  const startTime = getTimeProvider().now();
  const registry = getGraphRegistry();
  const factory = registry.get(input.workflow);

  if (factory === undefined) {
    const available = [...registry.keys()].join(', ');
    return createErrorResponse({
      workflow: input.workflow,
      startTime,
      error: `Unknown workflow '${input.workflow}'. Available: ${available}`,
    });
  }

  const graph = factory();
  if (graph === undefined) {
    return createErrorResponse({
      workflow: input.workflow,
      startTime,
      error: `Failed to compile workflow '${input.workflow}'`,
    });
  }

  const events: GraphEventSummary[] = [];
  const checkpointStore = input.enableCheckpointing ? createCheckpointStore() : undefined;
  const auditTrail = input.enableAuditTrail ? createAuditTrail() : undefined;
  const auditBridge = auditTrail !== undefined ? createGraphAuditBridge(auditTrail) : undefined;

  const onEvent = (event: GraphEvent): void => {
    events.push(toEventSummary(event));
    auditBridge?.(event);
  };

  const executionId = `graph-${input.workflow}-${String(Date.now())}`;

  logger.info('Executing graph workflow', { workflow: input.workflow, executionId });

  const result = await executeGraph(graph, input.inputs, {
    ...(checkpointStore !== undefined ? { checkpointStore } : {}),
    executionId,
    onEvent,
    timeout: 60_000,
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

/** Registers the run_graph_workflow tool with an MCP server. */
export function registerRunGraphWorkflowTool(server: McpServer, deps: RunGraphWorkflowDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_graph_workflow' });

  type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

  const handler = async (args: unknown, _ctx: HandlerContext): Promise<ToolResponse> => {
    const parsed = RunGraphWorkflowInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
      };
    }
    const result = await handleRunGraphWorkflow(parsed.data, logger);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  };

  const secureHandler = createSecureHandler(handler, {
    toolName: 'run_graph_workflow',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('run_graph_workflow', deps.security);
  const wrapped = wrapToolWithTimeout('run_graph_workflow', secureHandler, { timeoutMs, logger });

  const toolSchema = {
    workflow: z.string().min(1).max(100).describe('Workflow name (e.g., "echo", "pipeline")'),
    inputs: z.record(z.unknown()).optional().describe('Input values for the workflow'),
    enableCheckpointing: z.boolean().optional().describe('Enable checkpoint saving'),
    enableAuditTrail: z.boolean().optional().describe('Enable audit trail logging'),
  };

  const description =
    'Execute a predefined graph-based workflow with checkpointing, event streaming, and audit trail support';

  server.registerTool(
    'run_graph_workflow',
    { description, inputSchema: toolSchema },
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
