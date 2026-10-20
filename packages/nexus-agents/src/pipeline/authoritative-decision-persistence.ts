/** Transactional SQLite authority for pipeline decisions and notification intents. */
import { chmodSync, closeSync, mkdirSync, openSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import { openSqliteDatabase } from '../context/open-database.js';
import { err, ok, type Result } from '../core/result.js';
import type { ISQLiteDatabase } from '../core/types/database-types.js';
import {
  DecisionIdentifierSchema,
  DecisionTransitionSchema,
  MAX_DECISION_INPUT_BYTES,
  MAX_TASK_PERSISTED_BYTES,
  MAX_TASK_RECORDS,
  parsePersistedDecisionRow,
  PersistedDecisionSchema,
  PersistedOutboxSchema,
  type AuthoritativeDecisionStoreConfig,
  type AuthoritativeTaskSnapshot,
  type CommittedDecisionRecord,
  type DecisionTransitionInput,
  type FlushOutboxOutcome,
  type PersistedDecision,
} from './authoritative-decision-types.js';
import { deliverDecisionNotifications } from './authoritative-decision-delivery.js';

const BUSY_TIMEOUT_MS = 3_000;
const FINISHED_STATES = new Set(['terminal', 'blocked', 'rejected', 'cancelled']);
const outboxRowSchema = z.object({
  taskId: z.string(),
  intentId: z.string(),
  payload: z.string(),
  status: z.enum(['pending', 'dispatched']),
});
const taskSizeSchema = z.object({ decisions: z.number(), intents: z.number(), bytes: z.number() });
function requireBoundedTask(db: ISQLiteDatabase, taskId: string): void {
  const sizes = taskSizeSchema.parse(
    db
      .prepare(
        `SELECT
    (SELECT COUNT(*) FROM decisions WHERE taskId = ?) AS decisions,
    (SELECT COUNT(*) FROM outbox WHERE taskId = ?) AS intents,
    (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))), 0) FROM decisions WHERE taskId = ?) +
    (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))), 0) FROM outbox WHERE taskId = ?) AS bytes`
      )
      .get(taskId, taskId, taskId, taskId)
  );
  if (
    sizes.decisions > MAX_TASK_RECORDS ||
    sizes.intents > MAX_TASK_RECORDS ||
    sizes.bytes > MAX_TASK_PERSISTED_BYTES
  ) {
    throw new Error('TaskPersistenceLimitError: authority exceeds complete-snapshot limits');
  }
}
function databasePath(config: AuthoritativeDecisionStoreConfig): string {
  if (config.storageDir?.trim().length === 0) {
    throw new Error('InvalidStorageDirectoryError: storageDir must be nonempty');
  }
  return join(
    config.storageDir === undefined ? nexusDataPath('pipeline') : resolve(config.storageDir),
    'decisions.db'
  );
}
function openDecisionDatabase(config: AuthoritativeDecisionStoreConfig): ISQLiteDatabase {
  const filePath = databasePath(config);
  const storageDir = resolve(filePath, '..');
  mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  closeSync(openSync(filePath, 'a', 0o600));
  chmodSync(filePath, 0o600);
  const db = (config.openDatabase ?? openSqliteDatabase)(filePath);
  try {
    db.exec(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)}; PRAGMA synchronous = FULL;`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId TEXT NOT NULL, attemptId TEXT NOT NULL, idempotencyKey TEXT NOT NULL,
        payload TEXT NOT NULL, deliveryAttempts INTEGER NOT NULL,
        UNIQUE(taskId, idempotencyKey)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        taskId TEXT NOT NULL, intentId TEXT NOT NULL, payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'dispatched')),
        PRIMARY KEY(taskId, intentId)
      );`);
    return db;
  } catch (cause: unknown) {
    db.close();
    throw cause;
  }
}
function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function withDecisionDatabase<T>(
  config: AuthoritativeDecisionStoreConfig,
  kind: 'Read' | 'Write',
  operation: (db: ISQLiteDatabase) => T
): Result<T, string> {
  let db: ISQLiteDatabase | undefined;
  let outcome: Result<T, string>;
  try {
    db = openDecisionDatabase(config);
    outcome = ok(operation(db));
  } catch (cause: unknown) {
    outcome = err(`DurablePersistence${kind}Error: ${errorMessage(cause)}`);
  }
  try {
    db?.close();
  } catch (cause: unknown) {
    outcome = err(`DurablePersistence${kind}Error: close failed: ${errorMessage(cause)}`);
  }
  return outcome;
}

function inTransaction<T>(db: ISQLiteDatabase, operation: () => T, readOnly = false): T {
  db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (cause: unknown) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackCause: unknown) {
      throw new Error(`${errorMessage(cause)}; rollback failed: ${errorMessage(rollbackCause)}`);
    }
    throw cause;
  }
}

