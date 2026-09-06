/**
 * nexus-agents/orchestration - Graph Event Emission
 *
 * Helpers for emitting typed graph lifecycle events during execution.
 * Keeps event logic separate from core executor flow.
 *
 * @module orchestration/graph/graph-events
 * (Source: Issue #838 — EventEmitter streaming)
 */

import { getTimeProvider } from '../../core/index.js';
import type { NodeResult, GraphExecuteOptions } from './graph-types.js';

/** Fields for a {@link emitContextUnavailable} call (#3180). */
interface ContextUnavailableArgs {
  /** Inferred task category whose context retrieval failed. */
  readonly category: string;
  /** Sanitized failure message — message string only (caller must sanitize). */
  readonly error: string;
  /** Correlation id when the execution carries one. */
  readonly executionId?: string;
}

/** Minimal context needed for event emission. */
interface StepContext {
  readonly stepsExecuted: number;
  readonly runnableIds: readonly string[];
}

/** Emits node_started events for all nodes about to execute. */
export function emitNodeStarted(ctx: StepContext, options?: GraphExecuteOptions): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  const ts = getTimeProvider().now();
  for (const nodeId of ctx.runnableIds) {
    emit({ type: 'node_started', nodeId, stepNumber: ctx.stepsExecuted, timestamp: ts });
  }
}

/** Emits node_completed or node_error events for each result. */
export function emitNodeResults(
  ctx: StepContext,
  results: readonly NodeResult[],
  options?: GraphExecuteOptions
): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  const ts = getTimeProvider().now();
  for (const r of results) {
    if (r.status === 'failed') {
      emit({
        type: 'node_error',
        nodeId: r.nodeId,
        stepNumber: ctx.stepsExecuted,
        error: r.error ?? 'unknown',
        timestamp: ts,
      });
    } else if (r.status === 'interrupted' || r.status === 'skipped') {
      // NOT a completion. `NodeResult.status` is four-way and the `else` branch
      // folded both of these into `node_completed`, so a node that paused for
      // human input — `stateUpdates: {}`, nothing produced — was published to
      // the hash-chained audit trail as "completed in 0ms", and a `skipped`
      // result's `error` string was dropped because the completion event has no
      // slot for it.
      emit({
        type: 'node_not_completed',
        nodeId: r.nodeId,
        stepNumber: ctx.stepsExecuted,
        reason: r.status,
        ...(r.error !== undefined ? { detail: r.error } : {}),
        timestamp: ts,
      });
    } else {
      const resultKeys = Object.keys(r.stateUpdates);
      emit({
        type: 'node_completed',
        nodeId: r.nodeId,
        stepNumber: ctx.stepsExecuted,
        durationMs: r.durationMs,
        resultKeys,
        timestamp: ts,
      });
    }
  }
}

/** Emits state_updated event with deduplicated keys from successful results. */
export function emitStateUpdated(
  ctx: StepContext,
  results: readonly NodeResult[],
  options?: GraphExecuteOptions
): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  const keys = results
    .filter((r) => r.status === 'success')
    .flatMap((r) => Object.keys(r.stateUpdates));
  const updatedKeys = [...new Set(keys)];
  if (updatedKeys.length > 0) {
    emit({
      type: 'state_updated',
      stepNumber: ctx.stepsExecuted,
      updatedKeys,
      timestamp: getTimeProvider().now(),
    });
  }
}

/** Emits step_completed event after a super-step finishes. */
export function emitStepCompleted(
  ctx: StepContext,
  nodesExecuted: number,
  options?: GraphExecuteOptions
): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  emit({
    type: 'step_completed',
    stepNumber: ctx.stepsExecuted,
    nodesExecuted,
    timestamp: getTimeProvider().now(),
  });
}

/**
 * Emits a `context_unavailable` event when unified-context retrieval failed at
 * graph start (#3180). Guards on `options?.onEvent` like the other emitters, so
 * it is a no-op when no listener is attached. The caller is responsible for
 * passing an already-sanitized `error` (message string only).
 */
export function emitContextUnavailable(
  args: ContextUnavailableArgs,
  options?: GraphExecuteOptions
): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  emit({
    type: 'context_unavailable',
    category: args.category,
    error: args.error,
    ...(args.executionId !== undefined ? { executionId: args.executionId } : {}),
    timestamp: getTimeProvider().now(),
  });
}

/** Emits execution_complete event when graph execution finishes. */
export function emitExecutionComplete(
  totalSteps: number,
  totalNodes: number,
  durationMs: number,
  options?: GraphExecuteOptions,
  halted?: boolean
): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  emit({
    type: 'execution_complete',
    totalSteps,
    totalNodes,
    durationMs,
    // Omitted when the run genuinely finished, so an unpaused execution is
    // unchanged for every existing consumer.
    ...(halted === true ? { halted: true } : {}),
    timestamp: getTimeProvider().now(),
  });
}
