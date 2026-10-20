/** At-least-once diagnostic notification delivery; consumers must deduplicate intentId. */
import { z } from 'zod';
import type { ISQLiteDatabase } from '../core/types/database-types.js';
import type { PipelineEvent } from './event-types.js';
import {
  PersistedOutboxSchema,
  MAX_TASK_RECORDS,
  type AuthoritativeDecisionStoreConfig,
  type FlushOutboxOutcome,
} from './authoritative-decision-types.js';

const rowSchema = z.object({ taskId: z.string(), intentId: z.string(), payload: z.string() });

function readPendingIntent(raw: unknown, taskId: string): z.infer<typeof PersistedOutboxSchema> {
  const row = rowSchema.parse(raw);
  const intent = PersistedOutboxSchema.parse(JSON.parse(row.payload));
  if (
    row.taskId !== taskId ||
    intent.taskId !== taskId ||
    row.intentId !== intent.intentId ||
    intent.status !== 'pending'
  ) {
    throw new Error('DurablePersistenceIntegrityError: pending intent identity/status mismatch');
  }
  return intent;
}

function acknowledgeIntent(
  db: ISQLiteDatabase,
  intent: z.infer<typeof PersistedOutboxSchema>,
  dispatchedAt: number
): void {
  const acknowledged = PersistedOutboxSchema.parse({
    ...intent,
    status: 'dispatched',
    dispatchedAt,
  });
  db.prepare('UPDATE outbox SET status = ?, payload = ? WHERE taskId = ? AND intentId = ?').run(
    'dispatched',
    JSON.stringify(acknowledged),
    intent.taskId,
    intent.intentId
  );
}

/** Caller holds BEGIN IMMEDIATE through delivery and acknowledgement.
 * A crash after emit and before COMMIT can replay; this is never an effect executor.
 */
export function deliverDecisionNotifications(
  db: ISQLiteDatabase,
  config: AuthoritativeDecisionStoreConfig,
  taskId: string,
  now: () => number
): { outcome: FlushOutboxOutcome; events: PipelineEvent[] } {
  const events: PipelineEvent[] = [];
  const dispatchedIntentIds: string[] = [];
  const failedIntentIds: string[] = [];
  let firstError: string | undefined;
  const rows = db
    .prepare(
      "SELECT taskId, intentId, payload FROM outbox WHERE taskId = ? AND status = 'pending' ORDER BY rowid LIMIT ?"
    )
    .all(taskId, MAX_TASK_RECORDS);
  for (const raw of rows) {
    const intent = readPendingIntent(raw, taskId);
    if (config.eventBus === undefined) continue;
    const event = { ...intent.event, intentId: intent.intentId, attemptId: intent.attemptId };
    try {
      config.eventBus.emit(event);
    } catch (cause: unknown) {
      failedIntentIds.push(intent.intentId);
      firstError ??= cause instanceof Error ? cause.message : String(cause);
      continue;
    }
    acknowledgeIntent(db, intent, now());
    dispatchedIntentIds.push(intent.intentId);
    events.push(event);
  }
  return {
    events,
    outcome: {
      dispatchedIntentIds,
      failedIntentIds,
      observabilityDegraded: firstError !== undefined,
      ...(firstError === undefined
        ? {}
        : { observabilityError: `NotificationDeliveryError: ${firstError}` }),
    },
  };
}
