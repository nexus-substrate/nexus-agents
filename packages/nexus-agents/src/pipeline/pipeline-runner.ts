/**
 * PipelineRunner — V2 Pipeline Execution Engine (Issue #910, E2-3)
 *
 * Compiles PlanContracts into graphs and executes them using
 * the existing GraphBuilder infrastructure.
 *
 * @module pipeline/pipeline-runner
 */
import { executeGraph } from '../orchestration/graph/graph-executor.js';
import { createLogger } from '../core/index.js';
import { nexusDataPath } from '../config/nexus-data-dir.js';

import { compilePlan } from './plan-compiler.js';
import type { PlanCompileOptions } from './plan-compiler.js';
import { PipelineRunLifecycle } from './pipeline-run-lifecycle.js';
import { resolvePipelineDeps } from './pipeline-deps.js';

import type {
  CompiledGraph,
  GraphExecutionResult,
  GraphExecuteOptions,
  NodeResult,
} from '../orchestration/graph/graph-types.js';
import type { IEventBus } from './event-types.js';
import { emitStageCompleted, emitStageFailed } from './pipeline-observability.js';
import type { PlanContract, TaskContract } from './task-contract.js';
import { verifyWorkerReadiness, type WorkerReadinessConfig } from './worker-readiness.js';
import type { AuthoritativeDecisionStore } from './authoritative-decision-store.js';

const pipelineLogger = createLogger({ component: 'PipelineRunner' });

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
  /**
   * Raw per-node results from the run (#3534). Retained so `retryFailed` can
   * replay prior successes and re-run only the failed nodes; carries the
   * `isRetryable` signal used to gate the retry.
   */
  readonly nodeResults?: readonly NodeResult[] | undefined;
}

/** Outcome of a single pipeline step. */
export interface StepOutcome {
  readonly stepId: string;
  readonly status: 'succeeded' | 'failed' | 'skipped';
  readonly durationMs: number;
  readonly error?: string | undefined;
}

/**
 * Default directory for trace output. Resolved through `nexusDataPath()`
 * — NOT `join(getNexusDataDir(), 'runs')` — because `runs` is a per-repo
 * subdir: the manual join bypassed the per-repo routing entirely, so
 * traces landed in homedir even with `NEXUS_REPO_PREFERRED` ON. Issue
 * #2889. Function rather than const so env changes are honored at call
 * time (matters for tests that mock the env). See epic #2872 / #2887.
 */
export function getDefaultRunsDir(): string {
  return nexusDataPath('runs');
}

/** Pipeline execution options. */
export interface PipelineExecuteOptions {
  readonly signal?: AbortSignal;
  readonly maxSteps?: number;
  readonly timeout?: number;
  readonly onStageComplete?: (stageId: string) => void;
  /** When true, continue executing independent steps after a failure. */
  readonly continueOnFailure?: boolean;
  /**
   * Prior NodeResults to replay (#3534) — succeeded nodes are reused instead of
   * re-executed. Set by `retryFailed` so a retry re-runs only the failed nodes.
   */
  readonly priorResults?: ReadonlyMap<string, NodeResult>;
  /** EventBus for trace persistence. When provided, creates a TraceWriter. */
  readonly eventBus?: IEventBus;
  /**
   * Override base directory for trace output. Default: `getDefaultRunsDir()`,
   * i.e. `nexusDataPath('runs')` — per-repo aware. NOT `getNexusDataDir()/runs`,
   * which bypassed per-repo routing (#2889).
   */
  readonly runsDir?: string;
  /**
   * Worker boundary readiness configuration (Task T06 / #5129).
   * When provided, verifies capability requirements on the actual worker before execution.
   */
  readonly workerReadiness?: WorkerReadinessConfig;
  /**
   * Authoritative decision store (Task T10 / #7522).
   * When provided, persists authoritative transitions and outbox intents before/after execution.
   */
  readonly decisionStore?: AuthoritativeDecisionStore;
  /** Stable retry identity; changing it explicitly requests a distinct attempt. */
  readonly decisionAttemptId?: string;
  /** Persist the actual scope: V2 route instrumentation never certifies V1 work. */
  readonly decisionScope?: 'pipeline-attempt' | 'v2-route-instrumentation';
}

/** Compile result type. */
type CompileResult =
  | { readonly ok: true; readonly value: CompiledPipeline }
  | { readonly ok: false; readonly error: string };

/** Execute result type. */
type ExecuteResult =
  | { readonly ok: true; readonly value: PipelineResult }
  | { readonly ok: false; readonly error: string };

