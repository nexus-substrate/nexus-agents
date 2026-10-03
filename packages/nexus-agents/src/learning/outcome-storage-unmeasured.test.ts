/** Real SQLite regressions for absent model measurements (#5761). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqliteDatabase } from '../context/open-database.js';
import { SQLiteOutcomeStorage } from './outcome-storage.js';
import type { StoredModelStats } from './outcome-storage-types.js';

describe('stored model measurements (#5761, real SQLite)', () => {
  let storage: SQLiteOutcomeStorage;

  beforeEach(async () => {
    storage = new SQLiteOutcomeStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(openSqliteDatabase(':memory:'));
    const result = await storage.storeDecision({
      id: 'decision',
      traceId: 'trace',
      timestamp: '2026-10-03T00:00:00.000Z',
      routerType: 'linucb',
      selectedModel: 'claude',
      alternativeModels: [],
      confidence: 1,
      reason: 'Regression fixture',
      taskProfile: {},
    });
    expect(result.ok).toBe(true);
  });

  afterEach(() => {
    storage.close();
  });

  async function readStats(): Promise<readonly [StoredModelStats]> {
    const result = await storage.getModelStats();
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(1);
    const first = result.value[0];
    if (first === undefined) throw new Error('Expected the routed model');
    return [first];
  }

  it('returns null for all aggregates when outcomes and rewards are empty', async () => {
    const stats = await readStats();
    expect(stats[0].avgLatencyMs).toBeNull();
    expect(stats[0].avgReward).toBeNull();
    expect(stats[0].avgQualityScore).toBeNull();
    expect(stats[0].successRate).toBeNull();
    expect(stats[0].totalDecisions).toBe(1);
    expect(stats[0].totalOutcomes).toBe(0);
  });

  it('returns no models when routing decisions, outcomes and rewards are empty', async () => {
    storage.close();
    storage.initializeWithDatabase(openSqliteDatabase(':memory:'));
    const result = await storage.getModelStats();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([]);
  });

  it('preserves measured zero outcomes when only rewards are empty', async () => {
    const result = await storage.storeOutcome({
      routingDecisionId: 'decision',
      timestamp: '2026-10-03T00:00:00.000Z',
      outcomeClass: 'error',
      success: false,
      qualityScore: 0,
      durationMs: 0,
      tokenUsage: 0,
    });
    expect(result.ok).toBe(true);
    const stats = await readStats();
    expect(stats[0].avgLatencyMs).toBe(0);
    expect(stats[0].avgQualityScore).toBe(0);
    expect(stats[0].successRate).toBe(0);
    expect(stats[0].avgReward).toBeNull();
    expect(stats[0].totalOutcomes).toBe(1);
  });

  it('preserves normal measured aggregates when neither outcomes nor rewards are empty', async () => {
    const outcome = await storage.storeOutcome({
      routingDecisionId: 'decision',
      timestamp: '2026-10-03T00:00:00.000Z',
      outcomeClass: 'success',
      success: true,
      qualityScore: 0.8,
      durationMs: 1200,
      tokenUsage: 100,
    });
    expect(outcome.ok).toBe(true);
    const reward = await storage.storeReward({
      routingDecisionId: 'decision',
      timestamp: '2026-10-03T00:00:00.000Z',
      reward: 0.75,
      baseReward: 0.75,
      qualityBonus: 0,
      speedBonus: 0,
      efficiencyBonus: 0,
      retryPenalty: 0,
    });
    expect(reward.ok).toBe(true);
    const stats = await readStats();
    expect(stats[0].avgLatencyMs).toBe(1200);
    expect(stats[0].avgQualityScore).toBe(0.8);
    expect(stats[0].avgReward).toBe(0.75);
    expect(stats[0].successRate).toBe(1);
  });
});
