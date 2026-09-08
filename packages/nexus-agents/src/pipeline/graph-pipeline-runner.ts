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
  /**
   * Set when the run was a dry run. Mirrors `DevPipelineResult.dryRun`: a
   * consumer reading `success` alone reported a truncated dry run as a full
   * pipeline. Absent means a normal run.
   */
  readonly dryRun?: true;
  /**
   * Stages the template declares, and stages this run actually executed.
   *
   * `templateId` names the FULL template even when `resolveEffectiveTemplate`
   * truncated it at `dryRunStopAfter`, so `templateId: 'dev'` with
   * `success: true` used to be byte-identical whether qa and security ran or
   * were sliced away. These two numbers are what makes the coverage legible
   * without the consumer having to know `dryRunStopAfter` and the stage list.
   */
  readonly stagesPlanned: number;
  readonly stagesRun: number;
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
    // Compilation failed, so nothing ran. `stagesRun: 0` is the measurement,
    // not a default — and the compiler required this branch to say so.
    return {
      ...buildError(template.id, graphResult.error, startTime),
      ...stamp({ stagesPlanned: template.stages.length, stagesRun: 0 }, options),
    };
  }

  return executeAndReport({
    task,
    template,
    graph: graphResult.graph,
    coverage: graphResult.coverage,
    options,
    startTime,
  });
}

/** Compile the graph, handling dryRun truncation. */
function compileEffectiveGraph(
  template: PipelineTemplate,
  stages: StageRegistry,
  options: GraphPipelineOptions | undefined
):
  | { graph: CompiledGraph; coverage: StageCoverage; error?: undefined }
  | { graph?: undefined; coverage?: undefined; error: string } {
  const effective = resolveEffectiveTemplate(template, options);
  const compiled = compilePipelineGraph(effective, stages);
  if (!compiled.ok || compiled.graph === undefined) {
    return { error: compiled.error ?? 'Compilation failed' };
  }
  return {
    graph: compiled.graph,
    coverage: { stagesPlanned: template.stages.length, stagesRun: effective.stages.length },
  };
}

/** How much of the template this run covers — see `GraphPipelineResult`. */
interface StageCoverage {
  readonly stagesPlanned: number;
  readonly stagesRun: number;
}

/** Execute the compiled graph and emit observability events. */
interface ExecuteAndReportArgs {
  readonly task: string;
  readonly template: PipelineTemplate;
  readonly graph: CompiledGraph;
  readonly coverage: StageCoverage;
  readonly options: GraphPipelineOptions | undefined;
  readonly startTime: number;
}

async function executeAndReport(args: ExecuteAndReportArgs): Promise<GraphPipelineResult> {
  const { task, template, graph, coverage, options, startTime } = args;
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
    return {
      ...buildError(template.id, result.error.message, startTime),
      ...stamp(coverage, options),
    };
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
      ...stamp(coverage, options),
    };
  }

  emitPipelineStageEvent(template.id, 'pipeline', 'completed', { durationMs });
  return {
    success: true,
    templateId: template.id,
    stepsExecuted: result.value.stepsExecuted,
    durationMs,
    finalState: result.value.finalState,
    ...stamp(coverage, options),
  };
}

/**
 * The coverage fields every exit path carries.
 *
 * `dryRun` is stamped from the OPTION, not from whether truncation happened: a
 * dry run of a template with no `dryRunStopAfter` executes every stage, and
 * calling that a normal run would be the same misreport in the other
 * direction. `stagesPlanned`/`stagesRun` say whether anything was actually
 * sliced.
 */
function stamp(
  coverage: StageCoverage,
  options: GraphPipelineOptions | undefined
): StageCoverage & { dryRun?: true } {
  return { ...coverage, ...(options?.dryRun === true ? { dryRun: true as const } : {}) };
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

function buildError(
  templateId: string,
  error: string,
  startTime: number
): Omit<GraphPipelineResult, 'stagesPlanned' | 'stagesRun'> {
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
// State Extractors
// ============================================================================

/**
 * Reads one key out of the final pipeline state.
 *
 * UNTYPED, which the header above used to deny — it promised "typed access to
 * well-known state keys" (#5771). The well-known keys do exist
 * (`PIPELINE_STATE_KEYS` in `stage-types.ts`), but this function does not use
 * them: `key` is a bare `string`, so a typo compiles, and the return is
 * `unknown`, so every caller narrows it itself. Narrowing the parameter to
 * `(typeof PIPELINE_STATE_KEYS)[keyof typeof PIPELINE_STATE_KEYS]` would make
 * the old header true, but this is published API and that is a breaking
 * change — queued with the next-major batch rather than done here.
 *
 * Returns `undefined` for a key the run never set, which is indistinguishable
 * from a key set to `undefined`; a caller needing to tell those apart must
 * inspect the state object directly. Falsy values come back as themselves.
 *
 * Published (`exports/pipeline.ts`) and, as of #5771, with no consumer at all
 * — not even a test. These assertions exist so the behaviour is pinned rather
 * than merely exported.
 */
export function extractStateValue(state: Readonly<Record<string, unknown>>, key: string): unknown {
  return state[key];
}
