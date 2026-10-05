/** Stored router attribution regressions (#5914, real SQLite). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { openSqliteDatabase } from '../context/open-database.js';
import { SQLiteOutcomeStorage } from './outcome-storage.js';
import { OutcomeStorageError } from './outcome-storage-types.js';
import type { ISQLiteDatabase } from './outcome-storage-types.js';

const readers = [
  {
    name: 'getDecision',
    expectedCount: 1,
    read: (storage: SQLiteOutcomeStorage) => storage.getDecision('corrupt'),
  },
  {
    name: 'getRecentDecisions',
    expectedCount: 2,
    read: (storage: SQLiteOutcomeStorage) => storage.getRecentDecisions('claude', 10),
  },
  {
    name: 'getDecisionsByRequestId',
    expectedCount: 2,
    read: (storage: SQLiteOutcomeStorage) => storage.getDecisionsByRequestId('request'),
  },
];

describe('stored router labels (#5914, real SQLite)', () => {
  let storage: SQLiteOutcomeStorage;
  let db: ISQLiteDatabase;

  beforeEach(async () => {
    db = openSqliteDatabase(':memory:');
    storage = new SQLiteOutcomeStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(db);
    for (const id of ['clean', 'corrupt']) {
      const result = await storage.storeDecision({
        id,
        traceId: 'trace',
        timestamp: '2026-10-03T00:00:00.000Z',
        routerType: 'linucb',
        routerTypeMeasured: true,
        selectedModel: 'claude',
        alternativeModels: [],
        confidence: 1,
        reason: 'Regression fixture',
        taskProfile: {},
        requestId: 'request',
      });
      expect(result.ok).toBe(true);
    }
  });

  afterEach(() => {
    storage.close();
  });

  describe.each(['unknown', 'composite', ''])('invalid stored label %j', (label) => {
    it.each(readers)('$name returns a typed error even with measured=1', async ({ read }) => {
      db.prepare('UPDATE routing_decisions SET router_type = ? WHERE id = ?').run(label, 'corrupt');
      const result = await read(storage);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Invalid attribution was returned successfully');
      expect(result.error).toBeInstanceOf(OutcomeStorageError);
      expect(result.error.cause).toBeInstanceOf(ZodError);
    });
  });

  it.each(readers)(
    '$name returns an intact collection when all labels are valid',
    async ({ read, expectedCount }) => {
      const result = await read(storage);
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      const decisions = Array.isArray(result.value) ? result.value : [result.value];
      expect(decisions).toHaveLength(expectedCount);
      for (const decision of decisions) {
        expect(decision).toMatchObject({ routerType: 'linucb', routerTypeMeasured: true });
      }
    }
  );
});