function loadDecisions(db: ISQLiteDatabase, taskId: string): PersistedDecision[] {
  return db
    .prepare(
      'SELECT taskId, attemptId, idempotencyKey, payload, deliveryAttempts FROM decisions WHERE taskId = ? ORDER BY seq LIMIT ?'
    )
    .all(taskId, MAX_TASK_RECORDS)
    .map((raw) => parsePersistedDecisionRow(raw, taskId));
}

function loadOutbox(db: ISQLiteDatabase, taskId: string): z.infer<typeof PersistedOutboxSchema>[] {
  return db
    .prepare(
      'SELECT taskId, intentId, payload, status FROM outbox WHERE taskId = ? ORDER BY rowid LIMIT ?'
    )
    .all(taskId, MAX_TASK_RECORDS)
    .map((raw) => {
      const row = outboxRowSchema.parse(raw);
      const value = PersistedOutboxSchema.parse(JSON.parse(row.payload));
      if (
        value.taskId !== taskId ||
        row.taskId !== taskId ||
        value.intentId !== row.intentId ||
        value.status !== row.status
      ) {
        throw new Error('DurablePersistenceIntegrityError: outbox identity/status mismatch');
      }
      return value;
    });
}

function toRecord(value: PersistedDecision): CommittedDecisionRecord {
  const { outboxIntents, ...record } = value;
  return { ...record, outboxIntentIds: outboxIntents.map((intent) => intent.intentId) };
}

