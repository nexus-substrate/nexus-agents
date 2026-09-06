/**
 * Event → one-line detail rendering for `run_graph_workflow`.
 *
 * Split out of `run-graph-workflow.ts` when the non-completion arm pushed both
 * that file past its line cap and `formatDetail` past its complexity budget.
 * The rendering belongs together anyway: these strings are what a caller reads
 * to find out what a graph run actually did.
 *
 * @module mcp/tools/run-graph-workflow-events
 */
import type { GraphEvent } from '../../orchestration/graph/graph-types.js';

type HookEvent = Extract<GraphEvent, { type: 'hook_started' | 'hook_completed' | 'hook_failed' }>;

/** Type guard for the three hook lifecycle events. */
function isHookEvent(event: GraphEvent): event is HookEvent {
  return (
    event.type === 'hook_started' || event.type === 'hook_completed' || event.type === 'hook_failed'
  );
}

/** Detail string for the three hook lifecycle events (split out for complexity). */
function formatHookDetail(event: HookEvent): string {
  const where = `${event.hookPhase}: ${event.hookName} on ${event.nodeId}`;
  switch (event.type) {
    case 'hook_started':
      return where;
    case 'hook_completed':
      return `${where} in ${String(event.durationMs)}ms`;
    case 'hook_failed':
      return `${where}: ${event.error}`;
  }
}

/** A node that produced nothing — named, never folded into the completion line. */
function formatNotCompleted(event: Extract<GraphEvent, { type: 'node_not_completed' }>): string {
  return `${event.nodeId} ${event.reason}${event.detail !== undefined ? `: ${event.detail}` : ''}`;
}

/** Node lifecycle events, including the one that did NOT complete. */
function formatNodeDetail(
  event: Extract<
    GraphEvent,
    { type: 'node_started' | 'node_completed' | 'node_error' | 'node_not_completed' }
  >
): string {
  switch (event.type) {
    case 'node_started':
      return `Starting ${event.nodeId}`;
    case 'node_completed':
      return `${event.nodeId} in ${String(event.durationMs)}ms`;
    case 'node_error':
      return `${event.nodeId}: ${event.error}`;
    case 'node_not_completed':
      return formatNotCompleted(event);
  }
}

function isNodeEvent(
  event: GraphEvent
): event is Extract<
  GraphEvent,
  { type: 'node_started' | 'node_completed' | 'node_error' | 'node_not_completed' }
> {
  return (
    event.type === 'node_started' ||
    event.type === 'node_completed' ||
    event.type === 'node_error' ||
    event.type === 'node_not_completed'
  );
}

export function formatDetail(event: GraphEvent): string {
  // Hook and node events are dispatched out-of-switch to keep complexity within
  // budget — the same reason the hook split already existed.
  if (isHookEvent(event)) return formatHookDetail(event);
  if (isNodeEvent(event)) return formatNodeDetail(event);
  switch (event.type) {
    case 'step_completed':
      return `${String(event.nodesExecuted)} nodes`;
    case 'execution_complete':
      return (
        `${String(event.totalSteps)} steps, ${String(event.durationMs)}ms` +
        (event.halted === true ? ' (HALTED — awaiting input, not finished)' : '')
      );
    case 'state_updated':
      return event.updatedKeys.join(', ');
    case 'context_unavailable':
      return `Context unavailable for category '${event.category}': ${event.error}`;
  }
}
