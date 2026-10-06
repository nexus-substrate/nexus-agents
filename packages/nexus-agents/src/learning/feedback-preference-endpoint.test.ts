/** Endpoint outcomes are not evidence about CLI preference tiers (#7151, #7115). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompositeRouter } from '../cli-adapters/composite-router.js';
import { PreferenceRouter } from '../cli-adapters/preference-router.js';
import type { PreferenceModelStats } from '../cli-adapters/preference-router-types.js';
import type { ICliAdapter, RoutingArmId } from '../cli-adapters/types.js';
import { openSqliteDatabase } from '../context/open-database.js';
import { ok } from '../core/result.js';
import { FeedbackIntegration } from './feedback-integration.js';
import { OutcomeFeedbackCollector } from './outcome-feedback.js';
import { SQLiteOutcomeStorage } from './outcome-storage.js';
import { mapFeedbackRoutingDecision } from './routing-decision-mappers.js';

const ARM = 'api:gw-prod';
const TASK = { content: 'Implement a parser helper function' };

function adapter(name: RoutingArmId): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 64000, codeGeneration: 9, speed: 7, cost: 5 },
    execute: vi.fn().mockResolvedValue(ok({ text: 'response', model: 'model' })),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 64000 }),
    getModelInfo: () => ({ id: 'model', name: 'Model', contextWindow: 64000 }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function preferenceStats(router: PreferenceRouter): Omit<PreferenceModelStats, 'lastUpdatedAt'> {
  const { lastUpdatedAt: _updatedAt, ...stats } = router.getStats();
  return stats;
}

function recordOutcome(feedback: FeedbackIntegration, id: string): void {
  feedback.recordOutcome({
    routingDecisionId: id,
    success: true,
    qualityScore: 0.91,
    durationMs: 137,
    tokenUsage: 241,
  });
}

describe('endpoint preference learning isolation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['strong', 'weak', undefined] as const)(
    'does not train any CLI preference statistics from an endpoint with tier %j',
    (selectedTier) => {
      const preference = new PreferenceRouter();
      preference.recordPreference(TASK.content, true, 0.9, 0.5);
      preference.recordPreference('Summarize this text', false, 0.6, 0.8);
      const before = preferenceStats(preference);
      const collector = new OutcomeFeedbackCollector();
      collector.registerPreferenceRouter(preference);
      collector.recordRoutingDecision({
        id: 'endpoint-decision',
        traceId: 'endpoint-trace',
        timestamp: new Date().toISOString(),
        query: TASK.content,
        selectedModel: ARM,
        selectedTier,
        routerType: 'preference',
        routerTypeMeasured: true,
      });
      const pending = collector.getPendingDecisions()[0];
      collector.processOutcome('endpoint-trace', {
        timestamp: new Date().toISOString(),
        traceId: 'endpoint-trace',
        success: true,
        outcomeClass: 'success',
        qualityScore: 0.91,
        durationMs: 137,
        tokenUsage: 241,
        qualitySignals: { completionRatio: 1, retryCount: 0 },
      });
      expect(preferenceStats(preference)).toEqual(before);
      expect(pending).toMatchObject({
        selectedModel: ARM,
        selectedTier: undefined,
        routerType: 'unattributed',
        routerTypeMeasured: false,
      });
      expect(collector.getStats().totalOutcomes).toBe(1);
      expect(collector.getStats().decisionsByRouter).toMatchObject({
        preference: 0,
        unattributed: 1,
      });
    }
  );

  it.each(['strong', 'weak'] as const)('still trains a CLI outcome in its %s tier', (tier) => {
    const preference = new PreferenceRouter();
    const collector = new OutcomeFeedbackCollector();
    collector.registerPreferenceRouter(preference);
    collector.recordRoutingDecision({
      id: 'cli-decision',
      traceId: 'cli-trace',
      timestamp: new Date().toISOString(),
      query: TASK.content,
      selectedModel: tier === 'strong' ? 'claude' : 'gemini',
      selectedTier: tier,
      routerType: 'preference',
      routerTypeMeasured: true,
    });
    collector.processOutcome('cli-trace', {
      timestamp: new Date().toISOString(),
      traceId: 'cli-trace',
      success: true,
      outcomeClass: 'success',
      qualityScore: 0.91,
      durationMs: 137,
      tokenUsage: 241,
      qualitySignals: { completionRatio: 1, retryCount: 0 },
    });
    expect(preference.getStats()).toMatchObject({
      totalDataPoints: 1,
      strongModelPreferenceRate: tier === 'strong' ? 1 : 0,
      estimatedCostSavingsRate: tier === 'weak' ? 1 : 0,
    });
  });

  it('does not attribute an endpoint fallback to measured CLI preference routing', async () => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    const router = new CompositeRouter(new Map([[ARM, adapter(ARM)]]), {
      enablePreferenceRouting: true,
      preferenceRouterConfig: { minDataPoints: 1 },
      enableLinUCBSelection: false,
      enableTopsisRanking: false,
      enableZeroRouter: false,
      enableBudgetFilter: false,
      enableCapacityBalancing: false,
      enableRoutingMemory: false,
      enableStrategyDistillation: false,
    });
    router.recordPreference(TASK.content, true);
    const routed = await router.route(TASK);
    if (!routed.ok) throw routed.error;
    expect(routed.value.stagesExecuted).toContain('preference-routing');
    const mapped = mapFeedbackRoutingDecision(routed.value, {
      id: 'mapped-endpoint',
      traceId: 'mapped-trace',
      timestamp: new Date().toISOString(),
      query: TASK.content,
      routerType: 'unattributed',
      routerTypeMeasured: false,
    });
    expect(mapped.selectedTier).toBeUndefined();
    const collector = new OutcomeFeedbackCollector();
    const preference = new PreferenceRouter();
    collector.registerPreferenceRouter(preference);
    const storage = new SQLiteOutcomeStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(openSqliteDatabase(':memory:'));
    const feedback = new FeedbackIntegration(
      { enablePersistence: true, outcomeStorage: storage },
      collector
    );
    const id = feedback.recordRoutingDecision(routed.value, undefined, { query: TASK.content });
    expect(collector.getPendingDecisions()[0]).toMatchObject({
      selectedModel: ARM,
      selectedTier: undefined,
      routerType: 'unattributed',
      routerTypeMeasured: false,
    });
    recordOutcome(feedback, id);
    expect(preference.getStats().totalDataPoints).toBe(0);
    expect(feedback.getStats().decisionsByRouter.preference).toBe(0);
    try {
      const stored = await storage.getDecision(id);
      if (!stored.ok) throw stored.error;
      expect(stored.value).toMatchObject({
        selectedModel: ARM,
        routerType: 'unattributed',
        routerTypeMeasured: false,
      });
    } finally {
      storage.close();
    }
  });

  it('retains endpoint learning in LinUCB and stored outcomes under its own arm', async () => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    const router = new CompositeRouter(
      new Map([
        [ARM, adapter(ARM)],
        ['opencode', adapter('opencode')],
      ])
    );
    const storage = new SQLiteOutcomeStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(openSqliteDatabase(':memory:'));
    try {
      const endpointOnly = new CompositeRouter(new Map([[ARM, adapter(ARM)]]), {
        enableBudgetFilter: false,
      });
      const routed = await endpointOnly.route(TASK);
      if (!routed.ok) throw routed.error;
      const preference = new PreferenceRouter();
      const collector = new OutcomeFeedbackCollector();
      collector.registerPreferenceRouter(preference);
      const feedback = new FeedbackIntegration(
        { enablePersistence: true, outcomeStorage: storage },
        collector
      );
      feedback.registerCompositeRouter(router);
      const before = router.getStats().banditStats;
      const id = feedback.recordRoutingDecision(routed.value, undefined, { query: TASK.content });
      recordOutcome(feedback, id);
      const after = router.getStats().banditStats;
      expect(after.find((arm) => arm.name === ARM)?.pullCount).toBe(
        (before.find((arm) => arm.name === ARM)?.pullCount ?? 0) + 1
      );
      expect(after.find((arm) => arm.name === 'opencode')).toEqual(
        before.find((arm) => arm.name === 'opencode')
      );
      expect(preference.getStats().totalDataPoints).toBe(0);
      const storedDecision = await storage.getDecision(id);
      const storedOutcome = await storage.getOutcome(id);
      if (!storedDecision.ok) throw storedDecision.error;
      if (!storedOutcome.ok) throw storedOutcome.error;
      expect(storedDecision.value?.selectedModel).toBe(ARM);
      expect(storedOutcome.value).toMatchObject({ routingDecisionId: id, success: true });
    } finally {
      storage.close();
    }
  });
});
