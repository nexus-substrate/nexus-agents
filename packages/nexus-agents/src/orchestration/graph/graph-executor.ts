/* eslint-disable max-lines -- cohesive super-step + HITL pipeline; splitting hides control flow */
/**
 * nexus-agents/orchestration - Graph Workflow Executor
 *
 * Executes compiled graph workflows using super-step (BSP) model:
 * 1. Find all nodes with satisfied dependencies (in-degree 0)
 * 2. Execute them in parallel
 * 3. Merge state updates using reducers
 * 4. Repeat until END is reached or max steps exhausted
 *
 * @module orchestration/graph/graph-executor
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import type { Result } from '../../core/index.js';
import { getErrorMessage, ok, err, createLogger, getTimeProvider } from '../../core/index.js';

import type {
  CompiledGraph,
  Command,
  GraphState,
  GraphNode,
  GraphEdge,
  NodeResult,
  NodeReturn,
  NodeContext,
  Interrupt,
  GraphExecutionResult,
  GraphExecuteOptions,
  StateFieldSchema,
} from './graph-types.js';
import { END, isInterrupt, isCommand, ResumeValuesSchema } from './graph-types.js';
import { createCheckpoint } from './checkpoint-store.js';
import type { ICheckpointStore } from './checkpoint-types.js';
import {
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
} from './graph-events.js';
import { runPreconditions, runVerification } from './graph-hooks.js';
import { categorizeOutcomeError } from '../outcomes/outcome-types.js';
import { coarsenFailureCategory, defaultRetryable } from '../../mcp/error-envelope.js';
import type { ErrorCategory } from '../../mcp/error-envelope.js';

const logger = createLogger({ component: 'GraphExecutor' });

/** Build the retryability fields for a failed NodeResult (#3534). */
function failureClassification(category: ErrorCategory): {
  errorCategory: ErrorCategory;
  isRetryable: boolean;
} {
  return { errorCategory: category, isRetryable: defaultRetryable(category) };
}

// Canonical source: config/timeouts.ts (Issue #1046)
import { GRAPH_TIMEOUTS } from '../../config/timeouts.js';

const DEFAULT_MAX_STEPS = GRAPH_TIMEOUTS.maxSteps;
const DEFAULT_TIMEOUT_MS = GRAPH_TIMEOUTS.defaultMs;

/**
 * Well-known key under which {@link executeGraph} stashes the unified
 * memory context (Phase 3 of #2792). Node implementations may read
 * `state[GRAPH_UNIFIED_CONTEXT_KEY]` to access beliefs, similar memories,
 * recent learnings, observed patterns, and outcomes for the task type
 * inferred from the graph's initial inputs.
 */
export const GRAPH_UNIFIED_CONTEXT_KEY = '__unifiedContext';

async function populateUnifiedContextOnState(state: GraphState): Promise<void> {
  try {
    const taskCandidate = state['task'];
    if (typeof taskCandidate !== 'string' || taskCandidate === '') return;

    const { getContextForTask, inferTaskCategory } =
      await import('../../context/context-retriever.js');
    const ctx = await getContextForTask({
      task: taskCandidate,
      category: inferTaskCategory(taskCandidate),
      logger,
    });
    state[GRAPH_UNIFIED_CONTEXT_KEY] = ctx;
    logger.debug('Graph start: unified memory context stashed', {
      beliefs: ctx.beliefs.length,
      similarMemories: ctx.similarMemories.length,
      experiencePatterns: ctx.experiencePatterns.length,
      outcomesTotal: ctx.outcomes?.totalTasks ?? 0,
    });
  } catch (error: unknown) {
    logger.debug('Graph start: context retrieval failed', { error: getErrorMessage(error) });
  }
}

/** Mutable execution context threaded through the super-step loop. */
interface ExecutionContext {
  state: GraphState;
  allResults: NodeResult[];
  stepsExecuted: number;
  runnableIds: string[];
  /** Per-edge traversal counts for maxTraversals enforcement. */
  edgeTraversals: Map<string, number>;
  /** Resume values keyed by interrupt id, surfaced to nodes via NodeContext (#1895). */
  resumeValues: Readonly<Record<string, unknown>>;
  /** Set when a node in the current super-step returned an Interrupt (#1895). */
  pendingInterrupt:
    | {
        readonly nodeId: string;
        readonly interrupt: Interrupt;
        readonly additional: readonly { readonly nodeId: string; readonly interrupt: Interrupt }[];
      }
    | undefined;
}

