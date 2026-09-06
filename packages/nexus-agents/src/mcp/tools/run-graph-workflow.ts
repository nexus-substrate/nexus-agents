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
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import {
  createLogger,
  formatZodError,
  getTimeProvider,
  getRandomProvider,
} from '../../core/index.js';
import {
  toolStructuredError,
  toolSuccess,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import { executeGraph } from '../../orchestration/graph/index.js';
import type { CompiledGraph, GraphEvent, GraphState } from '../../orchestration/graph/index.js';
import { createCheckpointStore } from '../../orchestration/graph/index.js';
import { getGraphRegistry, getGraphWorkflowList } from './run-graph-workflow-templates.js';
import { createGraphAuditBridge } from '../../security/audit-trail.js';
import { createDurableAuditTrail } from '../../security/audit-bridge.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
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
import { getToolAnnotations } from '../tool-annotations.js';
// #3732 / epic #2631: async-mode dispatch via the shared `runAsJob` helper.
import { runAsJob } from '../jobs/run-as-job.js';
import { formatDetail } from './run-graph-workflow-events.js';

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
  /**
   * Dispatch mode (#3732). `sync` (default) runs the graph workflow inline and
   * returns the result — but a workflow of up to ~100 expert nodes can exceed
   * the MCP request timeout. `async` returns a `{ status: 'pending', jobId }`
   * envelope immediately and runs in the background; poll
   * `get_job_result({ jobId })` for the result. Ignored for the `list` sentinel.
   */
  dispatch: z
    .enum(['sync', 'async'])
    .optional()
    .default('sync')
    .describe(
      "Dispatch mode (#3732). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result)."
    ),
});

export type RunGraphWorkflowInput = z.infer<typeof RunGraphWorkflowInputSchema>;

export interface RunGraphWorkflowDeps extends BaseMcpToolDeps {
  /** MCP notifier for client-visible logging (Issue #974) */
  readonly notifier?: IMcpNotifier | undefined;
  /**
   * Durable audit logger (#5219). Without it, `enableAuditTrail` produced a
   * trail that was never persisted: `graph_execution` records sat in an
   * in-memory array capped at 10,000, evicted oldest-first, and gone on exit —
   * never reaching the hash chain `verify_audit_chain` reads.
   *
   * Threaded the same way `execute_expert` and `orchestrate` receive theirs.
   */
  readonly auditLogger?: IAuditLogger | undefined;
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
  enableAuditTrail: boolean,
  logger: ILogger,
  auditLogger?: IAuditLogger
): (event: GraphEvent) => void {
  // `createDurableAuditTrail` returns undefined without a logger, deliberately:
  // a caller cannot silently receive a non-durable trail (#5219). This site
  // previously called bare `createAuditTrail()` and bypassed that guard.
  const trail = enableAuditTrail ? createDurableAuditTrail(auditLogger) : undefined;
  if (enableAuditTrail && trail === undefined) {
    // Warn rather than fail: the run itself is unaffected, but the caller asked
    // for an audit trail and is not getting one, which must not be silent.
    logger.warn(
      'enableAuditTrail requested but no durable audit logger is configured; ' +
        'graph_execution events will NOT be recorded (#5219)'
    );
  }
  const auditBridge = trail !== undefined ? createGraphAuditBridge(trail) : undefined;
  return (event: GraphEvent): void => {
    events.push(toEventSummary(event));
    auditBridge?.(event);
  };
}

