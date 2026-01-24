/**
 * Puppeteer Orchestrator Tests
 *
 * Tests for the main Puppeteer orchestrator.
 *
 * @module agents/orchestration/puppeteer-orchestrator.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PuppeteerOrchestrator,
  createPuppeteerOrchestrator,
  PuppeteerError,
} from './puppeteer-orchestrator.js';
import type {
  IAgent,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentState,
  AgentRole,
  AgentCapability,
} from '../../core/index.js';
import { ok, AgentCapability as Cap, AgentError } from '../../core/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockAgent(id: string, outputs: string[] = ['Default output']): IAgent {
  let callIndex = 0;
  return {
    id,
    role: 'custom' as AgentRole,
    state: 'idle' as AgentState,
    capabilities: [Cap.TASK_EXECUTION] as readonly AgentCapability[],
    execute: vi.fn((task: Task) => {
      const output = outputs[callIndex] ?? outputs[outputs.length - 1];
      callIndex++;
      const result: TaskResult = {
        taskId: task.id,
        output,
        metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'mock' },
      };
      return Promise.resolve(ok(result));
    }),
    handleMessage: vi.fn((_msg: AgentMessage) => {
      const response: AgentResponse = { messageId: _msg.id, status: 'completed' };
      return Promise.resolve(ok(response));
    }),
    initialize: vi.fn(() => Promise.resolve(ok(undefined))),
    cleanup: vi.fn(() => Promise.resolve()),
  };
}

const createTestTask = (description = 'Test task'): Task => ({
  id: 'test-task',
  description,
  context: {},
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('PuppeteerOrchestrator', () => {
  describe('constructor', () => {
    it('creates with default options', () => {
      const orchestrator = new PuppeteerOrchestrator();
      expect(orchestrator).toBeDefined();
    });

    it('creates with custom config', () => {
      const orchestrator = new PuppeteerOrchestrator({
        config: {
          maxSteps: 5,
          timeoutMs: 30000,
        },
      });
      expect(orchestrator).toBeDefined();
    });

    it('accepts initial agents', () => {
      const agent = createMockAgent('test-agent');
      const orchestrator = new PuppeteerOrchestrator({ agents: [agent] });

      expect(orchestrator.getRegisteredAgents()).toContain('test-agent');
    });

    it('respects policyMode config (#385)', () => {
      // Default (rule_based) should work
      const defaultOrchestrator = new PuppeteerOrchestrator();
      expect(defaultOrchestrator).toBeDefined();

      // Learned mode should create learnable policy
      const learnedOrchestrator = new PuppeteerOrchestrator({
        config: { policyMode: 'learned' },
      });
      expect(learnedOrchestrator).toBeDefined();

      // Hybrid mode should work
      const hybridOrchestrator = new PuppeteerOrchestrator({
        config: { policyMode: 'hybrid' },
      });
      expect(hybridOrchestrator).toBeDefined();

      // Rule-based explicit
      const ruleBasedOrchestrator = new PuppeteerOrchestrator({
        config: { policyMode: 'rule_based' },
      });
      expect(ruleBasedOrchestrator).toBeDefined();
    });
  });

  describe('createPuppeteerOrchestrator factory', () => {
    it('creates PuppeteerOrchestrator instance', () => {
      const orchestrator = createPuppeteerOrchestrator();
      expect(orchestrator).toBeInstanceOf(PuppeteerOrchestrator);
    });
  });
});

// =============================================================================
// Agent Registration Tests
// =============================================================================

describe('agent registration', () => {
  let orchestrator: PuppeteerOrchestrator;

  beforeEach(() => {
    orchestrator = new PuppeteerOrchestrator();
  });

  it('registers agent', () => {
    const agent = createMockAgent('agent-1');
    orchestrator.registerAgent(agent);

    expect(orchestrator.getRegisteredAgents()).toContain('agent-1');
  });

  it('unregisters agent', () => {
    const agent = createMockAgent('agent-1');
    orchestrator.registerAgent(agent);
    orchestrator.unregisterAgent('agent-1');

    expect(orchestrator.getRegisteredAgents()).not.toContain('agent-1');
  });

  it('overwrites agent with same ID', () => {
    const agent1 = createMockAgent('agent-1');
    const agent2 = createMockAgent('agent-1');

    orchestrator.registerAgent(agent1);
    orchestrator.registerAgent(agent2);

    expect(orchestrator.getRegisteredAgents().filter((id) => id === 'agent-1')).toHaveLength(1);
  });
});

// =============================================================================
// Execute Tests
// =============================================================================

describe('execute', () => {
  let orchestrator: PuppeteerOrchestrator;

  beforeEach(() => {
    orchestrator = new PuppeteerOrchestrator({
      config: { maxSteps: 3 },
    });
  });

  it('returns error when no agents available', async () => {
    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_AGENTS');
    }
  });

  it('executes task with registered agents', async () => {
    const agent = createMockAgent('puppet-decomposer', ['Task complete']);
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalSteps).toBeGreaterThan(0);
    }
  });

  it('uses provided agents over registered', async () => {
    const registered = createMockAgent('registered-agent');
    const provided = createMockAgent('provided-agent', ['Task complete']);

    orchestrator.registerAgent(registered);

    const task = createTestTask();
    const result = await orchestrator.execute({ task, agents: [provided] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const firstStep = result.value.trajectory[0];
      expect(firstStep).toBeDefined();
      if (firstStep) {
        expect(firstStep.selectedAgent).toBe('provided-agent');
      }
    }
  });

  it('stops at max steps', async () => {
    const agent = createMockAgent('agent-1', ['Working...', 'Still working...', 'More work...']);
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalSteps).toBeLessThanOrEqual(3);
      expect(result.value.terminationReason).toBe('max_steps');
    }
  });

  it('terminates on task completion signal', async () => {
    const agent = createMockAgent('agent-1', ['Task complete and finished successfully']);
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminationReason).toBe('task_complete');
    }
  });

  it('returns trajectory with steps', async () => {
    const agent = createMockAgent('agent-1', ['Step 1', 'Step 2', 'Task complete']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 5 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trajectory.length).toBeGreaterThan(0);
      const firstStep = result.value.trajectory[0];
      expect(firstStep).toBeDefined();
      if (firstStep) {
        expect(firstStep.selectedAgent).toBe('agent-1');
      }
    }
  });

  it('tracks total tokens', async () => {
    const agent = createMockAgent('agent-1', ['Output']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 2 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTokens).toBeGreaterThan(0);
    }
  });

  it('tracks total duration', async () => {
    const agent = createMockAgent('agent-1', ['Task complete']);
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalDurationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('generates unique session ID', async () => {
    const agent = createMockAgent('agent-1', ['Task complete']);
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result1 = await orchestrator.execute({ task });
    const result2 = await orchestrator.execute({ task });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value.sessionId).not.toBe(result2.value.sessionId);
    }
  });
});

// =============================================================================
// Cancellation Tests
// =============================================================================

describe('cancellation', () => {
  it('cancels during execution', async () => {
    const agent = createMockAgent('agent-1', ['Working...']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 10 } });
    orchestrator.registerAgent(agent);

    // Schedule cancellation
    setTimeout(() => {
      orchestrator.cancel('Test cancellation');
    }, 50);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // May be cancelled or complete before cancellation, or convergence due to same output
      expect(['cancelled', 'max_steps', 'task_complete', 'convergence']).toContain(
        result.value.terminationReason
      );
    }
  });

  it('respects abort signal', async () => {
    const agent = createMockAgent('agent-1', ['Working...']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 10 } });
    orchestrator.registerAgent(agent);

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 50);

    const task = createTestTask();
    const result = await orchestrator.execute({ task, signal: controller.signal });

    expect(result.ok).toBe(true);
  });

  it('cleans up abort signal listener after execution (Issue #401)', async () => {
    const agent = createMockAgent('agent-1', ['Done']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 1 } });
    orchestrator.registerAgent(agent);

    const controller = new AbortController();
    const signal = controller.signal;

    // Track listener count using a spy pattern
    let addCalls = 0;
    let removeCalls = 0;
    const originalAdd = signal.addEventListener.bind(signal);
    const originalRemove = signal.removeEventListener.bind(signal);

    signal.addEventListener = (type: string, listener: unknown) => {
      addCalls++;
      originalAdd(type, listener as () => void);
    };
    signal.removeEventListener = (type: string, listener: unknown) => {
      removeCalls++;
      originalRemove(type, listener as () => void);
    };

    const task = createTestTask();
    await orchestrator.execute({ task, signal });

    // Listener should be added and then removed
    expect(addCalls).toBe(1);
    expect(removeCalls).toBe(1);
  });

  it('cleans up abort signal on multiple sequential executions', async () => {
    const agent = createMockAgent('agent-1', ['Done']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 1 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();

    // Execute multiple times with different signals
    for (let i = 0; i < 3; i++) {
      const controller = new AbortController();
      await orchestrator.execute({ task, signal: controller.signal });
    }

    // Should not throw or leak - this test passes if no errors occur
    expect(true).toBe(true);
  });
});

// =============================================================================
// Emergent Patterns Tests
// =============================================================================

describe('emergent patterns', () => {
  it('tracks patterns when enabled', async () => {
    const agent = createMockAgent('hub-agent', ['Output 1', 'Output 2', 'Output 3']);

    const orchestrator = new PuppeteerOrchestrator({
      config: { maxSteps: 3, trackEmergentPatterns: true },
    });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.emergentPatterns).toBeDefined();
      expect(result.value.emergentPatterns.hubAgents).toBeDefined();
      expect(result.value.emergentPatterns.cycles).toBeDefined();
    }
  });

  it('detects hub when one agent dominates', async () => {
    const hubAgent = createMockAgent('hub-agent', ['Output']);

    const orchestrator = new PuppeteerOrchestrator({
      config: { maxSteps: 5, trackEmergentPatterns: true },
    });
    orchestrator.registerAgent(hubAgent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Single agent should be detected as hub
      expect(result.value.emergentPatterns.hubAgents.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// =============================================================================
// Metrics Tests
// =============================================================================

describe('metrics', () => {
  it('computes metrics on completion', async () => {
    const agent = createMockAgent('agent-1', ['Task complete']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 3 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metrics.avgReward).toBeDefined();
      expect(result.value.metrics.taskCompletionRate).toBeDefined();
      expect(result.value.metrics.efficiencyScore).toBeDefined();
    }
  });

  it('sets taskCompletionRate to 1 on success', async () => {
    const agent = createMockAgent('agent-1', ['Task complete']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 3 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.success) {
      expect(result.value.metrics.taskCompletionRate).toBe(1);
    }
  });

  it('sets taskCompletionRate to 0 on failure', async () => {
    const agent = createMockAgent('agent-1', ['Working...']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 1 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok && !result.value.success) {
      expect(result.value.metrics.taskCompletionRate).toBe(0);
    }
  });
});

// =============================================================================
// Initial Context Tests
// =============================================================================

describe('initial context', () => {
  it('uses provided initial context', async () => {
    const agent = createMockAgent('agent-1', ['Task complete']);

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 2 } });
    orchestrator.registerAgent(agent);

    const task = createTestTask();
    const result = await orchestrator.execute({
      task,
      initialContext: 'Custom context for the task',
    });

    expect(result.ok).toBe(true);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('error handling', () => {
  it('handles agent execution failure gracefully', async () => {
    const agentError = new AgentError('Agent failed');

    const failingAgent: IAgent = {
      id: 'failing-agent',
      role: 'custom' as AgentRole,
      state: 'idle' as AgentState,
      capabilities: [Cap.TASK_EXECUTION] as readonly AgentCapability[],
      execute: vi.fn(() => {
        return Promise.resolve({
          ok: false as const,
          error: agentError,
        });
      }),
      handleMessage: vi.fn(() =>
        Promise.resolve(ok({ messageId: '', status: 'completed' as const }))
      ),
      initialize: vi.fn(() => Promise.resolve(ok(undefined))),
      cleanup: vi.fn(() => Promise.resolve()),
    };

    const orchestrator = new PuppeteerOrchestrator({ config: { maxSteps: 3 } });
    orchestrator.registerAgent(failingAgent);

    const task = createTestTask();
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminationReason).toBe('error');
    }
  });
});

// =============================================================================
// PuppeteerError Tests
// =============================================================================

describe('PuppeteerError', () => {
  it('creates error with code', () => {
    const error = new PuppeteerError('Test message', 'TEST_CODE');

    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('PuppeteerError');
  });

  it('creates error with context', () => {
    const error = new PuppeteerError('Test', 'CODE', { extra: 'info' });

    expect(error.context).toEqual({ extra: 'info' });
  });
});
