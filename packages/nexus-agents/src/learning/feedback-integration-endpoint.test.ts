/** Endpoint routing provenance through the real observer and SQLite sinks (#7151). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationEventBus } from '../agents/collaboration/event-bus.js';
import { OrchestrationObserver } from '../agents/observability/orchestration-observer.js';
import { CompositeRouter } from '../cli-adapters/composite-router.js';
import type { CompositeRoutingDecision } from '../cli-adapters/composite-router-types.js';
import type { CliTask, ICliAdapter, RoutingArmId } from '../cli-adapters/types.js';
import { openSqliteDatabase } from '../context/open-database.js';
import { ok } from '../core/result.js';
import { FeedbackIntegration } from './feedback-integration.js';
import { OutcomeFeedbackCollector } from './outcome-feedback.js';
import { SQLiteOutcomeStorage } from './outcome-storage.js';

function endpointAdapter(): ICliAdapter {
  return {
    name: 'api:gw-prod',
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 64000, codeGeneration: 9, speed: 7, cost: 5 },
    execute: vi.fn().mockResolvedValue(ok({ text: 'gateway response', model: 'gateway-model' })),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 64000 }),
    getModelInfo: () => ({ id: 'gateway-model', name: 'Gateway model', contextWindow: 64000 }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

describe('endpoint routing record fidelity (#7151)', () => {
  let observer: OrchestrationObserver;
  let router: CompositeRouter;
  let storage: SQLiteOutcomeStorage;

  beforeEach(() => {
    observer = new OrchestrationObserver(new CollaborationEventBus());
    router = new CompositeRouter(
      new Map<RoutingArmId, ICliAdapter>([['api:gw-prod', endpointAdapter()]]),
      {
        orchestrationObserver: observer,
        enableBudgetFilter: false,
        enableZeroRouter: false,
        enableTopsisRanking: false,
        enableLinUCBSelection: false,
        enableCapacityBalancing: false,
        enableRoutingMemory: false,
        enableStrategyDistillation: false,
      }
    );
    storage = new SQLiteOutcomeStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(openSqliteDatabase(':memory:'));
  });

  afterEach(() => {
    storage.close();
    observer.stop();
  });

  async function endpointDecision(
    task: CliTask = { content: 'Write a small helper function' }
  ): Promise<CompositeRoutingDecision> {
    const result = await router.route(task);
    if (!result.ok) throw result.error;
    expect(result.value.cliName).toBe('api:gw-prod');
    return result.value;
  }

  it('records the endpoint arm in the observer history and distribution', async () => {
    const task = { content: 'Write a small helper function' };
    const result = await router.executeTask(task);
    expect(result.ok).toBe(true);
    expect(observer.getRoutingHistory()).toHaveLength(1);
    expect(observer.getRoutingHistory()[0]?.selectedCli).toBe('api:gw-prod');
    expect(observer.getStats().routingDistribution).toMatchObject({
      'api:gw-prod': 1,
      opencode: 0,
    });
  });

  it('records the endpoint arm in FeedbackIntegration and real SQLite', async () => {
    const collector = new OutcomeFeedbackCollector();
    const feedback = new FeedbackIntegration(
      { enablePersistence: true, outcomeStorage: storage },
      collector
    );
    const id = feedback.recordRoutingDecision(await endpointDecision());
    expect(collector.getPendingDecisions()[0]?.selectedModel).toBe('api:gw-prod');
    const result = await storage.getDecision(id);
    if (!result.ok) throw result.error;
    expect(result.value?.selectedModel).toBe('api:gw-prod');
  });

  it('preserves endpoint alternatives in observer history and SQLite', async () => {
    const task = { content: 'Write a helper' };
    const decision = {
      ...(await endpointDecision(task)),
      alternatives: ['api:gw-backup'] as const,
    };
    const result = await router.executeDecision(decision, task);
    expect(result.ok).toBe(true);
    expect(observer.getRoutingHistory()[0]?.alternatives).toEqual(['api:gw-backup']);
    const feedback = new FeedbackIntegration({ enablePersistence: true, outcomeStorage: storage });
    const id = feedback.recordRoutingDecision(decision);
    const stored = await storage.getDecision(id);
    if (!stored.ok) throw stored.error;
    expect(stored.value?.alternativeModels).toEqual(['api:gw-backup']);
  });
});
