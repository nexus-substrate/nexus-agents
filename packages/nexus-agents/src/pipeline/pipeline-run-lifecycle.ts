/** Owns pipeline attempt admission, lifecycle diagnostics and trace cleanup. */
import { createHash } from 'node:crypto';
import { createLogger } from '../core/logger.js';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import { TraceWriter } from './trace-writer.js';
import { PipelineCallbackTracker } from './pipeline-callback-tracker.js';
import type { CompiledGraph } from '../orchestration/graph/graph-types.js';
import type {
  CompiledPipeline,
  PipelineExecuteOptions,
  PipelineResult,
} from './pipeline-runner.js';
import type { TaskContract } from './task-contract.js';
import {
  prepareEvidenceVerification,
  verifyPreparedEvidence,
  type PreparedEvidenceVerification,
  type EvidenceVerificationOutcome,
} from './evidence-verification.js';

const logger = createLogger({ component: 'PipelineRunner' });

function rejectUnsettledResult(result: PipelineResult, pendingCallbacks: number): PipelineResult {
  if (pendingCallbacks === 0) return result;
  return {
    ...result,
    success: false,
    error: `UnsettledExecutionError: ${String(pendingCallbacks)} callback(s) still active; explicit recovery required. ${result.error ?? ''}`,
  };
}

function applyEvidenceOutcome(
  result: PipelineResult,
  evidence: EvidenceVerificationOutcome
): PipelineResult {
  return {
    ...result,
    evidence: evidence.report,
    ...(result.success && evidence.error !== undefined
      ? { success: false, error: evidence.error }
      : {}),
  };
}

export class PipelineRunLifecycle {
  private writer: TraceWriter | undefined;
  private readonly callbacks: PipelineCallbackTracker | undefined;
  private readonly context: { attemptId: string; subjectRevision: string; scope: string };
  private readonly evidence: PreparedEvidenceVerification;
  private readonly deadlineAt: number;

  constructor(
    private readonly pipeline: CompiledPipeline,
    private readonly task: TaskContract,
    private readonly options: PipelineExecuteOptions | undefined,
    startTime: number
  ) {
    this.callbacks =
      options?.decisionStore === undefined
        ? undefined
        : new PipelineCallbackTracker(pipeline.graph);
    this.evidence = prepareEvidenceVerification(task, options?.evidenceVerification);
    this.task = { ...task };
    this.deadlineAt = startTime + (options?.timeout ?? pipeline.plan.timeoutMs);
    this.context = {
      attemptId: options?.decisionAttemptId ?? task.id,
      scope: options?.decisionScope ?? 'pipeline-attempt',
      subjectRevision: '',
    };
  }

  get executionGraph(): CompiledGraph {
    return this.callbacks?.graph ?? this.pipeline.graph;
  }

  /** No graph work or lifecycle event precedes successful durable admission. */
  begin(): string | null {
    const error = this.admit();
    if (error !== null) return error;
    this.startDiagnostics();
    return null;
  }

  private admit(): string | null {
    const store = this.options?.decisionStore;
    if (store === undefined && (this.evidence.contract.evidenceObligations ?? []).length === 0)
      return null;
    try {
      this.context.subjectRevision = createHash('sha256')
        .update(JSON.stringify({ task: this.task, plan: this.pipeline.plan }))
        .digest('hex');
      return store?.recordPipelineStart(this.task, this.context) ?? null;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return `InvalidDecisionSubjectError: ${message}`;
    }
  }

  private startDiagnostics(): void {
    const bus = this.options?.eventBus;
    if (bus !== undefined) {
      this.writer = new TraceWriter(bus, {
        runsDir: this.options?.runsDir ?? nexusDataPath('runs'),
        runId: this.task.id,
      });
    }
    if (this.options?.decisionStore !== undefined) {
      this.options.decisionStore.flushPendingOutbox(this.task.id, bus);
    } else {
      bus?.emit({
        type: 'pipeline.started',
        taskId: this.task.id,
        executionId: this.task.id,
        timestamp: Date.now(),
      });
    }
  }

  /** Missing terminal persistence never becomes a reported completed decision. */
  async finish(result: PipelineResult): Promise<PipelineResult> {
    const pendingCallbacks = this.callbacks?.pendingCount ?? 0;
    const settled = rejectUnsettledResult(result, pendingCallbacks);
    const evidence = await verifyPreparedEvidence(
      this.evidence,
      {
        taskId: this.evidence.contract.id,
        attemptId: this.context.attemptId,
        subjectRevision: this.context.subjectRevision,
      },
      this.deadlineAt,
      this.options?.signal,
      settled.success
    );
    const outcome = applyEvidenceOutcome(settled, evidence);
    const store = this.options?.decisionStore;
    if (store !== undefined) {
      const error = store.recordPipelineFinish(this.task, this.context, {
        ...outcome,
        executionSettled: pendingCallbacks === 0,
        receipts: evidence.receipts,
      });
      if (error !== null) return { ...outcome, success: false, error };
      store.flushPendingOutbox(this.task.id, this.options?.eventBus);
    } else {
      this.options?.eventBus?.emit({
        type: 'pipeline.completed',
        executionId: this.task.id,
        success: outcome.success,
        durationMs: outcome.durationMs,
        timestamp: Date.now(),
      });
    }
    return outcome;
  }

  async flush(): Promise<void> {
    if (this.writer === undefined) return;
    try {
      await this.writer.flush();
    } catch (cause: unknown) {
      logger.warn('Trace flush failed — trace data may be lost', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      this.writer.stop();
    }
  }
}
