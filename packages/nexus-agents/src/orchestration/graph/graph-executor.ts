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
import { END, isInterrupt, isCommand } from './graph-types.js';
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

const logger = createLogger({ component: 'GraphExecutor' });

// Canonical source: config/timeouts.ts (Issue #1046)
import { GRAPH_TIMEOUTS } from '../../config/timeouts.js';

const DEFAULT_MAX_STEPS = GRAPH_TIMEOUTS.maxSteps;
const DEFAULT_TIMEOUT_MS = GRAPH_TIMEOUTS.defaultMs;

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
  pendingInterrupt: { readonly nodeId: string; readonly interrupt: Interrupt } | undefined;
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
 * and re-runs the graph starting from the interrupted node. The supplied
 * `resumeValues` map (keyed by interrupt id) is delivered to that node's
 * NodeContext on the run that follows the resume call.
 *
 * Errors:
 *   - checkpoint not found
 *   - checkpoint exists but isn't an interrupt checkpoint
 *   - resumeValues missing the interrupt id this checkpoint is waiting for
 */
export async function resumeFromCheckpoint(
  graph: CompiledGraph,
  checkpointId: string,
  resumeValues: Readonly<Record<string, unknown>>,
  options: GraphExecuteOptions
): Promise<Result<GraphExecutionResult, Error>> {
  const store: ICheckpointStore | undefined = options.checkpointStore;
  if (store === undefined) {
    return err(new Error('resumeFromCheckpoint requires options.checkpointStore'));
  }
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
  if (!Object.prototype.hasOwnProperty.call(resumeValues, interruptCtx.interruptId)) {
    return err(
      new Error(
        `resumeValues missing interrupt id '${interruptCtx.interruptId}' (paused at node '${interruptCtx.nodeId}')`
      )
    );
  }
  return executeGraph(
    graph,
    {},
    {
      ...options,
      executionId: checkpoint.executionId,
      resumeValues,
    }
  );
}

/**
 * Save an interrupt-flavored checkpoint when execution paused on an Interrupt
 * return. Returns the `halted` summary for inclusion in GraphExecutionResult,
 * or undefined when no checkpoint store was configured (interrupts still halt
 * the loop, but resumption is unavailable without persistence). (#1895)
 */
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
  const checkpoint = createCheckpoint({
    executionId: execId,
    stepNumber: ctx.stepsExecuted,
    state: ctx.state,
    // Re-run the interrupted node first on resume.
    pendingNodeIds: [nodeId],
    completedResults: ctx.allResults,
    interrupt: {
      nodeId,
      interruptId: interrupt.id,
      value: interrupt.value,
      createdAt: new Date().toISOString(),
    },
  });
  try {
    store.save(checkpoint);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
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

  // Halt if any node returned an Interrupt — surfaces upward via ctx.pendingInterrupt.
  // Multi-interrupt support is Phase 2; v1 records the first one.
  const interrupted = results.find((r) => r.status === 'interrupted');
  if (interrupted?.interrupt !== undefined) {
    ctx.pendingInterrupt = { nodeId: interrupted.nodeId, interrupt: interrupted.interrupt };
    ctx.runnableIds = [];
    fireSuperStepCallbacks(results, ctx, options);
    return;
  }

  const completedIds = results.filter((r) => r.status === 'success').map((r) => r.nodeId);
  ctx.runnableIds = resolveNextNodes(graph, completedIds, ctx.state, ctx);
  fireSuperStepCallbacks(results, ctx, options);
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
 * Reduce a raw NodeReturn into the (stateUpdates, interrupt?) pair the
 * executor cares about. Centralizes Interrupt/Command unwrapping (#1895).
 */
function extractNodeOutput(returned: NodeReturn): {
  stateUpdates: Partial<GraphState>;
  interrupt?: Interrupt;
} {
  if (isInterrupt(returned)) {
    return { stateUpdates: {}, interrupt: returned };
  }
  if (isCommand(returned)) {
    return { stateUpdates: returned.update ?? {} };
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
  const { stateUpdates, interrupt } = extractNodeOutput(returned);

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
    };
  }

  return { nodeId, stateUpdates, durationMs: handlerDuration, status: 'success' };
}

/** Executes a single node with preconditions, timeout, verification, and error handling. */
async function executeSingleNode(
  graph: CompiledGraph,
  nodeId: string,
  state: Readonly<GraphState>,
  nodeCtx: NodeContext,
  options?: GraphExecuteOptions
): Promise<NodeResult> {
  const node: GraphNode | undefined = graph.nodes.get(nodeId);
  if (node === undefined) {
    return {
      nodeId,
      stateUpdates: {},
      durationMs: 0,
      status: 'failed',
      error: `Node '${nodeId}' not found`,
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
    return {
      nodeId,
      stateUpdates: {},
      durationMs: getTimeProvider().now() - startTime,
      status: 'failed',
      error: message,
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
