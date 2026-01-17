/**
 * Routing -> Memory Integration E2E Tests
 *
 * Tests verifying the integration between routing decisions and memory/feedback systems.
 *
 * @module testing/e2e/integration/routing-memory
 * (Source: Issue #323, Swarm Analysis Gap)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CompositeRouter } from '../../../cli-adapters/composite-router.js';
import type { CliTask, CliName, ICliAdapter, CliResponse } from '../../../cli-adapters/types.js';
import type { Task, Result } from '../../../core/index.js';
import { FeedbackIntegration } from '../../../learning/feedback-integration.js';
import { MockCliAdapter } from '../mocks/index.js';
import { assertOk } from '../utils/index.js';

/**
 * Create a mock adapter that implements ICliAdapter interface.
 */
function createMockCliAdapter(name: CliName, available = true): ICliAdapter {
  const mock = new MockCliAdapter({ name, available, responseDelay: 10 });
  return {
    name,
    available,
    execute: async (task: CliTask): Promise<Result<CliResponse, Error>> => {
      const result = await mock.execute(task as unknown as Task);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return {
        ok: true,
        value: {
          text: result.value.content,
          usage: { inputTokens: 0, outputTokens: result.value.tokensUsed },
          model: name,
        },
      };
    },
    healthCheck: () => mock.healthCheck(),
    getCapabilities: () => ({
      reasoning: name === 'claude' ? 9 : 7,
      contextWindow: name === 'gemini' ? 1000000 : 200000,
      codeGeneration: name === 'codex' ? 9 : 7,
      speed: name === 'codex' ? 9 : 6,
      cost: name === 'gemini' ? 9 : 5,
    }),
  } as unknown as ICliAdapter;
}

/**
 * Create a CLI task for testing.
 */
function createCliTask(description: string): CliTask {
  return {
    content: description,
    maxTokens: 1000,
  };
}

describe('Routing -> Memory Integration E2E Tests', () => {
  let router: CompositeRouter;
  let feedback: FeedbackIntegration;
  let adapters: Map<CliName, ICliAdapter>;

  beforeEach(() => {
    adapters = new Map<CliName, ICliAdapter>([
      ['claude', createMockCliAdapter('claude')],
      ['gemini', createMockCliAdapter('gemini')],
      ['codex', createMockCliAdapter('codex')],
    ]);
    router = new CompositeRouter(adapters, {
      enableBudgetFilter: true,
      enableTopsisRanking: true,
      enableLinUCBSelection: true,
    });
    feedback = new FeedbackIntegration({ enableAutoFeedback: true });
    feedback.registerCompositeRouter(router);
  });

  it('should record routing decisions for later feedback', async () => {
    const task = createCliTask('Review TypeScript code for security issues');
    const routeResult = await router.route(task);

    const decision = assertOk(routeResult);
    const decisionId = feedback.recordRoutingDecision(decision);

    expect(decisionId).toBeDefined();
    expect(typeof decisionId).toBe('string');
    expect(decisionId.length).toBeGreaterThan(0);
  });

  it('should feed outcome back to router and update learning', async () => {
    const task = createCliTask('Implement sorting algorithm');
    const routeResult = await router.route(task);
    const decision = assertOk(routeResult);

    const decisionId = feedback.recordRoutingDecision(decision);

    // Simulate successful outcome
    feedback.recordOutcome({
      routingDecisionId: decisionId,
      success: true,
      qualityScore: 0.9,
      durationMs: 150,
      tokenUsage: 500,
    });

    // Stats should reflect the recorded outcome
    const stats = feedback.getStats();
    expect(stats.totalOutcomes).toBeGreaterThanOrEqual(1);
  });

  it('should track routing effectiveness across multiple decisions', async () => {
    const tasks = [
      createCliTask('Write unit tests'),
      createCliTask('Refactor database layer'),
      createCliTask('Add API documentation'),
    ];

    for (const task of tasks) {
      const result = await router.route(task);
      const decision = assertOk(result);
      const decisionId = feedback.recordRoutingDecision(decision);
      feedback.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.85,
        durationMs: 100 + Math.random() * 100,
        tokenUsage: 200 + Math.floor(Math.random() * 300),
      });
    }

    const routerStats = router.getStats();
    expect(routerStats.totalDecisions).toBe(3);
  });
});