function resolvePreflightConfig(
  workerReadiness: WorkerReadinessConfig,
  pipelineTimeoutMs: number,
  pipelineSignal: AbortSignal | undefined
): { effectiveSignal: AbortSignal | undefined; totalBudgetMs: number; effectiveProbeMs: number } {
  const effectiveSignal =
    pipelineSignal !== undefined && workerReadiness.signal !== undefined
      ? AbortSignal.any([pipelineSignal, workerReadiness.signal])
      : (workerReadiness.signal ?? pipelineSignal);
  const totalBudgetMs = Math.min(
    pipelineTimeoutMs,
    workerReadiness.totalTimeoutMs ?? pipelineTimeoutMs
  );
  const effectiveProbeMs = Math.min(workerReadiness.probeTimeoutMs ?? totalBudgetMs, totalBudgetMs);
  return { effectiveSignal, totalBudgetMs, effectiveProbeMs };
}

function formatReadinessOutcome(
  report: {
    readonly ready: boolean;
    readonly workerId: string;
    readonly failures: readonly {
      readonly requirementId: string;
      readonly errorClass: string;
      readonly message: string;
    }[];
  },
  effectiveSignal: AbortSignal | undefined,
  startTime: number,
  totalBudgetMs: number
): string | null {
  if (effectiveSignal?.aborted === true) return 'Pipeline aborted during preflight readiness';
  if (!report.ready) {
    const details = report.failures
      .map((f) => `${f.requirementId} (${f.errorClass}: ${f.message})`)
      .join('; ');
    return `WorkerNotReadyError [${report.workerId}]: ${details}`;
  }
  if (Date.now() - startTime >= totalBudgetMs) {
    return `PipelineTimeoutError [${report.workerId}]: Preflight readiness exhausted timeout budget (${String(totalBudgetMs)}ms)`;
  }
  return null;
}

async function checkPreflightReadiness(
  pipeline: CompiledPipeline,
  task: TaskContract,
  options: PipelineExecuteOptions | undefined,
  startTime: number
): Promise<string | null> {
  if (options?.workerReadiness === undefined) return null;
  const { effectiveSignal, totalBudgetMs, effectiveProbeMs } = resolvePreflightConfig(
    options.workerReadiness,
    options.timeout ?? pipeline.plan.timeoutMs,
    options.signal
  );
  if (effectiveSignal?.aborted === true) return 'Pipeline aborted before preflight readiness';

  const report = await verifyWorkerReadiness(task.capabilityRequirements ?? [], {
    ...options.workerReadiness,
    probeTimeoutMs: effectiveProbeMs,
    totalTimeoutMs: totalBudgetMs,
    ...(effectiveSignal !== undefined ? { signal: effectiveSignal } : {}),
  });
  for (const w of report.advisoryWarnings) {
    pipelineLogger.warn('Worker readiness advisory warning', { ...w });
  }
  return formatReadinessOutcome(report, effectiveSignal, startTime, totalBudgetMs);
}

async function runPreExecutionGates(
  pipeline: CompiledPipeline,
  task: TaskContract,
  options: PipelineExecuteOptions | undefined,
  startTime: number
): Promise<string | null> {
  if (options?.signal?.aborted === true) return 'Pipeline aborted before execution';
  return checkPreflightReadiness(pipeline, task, options, startTime);
}

function computeRemainingTimeout(
  pipeline: CompiledPipeline,
  options: PipelineExecuteOptions | undefined,
  startTime: number
): number {
  const totalTimeoutMs = options?.timeout ?? pipeline.plan.timeoutMs;
  return Math.max(0, totalTimeoutMs - (Date.now() - startTime));
}

function executionBoundaryError(
  pipeline: CompiledPipeline,
  options: PipelineExecuteOptions | undefined,
  startTime: number
): string | null {
  if (options?.signal?.aborted === true) return 'Pipeline aborted before graph execution';
  return computeRemainingTimeout(pipeline, options, startTime) === 0
    ? 'Pipeline timed out before graph execution'
    : null;
}

/**
 * Compiles PlanContracts and executes them as graphs.
 */
export class PipelineRunner {
  /** Compiles a PlanContract into a CompiledPipeline. */
  compile(plan: PlanContract, options?: PlanCompileOptions): CompileResult {
    const { pluginRegistry } = resolvePipelineDeps(options);
    const compileOpts: PlanCompileOptions = {
      pluginRegistry,
      ...(options?.policyEnforcement !== undefined
        ? { policyEnforcement: options.policyEnforcement }
        : {}),
    };
    const graphResult = compilePlan(plan, compileOpts);
    if (!graphResult.ok) return { ok: false, error: graphResult.error };
    return { ok: true, value: { graph: graphResult.value, plan } };
  }

