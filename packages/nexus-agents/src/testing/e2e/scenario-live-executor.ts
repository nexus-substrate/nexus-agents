/**
 * nexus-agents/testing/e2e - Live Graph Executor (Epic #952, Phase 3)
 *
 * Executes scenario fixtures against real compiled graphs,
 * collecting trace events and branch coverage data.
 *
 * @module testing/e2e/scenario-live-executor
 */

import type { StepResult } from '../../core/index.js';
import { getTimeProvider } from '../../core/index.js';
import type {
  CompiledGraph,
  GraphEvent,
  GraphExecuteOptions,
  GraphExecutionResult,
  NodeResult,
} from '../../orchestration/graph/graph-types.js';
import { executeGraph } from '../../orchestration/graph/graph-executor.js';
import type { BranchCoverageReport, ITraceOutput } from './types.js';

// ============================================================================
// Types
// ============================================================================

/** Configuration for the live executor. */
export interface LiveExecutorConfig {
  /** Timeout per scenario execution in ms. */
  readonly timeoutMs: number;
  /** Optional trace output for disk persistence. */
  readonly traceOutput?: ITraceOutput;
  /** Run ID for trace correlation. */
  readonly runId?: string;
}

/** Result of a live graph execution. */
export interface LiveExecutionResult {
  /** Step results mapped by node ID. */
  readonly stepResults: ReadonlyMap<string, StepResult>;
  /** Branch coverage data. */
  readonly branchCoverage: BranchCoverageReport;
  /** Total execution duration in ms. */
  readonly durationMs: number;
  /** Run ID used for trace correlation. */
  readonly runId: string;
}

// ============================================================================
// Branch Coverage
// ============================================================================

/** Compute branch coverage from collected events and graph topology. */
export function computeBranchCoverage(
  graph: CompiledGraph,
  executedNodes: ReadonlySet<string>
): BranchCoverageReport {
  const allEdgeIds: string[] = [];
  const conditionalEdgeIds: string[] = [];

  for (const edge of graph.edges) {
    if (edge.type === 'fixed') {
      allEdgeIds.push(`${edge.from}→${edge.to}`);
    } else {
      // Conditional edge: one entry per target
      for (const target of edge.targets) {
        const edgeId = `${edge.from}→${target}`;
        allEdgeIds.push(edgeId);
        conditionalEdgeIds.push(edgeId);
      }
    }
  }

  const wasTraversed = (edgeId: string): boolean => {
    const target = edgeId.split('→')[1] ?? '';
    return target === '__end__' || executedNodes.has(target);
  };

  const traversedEdges = allEdgeIds.filter(wasTraversed);
  const traversedConditional = conditionalEdgeIds.filter(wasTraversed);

  const denom = conditionalEdgeIds.length;
  const coveragePercent = denom > 0 ? Math.round((traversedConditional.length / denom) * 100) : 100;

  return {
    totalEdges: allEdgeIds.length,
    traversedEdges,
    conditionalEdges: conditionalEdgeIds,
    traversedConditionalEdges: traversedConditional,
    coveragePercent,
  };
}

// ============================================================================
// Event Collection
// ============================================================================

/** Convert a NodeResult from graph execution to a StepResult. */
function nodeResultToStepResult(nr: NodeResult): StepResult {
  return {
    stepId: nr.nodeId,
    status: nr.status,
    output: JSON.stringify(nr.stateUpdates),
    durationMs: nr.durationMs,
  };
}

// ============================================================================
// Live Executor
// ============================================================================

/**
 * Execute a compiled graph as a scenario, collecting trace events
 * and branch coverage data.
 */
export async function executeLiveGraph(
  graph: CompiledGraph,
  inputs: Record<string, unknown>,
  config: LiveExecutorConfig
): Promise<LiveExecutionResult> {
  const startTime = getTimeProvider().now();
  const runId = config.runId ?? `live-${String(startTime)}`;
  const executedNodes = new Set<string>();
  const collectedEvents: GraphEvent[] = [];

  const onEvent = (event: GraphEvent): void => {
    collectedEvents.push(event);
    if (event.type === 'node_completed') {
      executedNodes.add(event.nodeId);
    }
    if (config.traceOutput !== undefined) {
      config.traceOutput.writeEvent({
        timestamp: event.timestamp,
        runId,
        eventType: `graph.${event.type}`,
        ...('nodeId' in event ? { nodeId: event.nodeId } : {}),
        ...('durationMs' in event ? { durationMs: event.durationMs } : {}),
        ...('error' in event ? { error: event.error } : {}),
      });
    }
  };

  const execOptions: GraphExecuteOptions = {
    timeout: config.timeoutMs,
    onEvent,
  };

  const result = await executeGraph(graph, inputs, execOptions);
  const durationMs = getTimeProvider().now() - startTime;

  if (!result.ok) {
    throw result.error;
  }

  const graphResult: GraphExecutionResult = result.value;
  const stepResults = new Map<string, StepResult>();
  for (const nr of graphResult.nodeResults) {
    executedNodes.add(nr.nodeId);
    stepResults.set(nr.nodeId, nodeResultToStepResult(nr));
  }

  const branchCoverage = computeBranchCoverage(graph, executedNodes);

  if (config.traceOutput !== undefined) {
    await config.traceOutput.flush();
  }

  return { stepResults, branchCoverage, durationMs, runId };
}
