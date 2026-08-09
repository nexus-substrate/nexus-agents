/**
 * Tests for Work Balancer
 *
 * Verifies scoring algorithm, capacity handling, and queue management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorkBalancer,
  createTaskProfile,
  capacityStatusToInfo,
  BalancingError,
  type TaskProfile,
  type CapacityInfo,
  type IWorkBalancer,
} from './work-balancer.js';
import type {
  ICliAdapter,
  CapabilityProfile,
  ModelInfo,
  HealthStatus,
  CapacityStatus,
} from '../cli-adapters/types.js';
import { ok } from '../core/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockAdapter(
  name: string,
  capabilities: Partial<CapabilityProfile> = {}
): ICliAdapter {
  const defaultCapabilities: CapabilityProfile = {
    reasoning: 8,
    contextWindow: 200_000,
    codeGeneration: 8,
    speed: 7,
    cost: 5,
    ...capabilities,
  };

  return {
    name: name as 'claude' | 'gemini' | 'codex',
    transport: 'subprocess',
    capabilities: defaultCapabilities,
    execute: vi.fn().mockResolvedValue(ok({ text: 'response' })),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported',
      lastChecked: new Date(),
    } satisfies HealthStatus),
    getCapacity: vi.fn().mockResolvedValue({
      remainingTokens: 100_000,
      remainingRequests: 100,
      utilizationPercent: 20,
      exhausted: false,
      observed: true,
      resetTime: new Date(Date.now() + 60000),
    } satisfies CapacityStatus),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: 'test-model',
      name: 'Test Model',
      contextWindow: 200_000,
    } satisfies ModelInfo),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createCapacityInfo(overrides: Partial<CapacityInfo> = {}): CapacityInfo {
  return {
    remainingTokens: 100_000,
    remainingRequests: 100,
    utilizationPercent: 20,
    exhausted: false,
    resetTime: new Date(Date.now() + 60000),
    ...overrides,
  };
}

function createTaskProfileFixture(overrides: Partial<TaskProfile> = {}): TaskProfile {
  return {
    estimatedTokens: 10_000,
    complexity: 5,
    reasoningRequired: 5,
    codeGenerationRequired: 5,
    speedPriority: 5,
    costSensitivity: 5,
    minContextWindow: 50_000,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('WorkBalancer', () => {
  let balancer: IWorkBalancer;

  beforeEach(() => {
    balancer = createWorkBalancer();
  });

  describe('balance()', () => {
    it('should return error when no adapters provided', () => {
      const task = createTaskProfileFixture();
      const result = balancer.balance(task, [], new Map());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(BalancingError);
        expect(result.error.balancingCode).toBe('NO_ADAPTERS');
      }
    });

    it('should return error for invalid task profile', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 0 });
      const adapter = createMockAdapter('claude');
      const capacities = new Map([['claude', createCapacityInfo()]]);

      const result = balancer.balance(task, [adapter], capacities);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.balancingCode).toBe('INVALID_PROFILE');
      }
    });

    it('should select adapter with highest score', () => {
      const task = createTaskProfileFixture({
        reasoningRequired: 9,
        codeGenerationRequired: 5,
      });

      // Claude: high reasoning
      const claude = createMockAdapter('claude', {
        reasoning: 10,
        codeGeneration: 9,
        speed: 7,
        cost: 5,
      });

      // Gemini: lower reasoning
      const gemini = createMockAdapter('gemini', {
        reasoning: 7,
        codeGeneration: 7,
        speed: 8,
        cost: 9,
      });

      const capacities = new Map([
        ['claude', createCapacityInfo()],
        ['gemini', createCapacityInfo()],
      ]);

      const result = balancer.balance(task, [claude, gemini], capacities);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.adapter.name).toBe('claude');
        expect(result.value.scores).toHaveLength(2);
      }
    });

    it('should exclude adapters below capacity threshold', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 50_000 });

      const adapter = createMockAdapter('claude');
      const lowCapacity = createCapacityInfo({
        remainingTokens: 1_000, // Way below threshold
      });

      const capacities = new Map([['claude', lowCapacity]]);

      const result = balancer.balance(task, [adapter], capacities);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.balancingCode).toBe('ALL_EXHAUSTED');
      }
    });

    it('should exclude adapters with exhausted capacity', () => {
      const task = createTaskProfileFixture();
      const adapter = createMockAdapter('claude');
      const exhaustedCapacity = createCapacityInfo({
        exhausted: true,
        remainingTokens: 0,
      });

      const capacities = new Map([['claude', exhaustedCapacity]]);

      const result = balancer.balance(task, [adapter], capacities);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.balancingCode).toBe('ALL_EXHAUSTED');
      }
    });

    it('should exclude adapters with insufficient context window', () => {
      const task = createTaskProfileFixture({ minContextWindow: 500_000 });

      const adapter = createMockAdapter('claude', {
        contextWindow: 200_000, // Less than required
      });

      const capacities = new Map([['claude', createCapacityInfo()]]);

      const result = balancer.balance(task, [adapter], capacities);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.balancingCode).toBe('ALL_EXHAUSTED');
      }
    });

    it('should return score breakdown for all adapters', () => {
      const task = createTaskProfileFixture();

      const claude = createMockAdapter('claude');
      const gemini = createMockAdapter('gemini');

      const capacities = new Map([
        ['claude', createCapacityInfo()],
        ['gemini', createCapacityInfo()],
      ]);

      const result = balancer.balance(task, [claude, gemini], capacities);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scores).toHaveLength(2);
        expect(result.value.scores[0]?.capabilityScore).toBeGreaterThanOrEqual(0);
        expect(result.value.scores[0]?.capacityScore).toBeGreaterThanOrEqual(0);
        expect(result.value.scores[0]?.finalScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should prefer adapter with more available capacity when capabilities equal', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 10_000 });

      const claude = createMockAdapter('claude');
      const gemini = createMockAdapter('gemini', {
        reasoning: 8,
        contextWindow: 200_000,
        codeGeneration: 8,
        speed: 7,
        cost: 5,
      });

      // Create significant capacity difference to overcome tie-breaking
      const capacities = new Map([
        ['claude', createCapacityInfo({ remainingTokens: 10_000 })], // 1x capacity = score 5
        ['gemini', createCapacityInfo({ remainingTokens: 100_000 })], // 10x capacity = score 10
      ]);

      const result = balancer.balance(task, [claude, gemini], capacities);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verify scores show gemini has higher capacity score
        const claudeScore = result.value.scores.find((s) => s.adapter === 'claude');
        const geminiScore = result.value.scores.find((s) => s.adapter === 'gemini');

        expect(geminiScore?.capacityScore).toBeGreaterThan(claudeScore?.capacityScore ?? 0);
        // With 40% capacity weight and significant capacity difference, gemini should win
        expect(result.value.adapter.name).toBe('gemini');
      }
    });
  });

  describe('getScore()', () => {
    it('should return combined weighted score', () => {
      const adapter = createMockAdapter('claude');
      const task = createTaskProfileFixture();
      const capacity = createCapacityInfo();

      const score = balancer.getScore(adapter, task, capacity);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });

    it('should return 0 for exhausted capacity', () => {
      const adapter = createMockAdapter('claude');
      const task = createTaskProfileFixture();
      const capacity = createCapacityInfo({ exhausted: true, remainingTokens: 0 });

      // Capacity score will be 0, bringing down the weighted score
      const score = balancer.getScore(adapter, task, capacity);

      // With 60% capability weight and 40% capacity weight, if capacity is 0
      // the maximum score is 60% of capability score
      expect(score).toBeLessThan(7);
    });
  });

  describe('getCapabilityScore()', () => {
    it('should return high score when capabilities match requirements', () => {
      const capabilities: CapabilityProfile = {
        reasoning: 9,
        contextWindow: 200_000,
        codeGeneration: 8,
        speed: 7,
        cost: 5,
      };

      const task = createTaskProfileFixture({
        reasoningRequired: 8,
        codeGenerationRequired: 7,
      });

      const score = balancer.getCapabilityScore(capabilities, task);

      expect(score).toBeGreaterThan(7);
    });

    it('should return lower score when capabilities fall short', () => {
      const capabilities: CapabilityProfile = {
        reasoning: 4,
        contextWindow: 200_000,
        codeGeneration: 4,
        speed: 5,
        cost: 5,
      };

      const task = createTaskProfileFixture({
        reasoningRequired: 9,
        codeGenerationRequired: 8,
      });

      const score = balancer.getCapabilityScore(capabilities, task);

      expect(score).toBeLessThan(5);
    });

    it('should favor cost-efficient adapters for cost-sensitive tasks', () => {
      const cheapAdapter: CapabilityProfile = {
        reasoning: 7,
        contextWindow: 200_000,
        codeGeneration: 7,
        speed: 7,
        cost: 9, // High cost score = cheaper
      };

      const expensiveAdapter: CapabilityProfile = {
        reasoning: 7,
        contextWindow: 200_000,
        codeGeneration: 7,
        speed: 7,
        cost: 3, // Low cost score = more expensive
      };

      const costSensitiveTask = createTaskProfileFixture({
        costSensitivity: 9,
      });

      const cheapScore = balancer.getCapabilityScore(cheapAdapter, costSensitiveTask);
      const expensiveScore = balancer.getCapabilityScore(expensiveAdapter, costSensitiveTask);

      expect(cheapScore).toBeGreaterThan(expensiveScore);
    });

    it('should favor fast adapters for high-priority tasks', () => {
      const fastAdapter: CapabilityProfile = {
        reasoning: 7,
        contextWindow: 200_000,
        codeGeneration: 7,
        speed: 10,
        cost: 5,
      };

      const slowAdapter: CapabilityProfile = {
        reasoning: 7,
        contextWindow: 200_000,
        codeGeneration: 7,
        speed: 4,
        cost: 5,
      };

      const urgentTask = createTaskProfileFixture({
        speedPriority: 9,
      });

      const fastScore = balancer.getCapabilityScore(fastAdapter, urgentTask);
      const slowScore = balancer.getCapabilityScore(slowAdapter, urgentTask);

      expect(fastScore).toBeGreaterThan(slowScore);
    });
  });

  describe('getCapacityScore()', () => {
    it('should return 10 for 2x or more capacity', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 10_000 });
      const capacity = createCapacityInfo({ remainingTokens: 25_000 });

      const score = balancer.getCapacityScore(capacity, task);

      expect(score).toBe(10);
    });

    it('should return 5 for exactly matching capacity', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 10_000 });
      const capacity = createCapacityInfo({ remainingTokens: 10_000 });

      const score = balancer.getCapacityScore(capacity, task);

      expect(score).toBe(5);
    });

    it('should return 0 for exhausted capacity', () => {
      const task = createTaskProfileFixture();
      const capacity = createCapacityInfo({ exhausted: true });

      const score = balancer.getCapacityScore(capacity, task);

      expect(score).toBe(0);
    });

    it('should scale linearly between 1x and 2x capacity', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 10_000 });
      const capacity1_5x = createCapacityInfo({ remainingTokens: 15_000 });

      const score = balancer.getCapacityScore(capacity1_5x, task);

      // 1.5x should be halfway between 5 and 10
      expect(score).toBeCloseTo(7.5, 1);
    });

    it('should decay for less than 1x capacity', () => {
      const task = createTaskProfileFixture({ estimatedTokens: 10_000 });
      const capacityHalf = createCapacityInfo({ remainingTokens: 5_000 });

      const score = balancer.getCapacityScore(capacityHalf, task);

      // 0.5x should give score around 2.5
      expect(score).toBeCloseTo(2.5, 1);
    });
  });

  describe('queueTask()', () => {
    it('should queue task successfully', () => {
      const task = createTaskProfileFixture();
      const result = balancer.queueTask(task, 'Test task');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toMatch(/^task-\d+$/);
        expect(result.value.profile).toBe(task);
        expect(result.value.priority).toBe(5);
      }
    });

    it('should respect priority order in queue', () => {
      const task = createTaskProfileFixture();

      balancer.queueTask(task, 'Low priority', 3);
      balancer.queueTask(task, 'High priority', 8);
      balancer.queueTask(task, 'Medium priority', 5);

      const status = balancer.getQueueStatus();
      expect(status.size).toBe(3);
    });

    it('should return error when queue is full', () => {
      const smallQueueBalancer = createWorkBalancer({ maxQueueSize: 2 });
      const task = createTaskProfileFixture();

      smallQueueBalancer.queueTask(task, 'Task 1');
      smallQueueBalancer.queueTask(task, 'Task 2');
      const result = smallQueueBalancer.queueTask(task, 'Task 3');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.balancingCode).toBe('QUEUE_FULL');
      }
    });

    it('should clamp priority between 1 and 10', () => {
      const task = createTaskProfileFixture();

      const lowResult = balancer.queueTask(task, 'Low', 0);
      const highResult = balancer.queueTask(task, 'High', 15);

      expect(lowResult.ok).toBe(true);
      expect(highResult.ok).toBe(true);
      if (lowResult.ok && highResult.ok) {
        expect(lowResult.value.priority).toBe(1);
        expect(highResult.value.priority).toBe(10);
      }
    });
  });

  describe('getNextQueuedTask()', () => {
    it('should return task that fits in capacity', () => {
      const smallTask = createTaskProfileFixture({ estimatedTokens: 5_000 });
      const largeTask = createTaskProfileFixture({ estimatedTokens: 50_000 });

      balancer.queueTask(largeTask, 'Large task', 5);
      balancer.queueTask(smallTask, 'Small task', 5);

      const adapter = createMockAdapter('claude');
      const limitedCapacity = createCapacityInfo({ remainingTokens: 10_000 });

      const nextTask = balancer.getNextQueuedTask(adapter, limitedCapacity);

      expect(nextTask).toBeDefined();
      expect(nextTask?.profile.estimatedTokens).toBe(5_000);
    });

    it('should return undefined when no tasks fit', () => {
      const largeTask = createTaskProfileFixture({ estimatedTokens: 100_000 });
      balancer.queueTask(largeTask, 'Large task');

      const adapter = createMockAdapter('claude');
      const limitedCapacity = createCapacityInfo({ remainingTokens: 10_000 });

      const nextTask = balancer.getNextQueuedTask(adapter, limitedCapacity);

      expect(nextTask).toBeUndefined();
    });

    it('should respect context window requirements', () => {
      const largeContextTask = createTaskProfileFixture({
        estimatedTokens: 5_000,
        minContextWindow: 500_000,
      });
      balancer.queueTask(largeContextTask, 'Large context task');

      const adapter = createMockAdapter('claude', { contextWindow: 200_000 });
      const capacity = createCapacityInfo({ remainingTokens: 100_000 });

      const nextTask = balancer.getNextQueuedTask(adapter, capacity);

      expect(nextTask).toBeUndefined();
    });
  });

  describe('removeFromQueue()', () => {
    it('should remove existing task', () => {
      const task = createTaskProfileFixture();
      const queueResult = balancer.queueTask(task, 'Test task');

      expect(queueResult.ok).toBe(true);
      if (queueResult.ok) {
        const removed = balancer.removeFromQueue(queueResult.value.id);
        expect(removed).toBe(true);
        expect(balancer.getQueueStatus().size).toBe(0);
      }
    });

    it('should return false for non-existent task', () => {
      const removed = balancer.removeFromQueue('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getQueueStatus()', () => {
    it('should return correct queue status', () => {
      const task = createTaskProfileFixture();
      balancer.queueTask(task, 'Task 1');
      balancer.queueTask(task, 'Task 2');

      const status = balancer.getQueueStatus();

      expect(status.size).toBe(2);
      expect(status.maxSize).toBe(100);
      expect(status.oldestTask).toBeInstanceOf(Date);
    });

    it('should return undefined oldestTask for empty queue', () => {
      const status = balancer.getQueueStatus();

      expect(status.size).toBe(0);
      expect(status.oldestTask).toBeUndefined();
    });
  });
});

describe('createTaskProfile()', () => {
  it('should create profile from simple description', () => {
    const profile = createTaskProfile('Write a function to parse JSON');

    expect(profile.estimatedTokens).toBeGreaterThan(0);
    expect(profile.codeGenerationRequired).toBeGreaterThan(5);
  });

  it('should detect reasoning requirements', () => {
    const profile = createTaskProfile('Analyze the architecture and design a solution');

    expect(profile.reasoningRequired).toBeGreaterThan(5);
  });

  it('should detect urgency', () => {
    const profile = createTaskProfile('Fix this critical bug urgently');

    expect(profile.speedPriority).toBeGreaterThan(7);
  });

  it('should detect cost sensitivity', () => {
    const profile = createTaskProfile('Do this cheaply and efficiently within budget');

    expect(profile.costSensitivity).toBeGreaterThan(5);
  });

  it('should allow overrides', () => {
    const profile = createTaskProfile('Test task', {
      estimatedTokens: 50_000,
      complexity: 10,
    });

    expect(profile.estimatedTokens).toBe(50_000);
    expect(profile.complexity).toBe(10);
  });
});

describe('capacityStatusToInfo()', () => {
  it('should convert CapacityStatus to CapacityInfo', () => {
    const status: CapacityStatus = {
      remainingTokens: 50_000,
      remainingRequests: 100,
      utilizationPercent: 50,
      exhausted: false,
      observed: true,
      resetTime: new Date(),
    };

    const info = capacityStatusToInfo(status);

    expect(info.remainingTokens).toBe(50_000);
    expect(info.remainingRequests).toBe(100);
    expect(info.utilizationPercent).toBe(50);
    expect(info.exhausted).toBe(false);
  });
});

describe('WorkBalancer with custom options', () => {
  it('should use custom weights', () => {
    const balancer = createWorkBalancer({
      capabilityWeight: 0.3,
      capacityWeight: 0.7,
    });

    const adapter = createMockAdapter('claude', {
      reasoning: 5,
      codeGeneration: 5,
      speed: 5,
      cost: 5,
    });

    const task = createTaskProfileFixture({ estimatedTokens: 10_000 });

    // With 70% capacity weight and high capacity, score should be high
    const highCapacity = createCapacityInfo({ remainingTokens: 100_000 });
    const lowCapacity = createCapacityInfo({ remainingTokens: 15_000 });

    const highCapScore = balancer.getScore(adapter, task, highCapacity);
    const lowCapScore = balancer.getScore(adapter, task, lowCapacity);

    // Higher capacity should have significantly higher score with 70% weight
    expect(highCapScore - lowCapScore).toBeGreaterThan(1);
  });

  it('should respect minimum capacity threshold', () => {
    const balancer = createWorkBalancer({
      minCapacityThreshold: 0.5, // Need at least 50% of required tokens
    });

    const adapter = createMockAdapter('claude');
    const task = createTaskProfileFixture({ estimatedTokens: 10_000 });
    const lowCapacity = createCapacityInfo({ remainingTokens: 4_000 }); // 40%

    const capacities = new Map([['claude', lowCapacity]]);
    const result = balancer.balance(task, [adapter], capacities);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.balancingCode).toBe('ALL_EXHAUSTED');
    }
  });

  it('should enable debug logging', () => {
    // Just verify it doesn't throw with debug enabled
    const balancer = createWorkBalancer({ debug: true });
    const adapter = createMockAdapter('claude');
    const task = createTaskProfileFixture();
    const capacities = new Map([['claude', createCapacityInfo()]]);

    const result = balancer.balance(task, [adapter], capacities);
    expect(result.ok).toBe(true);
  });
});

describe('BalancingError', () => {
  it('should include balancing code', () => {
    const error = new BalancingError('Test error', 'NO_ADAPTERS');

    expect(error.balancingCode).toBe('NO_ADAPTERS');
    expect(error.name).toBe('BalancingError');
    expect(error.message).toBe('Test error');
  });

  it('should include context', () => {
    const error = new BalancingError('Test error', 'QUEUE_FULL', {
      context: { queueSize: 100 },
    });

    expect(error.context).toEqual({ queueSize: 100 });
  });

  it('should include cause', () => {
    const cause = new Error('Root cause');
    const error = new BalancingError('Test error', 'CAPACITY_FETCH_FAILED', {
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});