/**
 * Executes a compiled graph workflow.
 *
 * Uses a super-step model: each step finds all runnable nodes,
 * executes them in parallel, merges state, then resolves edges
 * to find the next set of runnable nodes.
 */
export async function executeGraph(
  graph: CompiledGraph,
  initialInputs: Readonly<GraphState>,
  options?: GraphExecuteOptions
): Promise<Result<GraphExecutionResult, Error>> {
  const startTime = getTimeProvider().now();
  const initialState = initializeState(graph, initialInputs);

  // Phase 3 of #2792 — read unified memory context at graph start and stash
  // under a well-known key so node implementations can consume it without
  // a second fetch. Best-effort: failure is logged and silently produces
  // an empty context.
  await populateUnifiedContextOnState(initialState);

  const ctx: ExecutionContext = {
    state: initialState,
    allResults: [],
    stepsExecuted: 0,
    runnableIds: resolveEntryNodes(graph, initialState),
    edgeTraversals: new Map(),
    resumeValues: options?.resumeValues ?? {},
    pendingInterrupt: undefined,
  };

  tryResumeFromCheckpoint(ctx, options);

  const loopResult = await runSuperStepLoop(graph, ctx, startTime, options);
  if (loopResult !== undefined) return loopResult;

  const totalDurationMs = getTimeProvider().now() - startTime;

  logger.info('Graph execution complete', {
    stepsExecuted: ctx.stepsExecuted,
    durationMs: totalDurationMs,
  });

  emitExecutionComplete(ctx.stepsExecuted, ctx.allResults.length, totalDurationMs, options);

  if (ctx.pendingInterrupt !== undefined) {
    const halted = saveInterruptCheckpoint(ctx, options);
    return ok({
      finalState: ctx.state,
      nodeResults: ctx.allResults,
      totalDurationMs,
      stepsExecuted: ctx.stepsExecuted,
      ...(halted !== undefined ? { halted } : {}),
    });
  }

  return ok({
    finalState: ctx.state,
    nodeResults: ctx.allResults,
    totalDurationMs,
    stepsExecuted: ctx.stepsExecuted,
  });
}

/**
 * Resume a paused graph execution from a HITL interrupt checkpoint (#1895).
 *
 * Loads the named checkpoint, validates that it carries interrupt metadata,
 * Zod-parses `resumeValues` at the API boundary (#2425), checks idempotency
 * (#2425), and re-runs the graph starting from the interrupted node. The
 * supplied `resumeValues` map (keyed by interrupt id) is delivered to that
 * node's NodeContext on the run that follows the resume call.
 *
 * Errors:
 *   - checkpointStore not configured
 *   - checkpoint not found
 *   - checkpoint has no interrupt metadata
 *   - resumeValues fails Zod validation (#2425)
 *   - resumeValues missing the interrupt id this checkpoint is waiting for
 *   - checkpoint already consumed (#2425)
 */
/**
 * Validate the resume request — checkpoint loadable + valid resumeValues +
 * matches the interrupt id + not already consumed. Returns either the
 * validated context or an error.
 */
function validateResumeRequest(
  store: ICheckpointStore,
  checkpointId: string,
  resumeValues: unknown
): Result<
  {
    checkpoint: NonNullable<ReturnType<ICheckpointStore['load']>>;
    values: Record<string, unknown>;
  },
  Error
> {
  const checkpoint = store.load(checkpointId);
  if (checkpoint === undefined) {
    return err(new Error(`Checkpoint not found: ${checkpointId}`));
  }
  const interruptCtx = checkpoint.interrupt;
  if (interruptCtx === undefined) {
    return err(
      new Error(`Checkpoint ${checkpointId} has no interrupt metadata; not a paused execution.`)
    );
  }
  if (interruptCtx.consumedAt !== undefined) {
    return err(
      new Error(
        `Checkpoint ${checkpointId} already resumed at ${interruptCtx.consumedAt}; double-resume rejected.`
      )
    );
  }
  const parsed = ResumeValuesSchema.safeParse(resumeValues);
  if (!parsed.success) {
    return err(new Error(`resumeValues failed validation: ${parsed.error.message}`));
  }
  if (!Object.prototype.hasOwnProperty.call(parsed.data, interruptCtx.interruptId)) {
    return err(
      new Error(
        `resumeValues missing interrupt id '${interruptCtx.interruptId}' (paused at node '${interruptCtx.nodeId}')`
      )
    );
  }
  return ok({ checkpoint, values: parsed.data });
}

