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
import { ok, err, createLogger, getTimeProvider } from '../../core/index.js';
import type {
  CompiledGraph,
  GraphState,
  GraphNode,
  NodeResult,
  GraphExecutionResult,
  GraphExecuteOptions,
  StateFieldSchema,
} from './graph-types.js';
import { END } from './graph-types.js';
import { createCheckpoint } from './checkpoint-store.js';
import {
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
} from './graph-events.js';

const logger = createLogger({ component: 'GraphExecutor' });

const DEFAULT_MAX_STEPS = 100;
const DEFAULT_TIMEOUT_MS = 120_000;

// ============================================================================
// Executor
// ============================================================================

/** Mutable execution context threaded through the super-step loop. */
interface ExecutionContext {
  state: GraphState;
  allResults: NodeResult[];
  stepsExecuted: number;
  runnableIds: string[];
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

  return ok({
    finalState: ctx.state,
    nodeResults: ctx.allResults,
    totalDurationMs,
    stepsExecuted: ctx.stepsExecuted,
  });
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
    const interrupt = checkInterrupt(startTime, timeout, options?.signal);
    if (interrupt !== undefined) return interrupt as Result<GraphExecutionResult, Error>;

    await executeSuperStep(graph, ctx, options);
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
  const results = await executeNodes(graph, ctx.runnableIds, ctx.state, options);
  ctx.allResults.push(...results);
  ctx.stepsExecuted += results.length;
  ctx.state = mergeNodeResults(graph, ctx.state, results);

  const completedIds = results.filter((r) => r.status === 'success').map((r) => r.nodeId);
  ctx.runnableIds = resolveNextNodes(graph, completedIds, ctx.state);

  for (const result of results) {
    options?.onNodeComplete?.(result);
  }

  emitNodeResults(ctx, results, options);
  emitStateUpdated(ctx, results, options);
  emitStepCompleted(ctx, results.length, options);
  saveCheckpointIfConfigured(ctx, options);
}

// ============================================================================
// Checkpointing (Issue #837)
// ============================================================================

/** Attempts to resume execution from a checkpoint. */
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
  store.save(checkpoint);
}

// ============================================================================
// State Management
// ============================================================================

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
      // No reducer defined — use overwrite by default
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
        newState[field] = schema.reducer.merge(newState[field], value);
        break;
    }
  }

  return newState;
}

// ============================================================================
// Node Execution
// ============================================================================

/** Executes a set of nodes in parallel. */
async function executeNodes(
  graph: CompiledGraph,
  nodeIds: readonly string[],
  state: Readonly<GraphState>,
  options?: GraphExecuteOptions
): Promise<NodeResult[]> {
  const promises = nodeIds.map((id) => executeSingleNode(graph, id, state, options));
  return Promise.all(promises);
}

/** Executes a single node with timeout and error handling. */
async function executeSingleNode(
  graph: CompiledGraph,
  nodeId: string,
  state: Readonly<GraphState>,
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
  const nodeTimeout = node.timeout ?? options?.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await withTimeout(node.handler(state), nodeTimeout);
    return {
      nodeId,
      stateUpdates: result,
      durationMs: getTimeProvider().now() - startTime,
      status: 'success',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
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

// ============================================================================
// Edge Resolution
// ============================================================================

/** Resolves entry nodes from START edges. */
function resolveEntryNodes(graph: CompiledGraph, state: Readonly<GraphState>): string[] {
  const nodeIds: string[] = [];

  for (const edge of graph.entryEdges) {
    if (edge.type === 'fixed') {
      if (edge.to !== END) nodeIds.push(edge.to);
    } else {
      const target = edge.router(state);
      if (target !== END) nodeIds.push(target);
    }
  }

  return dedupe(nodeIds);
}

/** Resolves next runnable nodes based on completed nodes and edges. */
function resolveNextNodes(
  graph: CompiledGraph,
  completedIds: readonly string[],
  state: Readonly<GraphState>
): string[] {
  const nodeIds: string[] = [];

  for (const completedId of completedIds) {
    for (const edge of graph.edges) {
      if (edge.from !== completedId) continue;

      if (edge.type === 'fixed') {
        if (edge.to !== END) nodeIds.push(edge.to);
      } else {
        const target = edge.router(state);
        if (target !== END) nodeIds.push(target);
      }
    }
  }

  return dedupe(nodeIds);
}

// ============================================================================
// Utilities
// ============================================================================

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
