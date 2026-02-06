/**
 * Tests for Puppeteer Orchestration Events
 * @module agents/orchestration/puppeteer-events.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { IEventBus, DomainEvent } from '../collaboration/event-bus-types.js';
import type { Task } from '../../core/index.js';
import type {
  PuppeteerResult,
  PuppeteerStepResult,
  EmergentPatterns,
  PuppeteerMetrics,
  AgentStepOutput,
  AgentDistribution,
  PuppeteerStateMetadata,
} from './puppeteer-types.js';
import {
  PuppeteerTopics,
  emitPuppeteerStarted,
  emitPuppeteerStepCompleted,
  emitPuppeteerCompleted,
  emitPuppeteerError,
  emitPuppeteerPatternDetected,
} from './puppeteer-events.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockEventBus() {
  const events: DomainEvent[] = [];
  const bus: IEventBus = {
    emit: vi.fn((event: DomainEvent) => {
      events.push(event);
    }),
    emitAsync: vi.fn().mockReturnValue(Promise.resolve()),
    subscribe: vi.fn().mockReturnValue({ id: 'sub-1', pattern: '*', unsubscribe: vi.fn() }),
    unsubscribe: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      eventsEmitted: 0,
      subscriptionsCreated: 0,
      activeSubscriptions: 0,
      historySize: 0,
      errorCount: 0,
    }),
    hasSubscribers: vi.fn().mockReturnValue(false),
  };
  return { bus, events };
}

function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    description: 'Test task for orchestration',
    ...overrides,
  } as Task;
}

function createMockMetadata(): PuppeteerStateMetadata {
  return {
    progress: 0.5,
    totalCost: 0.01,
    totalTokens: 500,
    elapsedMs: 2000,
    startedAt: '2025-01-01T00:00:00Z',
  };
}

function createMockAgentOutput(): AgentStepOutput {
  return {
    step: 0,
    agentId: 'code-expert',
    output: 'result',
    durationMs: 1500,
    tokensUsed: 250,
    model: 'claude-sonnet-4',
  };
}

function createMockDistribution(): AgentDistribution {
  return {
    probabilities: new Map([
      ['code-expert', 0.6],
      ['security-expert', 0.3],
      ['docs-expert', 0.1],
    ]),
    rawScores: new Map([
      ['code-expert', 0.9],
      ['security-expert', 0.5],
      ['docs-expert', 0.2],
    ]),
    reasoning: 'Code expert best matches task requirements',
  };
}

function createMockEmergentPatterns(): EmergentPatterns {
  return {
    hubAgents: [
      { agentId: 'code-expert', activationCount: 5, percentage: 0.6 },
      { agentId: 'security-expert', activationCount: 2, percentage: 0.25 },
    ],
    cycles: [{ agents: ['code-expert', 'security-expert'], occurrences: 2 }],
    graphDensity: 0.45,
    cyclicalityScore: 0.3,
  };
}

function createMockMetrics(): PuppeteerMetrics {
  return {
    avgReward: 0.8,
    taskCompletionRate: 0.9,
    efficiencyScore: 0.5,
    compactionScore: 0.6,
    cyclicalityScore: 0.3,
  };
}

// ============================================================================
// PuppeteerTopics
// ============================================================================

describe('PuppeteerTopics', () => {
  it('defines STARTED topic', () => {
    expect(PuppeteerTopics.STARTED).toBe('puppeteer.started');
  });

  it('defines STEP_COMPLETED topic', () => {
    expect(PuppeteerTopics.STEP_COMPLETED).toBe('puppeteer.step.completed');
  });

  it('defines AGENT_SELECTED topic', () => {
    expect(PuppeteerTopics.AGENT_SELECTED).toBe('puppeteer.agent.selected');
  });

  it('defines STATE_UPDATED topic', () => {
    expect(PuppeteerTopics.STATE_UPDATED).toBe('puppeteer.state.updated');
  });

  it('defines PATTERN_DETECTED topic', () => {
    expect(PuppeteerTopics.PATTERN_DETECTED).toBe('puppeteer.pattern.detected');
  });

  it('defines COMPLETED topic', () => {
    expect(PuppeteerTopics.COMPLETED).toBe('puppeteer.completed');
  });

  it('defines ERROR topic', () => {
    expect(PuppeteerTopics.ERROR).toBe('puppeteer.error');
  });

  it('defines CANCELLED topic', () => {
    expect(PuppeteerTopics.CANCELLED).toBe('puppeteer.cancelled');
  });
});

// ============================================================================
// emitPuppeteerStarted
// ============================================================================

describe('emitPuppeteerStarted', () => {
  it('emits a started event with correct topic', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task);
    expect(events).toHaveLength(1);
    expect(events[0]?.topic).toBe(PuppeteerTopics.STARTED);
  });

  it('includes session ID in event', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-42', task);
    expect(events[0]?.sessionId).toBe('session-42');
  });

  it('includes task information in payload', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask({ id: 'task-99', description: 'Important task' });
    emitPuppeteerStarted(bus, 'session-1', task);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.taskId).toBe('task-99');
    expect(payload.taskDescription).toBe('Important task');
  });

  it('truncates long task descriptions to 200 chars', () => {
    const { bus, events } = createMockEventBus();
    const longDesc = 'A'.repeat(300);
    const task = createMockTask({ description: longDesc });
    emitPuppeteerStarted(bus, 'session-1', task);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect((payload.taskDescription as string).length).toBe(200);
  });

  it('uses default config values', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task);
    const payload = events[0]?.payload as Record<string, unknown>;
    const config = payload.config as Record<string, unknown>;
    expect(config.maxSteps).toBe(10);
    expect(config.timeoutMs).toBe(300000);
    expect(config.policyMode).toBe('rule_based');
  });

  it('uses default agentCount of 0', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.agentCount).toBe(0);
  });

  it('accepts custom agentCount', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task, 5);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.agentCount).toBe(5);
  });

  it('accepts custom config', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task, 3, {
      maxSteps: 20,
      timeoutMs: 60000,
      policyMode: 'learned',
    });
    const payload = events[0]?.payload as Record<string, unknown>;
    const config = payload.config as Record<string, unknown>;
    expect(config.maxSteps).toBe(20);
    expect(config.policyMode).toBe('learned');
  });

  it('includes a unique eventId', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task);
    expect(events[0]?.eventId).toBeTruthy();
    expect(typeof events[0]?.eventId).toBe('string');
  });

  it('includes a timestamp', () => {
    const { bus, events } = createMockEventBus();
    const task = createMockTask();
    emitPuppeteerStarted(bus, 'session-1', task);
    expect(events[0]?.timestamp).toBeTruthy();
  });
});

// ============================================================================
// emitPuppeteerStepCompleted
// ============================================================================

describe('emitPuppeteerStepCompleted', () => {
  it('emits a step completed event', () => {
    const { bus, events } = createMockEventBus();
    const step: PuppeteerStepResult = {
      selectedAgent: 'code-expert',
      distribution: createMockDistribution(),
      agentOutput: createMockAgentOutput(),
      newState: {
        step: 1,
        task: createMockTask(),
        agentOutputs: [createMockAgentOutput()],
        context: 'current context',
        metadata: createMockMetadata(),
        sessionId: 'session-1',
      },
      reward: 0.85,
      shouldTerminate: false,
    };
    emitPuppeteerStepCompleted(bus, 'session-1', step);
    expect(events).toHaveLength(1);
    expect(events[0]?.topic).toBe(PuppeteerTopics.STEP_COMPLETED);
  });

  it('extracts selection probability from distribution', () => {
    const { bus, events } = createMockEventBus();
    const step: PuppeteerStepResult = {
      selectedAgent: 'code-expert',
      distribution: createMockDistribution(),
      agentOutput: createMockAgentOutput(),
      newState: {
        step: 1,
        task: createMockTask(),
        agentOutputs: [],
        context: '',
        metadata: createMockMetadata(),
        sessionId: 'session-1',
      },
      reward: 0.7,
      shouldTerminate: false,
    };
    emitPuppeteerStepCompleted(bus, 'session-1', step);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.selectionProbability).toBe(0.6);
  });

  it('defaults probability to 0 when agent not in distribution', () => {
    const { bus, events } = createMockEventBus();
    const step: PuppeteerStepResult = {
      selectedAgent: 'unknown-agent',
      distribution: createMockDistribution(),
      agentOutput: createMockAgentOutput(),
      newState: {
        step: 1,
        task: createMockTask(),
        agentOutputs: [],
        context: '',
        metadata: createMockMetadata(),
        sessionId: 'session-1',
      },
      reward: 0.5,
      shouldTerminate: false,
    };
    emitPuppeteerStepCompleted(bus, 'session-1', step);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.selectionProbability).toBe(0);
  });

  it('includes duration and tokens from agent output', () => {
    const { bus, events } = createMockEventBus();
    const agentOutput = createMockAgentOutput();
    const step: PuppeteerStepResult = {
      selectedAgent: 'code-expert',
      distribution: createMockDistribution(),
      agentOutput,
      newState: {
        step: 1,
        task: createMockTask(),
        agentOutputs: [],
        context: '',
        metadata: createMockMetadata(),
        sessionId: 'session-1',
      },
      reward: 0.9,
      shouldTerminate: false,
    };
    emitPuppeteerStepCompleted(bus, 'session-1', step);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.durationMs).toBe(1500);
    expect(payload.tokensUsed).toBe(250);
  });
});

// ============================================================================
// emitPuppeteerCompleted
// ============================================================================

describe('emitPuppeteerCompleted', () => {
  it('emits a completed event', () => {
    const { bus, events } = createMockEventBus();
    const result: PuppeteerResult = {
      success: true,
      output: 'final result',
      trajectory: [],
      totalSteps: 5,
      totalDurationMs: 10000,
      totalTokens: 2000,
      totalCost: 0.05,
      emergentPatterns: createMockEmergentPatterns(),
      metrics: createMockMetrics(),
      terminationReason: 'task_complete',
      sessionId: 'session-1',
    };
    emitPuppeteerCompleted(bus, 'session-1', result);
    expect(events).toHaveLength(1);
    expect(events[0]?.topic).toBe(PuppeteerTopics.COMPLETED);
  });

  it('includes pattern summary in payload', () => {
    const { bus, events } = createMockEventBus();
    const patterns = createMockEmergentPatterns();
    const result: PuppeteerResult = {
      success: true,
      output: 'done',
      trajectory: [],
      totalSteps: 3,
      totalDurationMs: 5000,
      totalTokens: 1000,
      totalCost: 0.02,
      emergentPatterns: patterns,
      metrics: createMockMetrics(),
      terminationReason: 'task_complete',
      sessionId: 'session-1',
    };
    emitPuppeteerCompleted(bus, 'session-1', result);
    const payload = events[0]?.payload as Record<string, unknown>;
    const patternsPayload = payload.patterns as Record<string, unknown>;
    expect(patternsPayload.hubCount).toBe(2);
    expect(patternsPayload.cycleCount).toBe(1);
    expect(patternsPayload.graphDensity).toBe(0.45);
  });

  it('includes metrics in payload', () => {
    const { bus, events } = createMockEventBus();
    const result: PuppeteerResult = {
      success: false,
      output: null,
      trajectory: [],
      totalSteps: 10,
      totalDurationMs: 30000,
      totalTokens: 5000,
      totalCost: 0.1,
      emergentPatterns: createMockEmergentPatterns(),
      metrics: createMockMetrics(),
      terminationReason: 'max_steps',
      sessionId: 'session-1',
    };
    emitPuppeteerCompleted(bus, 'session-1', result);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.success).toBe(false);
    expect(payload.terminationReason).toBe('max_steps');
    expect(payload.totalSteps).toBe(10);
  });
});

// ============================================================================
// emitPuppeteerError
// ============================================================================

describe('emitPuppeteerError', () => {
  it('emits an error event', () => {
    const { bus, events } = createMockEventBus();
    emitPuppeteerError(bus, 'session-1', { message: 'Something broke' });
    expect(events).toHaveLength(1);
    expect(events[0]?.topic).toBe(PuppeteerTopics.ERROR);
  });

  it('uses UNKNOWN_ERROR code when not provided', () => {
    const { bus, events } = createMockEventBus();
    emitPuppeteerError(bus, 'session-1', { message: 'Error!' });
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.code).toBe('UNKNOWN_ERROR');
    expect(payload.message).toBe('Error!');
  });

  it('uses provided error code', () => {
    const { bus, events } = createMockEventBus();
    emitPuppeteerError(bus, 'session-1', { code: 'TIMEOUT', message: 'Timed out' });
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.code).toBe('TIMEOUT');
  });

  it('includes step number when provided', () => {
    const { bus, events } = createMockEventBus();
    emitPuppeteerError(bus, 'session-1', { message: 'Error at step 3' }, 3);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.step).toBe(3);
  });

  it('omits step when not provided', () => {
    const { bus, events } = createMockEventBus();
    emitPuppeteerError(bus, 'session-1', { message: 'Error' });
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.step).toBeUndefined();
  });

  it('includes session ID in event and payload', () => {
    const { bus, events } = createMockEventBus();
    emitPuppeteerError(bus, 'session-99', { message: 'Error' });
    expect(events[0]?.sessionId).toBe('session-99');
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.sessionId).toBe('session-99');
  });
});

// ============================================================================
// emitPuppeteerPatternDetected
// ============================================================================

describe('emitPuppeteerPatternDetected', () => {
  it('emits a pattern detected event', () => {
    const { bus, events } = createMockEventBus();
    const patterns = createMockEmergentPatterns();
    emitPuppeteerPatternDetected(bus, 'session-1', patterns);
    expect(events).toHaveLength(1);
    expect(events[0]?.topic).toBe(PuppeteerTopics.PATTERN_DETECTED);
  });

  it('detects significant compaction (hub > 0.5 percentage)', () => {
    const { bus, events } = createMockEventBus();
    const patterns: EmergentPatterns = {
      hubAgents: [{ agentId: 'a1', activationCount: 8, percentage: 0.7 }],
      cycles: [],
      graphDensity: 0.5,
      cyclicalityScore: 0.1,
    };
    emitPuppeteerPatternDetected(bus, 'session-1', patterns);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.hasSignificantCompaction).toBe(true);
  });

  it('no significant compaction when all hubs below 0.5', () => {
    const { bus, events } = createMockEventBus();
    const patterns: EmergentPatterns = {
      hubAgents: [{ agentId: 'a1', activationCount: 3, percentage: 0.3 }],
      cycles: [],
      graphDensity: 0.3,
      cyclicalityScore: 0.1,
    };
    emitPuppeteerPatternDetected(bus, 'session-1', patterns);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.hasSignificantCompaction).toBe(false);
  });

  it('detects significant cyclicality (score > 0.4)', () => {
    const { bus, events } = createMockEventBus();
    const patterns: EmergentPatterns = {
      hubAgents: [],
      cycles: [{ agents: ['a1', 'a2'], occurrences: 5 }],
      graphDensity: 0.5,
      cyclicalityScore: 0.6,
    };
    emitPuppeteerPatternDetected(bus, 'session-1', patterns);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.hasSignificantCyclicality).toBe(true);
  });

  it('no significant cyclicality when score <= 0.4', () => {
    const { bus, events } = createMockEventBus();
    const patterns: EmergentPatterns = {
      hubAgents: [],
      cycles: [],
      graphDensity: 0.2,
      cyclicalityScore: 0.4,
    };
    emitPuppeteerPatternDetected(bus, 'session-1', patterns);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.hasSignificantCyclicality).toBe(false);
  });

  it('includes full patterns object in payload', () => {
    const { bus, events } = createMockEventBus();
    const patterns = createMockEmergentPatterns();
    emitPuppeteerPatternDetected(bus, 'session-1', patterns);
    const payload = events[0]?.payload as Record<string, unknown>;
    expect(payload.patterns).toBe(patterns);
  });
});