export async function resumeFromCheckpoint(
  graph: CompiledGraph,
  checkpointId: string,
  resumeValues: unknown,
  options: GraphExecuteOptions
): Promise<Result<GraphExecutionResult, Error>> {
  const store: ICheckpointStore | undefined = options.checkpointStore;
  if (store === undefined) {
    return err(new Error('resumeFromCheckpoint requires options.checkpointStore'));
  }
  const validated = validateResumeRequest(store, checkpointId, resumeValues);
  if (!validated.ok) return validated;
  const { checkpoint, values } = validated.value;
  const existing = checkpoint.interrupt;
  if (existing === undefined) {
    return err(new Error('unreachable: validateResumeRequest already checked .interrupt'));
  }
  // Mark consumed before re-running so a concurrent second call sees it.
  store.save({
    ...checkpoint,
    interrupt: { ...existing, consumedAt: new Date().toISOString() },
  });
  return executeGraph(
    graph,
    {},
    {
      ...options,
      executionId: checkpoint.executionId,
      resumeValues: values,
    }
  );
}

/**
 * Save an interrupt-flavored checkpoint when execution paused on an Interrupt
 * return. Returns the `halted` summary for inclusion in GraphExecutionResult,
 * or undefined when no checkpoint store was configured (interrupts still halt
 * the loop, but resumption is unavailable without persistence). (#1895)
 */
function buildInterruptCheckpoint(
  ctx: ExecutionContext,
  execId: string,
  pending: NonNullable<ExecutionContext['pendingInterrupt']>
): ReturnType<typeof createCheckpoint> {
  const { nodeId, interrupt, additional } = pending;
  const additionalInterrupts =
    additional.length > 0
      ? additional.map((a) => ({
          nodeId: a.nodeId,
          interruptId: a.interrupt.id,
          value: a.interrupt.value,
        }))
      : undefined;
  return createCheckpoint({
    executionId: execId,
    stepNumber: ctx.stepsExecuted,
    state: ctx.state,
    pendingNodeIds: [nodeId],
    completedResults: ctx.allResults,
    interrupt: {
      nodeId,
      interruptId: interrupt.id,
      value: interrupt.value,
      createdAt: new Date().toISOString(),
      ...(additionalInterrupts !== undefined ? { additionalInterrupts } : {}),
    },
  });
}

function saveInterruptCheckpoint(
  ctx: ExecutionContext,
  options?: GraphExecuteOptions
): GraphExecutionResult['halted'] | undefined {
  const store = options?.checkpointStore;
  const execId = options?.executionId;
  if (store === undefined || execId === undefined || ctx.pendingInterrupt === undefined) {
    return undefined;
  }
  const { nodeId, interrupt } = ctx.pendingInterrupt;
  const checkpoint = buildInterruptCheckpoint(ctx, execId, ctx.pendingInterrupt);
  try {
    store.save(checkpoint);
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.warn('Interrupt checkpoint save failed; resume unavailable', {
      executionId: execId,
      nodeId,
      errorMessage: error.message,
    });
    return undefined;
  }
  logger.info('Graph paused on interrupt — checkpoint saved', {
    executionId: execId,
    nodeId,
    interruptId: interrupt.id,
    checkpointId: checkpoint.id,
  });
  return {
    checkpointId: checkpoint.id,
    nodeId,
    interruptId: interrupt.id,
    value: interrupt.value,
  };
}

/** Checks if the loop should be interrupted early (timeout or abort). */
function checkInterrupt(
  startTime: number,
  timeout: number,
  signal?: AbortSignal
): Result<void, Error> | undefined {
  if (isTimedOut(startTime, timeout)) {
    return err(new Error(`Graph execution timed out after ${String(timeout)}ms`));
  }
  if (signal?.aborted === true) {
    return err(new Error('Graph execution aborted'));
  }
  return undefined;
}

