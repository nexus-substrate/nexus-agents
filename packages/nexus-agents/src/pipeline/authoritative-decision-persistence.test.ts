/** Actual SQLite transaction, recovery, and notification tests for T10. */
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISQLiteDatabase } from '../core/types/database-types.js';
import { openSqliteDatabase } from '../context/open-database.js';
import { EventBus } from './event-bus.js';
import {
  flushDecisionOutbox,
  persistDecision,
  readDecisionSnapshot,
} from './authoritative-decision-persistence.js';
import {
  MAX_DECISION_INPUT_BYTES,
  MAX_TASK_PERSISTED_BYTES,
  MAX_TASK_RECORDS,
  type AuthoritativeDecisionStoreConfig,
  type DecisionTransitionInput,
} from './authoritative-decision-types.js';

function transition(overrides: Partial<DecisionTransitionInput> = {}): DecisionTransitionInput {
  return {
    taskId: 'task-sqlite',
    attemptId: 'attempt-one',
    idempotencyKey: 'transition-one',
    toState: 'executing',
    mode: 'enforcing',
    receipts: [{ obligationId: 'review', artifactRef: 'artifact:review', verified: true }],
    outboxIntents: [
      {
        intentId: 'intent-one',
        event: {
          type: 'pipeline.started',
          taskId: 'task-sqlite',
          executionId: 'attempt-one',
          timestamp: 1,
        },
      },
    ],
    ...overrides,
  };
}

function rejectCommit(dbPath: string): ISQLiteDatabase {
  const db = openSqliteDatabase(dbPath);
  return {
    prepare: db.prepare.bind(db),
    close: () => {
      db.close();
    },
    exec: (sql) => {
      if (sql === 'COMMIT') throw new Error('ENOSPC: injected required commit failure');
      db.exec(sql);
    },
  };
}

function mutateAfterDecisionRead(dbPath: string, mutation: () => void): ISQLiteDatabase {
  const db = openSqliteDatabase(dbPath);
  let mutated = false;
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    close: () => {
      db.close();
    },
    prepare<T>(sql: string) {
      const statement = db.prepare<T>(sql);
      return {
        run: statement.run.bind(statement),
        get: statement.get.bind(statement),
        all: (...params: unknown[]) => {
          const rows = statement.all(...params);
          if (!mutated && sql.includes('ORDER BY seq')) {
            mutated = true;
            mutation();
          }
          return rows;
        },
      };
    },
  };
}

