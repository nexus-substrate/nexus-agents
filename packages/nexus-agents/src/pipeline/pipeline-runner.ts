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
}

/** Pipeline execution options. */
export interface PipelineExecuteOptions {
  readonly signal?: AbortSignal;
  readonly maxSteps?: number;
  readonly timeout?: number;
  readonly onStageComplete?: (stageId: string) => void;
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

    return okResult(toResult(graphResult.value, startTime));
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
  return {
    signal: options?.signal,
    maxSteps: options?.maxSteps,
    timeout: options?.timeout ?? pipeline.plan.timeoutMs,
    onNodeComplete: options?.onStageComplete
      ? (result) => {
          options.onStageComplete?.(result.nodeId);
        }
      : undefined,
  };
}

function toResult(graphResult: GraphExecutionResult, startTime: number): PipelineResult {
  const hasFailure = graphResult.nodeResults.some((r) => r.status === 'failed');

  if (hasFailure) {
    const failedNode = graphResult.nodeResults.find((r) => r.status === 'failed');
    return {
      success: false,
      stepsExecuted: graphResult.stepsExecuted,
      durationMs: Date.now() - startTime,
      error: failedNode?.error ?? 'Stage execution failed',
    };
  }

  return {
    success: true,
    stepsExecuted: graphResult.stepsExecuted,
    durationMs: Date.now() - startTime,
  };
}