/** Runs the super-step loop until no more runnable nodes or limit reached. */
async function runSuperStepLoop(
  graph: CompiledGraph,
  ctx: ExecutionContext,
  startTime: number,
  options?: GraphExecuteOptions
): Promise<Result<GraphExecutionResult, Error> | undefined> {
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  while (ctx.runnableIds.length > 0 && ctx.stepsExecuted < maxSteps) {
    const aborted = checkInterrupt(startTime, timeout, options?.signal);
    if (aborted !== undefined) return aborted as Result<GraphExecutionResult, Error>;

    await executeSuperStep(graph, ctx, options);
    if (ctx.pendingInterrupt !== undefined) return undefined;
  }

  return undefined;
}

/** Executes a single super-step: run nodes, merge state, resolve next. */
async function executeSuperStep(
  graph: CompiledGraph,
  ctx: ExecutionContext,
  options?: GraphExecuteOptions
): Promise<void> {
  emitNodeStarted(ctx, options);
  const nodeCtx: NodeContext = { resumeValues: ctx.resumeValues };
  const results = await executeNodes(graph, ctx.runnableIds, ctx.state, nodeCtx, options);
  ctx.allResults.push(...results);
  ctx.stepsExecuted += results.length;
  ctx.state = mergeNodeResults(graph, ctx.state, results);

  // Resume values are single-shot — clear after the super-step that consumed them. (#1895)
  ctx.resumeValues = {};

  // Halt on any Interrupt return. The first becomes the primary; any others
  // in the same super-step are surfaced as `additionalInterrupts` on the
  // checkpoint so operators don't silently lose human-input requests (#2425).
  const interrupted = results.filter(
    (r) => r.status === 'interrupted' && r.interrupt !== undefined
  );
  if (interrupted.length > 0) {
    const primary = interrupted[0];
    if (primary?.interrupt !== undefined) {
      const additional = interrupted.slice(1);
      ctx.pendingInterrupt = {
        nodeId: primary.nodeId,
        interrupt: primary.interrupt,
        additional: additional.map((r) => ({
          nodeId: r.nodeId,
          interrupt: r.interrupt as Interrupt,
        })),
      };
      if (additional.length > 0) {
        logger.warn('Multiple interrupts in one super-step — only primary is honored', {
          primaryNodeId: primary.nodeId,
          primaryInterruptId: primary.interrupt.id,
          additionalCount: additional.length,
          additionalNodeIds: additional.map((r) => r.nodeId),
        });
      }
      ctx.runnableIds = [];
      fireSuperStepCallbacks(results, ctx, options);
      return;
    }
  }

  // Honor Command.goto: if a node returned a Command with a goto target,
  // override the normal edge-resolved next-runnable set. (#2425)
  const overrides = collectGotoOverrides(graph, results);
  if (overrides !== undefined) {
    ctx.runnableIds = overrides;
    fireSuperStepCallbacks(results, ctx, options);
    return;
  }

  const completedIds = results.filter((r) => r.status === 'success').map((r) => r.nodeId);
  ctx.runnableIds = resolveNextNodes(graph, completedIds, ctx.state, ctx);
  fireSuperStepCallbacks(results, ctx, options);
}

/**
 * Walk the per-node returns and collect Command.goto targets. Returns the
 * de-duplicated list of node IDs to redirect to, or undefined when no goto
 * was issued (normal edge resolution path).
 *
 * Logs and skips invalid targets (unknown nodes); does not abort the run.
 */
function collectGotoOverrides(
  graph: CompiledGraph,
  results: readonly NodeResult[]
): string[] | undefined {
  const targets: string[] = [];
  for (const r of results) {
    const goto = r.gotoTarget;
    if (goto === undefined) continue;
    if (graph.nodes.has(goto)) {
      targets.push(goto);
    } else {
      logger.warn('Command.goto target unknown — ignoring redirect', {
        nodeId: r.nodeId,
        target: goto,
      });
    }
  }
  if (targets.length === 0) return undefined;
  // De-duplicate while preserving first-seen order.
  return [...new Set(targets)];
}

/** Fire onNodeComplete + emit lifecycle events + save checkpoint. */
function fireSuperStepCallbacks(
  results: readonly NodeResult[],
  ctx: ExecutionContext,
  options?: GraphExecuteOptions
): void {
  for (const result of results) {
    try {
      options?.onNodeComplete?.(result);
    } catch (error: unknown) {
      // Observer errors must never abort the super-step loop.
      logger.warn('onNodeComplete callback threw — continuing execution', {
        nodeId: result.nodeId,
        error: getErrorMessage(error),
      });
    }
  }

  emitNodeResults(ctx, results, options);
  emitStateUpdated(ctx, results, options);
  emitStepCompleted(ctx, results.length, options);
  saveCheckpointIfConfigured(ctx, options);
}

