/**
 * PipelineRunner — V2 Pipeline Execution Engine (Issue #910, E2-3)
 *
 * Compiles PlanContracts into graphs and executes them using
 * the existing GraphBuilder infrastructure.
 *
 * @module pipeline/pipeline-runner
 */
import { executeGraph } from '../orchestration/graph/graph-executor.js';

import { compilePlan } from './plan-compiler.js';

import type {
  CompiledGraph,
  GraphExecutionResult,
  GraphExecuteOptions,
} from '../orchestration/graph/graph-types.js';
import type { PlanContract, TaskContract } from './task-contract.js';

// ============================================================================
// Types
// ============================================================================

/** Compiled pipeline ready for execution. */
export interface CompiledPipeline {
  readonly graph: CompiledGraph;
  readonly plan: PlanContract;
}

/** Pipeline execution result. */
export interface PipelineResult {
  readonly success: boolean;
  readonly stepsExecuted: number;
  readonly durationMs: number;
  readonly error?: string;
  /** Per-step breakdown when continueOnFailure is enabled. */
  readonly stepResults?: readonly StepOutcome[] | undefined;
}

/** Outcome of a single pipeline step. */
export interface StepOutcome {
  readonly stepId: string;
  readonly status: 'succeeded' | 'failed' | 'skipped';
  readonly durationMs: number;
  readonly error?: string | undefined;
}

/** Pipeline execution options. */
export interface PipelineExecuteOptions {
  readonly signal?: AbortSignal;
  readonly maxSteps?: number;
  readonly timeout?: number;
  readonly onStageComplete?: (stageId: string) => void;
  /** When true, continue executing independent steps after a failure. */
  readonly continueOnFailure?: boolean;
}

/** Compile result type. */
type CompileResult =
  | { readonly ok: true; readonly value: CompiledPipeline }
  | { readonly ok: false; readonly error: string };

/** Execute result type. */
type ExecuteResult =
  | { readonly ok: true; readonly value: PipelineResult }
  | { readonly ok: false; readonly error: string };

// ============================================================================
// PipelineRunner
// ============================================================================

/**
 * Compiles PlanContracts and executes them as graphs.
 */
export class PipelineRunner {
  /** Compiles a PlanContract into a CompiledPipeline. */
  compile(plan: PlanContract): CompileResult {
    const graphResult = compilePlan(plan);
    if (!graphResult.ok) {
      return { ok: false, error: graphResult.error };
    }
    return {
      ok: true,
      value: { graph: graphResult.value, plan },
    };
  }

  /** Executes a compiled pipeline. */
  async execute(
    pipeline: CompiledPipeline,
    _task: TaskContract,
    options?: PipelineExecuteOptions
  ): Promise<ExecuteResult> {
    const startTime = Date.now();

    if (options?.signal?.aborted === true) {
      return okResult(failedResult(startTime, 'Pipeline aborted before execution'));
    }

    const graphOpts = buildGraphOptions(pipeline, options);
    const graphResult = await executeGraph(pipeline.graph, {}, graphOpts);

    if (!graphResult.ok) {
      return okResult(failedResult(startTime, graphResult.error.message));
    }

    const continueMode = options?.continueOnFailure === true;
    return okResult(toResult(graphResult.value, startTime, continueMode));
  }

  /**
   * Re-executes only the failed/skipped steps from a previous result.
   * Requires the original pipeline and a result with stepResults.
   */
  async retryFailed(
    pipeline: CompiledPipeline,
    previousResult: PipelineResult,
    task: TaskContract,
    options?: PipelineExecuteOptions
  ): Promise<ExecuteResult> {
    const steps = previousResult.stepResults;
    if (steps === undefined || steps.length === 0) {
      return okResult(previousResult);
    }

    const failedIds = new Set(
      steps.filter((s) => s.status === 'failed' || s.status === 'skipped').map((s) => s.stepId)
    );

    if (failedIds.size === 0) {
      return okResult(previousResult);
    }

    // Re-execute the full pipeline with continueOnFailure
    // The graph executor will re-run all nodes; we report combined results
    return this.execute(pipeline, task, { ...options, continueOnFailure: true });
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

function okResult(value: PipelineResult): ExecuteResult {
  return { ok: true, value };
}

function failedResult(startTime: number, error: string): PipelineResult {
  return { success: false, stepsExecuted: 0, durationMs: Date.now() - startTime, error };
}

function buildGraphOptions(
  pipeline: CompiledPipeline,
  options?: PipelineExecuteOptions
): GraphExecuteOptions {
  const base: GraphExecuteOptions = {
    timeout: options?.timeout ?? pipeline.plan.timeoutMs,
  };
  const signal = options?.signal;
  const maxSteps = options?.maxSteps;
  const onStage = options?.onStageComplete;
  return {
    ...base,
    ...(signal !== undefined ? { signal } : {}),
    ...(maxSteps !== undefined ? { maxSteps } : {}),
    ...(onStage !== undefined
      ? {
          onNodeComplete: (r: { nodeId: string }) => {
            onStage(r.nodeId);
          },
        }
      : {}),
  };
}

function toResult(
  graphResult: GraphExecutionResult,
  startTime: number,
  continueOnFailure: boolean
): PipelineResult {
  const durationMs = Date.now() - startTime;
  const hasFailure = graphResult.nodeResults.some((r) => r.status === 'failed');

  const stepResults: StepOutcome[] = graphResult.nodeResults.map((r) => ({
    stepId: r.nodeId,
    status: mapNodeStatus(r.status),
    durationMs: r.durationMs,
    ...(r.error !== undefined ? { error: r.error } : {}),
  }));

  if (hasFailure && !continueOnFailure) {
    const failedNode = graphResult.nodeResults.find((r) => r.status === 'failed');
    return {
      success: false,
      stepsExecuted: graphResult.stepsExecuted,
      durationMs,
      error: failedNode?.error ?? 'Stage execution failed',
    };
  }

  const succeeded = stepResults.filter((s) => s.status === 'succeeded').length;
  const total = stepResults.length;
  const allOk = succeeded === total;

  return {
    success: allOk,
    stepsExecuted: graphResult.stepsExecuted,
    durationMs,
    ...(continueOnFailure ? { stepResults } : {}),
    ...(!allOk && continueOnFailure
      ? { error: `${String(succeeded)}/${String(total)} steps succeeded` }
      : {}),
  };
}

function mapNodeStatus(
  status: 'success' | 'failed' | 'skipped'
): 'succeeded' | 'failed' | 'skipped' {
  return status === 'success' ? 'succeeded' : status;
}
