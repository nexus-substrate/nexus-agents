/**
 * Aegean Consensus Protocol E2E Test Utilities
 *
 * Shared utilities for Aegean E2E tests. Provides mock factories
 * and helper functions for testing the Byzantine-fault-tolerant
 * consensus protocol.
 *
 * @module testing/e2e/consensus/aegean-test-utils
 */

import { vi } from 'vitest';
import type { IAgent, Task } from '../../../core/index.js';
import { ok, err, AgentError } from '../../../core/index.js';
import type { CollaborationConfig } from '../../../agents/collaboration/collaboration-types.js';
import type { IEventBus, TypedEvent } from '../../../agents/collaboration/event-bus-types.js';
import { generateTestId } from '../utils/index.js';

// =============================================================================
// Mock EventBus
// =============================================================================

/** Mock EventBus with event tracking for testing. */
export interface MockEventBus extends IEventBus {
  emittedEvents: TypedEvent[];
}

/** Creates a mock EventBus for tracking emitted events. */
export function createMockEventBus(): MockEventBus {
  const emittedEvents: TypedEvent[] = [];
  return {
    emittedEvents,
    emit: vi.fn((event: TypedEvent) => {
      emittedEvents.push(event);
    }),
    emitAsync: vi.fn((event: TypedEvent) => {
      emittedEvents.push(event);
      return Promise.resolve();
    }),
    subscribe: vi.fn(() => ({ id: 'sub-1', pattern: '*', unsubscribe: vi.fn() })),
    unsubscribe: vi.fn(),
    getHistory: vi.fn(() => []),
    clearHistory: vi.fn(),
    getStats: vi.fn(() => ({
      eventsEmitted: 0,
      subscriptionsCreated: 0,
      activeSubscriptions: 0,
      historySize: 0,
      errorCount: 0,
    })),
    hasSubscribers: vi.fn(() => false),
  };
}

// =============================================================================
// Agent Factories
// =============================================================================

/** Agent behavior configuration for simulating different voting patterns. */
export interface AgentBehavior {
  readonly proposalOutput: unknown;
  readonly voteOutput: 'ACCEPT' | 'REJECT' | 'timeout';
  readonly delayMs?: number;
  readonly failOnRound?: number;
}

/** Creates a mock agent with configurable behavior. */
export function createConfigurableAgent(id: string, behavior: AgentBehavior): IAgent {
  let callCount = 0;
  return {
    id,
    role: 'code_expert',
    capabilities: [],
    state: 'idle',
    execute: vi.fn().mockImplementation(async (task: Task) => {
      callCount++;
      if (behavior.delayMs !== undefined && behavior.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
      }
      if (behavior.failOnRound !== undefined && callCount > behavior.failOnRound) {
        return err(new AgentError(`Simulated failure on round ${String(callCount)}`));
      }
      const isProposalTask = task.description.includes('propose');
      const output = isProposalTask ? behavior.proposalOutput : behavior.voteOutput;
      return ok({
        taskId: task.id,
        output,
        metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
      });
    }),
    handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'msg', status: 'completed' })),
    initialize: vi.fn().mockResolvedValue(ok(undefined)),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a simple mock agent that accepts all proposals. */
export function createAcceptingAgent(id: string, proposalOutput: unknown): IAgent {
  return createConfigurableAgent(id, { proposalOutput, voteOutput: 'ACCEPT' });
}

/** Creates a mock agent that rejects all proposals. */
export function createRejectingAgent(id: string, proposalOutput: unknown): IAgent {
  return createConfigurableAgent(id, { proposalOutput, voteOutput: 'REJECT' });
}

/** Creates a failing agent that returns an error. */
export function createFailingAgent(id: string): IAgent {
  return {
    id,
    role: 'code_expert',
    capabilities: [],
    state: 'idle',
    execute: vi.fn().mockResolvedValue(err(new AgentError('Agent execution failed'))),
    handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'msg', status: 'completed' })),
    initialize: vi.fn().mockResolvedValue(ok(undefined)),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Configuration Factories
// =============================================================================

/** Creates a test collaboration config for Aegean protocol. */
export function createTestConfig(experts: string[], sessionId?: string): CollaborationConfig {
  return {
    sessionId: sessionId ?? generateTestId('aegean-e2e'),
    pattern: 'aegean',
    experts,
    task: {
      id: generateTestId('task'),
      description: 'E2E test task for Aegean consensus',
      context: { metadata: { testMode: true } },
    },
  };
}

// =============================================================================
// Result Extractors
// =============================================================================

/** Output shape from Aegean protocol. */
interface AegeanOutput {
  consensusValue?: unknown;
  aegean?: {
    rounds: number;
    consensusReached: boolean;
    terminationReason: string;
  };
}

/** Extracts Aegean result data from collaboration result. */
export function extractAegeanOutput(result: unknown): AegeanOutput | null {
  const typed = result as { aggregatedResult?: { output?: AegeanOutput } };
  const output = typed.aggregatedResult?.output;
  return output ?? null;
}

/** Checks if consensus was reached from the result. */
export function wasConsensusReached(result: unknown): boolean {
  const output = extractAegeanOutput(result);
  return output?.aegean?.consensusReached === true;
}

/** Gets the number of rounds from the result. */
export function getRoundCount(result: unknown): number {
  const output = extractAegeanOutput(result);
  return output?.aegean?.rounds ?? 0;
}
