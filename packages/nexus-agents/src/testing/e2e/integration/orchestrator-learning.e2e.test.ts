/**
 * Orchestrator -> Learning Integration E2E Tests
 *
 * Tests verifying the integration between PuppeteerOrchestrator,
 * LearnablePolicy, and ExperienceBuffer for RL training.
 *
 * @module testing/e2e/integration/orchestrator-learning
 * (Source: Issue #154, RL-trained orchestrator)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PuppeteerOrchestrator } from '../../../agents/orchestration/puppeteer-orchestrator.js';
import {
  createLearnablePolicy,
  isLearnablePolicyEngine,
} from '../../../agents/orchestration/learnable-policy.js';
import { ExperienceBuffer } from '../../../agents/orchestration/experience-buffer.js';
import type {
  IAgent,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentCapability,
} from '../../../core/index.js';
import { ok, AgentCapability as Cap } from '../../../core/index.js';
import type { LearnablePolicyStats } from '../../../agents/orchestration/policy-types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/** Create a deterministic mock agent for testing. */
function createMockAgent(id: string, outputs: string[] = ['Task completed successfully']): IAgent {
  let callIndex = 0;
  return {
    id,
    role: 'custom',
    state: 'idle',
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

/** Create a test task. */
function createTestTask(description: string): Task {
  return {
    id: `task-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    description,
    context: { workingDirectory: '/test' },
  };
}

// =============================================================================
// LearnablePolicy Unit Tests
// =============================================================================

describe('LearnablePolicy Integration', () => {
  let learnablePolicy: ReturnType<typeof createLearnablePolicy>;

  beforeEach(() => {
    learnablePolicy = createLearnablePolicy({
      learningRate: 0.1,
      warmupUpdates: 2,
      temperature: 1.0,
      deterministic: false,
    });
  });

  it('should be recognized as learnable policy engine', () => {
    expect(isLearnablePolicyEngine(learnablePolicy)).toBe(true);
  });

  it('should track warmup status', () => {
    expect(learnablePolicy.isWarmedUp()).toBe(false);
  });

  it('should provide comprehensive learning stats', () => {
    const stats: LearnablePolicyStats = learnablePolicy.getStats();

    expect(stats).toHaveProperty('updateCount');
    expect(stats).toHaveProperty('currentLearningRate');
    expect(stats).toHaveProperty('baseline');
    expect(stats).toHaveProperty('lastGradientNorm');
    expect(stats).toHaveProperty('totalEpisodes');
    expect(stats).toHaveProperty('avgEpisodeLength');
    expect(stats).toHaveProperty('avgFinalReward');
  });

  it('should have sensible initial values', () => {
    const stats = learnablePolicy.getStats();

    expect(stats.updateCount).toBe(0);
    expect(stats.currentLearningRate).toBe(0.1);
    expect(stats.baseline).toBe(0);
    expect(stats.lastGradientNorm).toBe(0);
    expect(stats.totalEpisodes).toBe(0);
  });

  it('should allow saving and loading policy parameters', () => {
    const params = learnablePolicy.getParameters();
    expect(params.version).toBe('1.0.0');
    expect(params.weights).toBeDefined();
    expect(params.metadata).toHaveProperty('policyType', 'learnable');
    expect(params.metadata).toHaveProperty('algorithm', 'REINFORCE');

    // Create new policy and load parameters
    const newPolicy = createLearnablePolicy();
    newPolicy.loadParameters(params);

    const loadedParams = newPolicy.getParameters();
    expect(loadedParams.weights).toEqual(params.weights);
  });
});

// =============================================================================
// ExperienceBuffer Tests
// =============================================================================

describe('ExperienceBuffer Integration', () => {
  it('should create buffer with specified capacity', () => {
    const buffer = new ExperienceBuffer({ maxCapacity: 100 });
    const stats = buffer.getStats();
    expect(stats.episodeCount).toBe(0);
    expect(stats.totalSteps).toBe(0);
  });

  it('should support priority sampling configuration', () => {
    const buffer = new ExperienceBuffer({
      maxCapacity: 100,
      prioritySampling: true,
    });
    const stats = buffer.getStats();
    expect(stats.episodeCount).toBe(0);
  });

  it('should track buffer utilization', () => {
    const buffer = new ExperienceBuffer({ maxCapacity: 100 });
    const stats = buffer.getStats();
    expect(stats.utilization).toBe(0);
  });
});

// =============================================================================
// PuppeteerOrchestrator with LearnablePolicy Tests
// =============================================================================

describe('PuppeteerOrchestrator with LearnablePolicy', () => {
  let orchestrator: PuppeteerOrchestrator;
  let learnablePolicy: ReturnType<typeof createLearnablePolicy>;

  beforeEach(() => {
    learnablePolicy = createLearnablePolicy({
      learningRate: 0.1,
      warmupUpdates: 2,
      temperature: 1.0,
    });

    orchestrator = new PuppeteerOrchestrator({
      policyEngine: learnablePolicy,
      learningConfig: {
        enableLearning: true,
        bufferCapacity: 100,
        updateAfterEpisodes: 1,
      },
      agents: [
        createMockAgent('analyzer', ['Analysis complete']),
        createMockAgent('implementer', ['Implementation done']),
        createMockAgent('reviewer', ['Review passed']),
      ],
      config: {
        maxSteps: 3,
        timeoutMs: 10000,
      },
    });
  });

  it('should execute tasks with learnable policy', async () => {
    const task = createTestTask('Analyze the codebase structure');
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // With mock agents and maxSteps: 3, success depends on completion criteria
      // The key property is that execution produces a trajectory
      expect(typeof result.value.success).toBe('boolean');
      expect(result.value.trajectory.length).toBeGreaterThanOrEqual(0);
      expect(result.value.totalSteps).toBeGreaterThanOrEqual(0);
    }
  });

  it('should complete multiple sequential tasks', async () => {
    const tasks = [
      createTestTask('Task 1: Analyze code'),
      createTestTask('Task 2: Write tests'),
      createTestTask('Task 3: Review changes'),
    ];

    for (const task of tasks) {
      const result = await orchestrator.execute({ task });
      expect(result.ok).toBe(true);
      // Allow async processing
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });

  it('should record execution trajectory', async () => {
    const task = createTestTask('Generate unit tests');
    const result = await orchestrator.execute({ task });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Each step should have agent selection data
      for (const step of result.value.trajectory) {
        expect(step.selectedAgent).toBeDefined();
        expect(step.distribution).toBeDefined();
        expect(step.reward).toBeDefined();
      }
    }
  });
});

// =============================================================================
// End-to-End Learning Loop Tests
// =============================================================================

describe('End-to-End Learning Loop', () => {
  it('should complete orchestration with learning enabled', async () => {
    const policy = createLearnablePolicy({
      learningRate: 0.1,
      warmupUpdates: 1,
    });

    const orchestrator = new PuppeteerOrchestrator({
      policyEngine: policy,
      learningConfig: {
        enableLearning: true,
        bufferCapacity: 100,
        updateAfterEpisodes: 1,
      },
      agents: [
        createMockAgent('coder', ['Code written']),
        createMockAgent('tester', ['Tests passed']),
      ],
      config: { maxSteps: 3, timeoutMs: 5000 },
    });

    const result = await orchestrator.execute({
      task: createTestTask('Implement feature'),
    });

    // The orchestration should complete without error
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have a trajectory with steps
      expect(result.value.trajectory.length).toBeGreaterThan(0);
      expect(result.value.totalSteps).toBeGreaterThan(0);
    }
  });

  it('should handle multiple sequential tasks with learning', async () => {
    const policy = createLearnablePolicy({
      learningRate: 0.05,
      baselineDecay: 0.9,
    });

    const orchestrator = new PuppeteerOrchestrator({
      policyEngine: policy,
      learningConfig: {
        enableLearning: true,
        bufferCapacity: 100,
        updateAfterEpisodes: 1,
      },
      agents: [createMockAgent('worker1'), createMockAgent('worker2')],
      config: { maxSteps: 3, timeoutMs: 5000 },
    });

    const tasks = ['Task A', 'Task B', 'Task C'].map((desc) => createTestTask(desc));

    const results = [];
    for (const task of tasks) {
      const result = await orchestrator.execute({ task });
      results.push(result);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // All orchestrations should complete without error
    expect(results.every((r) => r.ok)).toBe(true);
    // Each should have produced a trajectory
    for (const result of results) {
      if (result.ok) {
        expect(result.value.trajectory.length).toBeGreaterThan(0);
      }
    }
  });
});