/** Executes a named graph workflow with full integration. */
async function handleRunGraphWorkflow(
  input: RunGraphWorkflowInput,
  logger: ILogger,
  auditLogger?: IAuditLogger
): Promise<RunGraphWorkflowResponse> {
  const startTime = getTimeProvider().now();
  const resolved = resolveGraph(input.workflow, startTime);
  if (!resolved.ok) return resolved.error;

  const events: GraphEventSummary[] = [];
  const checkpointStore = input.enableCheckpointing ? createCheckpointStore() : undefined;
  const onEvent = createEventCollector(events, input.enableAuditTrail, logger, auditLogger);
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

  // #4351: was hardcoded 'completed'. The executor returns ok() even when
  // nodes failed — its err() paths cover checkpoint/validation/timeout only —
  // so a graph whose nodes all failed reported success to the caller.
  // 'interrupted' is intentionally NOT treated as a failure here: the executor
  // signals that separately via `halted`, and conflating the two would change
  // interrupt semantics this change has not studied.
  const nodeStatus = result.value.nodeResults.some((n) => n.status === 'failed')
    ? ('failed' as const)
    : ('completed' as const);
  return {
    workflow: input.workflow,
    status: nodeStatus,
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
  "Run a DAG-shaped workflow with per-node checkpoints, event streaming, and an audit trail. Checkpoints drive the executor in-process recovery (crash-resume + selective node retry) and inspection — the MCP call is fire-and-forget with NO caller resume input, and the checkpoint store is in-memory (not durable across process restarts). For straight linear templates, use `run_workflow` instead. Supports dispatch: 'async' — returns a jobId immediately; poll get_job_result.";

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
  dispatch: z
    .enum(['sync', 'async'])
    .optional()
    .describe(
      "Dispatch mode (#3732). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result)."
    ),
};

/**
 * Run the graph workflow body + shape the structured envelope. The sync handler
 * awaits this inline; the async dispatcher backgrounds it via {@link runAsJob}
 * (#3732). Records the outcome + fires the completion notification as a side
 * effect so both dispatch paths report identically.
 */
async function executeGraphWorkflowBody(
  input: RunGraphWorkflowInput,
  logger: ILogger,
  notifier: IMcpNotifier,
  auditLogger?: IAuditLogger
): Promise<ToolResult> {
  const result = await handleRunGraphWorkflow(input, logger, auditLogger);
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
  return succeeded
    ? toolSuccess(text)
    : toolStructuredError({ errorCategory: 'internal', message: text });
}

/** Creates the handler for run_graph_workflow tool. */
function createGraphWorkflowHandler(
  logger: ILogger,
  notifier: IMcpNotifier,
  auditLogger?: IAuditLogger
): (args: unknown, ctx: HandlerContext) => Promise<ToolResult> {
  return async (args: unknown, _ctx: HandlerContext): Promise<ToolResult> => {
    const parsed = RunGraphWorkflowInputSchema.safeParse(args);
    if (!parsed.success) {
      return toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      });
    }
    const input = parsed.data;
    if (input.workflow === 'list') {
      return toolSuccess(JSON.stringify(getGraphWorkflowList(), null, 2));
    }
    const code = input.inputs['code'];
    if (input.workflow === 'security-scan' && (typeof code !== 'string' || code.trim() === ''))
      return toolStructuredError({ errorCategory: 'validation', message: 'Missing inputs.code' });
    notifier.info('run_graph_workflow', {
      event: 'graph_workflow_start',
      workflow: input.workflow,
    });

    // #3732: async dispatch — a workflow of up to ~100 expert nodes can exceed
    // the MCP request timeout. run_graph_workflow has no sessionId, so a fresh
    // `gw-<uuid>` jobId is always minted (no idempotency surface). Returns
    // `{ status: 'pending', jobId }` immediately.
    if (input.dispatch === 'async') {
      return runAsJob<RunGraphWorkflowInput, ToolResult>({
        toolName: 'run_graph_workflow',
        input,
        freshJobId: () => `gw-${randomUUID()}`,
        run: () => executeGraphWorkflowBody(input, logger, notifier, auditLogger),
        logger,
      });
    }

    return executeGraphWorkflowBody(input, logger, notifier, auditLogger);
  };
}

/** Registers the run_graph_workflow tool with an MCP server. @category MCP */
export function registerRunGraphWorkflowTool(server: McpServer, deps: RunGraphWorkflowDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_graph_workflow' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const handler = createGraphWorkflowHandler(logger, notifier, deps.auditLogger);

  const secureHandler = createSecureHandler(handler, {
    toolName: 'run_graph_workflow',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('run_graph_workflow', deps.security);
  const wrapped = wrapToolWithTimeout('run_graph_workflow', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'run_graph_workflow',
    {
      description: GRAPH_WORKFLOW_DESCRIPTION,
      inputSchema: GRAPH_WORKFLOW_SCHEMA,
      annotations: getToolAnnotations('run_graph_workflow'),
    },
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
      id: `graph-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`,
      // #5020: NOT `DEFAULT_CLI`. This tool does not know which CLI served the
      // work — the model field below is a synthetic label, not a model id — and
      // hardcoding 'claude' credited or debited claude for every run, poisoning
      // the same routing learner #5003 fixed in the feedback bridge.
      // `'unknown'` is the schema's own unattributed value, and the bandit's
      // warm-start already partitions it out (#4935) instead of replaying it.
      cli: 'unknown',
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
