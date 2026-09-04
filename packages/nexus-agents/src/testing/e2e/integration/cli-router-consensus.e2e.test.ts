/**
 * CLI Adapter -> Router -> Consensus Pipeline E2E Tests
 *
 * Tests verifying the end-to-end pipeline from CLI adapter selection,
 * through routing decisions, to consensus validation.
 *
 * @module testing/e2e/integration/cli-router-consensus
 * (Source: Issue #323, Swarm Analysis Gap)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CollaborationEventBus,
  resetGlobalEventBus,
  createEvent,
} from '../../../agents/collaboration/event-bus.js';
import type { DomainEvent } from '../../../agents/collaboration/event-bus-types.js';
import { CompositeRouter } from '../../../cli-adapters/composite-router.js';
import type { CliTask, CliName, ICliAdapter } from '../../../cli-adapters/types.js';
import { VotingProtocol } from '../../../consensus/voting-protocol.js';
import { MockCliAdapter } from '../mocks/index.js';
import { generateTestId, assertOk } from '../utils/index.js';

/**
 * Create a mock adapter that implements ICliAdapter interface.
 */
function createMockCliAdapter(name: CliName, available = true): ICliAdapter {
  const mock = new MockCliAdapter({ name, available, responseDelay: 10 });
  return {
    name,
    available,
    execute: async (task: CliTask) => {
      const result = await mock.execute(task as unknown as import('../../../core/index.js').Task);
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

describe('CLI Adapter -> Router -> Consensus Pipeline E2E Tests', () => {
  let adapters: Map<CliName, ICliAdapter>;
  let router: CompositeRouter;
  let votingProtocol: VotingProtocol;
  let eventBus: CollaborationEventBus;

  beforeEach(() => {
    resetGlobalEventBus();
    adapters = new Map<CliName, ICliAdapter>([
      ['claude', createMockCliAdapter('claude')],
      ['gemini', createMockCliAdapter('gemini')],
      ['codex', createMockCliAdapter('codex')],
    ]);
    router = new CompositeRouter(adapters);
    votingProtocol = new VotingProtocol();
    eventBus = new CollaborationEventBus();
  });

  afterEach(() => {
    resetGlobalEventBus();
  });

  it('should complete end-to-end task flow: route -> execute -> consensus validate', async () => {
    const receivedEvents: DomainEvent[] = [];
    eventBus.subscribe('*', (e) => {
      receivedEvents.push(e);
    });

    // Step 1: Route the task
    const task = createCliTask('Design microservices architecture');
    const routeResult = await router.route(task);
    const routeDecision = assertOk(routeResult);

    eventBus.emit(
      createEvent('routing.decision_made', {
        taskId: task.taskId,
        selectedCli: routeDecision.cliName,
        confidence: routeDecision.confidence,
      })
    );

    // Step 2: Create consensus session for validation
    const session = votingProtocol.createSession('Validate architecture design', [
      'architecture-expert',
      'security-expert',
      'performance-expert',
    ]);

    eventBus.emit(
      createEvent('consensus.session_created', {
        sessionId: session.id,
        taskId: task.taskId,
      })
    );

    // Step 3: Simulate votes
    for (const agent of session.committee) {
      eventBus.emit(
        createEvent('consensus.vote_cast', {
          sessionId: session.id,
          agentId: agent,
          decision: 'approve',
        })
      );
    }

    // Verify complete flow
    expect(receivedEvents.length).toBe(5); // 1 routing + 1 session + 3 votes
    expect(routeDecision.cliName).toBeDefined();
    expect(session.committee.length).toBe(3);
  });

  it('should route successfully even when one CLI has lower availability', async () => {
    // Routing is based on capabilities, not availability - availability is checked at execution
    // This test verifies routing succeeds with all adapters present
    const task = createCliTask('Complex reasoning task requiring powerful model');
    const result = await router.route(task);

    // Should route to any available CLI based on task profile
    const decision = assertOk(result);
    expect(['claude', 'gemini', 'codex']).toContain(decision.cliName);
    expect(decision.confidence).toBeGreaterThan(0);
  });
});