/** Attempts to resume execution from a checkpoint (Issue #837). */
function tryResumeFromCheckpoint(ctx: ExecutionContext, options?: GraphExecuteOptions): void {
  const store = options?.checkpointStore;
  const execId = options?.executionId;
  if (store === undefined || execId === undefined) return;

  const latest = store.latest(execId);
  if (latest === undefined) return;

  ctx.state = { ...latest.state };
  ctx.allResults = [...latest.completedResults];
  ctx.stepsExecuted = latest.stepNumber;
  ctx.runnableIds = [...latest.pendingNodeIds];

  logger.info('Resumed from checkpoint', {
    executionId: execId,
    stepNumber: latest.stepNumber,
    checkpointId: latest.id,
  });
}

/** Saves a checkpoint after a super-step if configured. */
function saveCheckpointIfConfigured(ctx: ExecutionContext, options?: GraphExecuteOptions): void {
  const store = options?.checkpointStore;
  const execId = options?.executionId;
  if (store === undefined || execId === undefined) return;

  const checkpoint = createCheckpoint({
    executionId: execId,
    stepNumber: ctx.stepsExecuted,
    state: ctx.state,
    pendingNodeIds: ctx.runnableIds,
    completedResults: ctx.allResults,
  });
  try {
    store.save(checkpoint);
  } catch (err: unknown) {
    // Checkpoint persistence failure should not abort the in-flight
    // super-step — the state is still consistent, resume just won't be
    // possible from this point. Log loudly so operators can investigate.
    const error = err instanceof Error ? err : new Error(String(err));
    logger.warn('Checkpoint save failed; execution continues without resumable state', {
      executionId: execId,
      stepNumber: ctx.stepsExecuted,
      errorMessage: error.message,
    });
  }
}

/** Initializes graph state from schema defaults + provided inputs. */
function initializeState(graph: CompiledGraph, inputs: Readonly<GraphState>): GraphState {
  const state: GraphState = {};

  // Apply schema defaults
  for (const [field, schema] of Object.entries(graph.stateSchema)) {
    state[field] = schema.defaultValue;
  }

  // Apply inputs (overwrite defaults)
  for (const [key, value] of Object.entries(inputs)) {
    state[key] = value;
  }

  return state;
}

/** Merges node results into state using configured reducers. */
function mergeNodeResults(
  graph: CompiledGraph,
  currentState: GraphState,
  results: readonly NodeResult[]
): GraphState {
  let state = { ...currentState };

  for (const result of results) {
    if (result.status !== 'success') continue;
    state = applyStateUpdates(graph, state, result.stateUpdates);
  }

  return state;
}

/**
 * Warn-once cache for undeclared state fields. Keyed by `${executionId}:${field}`
 * so a single executor instance does not spam the log for the same field, but
 * different graphs/runs are each reported on their first occurrence.
 */
const undeclaredFieldWarned = new Set<string>();

/** Applies a single node's state updates using reducers. */
function applyStateUpdates(
  graph: CompiledGraph,
  state: GraphState,
  updates: Partial<GraphState>
): GraphState {
  const newState = { ...state };

  for (const [field, value] of Object.entries(updates)) {
    const schema: StateFieldSchema | undefined = graph.stateSchema[field];

    if (schema === undefined) {
      // No reducer defined — the graph-builder header invariant ("all state
      // fields have reducers") is violated. Behaviour is kept as silent
      // overwrite for back-compat, but the violation is logged once per
      // field so operators can find and fix it.
      const key = `${String(Object.keys(graph.stateSchema).length)}:${field}`;
      if (!undeclaredFieldWarned.has(key)) {
        undeclaredFieldWarned.add(key);
        logger.warn('Node wrote to undeclared state field; defaulting to overwrite reducer', {
          field,
          knownFields: Object.keys(graph.stateSchema),
        });
      }
      newState[field] = value;
      continue;
    }

    switch (schema.reducer.type) {
      case 'overwrite':
        newState[field] = value;
        break;
      case 'append': {
        const existing = Array.isArray(newState[field]) ? (newState[field] as unknown[]) : [];
        const incoming = Array.isArray(value) ? (value as unknown[]) : [value];
        newState[field] = [...existing, ...incoming];
        break;
      }
      case 'custom':
        try {
          newState[field] = schema.reducer.merge(newState[field], value);
        } catch (error: unknown) {
          const msg = getErrorMessage(error);
          logger.warn('Custom reducer failed, falling back to overwrite', { field, error: msg });
          newState[field] = value;
        }
        break;
    }
  }

  return newState;
}