  /** Executes a compiled pipeline. */
  async execute(
    pipeline: CompiledPipeline,
    task: TaskContract,
    options?: PipelineExecuteOptions
  ): Promise<ExecuteResult> {
    const startTime = Date.now();
    const preGateError =
      (await runPreExecutionGates(pipeline, task, options, startTime)) ??
      executionBoundaryError(pipeline, options, startTime);
    if (preGateError !== null) return okResult(failedResult(startTime, preGateError));

    const lifecycle = new PipelineRunLifecycle(pipeline, task, options);
    const admissionError = lifecycle.begin();
    if (admissionError !== null) return okResult(failedResult(startTime, admissionError));

    try {
      const boundaryError = executionBoundaryError(pipeline, options, startTime);
      if (boundaryError !== null)
        return okResult(lifecycle.finish(failedResult(startTime, boundaryError)));
      const remainingTimeoutMs = computeRemainingTimeout(pipeline, options, startTime);
      const graphOpts = buildGraphOptions(pipeline, { ...options, timeout: remainingTimeoutMs });
      const graphResult = await executeGraph(lifecycle.executionGraph, { task }, graphOpts);
      if (!graphResult.ok) {
        const failed = failedResult(startTime, graphResult.error.message);
        return okResult(lifecycle.finish(failed));
      }
      const result = toResult(graphResult.value, startTime, options?.continueOnFailure === true);
      return okResult(lifecycle.finish(result));
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return okResult(lifecycle.finish(failedResult(startTime, message)));
    } finally {
      await lifecycle.flush();
    }
  }

  /**
   * Retries a previous run's failures **selectively** (#3534): prior successful
   * nodes are replayed (not re-executed) via `priorResults`, so only the failed
   * nodes and their dependents run again.
   *
   * Gated on retryability: retries only when at least one *failed* node is
   * `isRetryable` (transient). If every failure is permanent
   * (validation/permission/business/internal) it returns `previousResult`
   * unchanged rather than looping on errors that won't clear.
   *
   * Back-compat: a `previousResult` without `nodeResults` (e.g. an older caller)
   * falls back to the prior whole-pipeline retry gated on `stepResults`.
   *
   * NOTE: non-retryable failures that coexist with a retryable one still re-run
   * (and re-fail) under `continueOnFailure`; pinning them as terminal is a
   * future refinement.
   */
  async retryFailed(
    pipeline: CompiledPipeline,
    previousResult: PipelineResult,
    task: TaskContract,
    options?: PipelineExecuteOptions
  ): Promise<ExecuteResult> {
    const nodeResults = previousResult.nodeResults;
    if (nodeResults === undefined) {
      return this.retryFailedLegacy(pipeline, previousResult, task, options);
    }

    const anyRetryableFailure = nodeResults.some(
      (r) => r.status === 'failed' && r.isRetryable === true
    );
    if (!anyRetryableFailure) {
      // Nothing safely retryable — don't loop on permanent failures.
      return okResult(previousResult);
    }

    // Replay prior successes; the executor re-runs everything else (the failed
    // nodes and their dependents).
    const priorResults = new Map<string, NodeResult>(
      nodeResults.filter((r) => r.status === 'success').map((r) => [r.nodeId, r])
    );
    return this.execute(pipeline, task, { ...options, continueOnFailure: true, priorResults });
  }

