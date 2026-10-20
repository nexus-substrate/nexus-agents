/** Contracts and persisted-boundary validation for authoritative pipeline decisions. */
import { z } from 'zod';
import type { ISQLiteDatabase } from '../core/types/database-types.js';
import type { IEventBus, PipelineEvent } from './event-types.js';
import type { EnforcementMode, EvidenceReceipt } from './task-contract.js';

/** Refuse oversized authority rather than returning a partial snapshot. */
export const MAX_DECISION_INPUT_BYTES = 1_048_576;
export const MAX_TASK_RECORDS = 1_000;
export const MAX_TASK_PERSISTED_BYTES = 8 * MAX_DECISION_INPUT_BYTES;

export const AUTHORITATIVE_DECISION_STATES = [
  'planned',
  'preflight',
  'ready',
  'executing',
  'verifying',
  'reviewed',
  'approved',
  'rejected',
  'blocked',
  'recoverable',
  'cancelled',
  'terminal',
] as const;
export type AuthoritativeDecisionState = (typeof AUTHORITATIVE_DECISION_STATES)[number];

export interface OutboxIntentInput {
  readonly intentId: string;
  readonly event: PipelineEvent;
}

export interface PersistedOutboxIntent extends OutboxIntentInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly createdAt: number;
  readonly status: 'pending' | 'dispatched';
  readonly dispatchedAt?: number | undefined;
}

interface DecisionCoreFields {
  readonly taskId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly fromState?: AuthoritativeDecisionState | undefined;
  readonly toState: AuthoritativeDecisionState;
  readonly mode: EnforcementMode;
  readonly contractVersion?: string | undefined;
  readonly policyVersion?: string | undefined;
  readonly subjectRevision?: string | undefined;
  readonly reason?: string | undefined;
}

export interface DecisionTransitionInput extends DecisionCoreFields {
  readonly receipts?: readonly EvidenceReceipt[] | undefined;
  readonly outboxIntents?: readonly OutboxIntentInput[] | undefined;
}

export interface CommittedDecisionRecord extends DecisionCoreFields {
  readonly committedAt: number;
  readonly receipts: readonly EvidenceReceipt[];
  readonly outboxIntentIds: readonly string[];
  readonly deliveryAttempts: number;
}

export interface FlushOutboxOutcome {
  readonly dispatchedIntentIds: readonly string[];
  readonly failedIntentIds: readonly string[];
  readonly observabilityDegraded: boolean;
  readonly observabilityError?: string | undefined;
}

export interface CommitTransitionOutcome extends FlushOutboxOutcome {
  readonly record: CommittedDecisionRecord;
  readonly deduplicated: boolean;
  readonly deliveryAttempts: number;
}

export interface AuthoritativeTaskSnapshot {
  readonly taskId: string;
  readonly currentState: AuthoritativeDecisionState;
  readonly latestAttemptId: string;
  readonly committedTransitions: readonly CommittedDecisionRecord[];
  readonly pendingOutboxIntents: readonly PersistedOutboxIntent[];
  readonly dispatchedOutboxIntents: readonly PersistedOutboxIntent[];
}

export interface AuthoritativeDecisionStoreConfig {
  readonly storageDir?: string | undefined;
  readonly eventBus?: IEventBus | undefined;
  readonly telemetrySink?: ((event: PipelineEvent) => void) | undefined;
  readonly openDatabase?: ((dbPath: string) => ISQLiteDatabase) | undefined;
  readonly now?: (() => number) | undefined;
}

export const DecisionIdentifierSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_.:-]{1,128}$/)
  .refine((value) => !value.includes('..'), 'Identifier must not contain traversal segments');
const nonempty = z.string().min(1);
const optionalString = z.string().optional();
const eventCore = { timestamp: z.number() };

/** Only lifecycle notification shapes used by this store are accepted. */
export const DecisionNotificationSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...eventCore,
      type: z.literal('pipeline.started'),
      taskId: nonempty,
      executionId: nonempty,
    })
    .loose(),
  z
    .object({
      ...eventCore,
      type: z.literal('pipeline.completed'),
      executionId: nonempty,
      success: z.boolean(),
      durationMs: z.number().nonnegative(),
    })
    .loose(),
  z
    .object({
      ...eventCore,
      type: z.literal('task.status_changed'),
      taskId: nonempty,
      from: nonempty,
      to: nonempty,
    })
    .loose(),
]);

const receiptSchema = z
  .object({
    obligationId: nonempty,
    artifactRef: nonempty,
    digest: optionalString,
    issuer: optionalString,
    verified: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .transform(({ digest, issuer, metadata, ...core }): EvidenceReceipt => ({
    ...core,
    ...(digest === undefined ? {} : { digest }),
    ...(issuer === undefined ? {} : { issuer }),
    ...(metadata === undefined ? {} : { metadata }),
  }));

export const OutboxInputSchema = z
  .object({
    intentId: nonempty,
    event: DecisionNotificationSchema,
  })
  .strict();

export const DecisionTransitionSchema = z
  .object({
    taskId: DecisionIdentifierSchema,
    attemptId: DecisionIdentifierSchema,
    idempotencyKey: nonempty.refine((value) => value.trim().length > 0),
    fromState: z.enum(AUTHORITATIVE_DECISION_STATES).optional(),
    toState: z.enum(AUTHORITATIVE_DECISION_STATES),
    mode: z.enum(['advisory', 'enforcing']),
    contractVersion: optionalString,
    policyVersion: optionalString,
    subjectRevision: optionalString,
    reason: optionalString,
    receipts: z.array(receiptSchema).default([]),
    outboxIntents: z.array(OutboxInputSchema).default([]),
  })
  .strict();

export const PersistedDecisionSchema = DecisionTransitionSchema.extend({
  committedAt: z.number(),
  deliveryAttempts: z.number().int().positive(),
});
export type PersistedDecision = z.infer<typeof PersistedDecisionSchema>;

const decisionRowSchema = z.object({
  taskId: DecisionIdentifierSchema,
  attemptId: DecisionIdentifierSchema,
  idempotencyKey: nonempty,
  payload: z.string(),
  deliveryAttempts: z.number().int().positive(),
});

/** Redundant SQL identities must agree with the validated decision payload. */
export function parsePersistedDecisionRow(raw: unknown, taskId: string): PersistedDecision {
  const row = decisionRowSchema.parse(raw);
  const value = PersistedDecisionSchema.parse(JSON.parse(row.payload));
  if (
    row.taskId !== taskId ||
    value.taskId !== row.taskId ||
    value.attemptId !== row.attemptId ||
    value.idempotencyKey !== row.idempotencyKey
  ) {
    throw new Error('DurablePersistenceIntegrityError: decision SQL/payload identity mismatch');
  }
  return { ...value, deliveryAttempts: row.deliveryAttempts };
}

export const PersistedOutboxSchema = OutboxInputSchema.extend({
  taskId: DecisionIdentifierSchema,
  attemptId: DecisionIdentifierSchema,
  idempotencyKey: nonempty,
  createdAt: z.number(),
  status: z.enum(['pending', 'dispatched']),
  dispatchedAt: z.number().optional(),
});
