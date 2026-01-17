/**
 * Cross-Subsystem Integration E2E Tests
 *
 * Tests that verify interactions between ALL major subsystems working together.
 * This file contains end-to-end orchestration tests requiring: Routing, Memory,
 * Consensus, EventBus, Workflow, Agent, and Context Pruner to coordinate.
 *
 * For focused integration tests (2-3 subsystems), see:
 * - routing-memory.e2e.test.ts: Routing -> Memory Integration
 * - consensus-eventbus.e2e.test.ts: Consensus -> EventBus, SwarmObserver -> EventBus
 * - workflow-agent.e2e.test.ts: Workflow -> Agent, Memory -> Context Pruner
 * - cli-router-consensus.e2e.test.ts: CLI Adapter -> Router -> Consensus Pipeline
 *
 * @module testing/e2e/integration/cross-subsystem
 * (Source: Issue #323, Swarm Analysis Gap)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EventBus,
  resetGlobalEventBus,
  createEvent,
} from '../../../agents/collaboration/event-bus.js';
import { SwarmObserver, createSwarmObserver } from '../../../observability/swarm-observer.js';
import { CompositeRouter } from '../../../cli-adapters/composite-router.js';
import type { CliTask, CliName, ICliAdapter, CliResponse } from '../../../cli-adapters/types.js';
import type { Task, Result } from '../../../core/index.js';
import { FeedbackIntegration } from '../../../learning/feedback-integration.js';
import { ContextManager, ContentPriority } from '../../../agents/index.js';
import { MockCliAdapter } from '../mocks/index.js';
import { generateTestId, measureLatency, assertOk } from '../utils/index.js';

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
 * Test task with an ID for tracking (extends CliTask semantically).
 */
interface TestCliTask extends CliTask {
  readonly taskId: string;
}

/**
 * Create a CLI task for testing with a tracking ID.
 */
function createCliTask(description: string, id?: string): TestCliTask {
  return {
    taskId: id ?? generateTestId('task'),
    content: description,
    maxTokens: 1000,
  };
}

describe('End-to-End Multi-Subsystem Orchestration', () => {
  let adapters: Map<CliName, ICliAdapter>;
  let router: CompositeRouter;
  let feedback: FeedbackIntegration;
  let observer: SwarmObserver;
  let eventBus: EventBus;
  let contextManager: ContextManager;

  beforeEach(() => {
    resetGlobalEventBus();
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
    feedback = new FeedbackIntegration();
    feedback.registerCompositeRouter(router);
    observer = createSwarmObserver() as SwarmObserver;
    eventBus = new EventBus();
    contextManager = new ContextManager({ maxTokens: 10000 });
  });

  afterEach(() => {
    observer.clear();
    resetGlobalEventBus();
  });

  it('should orchestrate complete task lifecycle across all subsystems', async () => {
    const { ms } = await measureLatency(async () => {
      // 1. Create task context
      await contextManager.add({
        id: 'task-description',
        content: 'Implement secure authentication module',
        priority: ContentPriority.TASK,
        category: 'task',
      });

      // 2. Route task
      const task = createCliTask('Implement secure authentication module');
      const routeResult = await router.route(task);
      const routeDecision = assertOk(routeResult);

      // 3. Record routing decision
      const decisionId = feedback.recordRoutingDecision(routeDecision);

      // 4. Record agent interactions
      observer.recordInteraction({
        from: 'orchestrator',
        to: routeDecision.cliName,
        interactionType: 'delegation',
        outcome: 'success',
        traceId: SwarmObserver.generateTraceId(),
      });

      // 5. Emit events
      eventBus.emit(
        createEvent('task.started', {
          taskId: task.taskId,
          selectedCli: routeDecision.cliName,
        })
      );

      // 6. Record outcome
      feedback.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 200,
        tokenUsage: 800,
      });

      // 7. Add result to context
      await contextManager.add({
        id: 'task-result',
        content: 'Authentication module implemented with JWT tokens',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      eventBus.emit(createEvent('task.completed', { taskId: task.taskId, success: true }));
    });

    // Verify all subsystems were engaged
    const routerStats = router.getStats();
    const feedbackStats = feedback.getStats();
    const observerMetrics = observer.getHealthMetrics();
    const contextStats = contextManager.getStats();
    const eventHistory = eventBus.getHistory();

    expect(routerStats.totalDecisions).toBe(1);
    expect(feedbackStats.totalOutcomes).toBe(1);
    expect(observerMetrics.totalInteractions).toBeGreaterThanOrEqual(1);
    expect(contextStats.itemCounts['task']).toBeGreaterThanOrEqual(1);
    expect(eventHistory.length).toBe(2);
    expect(ms).toBeLessThan(1000);
  });

  it('should handle failure gracefully across subsystems', async () => {
    const task = createCliTask('Complex task that may fail');
    const routeResult = await router.route(task);
    const routeDecision = assertOk(routeResult);

    const decisionId = feedback.recordRoutingDecision(routeDecision);

    // Record failure outcome
    feedback.recordOutcome({
      routingDecisionId: decisionId,
      success: false,
      qualityScore: 0.0,
      durationMs: 500,
      tokenUsage: 100,
    });

    observer.recordInteraction({
      from: 'orchestrator',
      to: routeDecision.cliName,
      interactionType: 'delegation',
      outcome: 'failure',
      traceId: SwarmObserver.generateTraceId(),
    });

    eventBus.emit(
      createEvent('task.failed', {
        taskId: task.taskId,
        error: 'timeout',
      })
    );

    // System should remain stable
    const feedbackStats = feedback.getStats();
    expect(feedbackStats.totalOutcomes).toBe(1);
    expect(router.getStats().totalDecisions).toBe(1);
  });
});

describe('Performance: Cross-Subsystem Latency', () => {
  it('should complete routing + feedback recording under 100ms', async () => {
    const adapters = new Map<CliName, ICliAdapter>([
      ['claude', createMockCliAdapter('claude')],
      ['gemini', createMockCliAdapter('gemini')],
      ['codex', createMockCliAdapter('codex')],
    ]);
    const router = new CompositeRouter(adapters);
    const feedback = new FeedbackIntegration();
    feedback.registerCompositeRouter(router);

    const task = createCliTask('Quick routing test');

    const { ms } = await measureLatency(async () => {
      const result = await router.route(task);
      const decision = assertOk(result);
      const id = feedback.recordRoutingDecision(decision);
      feedback.recordOutcome({
        routingDecisionId: id,
        success: true,
        qualityScore: 0.9,
        durationMs: 50,
        tokenUsage: 100,
      });
    });

    expect(ms).toBeLessThan(100);
  });

  it('should handle concurrent cross-subsystem operations', async () => {
    const adapters = new Map<CliName, ICliAdapter>([
      ['claude', createMockCliAdapter('claude')],
      ['gemini', createMockCliAdapter('gemini')],
      ['codex', createMockCliAdapter('codex')],
    ]);
    const router = new CompositeRouter(adapters);
    const eventBus = new EventBus();

    const tasks = Array.from({ length: 10 }, (_, i) =>
      createCliTask(`Concurrent task ${String(i)}`)
    );

    const { ms } = await measureLatency(async () => {
      await Promise.all(
        tasks.map(async (task) => {
          const result = await router.route(task);
          const decision = assertOk(result);
          eventBus.emit(
            createEvent('task.routed', {
              taskId: task.taskId,
              cli: decision.cliName,
            })
          );
        })
      );
    });

    expect(router.getStats().totalDecisions).toBe(10);
    expect(eventBus.getHistory().length).toBe(10);
    expect(ms).toBeLessThan(500);
  });
});