/** Input JSON has already been serialized and validated, including receipt metadata. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function inputFingerprint(input: z.infer<typeof DecisionTransitionSchema>): string {
  return canonicalJson({
    ...input,
    outboxIntents: input.outboxIntents.map(({ event, ...intent }) => {
      const { timestamp: _timestamp, ...semantics } = event;
      return { ...intent, event: semantics };
    }),
  });
}

function validateCurrentAttempt(
  input: z.infer<typeof DecisionTransitionSchema>,
  latest: PersistedDecision | undefined,
  admission: boolean
): void {
  validateAttemptOwnership(input, latest, admission);
  const currentState = latest?.toState ?? 'planned';
  if (input.fromState !== undefined && input.fromState !== currentState) {
    throw new Error(
      `StateTransitionConflictError: expected ${input.fromState}, found ${currentState}`
    );
  }
}

function validateAttemptOwnership(
  input: z.infer<typeof DecisionTransitionSchema>,
  latest: PersistedDecision | undefined,
  admission: boolean
): void {
  if (latest !== undefined && input.attemptId !== latest.attemptId) {
    if (!admission)
      throw new Error('StaleAttemptError: superseded attempt cannot change authority');
    if (!FINISHED_STATES.has(latest.toState)) {
      throw new Error('AdmissionConflictError: an unfinished attempt already owns this task');
    }
  }
}

function insertOutbox(db: ISQLiteDatabase, decision: PersistedDecision): void {
  const seen = new Set<string>();
  for (const intent of decision.outboxIntents) {
    if (seen.has(intent.intentId)) throw new Error('OutboxIntentConflictError: repeated intentId');
    seen.add(intent.intentId);
    const existing = db
      .prepare('SELECT intentId FROM outbox WHERE taskId = ? AND intentId = ?')
      .get(decision.taskId, intent.intentId);
    if (existing !== undefined)
      throw new Error('OutboxIntentConflictError: intentId already committed');
    const payload = PersistedOutboxSchema.parse({
      ...intent,
      taskId: decision.taskId,
      attemptId: decision.attemptId,
      idempotencyKey: decision.idempotencyKey,
      createdAt: decision.committedAt,
      status: 'pending',
    });
    db.prepare('INSERT INTO outbox(taskId, intentId, payload, status) VALUES (?, ?, ?, ?)').run(
      decision.taskId,
      intent.intentId,
      JSON.stringify(payload),
      'pending'
    );
  }
}

function persistWithinTransaction(
  db: ISQLiteDatabase,
  input: z.infer<typeof DecisionTransitionSchema>,
  committedAt: number,
  admission: boolean
): { record: CommittedDecisionRecord; deduplicated: boolean } {
  requireBoundedTask(db, input.taskId);
  const history = loadDecisions(db, input.taskId);
  // Validate persisted notification history before accepting any new authority.
  loadOutbox(db, input.taskId);
  const latest = history.at(-1);
  if (!admission && latest !== undefined && latest.attemptId !== input.attemptId) {
    throw new Error('StaleAttemptError: superseded attempt cannot change authority');
  }
  const existing = history.find((decision) => decision.idempotencyKey === input.idempotencyKey);
  if (existing !== undefined) {
    const { committedAt: _at, deliveryAttempts: _count, ...original } = existing;
    if (inputFingerprint(original) !== inputFingerprint(input)) {
      throw new Error('IdempotencyConflictError: reused key has conflicting decision semantics');
    }
    const updated = db
      .prepare(
        'UPDATE decisions SET deliveryAttempts = deliveryAttempts + 1 WHERE taskId = ? AND idempotencyKey = ?'
      )
      .run(input.taskId, input.idempotencyKey);
    if (updated.changes !== 1) {
      throw new Error(
        'DurablePersistenceIntegrityError: duplicate accounting did not update one row'
      );
    }
    return {
      record: toRecord({ ...existing, deliveryAttempts: existing.deliveryAttempts + 1 }),
      deduplicated: true,
    };
  }
  validateCurrentAttempt(input, latest, admission);
  const decision = PersistedDecisionSchema.parse({ ...input, committedAt, deliveryAttempts: 1 });
  db.prepare(
    'INSERT INTO decisions(taskId, attemptId, idempotencyKey, payload, deliveryAttempts) VALUES (?, ?, ?, ?, ?)'
  ).run(input.taskId, input.attemptId, input.idempotencyKey, JSON.stringify(decision), 1);
  insertOutbox(db, decision);
  requireBoundedTask(db, input.taskId);
  return { record: toRecord(decision), deduplicated: false };
}

export function persistDecision(
  config: AuthoritativeDecisionStoreConfig,
  input: DecisionTransitionInput,
  committedAt: number,
  admission = false
): Result<{ record: CommittedDecisionRecord; deduplicated: boolean }, string> {
  try {
    // Serialization failures (cycles, bigint) are ordinary failed persistence, not thrown APIs.
    const serialized = JSON.stringify(input);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_DECISION_INPUT_BYTES) {
      return err('DecisionInputTooLargeError: serialized input exceeds byte limit');
    }
    const validated = DecisionTransitionSchema.parse(JSON.parse(serialized));
    return withDecisionDatabase(config, 'Write', (db) =>
      inTransaction(db, () => persistWithinTransaction(db, validated, committedAt, admission))
    );
  } catch (cause: unknown) {
    return err(`InvalidDecisionInputError: ${errorMessage(cause)}`);
  }
}

export function readDecisionSnapshot(
  config: AuthoritativeDecisionStoreConfig,
  taskId: string
): Result<AuthoritativeTaskSnapshot | null, string> {
  try {
    DecisionIdentifierSchema.parse(taskId);
    statSync(databasePath(config));
  } catch (cause: unknown) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return ok(null);
    return err(`DurablePersistenceReadError: ${errorMessage(cause)}`);
  }
  return withDecisionDatabase(config, 'Read', (db) =>
    inTransaction(
      db,
      () => {
        requireBoundedTask(db, taskId);
        const history = loadDecisions(db, taskId);
        const intents = loadOutbox(db, taskId);
        const latest = history.at(-1);
        if (latest === undefined) {
          if (intents.length > 0)
            throw new Error('DurablePersistenceIntegrityError: orphan outbox intents');
          return null;
        }
        return {
          taskId,
          currentState: latest.toState,
          latestAttemptId: latest.attemptId,
          committedTransitions: history.map(toRecord),
          pendingOutboxIntents: intents.filter((intent) => intent.status === 'pending'),
          dispatchedOutboxIntents: intents.filter((intent) => intent.status === 'dispatched'),
        };
      },
      true
    )
  );
}

export function flushDecisionOutbox(
  config: AuthoritativeDecisionStoreConfig,
  taskId: string,
  now: () => number
): FlushOutboxOutcome {
  if (!DecisionIdentifierSchema.safeParse(taskId).success) {
    return {
      dispatchedIntentIds: [],
      failedIntentIds: [],
      observabilityDegraded: true,
      observabilityError: 'InvalidTaskIdentifierError: unsafe taskId',
    };
  }
  const result = withDecisionDatabase(config, 'Write', (db) => {
    const delivered = inTransaction(db, () => {
      requireBoundedTask(db, taskId);
      return deliverDecisionNotifications(db, config, taskId, now);
    });
    // Telemetry is intentionally outside the committed bus-delivery transaction.
    let telemetryError: string | undefined;
    for (const event of delivered.events) {
      try {
        config.telemetrySink?.(event);
      } catch (cause: unknown) {
        telemetryError ??= errorMessage(cause);
      }
    }
    return {
      ...delivered.outcome,
      ...(telemetryError === undefined
        ? {}
        : {
            observabilityDegraded: true,
            observabilityError: `ObservabilityCollectorError: ${telemetryError}`,
          }),
    };
  });
  return result.ok
    ? result.value
    : {
        dispatchedIntentIds: [],
        failedIntentIds: [],
        observabilityDegraded: true,
        observabilityError: result.error,
      };
}