  /** Pre-#3534 whole-pipeline retry, kept for results lacking `nodeResults`. */
  private async retryFailedLegacy(
    pipeline: CompiledPipeline,
    previousResult: PipelineResult,
    task: TaskContract,
    options?: PipelineExecuteOptions
  ): Promise<ExecuteResult> {
    const steps = previousResult.stepResults;
    if (steps === undefined || steps.length === 0) {
      return okResult(previousResult);
    }
    const anyFailed = steps.some((s) => s.status === 'failed' || s.status === 'skipped');
    if (!anyFailed) {
      return okResult(previousResult);
    }
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

/** Builds the per-node-complete callback (extracted to keep buildGraphOptions simple). */
function makeOnNodeComplete(
  onStage: ((stageId: string) => void) | undefined,
  bus: IEventBus | undefined,
  execId: string
): (r: NodeResult) => void {
  return (r) => {
    onStage?.(r.nodeId);
    emitStageEvent(bus, execId, r);
  };
}

/** Optional GraphExecuteOptions fields, included only when defined (exactOptional-safe). */
function optionalGraphFields(options?: PipelineExecuteOptions): Partial<GraphExecuteOptions> {
  const signal = options?.signal;
  const maxSteps = options?.maxSteps;
  const priorResults = options?.priorResults;
  return {
    ...(signal !== undefined ? { signal } : {}),
    ...(maxSteps !== undefined ? { maxSteps } : {}),
    ...(priorResults !== undefined ? { priorResults } : {}),
  };
}

function buildGraphOptions(
  pipeline: CompiledPipeline,
  options?: PipelineExecuteOptions
): GraphExecuteOptions {
  return {
    timeout: options?.timeout ?? pipeline.plan.timeoutMs,
    ...optionalGraphFields(options),
    onNodeComplete: makeOnNodeComplete(
      options?.onStageComplete,
      options?.eventBus,
      pipeline.plan.taskId
    ),
  };
}

function toResult(
  graphResult: GraphExecutionResult,
  startTime: number,
  continueOnFailure: boolean
): PipelineResult {
  const durationMs = Date.now() - startTime;
  const hasFailure = graphResult.nodeResults.some((r) => r.status === 'failed');
  // A policy gate denial (#3177 condition 3) is terminal and non-retryable: it
  // halts the pipeline even in continue-mode, unlike an ordinary failed node.
  const policyBlockedNode = graphResult.nodeResults.find((r) => r.policyBlocked === true);

  const stepResults: StepOutcome[] = graphResult.nodeResults.map((r) => ({
    stepId: r.nodeId,
    status: mapNodeStatus(r.status),
    durationMs: r.durationMs,
    ...(r.error !== undefined ? { error: r.error } : {}),
  }));

  if (policyBlockedNode !== undefined) {
    return policyBlockedResult(graphResult, durationMs, continueOnFailure, stepResults);
  }

  if (hasFailure && !continueOnFailure) {
    const failedNode = graphResult.nodeResults.find((r) => r.status === 'failed');
    return {
      success: false,
      stepsExecuted: graphResult.stepsExecuted,
      durationMs,
      error: failedNode?.error ?? 'Stage execution failed',
      nodeResults: graphResult.nodeResults,
    };
  }

  const succeeded = stepResults.filter((s) => s.status === 'succeeded').length;
  const total = stepResults.length;
  const allOk = succeeded === total;

  return {
    success: allOk,
    stepsExecuted: graphResult.stepsExecuted,
    durationMs,
    nodeResults: graphResult.nodeResults,
    ...(continueOnFailure ? { stepResults } : {}),
    ...(!allOk && continueOnFailure
      ? { error: `${String(succeeded)}/${String(total)} steps succeeded` }
      : {}),
  };
}

/**
 * Builds the halt result for a policy-blocked pipeline (#3177 condition 3).
 * A policy denial halts even under continueOnFailure; `stepResults` is still
 * surfaced in continue-mode so callers see the per-step breakdown.
 */
function policyBlockedResult(
  graphResult: GraphExecutionResult,
  durationMs: number,
  continueOnFailure: boolean,
  stepResults: readonly StepOutcome[]
): PipelineResult {
  const blocked = graphResult.nodeResults.find((r) => r.policyBlocked === true);
  return {
    success: false,
    stepsExecuted: graphResult.stepsExecuted,
    durationMs,
    error: blocked?.error ?? 'Policy gate blocked the pipeline',
    nodeResults: graphResult.nodeResults,
    ...(continueOnFailure ? { stepResults } : {}),
  };
}

function mapNodeStatus(
  status: 'success' | 'failed' | 'skipped' | 'interrupted'
): 'succeeded' | 'failed' | 'skipped' {
  if (status === 'success') return 'succeeded';
  // Pipeline-runner doesn't model HITL pauses (#1895) yet — surface 'interrupted'
  // as 'skipped' so downstream pipeline status remains a 3-way enum.
  if (status === 'interrupted') return 'skipped';
  return status;
}

// ============================================================================
// Trace Helpers (#1167)
// ============================================================================

/** Emit stage.completed or stage.failed based on node result (#1179, #1734). */
function emitStageEvent(bus: IEventBus | undefined, executionId: string, result: NodeResult): void {
  const { nodeId: stageId, status, durationMs } = result;
  pipelineLogger.debug('Stage event', { executionId, stageId, status, durationMs });
  if (status === 'failed') {
    emitStageFailed({ bus, executionId, stageId, error: result.error ?? 'Unknown error' });
  } else {
    emitStageCompleted({ bus, executionId, stageId, durationMs, success: status === 'success' });
  }
}