/** Executes a set of nodes in parallel. */
async function executeNodes(
  graph: CompiledGraph,
  nodeIds: readonly string[],
  state: Readonly<GraphState>,
  nodeCtx: NodeContext,
  options?: GraphExecuteOptions
): Promise<NodeResult[]> {
  const promises = nodeIds.map((id) => executeSingleNode(graph, id, state, nodeCtx, options));
  return Promise.all(promises);
}

/** Returns a skipped NodeResult for a failed precondition. */
function preconditionFailedResult(
  nodeId: string,
  results: readonly import('./graph-hooks.js').PreconditionOutcome[],
  startTime: number
): NodeResult {
  const failed = results.find((r) => !r.passed);
  return {
    nodeId,
    stateUpdates: {},
    durationMs: getTimeProvider().now() - startTime,
    status: 'skipped',
    error: `Precondition '${failed?.name ?? 'unknown'}' failed: ${failed?.error ?? 'unknown'}`,
  };
}

/**
 * Reduce a raw NodeReturn into the (stateUpdates, interrupt?, gotoTarget?)
 * triple the executor cares about. Centralizes Interrupt/Command unwrapping
 * (#1895, #2425).
 */
function extractNodeOutput(returned: NodeReturn): {
  stateUpdates: Partial<GraphState>;
  interrupt?: Interrupt;
  gotoTarget?: string;
} {
  if (isInterrupt(returned)) {
    return { stateUpdates: {}, interrupt: returned };
  }
  if (isCommand(returned)) {
    const cmd: Command = returned;
    return {
      stateUpdates: cmd.update ?? {},
      ...(cmd.goto !== undefined ? { gotoTarget: cmd.goto } : {}),
    };
  }
  return { stateUpdates: returned };
}

interface ExecVerifyArgs {
  readonly node: GraphNode;
  readonly nodeId: string;
  readonly state: Readonly<GraphState>;
  readonly startTime: number;
  readonly nodeCtx: NodeContext;
  readonly options?: GraphExecuteOptions | undefined;
}

/** Executes node handler with verification, returning the NodeResult. */
async function executeWithVerification(args: ExecVerifyArgs): Promise<NodeResult> {
  const { node, nodeId, state, startTime, nodeCtx, options } = args;
  const nodeTimeout = node.timeout ?? options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const returned = await withTimeout(node.handler(state, nodeCtx), nodeTimeout);
  const handlerDuration = getTimeProvider().now() - startTime;
  const { stateUpdates, interrupt, gotoTarget } = extractNodeOutput(returned);

  if (interrupt !== undefined) {
    return {
      nodeId,
      stateUpdates: {},
      durationMs: handlerDuration,
      status: 'interrupted',
      interrupt,
    };
  }

  const mergedState = { ...state, ...stateUpdates };
  const verifyResult = await runVerification(node, mergedState, 0, options);
  if (!verifyResult.passed) {
    logger.warn('Post-step verification failed', { nodeId, error: verifyResult.error });
    return {
      nodeId,
      stateUpdates: {},
      durationMs: getTimeProvider().now() - startTime,
      status: 'failed',
      error: `Verification failed: ${verifyResult.error ?? 'unknown'}`,
      // Post-step verification is a domain check — re-running won't change it.
      ...failureClassification('business'),
    };
  }

  return {
    nodeId,
    stateUpdates,
    durationMs: handlerDuration,
    status: 'success',
    ...(gotoTarget !== undefined ? { gotoTarget } : {}),
  };
}