describe('authoritative SQLite decision persistence', () => {
  let storageDir: string;
  let config: AuthoritativeDecisionStoreConfig;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), 'nexus-decisions-sqlite-'));
    config = { storageDir };
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  it('reopens an actual durable decision with evidence and its pending notification', () => {
    expect(readDecisionSnapshot(config, 'task-sqlite')).toEqual({ ok: true, value: null });
    expect(persistDecision(config, transition(), 100).ok).toBe(true);

    const snapshot = readDecisionSnapshot({ storageDir }, 'task-sqlite');
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value?.currentState).toBe('executing');
    expect(snapshot.value?.committedTransitions[0]?.receipts).toHaveLength(1);
    expect(snapshot.value?.pendingOutboxIntents).toHaveLength(1);
    expect(snapshot.value?.dispatchedOutboxIntents).toHaveLength(0);
    expect(statSync(join(storageDir, 'decisions.db')).mode & 0o777).toBe(0o600);
    expect(statSync(storageDir).mode & 0o777).toBe(0o700);
  });

  it('preserves an existing configured directory mode while securing the database file', () => {
    chmodSync(storageDir, 0o755);
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    expect(statSync(storageDir).mode & 0o777).toBe(0o755);
    expect(statSync(join(storageDir, 'decisions.db')).mode & 0o777).toBe(0o600);
  });

  it('creates a new dedicated storage directory with private permissions', () => {
    const dedicatedDir = join(storageDir, 'dedicated-decisions');
    expect(persistDecision({ storageDir: dedicatedDir }, transition(), 100).ok).toBe(true);
    expect(statSync(dedicatedDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dedicatedDir, 'decisions.db')).mode & 0o777).toBe(0o600);
  });

  it('rolls back the decision when its outbox intent conflicts with a committed intent', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const conflicting = transition({ idempotencyKey: 'transition-two', toState: 'approved' });
    const outcome = persistDecision(config, conflicting, 200);
    expect(outcome.ok).toBe(false);
    const snapshot = readDecisionSnapshot(config, 'task-sqlite');
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value?.currentState).toBe('executing');
    expect(snapshot.value?.committedTransitions).toHaveLength(1);
    expect(snapshot.value?.pendingOutboxIntents).toHaveLength(1);
  });

  it('rolls back both the transition and intent when the mandatory commit fails', () => {
    const failed = persistDecision({ ...config, openDatabase: rejectCommit }, transition(), 100);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toContain('ENOSPC');
    expect(readDecisionSnapshot(config, 'task-sqlite')).toEqual({ ok: true, value: null });
  });

  it('durably records duplicates while ignoring only notification timestamps', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const duplicate = transition({
      outboxIntents: [
        {
          intentId: 'intent-one',
          event: {
            type: 'pipeline.started',
            taskId: 'task-sqlite',
            executionId: 'attempt-one',
            timestamp: 999,
          },
        },
      ],
    });
    const replay = persistDecision(config, duplicate, 200);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.deduplicated).toBe(true);
    expect(replay.value.record.deliveryAttempts).toBe(2);
    expect(replay.value.record.committedAt).toBe(100);
    const conflicting = persistDecision(config, transition({ reason: 'changed authority' }), 300);
    expect(conflicting.ok).toBe(false);
    const snapshot = readDecisionSnapshot(config, 'task-sqlite');
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.committedTransitions[0]?.deliveryAttempts).toBe(2);
  });

  it('does not report successful duplicate recording when its durable write fails', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const duplicate = persistDecision({ ...config, openDatabase: rejectCommit }, transition(), 200);
    expect(duplicate.ok).toBe(false);
    const snapshot = readDecisionSnapshot(config, 'task-sqlite');
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.committedTransitions[0]?.deliveryAttempts).toBe(1);
  });

  it('distinguishes unavailable storage from an absent task', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const snapshot = readDecisionSnapshot(
      {
        ...config,
        openDatabase: () => {
          throw new Error('SQLITE_CANTOPEN: read denied');
        },
      },
      'task-sqlite'
    );
    expect(snapshot.ok).toBe(false);
    if (!snapshot.ok) expect(snapshot.error).toContain('SQLITE_CANTOPEN');
  });

  it('returns a coherent snapshot when another writer commits between its reads', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const snapshot = readDecisionSnapshot(
      {
        ...config,
        openDatabase: (filePath) =>
          mutateAfterDecisionRead(filePath, () => {
            const completed = transition({
              idempotencyKey: 'finish',
              toState: 'terminal',
              outboxIntents: [
                {
                  intentId: 'intent-two',
                  event: {
                    type: 'pipeline.completed',
                    executionId: 'attempt-one',
                    success: true,
                    durationMs: 1,
                    timestamp: 200,
                  },
                },
              ],
            });
            expect(persistDecision(config, completed, 200).ok).toBe(true);
          }),
      },
      'task-sqlite'
    );
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.committedTransitions).toHaveLength(1);
    expect(snapshot.value?.pendingOutboxIntents).toHaveLength(1);
  });

  it('returns storage-close failures through the read Result instead of throwing', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const result = readDecisionSnapshot(
      {
        ...config,
        openDatabase: (filePath) => {
          const db = openSqliteDatabase(filePath);
          return {
            exec: db.exec.bind(db),
            prepare: db.prepare.bind(db),
            close: () => {
              db.close();
              throw new Error('Database close failed');
            },
          };
        },
      },
      'task-sqlite'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Database close failed');
  });

  it('rejects corrupt persisted payloads instead of reconstructing stale authority', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const db = openSqliteDatabase(join(storageDir, 'decisions.db'));
    try {
      db.prepare('UPDATE decisions SET payload = ? WHERE taskId = ?').run('{broken', 'task-sqlite');
    } finally {
      db.close();
    }
    expect(readDecisionSnapshot(config, 'task-sqlite').ok).toBe(false);
    expect(persistDecision(config, transition({ idempotencyKey: 'next' }), 200).ok).toBe(false);
  });

  it.each(['idempotencyKey', 'attemptId'] as const)(
    'rejects persisted %s that disagrees with its authoritative SQL identity',
    (field) => {
      expect(persistDecision(config, transition(), 100).ok).toBe(true);
      const db = openSqliteDatabase(join(storageDir, 'decisions.db'));
      try {
        db.prepare('UPDATE decisions SET payload = json_set(payload, ?, ?) WHERE taskId = ?').run(
          `$.${field}`,
          'changed-identity',
          'task-sqlite'
        );
      } finally {
        db.close();
      }
      expect(readDecisionSnapshot(config, 'task-sqlite').ok).toBe(false);
      const changed = transition({ [field]: 'changed-identity' });
      expect(persistDecision(config, changed, 200).ok).toBe(false);
    }
  );

  it('fails closed when duplicate accounting updates no authoritative row', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const db = openSqliteDatabase(join(storageDir, 'decisions.db'));
    try {
      db.exec(
        'CREATE TRIGGER suppress_duplicate BEFORE UPDATE ON decisions BEGIN SELECT RAISE(IGNORE); END'
      );
    } finally {
      db.close();
    }
    const duplicate = persistDecision(config, transition(), 200);
    expect(duplicate.ok).toBe(false);
    const snapshot = readDecisionSnapshot(config, 'task-sqlite');
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.committedTransitions[0]?.deliveryAttempts).toBe(1);
  });

  it('compares the expected initial state with planned when the task has no decisions', () => {
    const conflict = persistDecision(config, transition({ fromState: 'ready' }), 100);
    expect(conflict.ok).toBe(false);
    expect(persistDecision(config, transition({ fromState: 'planned' }), 100).ok).toBe(true);
  });

  it('refuses competing admission and fences an old attempt after a genuine retry', () => {
    expect(persistDecision(config, transition(), 100, true).ok).toBe(true);
    const retry = transition({
      attemptId: 'attempt-two',
      idempotencyKey: 'retry-start',
      outboxIntents: [],
    });
    expect(persistDecision(config, retry, 200, true).ok).toBe(false);
    const finish = transition({
      idempotencyKey: 'first-finish',
      toState: 'blocked',
      outboxIntents: [],
    });
    expect(persistDecision(config, finish, 300).ok).toBe(true);
    expect(persistDecision(config, retry, 400, true).ok).toBe(true);
    const stale = transition({
      idempotencyKey: 'stale-finish',
      toState: 'terminal',
      outboxIntents: [],
    });
    expect(persistDecision(config, stale, 500).ok).toBe(false);
    const snapshot = readDecisionSnapshot(config, 'task-sqlite');
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.latestAttemptId).toBe('attempt-two');
    expect(snapshot.value?.currentState).toBe('executing');
  });

  it('keeps intents pending when no delivery bus exists', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    expect(flushDecisionOutbox(config, 'task-sqlite', () => 200).dispatchedIntentIds).toEqual([]);
    const snapshot = readDecisionSnapshot(config, 'task-sqlite');
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.pendingOutboxIntents).toHaveLength(1);
  });

  it('rejects inputs over the serialized byte limit before committing anything', () => {
    const result = persistDecision(
      config,
      transition({ reason: 'x'.repeat(MAX_DECISION_INPUT_BYTES + 1) }),
      100
    );
    expect(result.ok).toBe(false);
    expect(readDecisionSnapshot(config, 'task-sqlite')).toEqual({ ok: true, value: null });
  });

  it('refuses oversized task history rather than returning a partial authoritative snapshot', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const db = openSqliteDatabase(join(storageDir, 'decisions.db'));
    try {
      db.prepare(
        `WITH RECURSIVE copies(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM copies WHERE n < ?)
        INSERT INTO decisions(taskId, attemptId, idempotencyKey, payload, deliveryAttempts)
        SELECT taskId, attemptId, 'copy-' || n, json_set(payload, '$.idempotencyKey', 'copy-' || n), 1
        FROM decisions CROSS JOIN copies WHERE seq = 1`
      ).run(MAX_TASK_RECORDS);
    } finally {
      db.close();
    }
    expect(readDecisionSnapshot(config, 'task-sqlite').ok).toBe(false);
    expect(persistDecision(config, transition({ idempotencyKey: 'new' }), 200).ok).toBe(false);
  });

  it('refuses oversized outbox history instead of silently truncating notification coverage', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const db = openSqliteDatabase(join(storageDir, 'decisions.db'));
    try {
      db.prepare(
        `WITH RECURSIVE copies(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM copies WHERE n < ?)
        INSERT INTO outbox(taskId, intentId, payload, status)
        SELECT taskId, 'copy-' || n, json_set(payload, '$.intentId', 'copy-' || n), 'pending'
        FROM outbox CROSS JOIN copies WHERE intentId = 'intent-one'`
      ).run(MAX_TASK_RECORDS);
    } finally {
      db.close();
    }
    expect(readDecisionSnapshot(config, 'task-sqlite').ok).toBe(false);
    expect(flushDecisionOutbox(config, 'task-sqlite', () => 200).observabilityDegraded).toBe(true);
  });

  it('refuses excess persisted payload bytes before loading an unbounded task into memory', () => {
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const db = openSqliteDatabase(join(storageDir, 'decisions.db'));
    try {
      db.prepare(
        "UPDATE decisions SET payload = json_set(payload, '$.reason', ?) WHERE taskId = ?"
      ).run('x'.repeat(MAX_TASK_PERSISTED_BYTES + 1), 'task-sqlite');
    } finally {
      db.close();
    }
    expect(readDecisionSnapshot(config, 'task-sqlite').ok).toBe(false);
  });

  it('does not replay bus delivery when collector export fails after acknowledgement', () => {
    const bus = new EventBus();
    const delivered = vi.fn();
    const telemetrySink = vi.fn(() => {
      throw new Error('Collector unavailable');
    });
    bus.subscribe({}, delivered);
    config = { ...config, eventBus: bus, telemetrySink };
    expect(persistDecision(config, transition(), 100).ok).toBe(true);
    const flushed = flushDecisionOutbox(config, 'task-sqlite', () => 200);
    expect(flushed.dispatchedIntentIds).toEqual(['intent-one']);
    expect(flushed.observabilityDegraded).toBe(true);
    expect(delivered).toHaveBeenCalledWith(
      expect.objectContaining({ intentId: 'intent-one', attemptId: 'attempt-one' })
    );
    expect(flushDecisionOutbox(config, 'task-sqlite', () => 300).dispatchedIntentIds).toEqual([]);
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(telemetrySink).toHaveBeenCalledTimes(1);
  });
});
