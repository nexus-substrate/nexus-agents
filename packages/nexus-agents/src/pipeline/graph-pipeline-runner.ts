/**
 * Graph Pipeline Runner — Execute pipelines via GraphBuilder (#1735, Phase 2)
 *
 * Provides a runGraphPipeline() function that compiles a PipelineTemplate
 * + stage registry into an executable graph and runs it through the
 * graph executor with checkpoint/resume support.
 *
 * @module pipeline/graph-pipeline-runner
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import { executeGraph } from '../orchestration/graph/graph-executor.js';
import type { CompiledGraph, NodeResult } from '../orchestration/graph/graph-types.js';
import { compilePipelineGraph } from './pipeline-graph.js';
import type { PipelineTemplate } from './stage-types.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';
import type { StageRegistry } from './pipeline-graph.js';
import { emitPipelineStageEvent } from './pipeline-observability.js';

const logger = createLogger({ component: 'graph-pipeline-runner' });

// ============================================================================
// Types
// ============================================================================

/** Options for graph-based pipeline execution. */
export interface GraphPipelineOptions {
  /** When true, stop after the dryRunStopAfter stage. */
  readonly dryRun?: boolean | undefined;
  /**
   * Maximum graph node executions (default: 20). Parallel super-steps are
   * atomic and start only when their full batch fits in the remaining budget.
   */
  readonly maxSteps?: number | undefined;
}

/** Result of a graph-based pipeline execution. */
export interface GraphPipelineResult {
  readonly success: boolean;
  readonly templateId: string;
  readonly stepsExecuted: number;
  readonly durationMs: number;
  readonly finalState: Readonly<Record<string, unknown>>;
  readonly error?: string | undefined;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_STEPS = 20;

// ============================================================================
// Execution
// ============================================================================

/**
 * Run a pipeline using graph-based execution.
 *
 * Compiles the template + stages into a graph, then executes via
 * the graph executor (super-step BSP model).
 */
export async function runGraphPipeline(
  task: string,
  template: PipelineTemplate,
  stages: StageRegistry,
  options?: GraphPipelineOptions
): Promise<GraphPipelineResult> {
  const startTime = getTimeProvider().now();

  const graphResult = compileEffectiveGraph(template, stages, options);
  if (graphResult.error !== undefined) {
    return buildError(template.id, graphResult.error, startTime);
  }

  return executeAndReport(task, template, graphResult.graph, options, startTime);
}

/** Compile the graph, handling dryRun truncation. */
function compileEffectiveGraph(
  template: PipelineTemplate,
  stages: StageRegistry,
  options: GraphPipelineOptions | undefined
): { graph: CompiledGraph; error?: undefined } | { graph?: undefined; error: string } {
  const effective = resolveEffectiveTemplate(template, options);
  const compiled = compilePipelineGraph(effective, stages);
  if (!compiled.ok || compiled.graph === undefined) {
    return { error: compiled.error ?? 'Compilation failed' };
  }
  return { graph: compiled.graph };
}

/** Execute the compiled graph and emit observability events. */
async function executeAndReport(
  task: string,
  template: PipelineTemplate,
  graph: CompiledGraph,
  options: GraphPipelineOptions | undefined,
  startTime: number
): Promise<GraphPipelineResult> {
  logger.info('Executing graph pipeline', {
    template: template.id,
    dryRun: options?.dryRun === true,
  });

  emitPipelineStageEvent(template.id, 'pipeline', 'started');

  // Pre-#2937 a SharedMemoryStore was threaded through graph state under
  // PIPELINE_STATE_KEYS.SHARED_MEMORY. Removed because no stage ever
  // read it — cross-stage handoff flows through `state` only.
  const result = await executeGraph(
    graph,
    { [K.TASK]: task },
    {
      maxSteps: options?.maxSteps ?? DEFAULT_MAX_STEPS,
    }
  );

  const durationMs = getTimeProvider().now() - startTime;

  if (!result.ok) {
    emitPipelineStageEvent(template.id, 'pipeline', 'failed', { error: result.error.message });
    return buildError(template.id, result.error.message, startTime);
  }

  // #4362: `result.ok` only says the BSP loop returned. The executor absorbs a
  // failed node into an `ok` result (it records `NodeResult.status: 'failed'`
  // and keeps going), so reporting success on `result.ok` alone made every
  // failed stage invisible to callers. Read the node results instead —
  // template-agnostic, unlike a `finalState.completed` predicate, which would
  // fail-wrong on the dev/general/greenfield templates that never set that key.
  const failures = describeFailedNodes(result.value.nodeResults);
  if (failures !== null) {
    emitPipelineStageEvent(template.id, 'pipeline', 'failed', { error: failures });
    return {
      success: false,
      templateId: template.id,
      stepsExecuted: result.value.stepsExecuted,
      durationMs,
      // Keep whatever earlier stages produced — callers inspect finalState to
      // see how far the run got before it failed.
      finalState: result.value.finalState,
      error: failures,
    };
  }

  emitPipelineStageEvent(template.id, 'pipeline', 'completed', { durationMs });
  return {
    success: true,
    templateId: template.id,
    stepsExecuted: result.value.stepsExecuted,
    durationMs,
    finalState: result.value.finalState,
  };
}

/**
 * Summarize the failed nodes of a graph run, or null when every node succeeded.
 *
 * Reports only what each node already recorded — stage errors can embed command
 * output, so this must not widen the message beyond `NodeResult.error`.
 */
function describeFailedNodes(nodeResults: readonly NodeResult[]): string | null {
  const failed = nodeResults.filter((n) => n.status === 'failed');
  if (failed.length === 0) return null;
  const detail = failed.map((n) => `${n.nodeId}: ${n.error ?? 'no error message'}`).join('; ');
  return `${String(failed.length)} stage(s) failed — ${detail}`;
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve effective template — truncate stages for dryRun. */
function resolveEffectiveTemplate(
  template: PipelineTemplate,
  options: GraphPipelineOptions | undefined
): PipelineTemplate {
  if (options?.dryRun !== true) return template;
  if (template.dryRunStopAfter === undefined) return template;

  const stopIdx = template.stages.indexOf(template.dryRunStopAfter);
  if (stopIdx < 0) return template;

  return {
    ...template,
    stages: template.stages.slice(0, stopIdx + 1),
  };
}

function buildError(templateId: string, error: string, startTime: number): GraphPipelineResult {
  return {
    success: false,
    templateId,
    stepsExecuted: 0,
    durationMs: getTimeProvider().now() - startTime,
    finalState: {},
    error,
  };
}

// ============================================================================
// State Extractors — typed access to well-known state keys
// ============================================================================

/** Extract a value from the final pipeline state. */
export function extractStateValue(state: Readonly<Record<string, unknown>>, key: string): unknown {
  return state[key];
}