/** Executes a single node with preconditions, timeout, verification, and error handling. */
async function executeSingleNode(
  graph: CompiledGraph,
  nodeId: string,
  state: Readonly<GraphState>,
  nodeCtx: NodeContext,
  options?: GraphExecuteOptions
): Promise<NodeResult> {
  // Selective-retry (#3534): replay a prior successful result instead of
  // re-executing, so a retry re-runs only the failed/new nodes. Only `success`
  // is replayed — failed/skipped/interrupted prior results fall through to a
  // fresh run.
  const prior = options?.priorResults?.get(nodeId);
  if (prior?.status === 'success') {
    logger.debug('Replaying prior successful node result', { nodeId });
    return prior;
  }

  const node: GraphNode | undefined = graph.nodes.get(nodeId);
  if (node === undefined) {
    return {
      nodeId,
      stateUpdates: {},
      durationMs: 0,
      status: 'failed',
      error: `Node '${nodeId}' not found`,
      // Missing node is a graph-construction bug, not a transient failure.
      ...failureClassification('internal'),
    };
  }

  const startTime = getTimeProvider().now();
  const preResult = await runPreconditions(node, state, 0, options);
  if (!preResult.passed) {
    return preconditionFailedResult(nodeId, preResult.results, startTime);
  }

  try {
    return await executeWithVerification({ node, nodeId, state, startTime, nodeCtx, options });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.warn('Node execution failed', { nodeId, error: message });
    // Classify the thrown error so selective-retry can gate on it (#3534):
    // transient (timeout/network/rate-limit) → retryable; others → not.
    const category = coarsenFailureCategory(categorizeOutcomeError(error));
    return {
      nodeId,
      stateUpdates: {},
      durationMs: getTimeProvider().now() - startTime,
      status: 'failed',
      error: message,
      ...failureClassification(category),
    };
  }
}

/** Resolves entry nodes from START edges. */
function resolveEntryNodes(graph: CompiledGraph, state: Readonly<GraphState>): string[] {
  const nodeIds: string[] = [];

  for (const edge of graph.entryEdges) {
    if (edge.type === 'fixed') {
      if (edge.to !== END) nodeIds.push(edge.to);
    } else {
      const target = safeRouterCall(edge.router, state);
      if (target !== END) nodeIds.push(target);
    }
  }

  return filterValidNodes(graph, dedupe(nodeIds));
}

/** Resolves next runnable nodes based on completed nodes and edges. */
function resolveNextNodes(
  graph: CompiledGraph,
  completedIds: readonly string[],
  state: Readonly<GraphState>,
  ctx: ExecutionContext
): string[] {
  const nodeIds: string[] = [];

  for (const completedId of completedIds) {
    for (const edge of graph.edges) {
      if (edge.from !== completedId) continue;

      // Check maxTraversals limit
      if (edge.maxTraversals !== undefined) {
        const edgeKey = edgeId(edge);
        const count = ctx.edgeTraversals.get(edgeKey) ?? 0;
        if (count >= edge.maxTraversals) {
          logger.warn('Edge traversal limit reached', {
            edge: edgeKey,
            maxTraversals: edge.maxTraversals,
          });
          continue;
        }
        ctx.edgeTraversals.set(edgeKey, count + 1);
      }

      if (edge.type === 'fixed') {
        if (edge.to !== END) nodeIds.push(edge.to);
      } else {
        const target = safeRouterCall(edge.router, state);
        if (target !== END) nodeIds.push(target);
      }
    }
  }

  return filterValidNodes(graph, dedupe(nodeIds));
}

/** Generates a stable identifier for an edge. */
function edgeId(edge: GraphEdge): string {
  if (edge.type === 'fixed') return `${edge.from}→${edge.to}`;
  return `${edge.from}→[conditional]`;
}

/** Safely calls a router function, returning END on error. */
function safeRouterCall(
  router: (state: Readonly<GraphState>) => string,
  state: Readonly<GraphState>
): string {
  try {
    return router(state);
  } catch (error: unknown) {
    logger.warn('Conditional router threw', {
      error: getErrorMessage(error),
    });
    return END;
  }
}

/** Filters node IDs to only include nodes present in the graph. */
function filterValidNodes(graph: CompiledGraph, ids: string[]): string[] {
  return ids.filter((id) => {
    const valid = graph.nodes.has(id);
    if (!valid) logger.warn('Unknown node from router', { nodeId: id });
    return valid;
  });
}

function isTimedOut(startTime: number, timeout: number): boolean {
  return getTimeProvider().now() - startTime > timeout;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Node timed out after ${String(ms)}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}
