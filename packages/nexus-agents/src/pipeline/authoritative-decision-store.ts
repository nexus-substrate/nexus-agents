/**
 * Durable decisions for TaskContract pipeline attempts (connected-autonomy T10).
 * SQLite owns admission and atomic decision/notification commits.
 * These records describe this pipeline, never an adjacent V1 invocation.
 */
import { createLogger, getTimeProvider, type Result } from '../core/index.js';
import type { IEventBus, PipelineEvent } from './event-types.js';
import type { EvidenceReceipt, TaskContract } from './task-contract.js';
import {
  persistDecision,
  readDecisionSnapshot,
  flushDecisionOutbox,
} from './authoritative-decision-persistence.js';
import type {
  AuthoritativeDecisionStoreConfig,
  AuthoritativeTaskSnapshot,
  CommitTransitionOutcome,
  DecisionTransitionInput,
  FlushOutboxOutcome,
} from './authoritative-decision-types.js';

export { AUTHORITATIVE_DECISION_STATES } from './authoritative-decision-types.js';
export type {
  AuthoritativeDecisionState,
  OutboxIntentInput,
  PersistedOutboxIntent,
  DecisionTransitionInput,
  CommittedDecisionRecord,
  CommitTransitionOutcome,
  FlushOutboxOutcome,
  AuthoritativeTaskSnapshot,
  AuthoritativeDecisionStoreConfig,
} from './authoritative-decision-types.js';

const logger = createLogger({ component: 'authoritative-decision-store' });

interface PipelineDecisionContext {
  readonly attemptId: string;
  readonly subjectRevision: string;
  readonly scope: string;
}

export class AuthoritativeDecisionStore {
  private readonly clock: () => number;

  constructor(private readonly config: AuthoritativeDecisionStoreConfig = {}) {
    this.clock = config.now ?? (() => getTimeProvider().now());
  }

  /** Required state commits before diagnostic delivery; exports cannot undo it. */
  commitTransition(input: DecisionTransitionInput): Result<CommitTransitionOutcome, string> {
    const committed = persistDecision(this.config, input, this.clock());
    if (!committed.ok) return committed;
    return {
      ok: true,
      value: {
        ...committed.value,
        ...this.flushPendingOutbox(input.taskId),
        deliveryAttempts: committed.value.record.deliveryAttempts,
      },
    };
  }

  /**
   * Atomically admits one attempt. Duplicate or incomplete previous admissions
   * refuse execution. Delivery waits until the trace subscriber is installed.
   */
  recordPipelineStart(task: TaskContract, context: PipelineDecisionContext): string | null {
    const event: PipelineEvent = {
      type: 'pipeline.started',
      taskId: task.id,
      executionId: task.id,
      timestamp: this.clock(),
    };
    const result = persistDecision(
      this.config,
      {
        taskId: task.id,
        attemptId: context.attemptId,
        idempotencyKey: `pipeline-start:${context.attemptId}`,
        toState: 'executing',
        mode: 'enforcing',
        contractVersion: task.contractVersion,
        subjectRevision: context.subjectRevision,
        reason: context.scope,
        outboxIntents: [{ intentId: `start:${context.attemptId}`, event }],
      },
      this.clock(),
      true
    );
    if (!result.ok) return result.error;
    return result.value.deduplicated
      ? 'DuplicateAdmissionError: pipeline attempt already admitted'
      : null;
  }

  /** Terminal decision and notification commit together, before delivery. */
  recordPipelineFinish(
    task: TaskContract,
    context: PipelineDecisionContext,
    outcome: {
      readonly success: boolean;
      readonly durationMs: number;
      readonly error?: string;
      /** False retains ownership; a deadline does not prove callback settlement. */
      readonly executionSettled?: boolean;
      readonly receipts?: readonly EvidenceReceipt[];
    }
  ): string | null {
    const success = outcome.success && outcome.executionSettled !== false;
    const event: PipelineEvent = {
      type: 'pipeline.completed',
      executionId: task.id,
      success,
      durationMs: outcome.durationMs,
      timestamp: this.clock(),
    };
    const result = persistDecision(
      this.config,
      {
        taskId: task.id,
        attemptId: context.attemptId,
        idempotencyKey: `pipeline-finish:${context.attemptId}`,
        fromState: 'executing',
        toState:
          outcome.executionSettled === false ? 'recoverable' : success ? 'terminal' : 'blocked',
        mode: 'enforcing',
        contractVersion: task.contractVersion,
        subjectRevision: context.subjectRevision,
        reason: outcome.error === undefined ? context.scope : `${context.scope}: ${outcome.error}`,
        receipts: outcome.receipts ?? [],
        outboxIntents: [{ intentId: `finish:${context.attemptId}`, event }],
      },
      this.clock()
    );
    return result.ok ? null : result.error;
  }

  /**
   * Diagnostic delivery is at least once across an emit/ack crash. Emission is
   * not consumer completion. Collector failure cannot reset a bus acknowledgement.
   */
  flushPendingOutbox(taskId: string, eventBus?: IEventBus): FlushOutboxOutcome {
    const config = eventBus === undefined ? this.config : { ...this.config, eventBus };
    const result = flushDecisionOutbox(config, taskId, this.clock);
    if (result.observabilityDegraded) {
      logger.warn('Pipeline decision diagnostics degraded', {
        taskId,
        error: result.observabilityError,
      });
    }
    return result;
  }

  /** Absence is ok(null); unreadable or invalid state is an explicit error. */
  getTaskSnapshot(taskId: string): Result<AuthoritativeTaskSnapshot | null, string> {
    return readDecisionSnapshot(this.config, taskId);
  }
}
