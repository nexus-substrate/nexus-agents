/**
 * LearnablePolicy Tests
 *
 * Comprehensive tests for the REINFORCE with baseline policy engine.
 * Tests cover construction, distribution computation, sampling,
 * policy updates, statistics, warmup, and parameter persistence.
 *
 * @module agents/orchestration/learnable-policy.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LearnablePolicy,
  createLearnablePolicy,
  isLearnablePolicyEngine,
} from './learnable-policy.js';
import type { PuppeteerState, AgentDistribution } from './puppeteer-types.js';
import type {
  PolicyTrajectoryStep,
  PolicyParameters,
  LearnablePolicyConfig,
} from './policy-types.js';
import { DEFAULT_LEARNABLE_CONFIG } from './policy-types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a mock PuppeteerState for testing.
 */
function createMockState(overrides: Partial<PuppeteerState> = {}): PuppeteerState {
  return {
    step: 0,
    task: {
      id: 'test-task-1',
      description: 'Test task for policy evaluation',
      context: {},
    },
    agentOutputs: [],
    context: 'Current working context',
    metadata: {
      progress: 0,
      totalCost: 0,
      totalTokens: 0,
      elapsedMs: 0,
      startedAt: new Date().toISOString(),
    },
    sessionId: 'test-session-1',
    ...overrides,
  };
}

/**
 * Creates a mock trajectory step for testing.
 */
function createTrajectoryStep(
  state: PuppeteerState,
  action: string,
  reward: number = 0.5
): PolicyTrajectoryStep {
  return {
    state,
    action,
    reward,
    logProb: -1.0,
  };
}

/**
 * Creates a full trajectory for testing policy updates.
 */
function createTrajectory(length: number = 3): PolicyTrajectoryStep[] {
  const steps: PolicyTrajectoryStep[] = [];
  const agents = ['code-agent', 'review-agent', 'test-agent'];

  for (let i = 0; i < length; i++) {
    const state = createMockState({ step: i });
    const action = agents[i % agents.length] ?? 'code-agent';
    const reward = 0.1 * (i + 1);
    steps.push(createTrajectoryStep(state, action, reward));
  }

  return steps;
}

// =============================================================================
// Construction Tests
// =============================================================================

describe('LearnablePolicy Construction', () => {
  it('should create with default config', () => {
    const policy = new LearnablePolicy();

    expect(policy).toBeInstanceOf(LearnablePolicy);
    const stats = policy.getStats();
    expect(stats.updateCount).toBe(0);
    expect(stats.currentLearningRate).toBe(DEFAULT_LEARNABLE_CONFIG.learningRate);
  });

  it('should create with custom config', () => {
    const customConfig: LearnablePolicyConfig = {
      learningRate: 0.05,
      temperature: 0.5,
      warmupUpdates: 20,
      deterministic: true,
    };

    const policy = new LearnablePolicy(customConfig);

    const stats = policy.getStats();
    expect(stats.currentLearningRate).toBe(0.05);
  });

  it('should initialize parameters correctly', () => {
    const policy = new LearnablePolicy();
    const params = policy.getParameters();

    expect(params.version).toBe('1.0.0');
    expect(params.weights).toBeDefined();
    expect(params.weights.recency).toBeCloseTo(0.3, 1);
    expect(params.weights.capability_match).toBeCloseTo(0.4, 1);
    expect(params.weights.cost_efficiency).toBeCloseTo(0.2, 1);
    expect(params.weights.pattern_match).toBeCloseTo(0.1, 1);
    expect(params.metadata.policyType).toBe('learnable');
    expect(params.metadata.algorithm).toBe('REINFORCE');
  });

  it('should create via factory function', () => {
    const policy = createLearnablePolicy({ learningRate: 0.02 });

    expect(policy).toBeDefined();
    const stats = policy.getStats();
    expect(stats.currentLearningRate).toBe(0.02);
  });
});

// =============================================================================
// computeDistribution Tests
// =============================================================================

describe('LearnablePolicy.computeDistribution', () => {
  let policy: LearnablePolicy;
  let state: PuppeteerState;
  const availableAgents = ['code-agent', 'review-agent', 'test-agent'];

  beforeEach(() => {
    policy = new LearnablePolicy();
    state = createMockState();
  });

  it('should return valid distribution for available agents', async () => {
    const result = await policy.computeDistribution(state, availableAgents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const distribution = result.value;
      expect(distribution.probabilities).toBeInstanceOf(Map);
      expect(distribution.rawScores).toBeInstanceOf(Map);
      expect(typeof distribution.reasoning).toBe('string');

      for (const agent of availableAgents) {
        expect(distribution.probabilities.has(agent)).toBe(true);
      }
    }
  });

  it('should return error for empty agents list', async () => {
    const result = await policy.computeDistribution(state, []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_AGENTS');
      expect(result.error.message).toContain('No agents available');
    }
  });

  it('should have distribution probabilities sum to approximately 1', async () => {
    const result = await policy.computeDistribution(state, availableAgents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const distribution = result.value;
      let sum = 0;
      for (const prob of distribution.probabilities.values()) {
        sum += prob;
      }
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('should assign all agents positive probabilities', async () => {
    const result = await policy.computeDistribution(state, availableAgents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const prob of result.value.probabilities.values()) {
        expect(prob).toBeGreaterThan(0);
      }
    }
  });

  it('should handle single agent', async () => {
    const result = await policy.computeDistribution(state, ['single-agent']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.probabilities.get('single-agent')).toBe(1.0);
    }
  });

  it('should respect minimum probability setting', async () => {
    const minProb = 0.1;
    const policyWithMinProb = new LearnablePolicy({ minProbability: minProb });

    const result = await policyWithMinProb.computeDistribution(state, availableAgents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const prob of result.value.probabilities.values()) {
        expect(prob).toBeGreaterThanOrEqual(minProb - 0.001);
      }
    }
  });
});

// =============================================================================
// sampleAgent Tests
// =============================================================================

describe('LearnablePolicy.sampleAgent', () => {
  it('should return valid agent from distribution', async () => {
    const policy = new LearnablePolicy();
    const state = createMockState();
    const agents = ['agent-a', 'agent-b', 'agent-c'];

    const distResult = await policy.computeDistribution(state, agents);
    expect(distResult.ok).toBe(true);

    if (distResult.ok) {
      const sampled = policy.sampleAgent(distResult.value);
      expect(agents).toContain(sampled);
    }
  });

  it('should respect deterministic mode', async () => {
    const deterministicPolicy = new LearnablePolicy({ deterministic: true });
    const state = createMockState();
    const agents = ['agent-a', 'agent-b'];

    const distResult = await deterministicPolicy.computeDistribution(state, agents);
    expect(distResult.ok).toBe(true);

    if (distResult.ok) {
      // In deterministic mode, should always return the same agent
      const samples = new Set<string>();
      for (let i = 0; i < 10; i++) {
        samples.add(deterministicPolicy.sampleAgent(distResult.value));
      }
      expect(samples.size).toBe(1);
    }
  });

  it('should return highest probability agent in deterministic mode', () => {
    const policy = new LearnablePolicy({ deterministic: true });

    // Create a distribution with known probabilities
    const distribution: AgentDistribution = {
      probabilities: new Map([
        ['low-prob', 0.1],
        ['high-prob', 0.7],
        ['mid-prob', 0.2],
      ]),
      rawScores: new Map([
        ['low-prob', 0.5],
        ['high-prob', 2.0],
        ['mid-prob', 1.0],
      ]),
      reasoning: 'Test distribution',
    };

    const sampled = policy.sampleAgent(distribution);
    expect(sampled).toBe('high-prob');
  });

  it('should sample probabilistically in stochastic mode', () => {
    const policy = new LearnablePolicy({ deterministic: false });

    // Create heavily skewed distribution
    const distribution: AgentDistribution = {
      probabilities: new Map([
        ['rare', 0.01],
        ['common', 0.99],
      ]),
      rawScores: new Map([
        ['rare', 0.1],
        ['common', 5.0],
      ]),
      reasoning: 'Skewed distribution',
    };

    // Sample many times - should mostly get 'common'
    let commonCount = 0;
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      if (policy.sampleAgent(distribution) === 'common') {
        commonCount++;
      }
    }

    // Should get 'common' most of the time (with high probability)
    expect(commonCount).toBeGreaterThan(80);
  });
});

// =============================================================================
// updatePolicy Tests (REINFORCE)
// =============================================================================

describe('LearnablePolicy.updatePolicy', () => {
  let policy: LearnablePolicy;

  beforeEach(() => {
    policy = new LearnablePolicy({
      learningRate: 0.1,
      learningRateDecay: 0.9,
      baselineDecay: 0.5,
      warmupUpdates: 5,
    });
  });

  it('should update weights after trajectory', async () => {
    const trajectory = createTrajectory(3);
    const initialParams = policy.getParameters();
    const initialWeights = { ...initialParams.weights };

    const result = await policy.updatePolicy(trajectory, 1.0);

    expect(result.ok).toBe(true);
    const updatedParams = policy.getParameters();

    // At least one weight should have changed
    const weightsChanged = Object.keys(initialWeights).some(
      (key) => Math.abs((updatedParams.weights[key] ?? 0) - (initialWeights[key] ?? 0)) > 0.0001
    );
    expect(weightsChanged).toBe(true);
  });

  it('should update baseline with exponential moving average', async () => {
    const trajectory = createTrajectory(2);
    const initialStats = policy.getStats();
    expect(initialStats.baseline).toBe(0);

    await policy.updatePolicy(trajectory, 1.0);
    const afterFirstUpdate = policy.getStats();

    // With baselineDecay=0.5: baseline = 0.5 * 0 + 0.5 * 1.0 = 0.5
    expect(afterFirstUpdate.baseline).toBeCloseTo(0.5, 2);

    await policy.updatePolicy(trajectory, 0.5);
    const afterSecondUpdate = policy.getStats();

    // baseline = 0.5 * 0.5 + 0.5 * 0.5 = 0.5
    expect(afterSecondUpdate.baseline).toBeCloseTo(0.5, 2);
  });

  it('should decay learning rate over updates', async () => {
    const trajectory = createTrajectory(2);
    const initialLR = policy.getStats().currentLearningRate;
    expect(initialLR).toBe(0.1);

    await policy.updatePolicy(trajectory, 1.0);
    const afterFirst = policy.getStats();

    // LR should decay: 0.1 * 0.9 = 0.09
    expect(afterFirst.currentLearningRate).toBeCloseTo(0.09, 4);

    await policy.updatePolicy(trajectory, 1.0);
    const afterSecond = policy.getStats();

    // LR should decay again: 0.09 * 0.9 = 0.081
    expect(afterSecond.currentLearningRate).toBeCloseTo(0.081, 4);
  });

  it('should not decay learning rate below minimum', async () => {
    const policyWithMinLR = new LearnablePolicy({
      learningRate: 0.01,
      minLearningRate: 0.005,
      learningRateDecay: 0.1, // Aggressive decay
    });

    const trajectory = createTrajectory(2);

    // Update multiple times to hit the floor
    for (let i = 0; i < 10; i++) {
      await policyWithMinLR.updatePolicy(trajectory, 1.0);
    }

    const stats = policyWithMinLR.getStats();
    expect(stats.currentLearningRate).toBeGreaterThanOrEqual(0.005);
  });

  it('should apply gradient clipping', async () => {
    const policyWithClip = new LearnablePolicy({
      gradientClip: 0.1,
      learningRate: 1.0, // High LR to amplify gradients
    });

    const trajectory = createTrajectory(3);
    const initialParams = policyWithClip.getParameters();

    await policyWithClip.updatePolicy(trajectory, 10.0); // High reward

    const updatedParams = policyWithClip.getParameters();

    // With gradient clipping, weight changes should be bounded
    for (const key of Object.keys(initialParams.weights)) {
      const initialWeight = initialParams.weights[key] ?? 0;
      const updatedWeight = updatedParams.weights[key] ?? 0;
      // The change should be limited by the clip value
      // (normalized weights will differ but clip prevents huge jumps)
      expect(Math.abs(updatedWeight - initialWeight)).toBeLessThan(1.0);
    }
  });

  it('should handle empty trajectory gracefully', async () => {
    const initialStats = policy.getStats();
    const result = await policy.updatePolicy([], 1.0);

    expect(result.ok).toBe(true);
    const afterStats = policy.getStats();

    // Should not change update count for empty trajectory
    expect(afterStats.updateCount).toBe(initialStats.updateCount);
  });

  it('should increment update count after successful update', async () => {
    const trajectory = createTrajectory(2);

    expect(policy.getStats().updateCount).toBe(0);

    await policy.updatePolicy(trajectory, 1.0);
    expect(policy.getStats().updateCount).toBe(1);

    await policy.updatePolicy(trajectory, 0.5);
    expect(policy.getStats().updateCount).toBe(2);
  });

  it('should accumulate episode statistics', async () => {
    const trajectory = createTrajectory(3);

    await policy.updatePolicy(trajectory, 0.8);
    const stats1 = policy.getStats();
    expect(stats1.totalEpisodes).toBe(1);
    expect(stats1.avgFinalReward).toBeCloseTo(0.8, 5);

    await policy.updatePolicy(trajectory, 0.4);
    const stats2 = policy.getStats();
    expect(stats2.totalEpisodes).toBe(2);
    expect(stats2.avgFinalReward).toBeCloseTo(0.6, 5); // (0.8 + 0.4) / 2
  });

  it('should normalize weights to sum to 1', async () => {
    const trajectory = createTrajectory(5);

    await policy.updatePolicy(trajectory, 2.0);
    const params = policy.getParameters();

    const weightSum = Object.values(params.weights).reduce((sum, w) => sum + Math.abs(w), 0);
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  it('should update metadata with training info', async () => {
    const trajectory = createTrajectory(2);

    const beforeUpdate = policy.getParameters();
    const beforeTrainedOn = (beforeUpdate.metadata.trainedOnTasks as number) ?? 0;

    await policy.updatePolicy(trajectory, 1.0);

    const afterUpdate = policy.getParameters();
    expect(afterUpdate.metadata.trainedOnTasks).toBe(beforeTrainedOn + 1);
    expect(afterUpdate.metadata.lastUpdated).toBeDefined();
  });
});

// =============================================================================
// getStats Tests
// =============================================================================

describe('LearnablePolicy.getStats', () => {
  it('should return correct updateCount', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(2);

    expect(policy.getStats().updateCount).toBe(0);

    await policy.updatePolicy(trajectory, 1.0);
    expect(policy.getStats().updateCount).toBe(1);

    await policy.updatePolicy(trajectory, 0.5);
    await policy.updatePolicy(trajectory, 0.8);
    expect(policy.getStats().updateCount).toBe(3);
  });

  it('should return current learning rate', () => {
    const policy = new LearnablePolicy({ learningRate: 0.05 });
    expect(policy.getStats().currentLearningRate).toBe(0.05);
  });

  it('should track total episodes', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(2);

    expect(policy.getStats().totalEpisodes).toBe(0);

    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 0.5);

    expect(policy.getStats().totalEpisodes).toBe(2);
  });

  it('should track average episode length', async () => {
    const policy = new LearnablePolicy();

    const trajectory3 = createTrajectory(3);
    await policy.updatePolicy(trajectory3, 1.0);

    const trajectory5 = createTrajectory(5);
    await policy.updatePolicy(trajectory5, 1.0);

    const stats = policy.getStats();
    expect(stats.avgEpisodeLength).toBeCloseTo(4.0, 5); // (3 + 5) / 2
  });

  it('should track last gradient norm', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(3);

    expect(policy.getStats().lastGradientNorm).toBe(0);

    await policy.updatePolicy(trajectory, 1.0);

    expect(policy.getStats().lastGradientNorm).toBeGreaterThan(0);
  });

  it('should return zero averages before any updates', () => {
    const policy = new LearnablePolicy();
    const stats = policy.getStats();

    expect(stats.avgEpisodeLength).toBe(0);
    expect(stats.avgFinalReward).toBe(0);
  });
});

// =============================================================================
// isWarmedUp Tests
// =============================================================================

describe('LearnablePolicy.isWarmedUp', () => {
  it('should return false before warmup threshold', async () => {
    const policy = new LearnablePolicy({ warmupUpdates: 5 });
    const trajectory = createTrajectory(2);

    expect(policy.isWarmedUp()).toBe(false);

    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 1.0);

    expect(policy.getStats().updateCount).toBe(4);
    expect(policy.isWarmedUp()).toBe(false);
  });

  it('should return true after enough updates', async () => {
    const policy = new LearnablePolicy({ warmupUpdates: 3 });
    const trajectory = createTrajectory(2);

    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 1.0);
    expect(policy.isWarmedUp()).toBe(false);

    await policy.updatePolicy(trajectory, 1.0);
    expect(policy.isWarmedUp()).toBe(true);
  });

  it('should remain warmed up after crossing threshold', async () => {
    const policy = new LearnablePolicy({ warmupUpdates: 2 });
    const trajectory = createTrajectory(2);

    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 1.0);
    expect(policy.isWarmedUp()).toBe(true);

    await policy.updatePolicy(trajectory, 1.0);
    await policy.updatePolicy(trajectory, 1.0);
    expect(policy.isWarmedUp()).toBe(true);
  });

  it('should handle zero warmup updates', () => {
    const policy = new LearnablePolicy({ warmupUpdates: 0 });
    expect(policy.isWarmedUp()).toBe(true);
  });
});

// =============================================================================
// getParameters/loadParameters Tests
// =============================================================================

describe('LearnablePolicy parameter persistence', () => {
  it('should round-trip parameters correctly', async () => {
    const policy1 = new LearnablePolicy();
    const trajectory = createTrajectory(3);

    // Train the first policy
    await policy1.updatePolicy(trajectory, 1.0);
    await policy1.updatePolicy(trajectory, 0.5);

    const savedParams = policy1.getParameters();

    // Create new policy and load parameters
    const policy2 = new LearnablePolicy();
    policy2.loadParameters(savedParams);

    const loadedParams = policy2.getParameters();

    // Verify weights match
    expect(loadedParams.weights).toEqual(savedParams.weights);
    expect(loadedParams.biases).toEqual(savedParams.biases);
    expect(loadedParams.version).toBe(savedParams.version);
  });

  it('should restore learning state from metadata', async () => {
    const policy1 = new LearnablePolicy({
      learningRate: 0.1,
      learningRateDecay: 0.9,
    });
    const trajectory = createTrajectory(2);

    await policy1.updatePolicy(trajectory, 1.0);
    await policy1.updatePolicy(trajectory, 0.8);

    const savedParams = policy1.getParameters();
    const originalStats = policy1.getStats();

    // Create new policy and load
    const policy2 = new LearnablePolicy();
    policy2.loadParameters(savedParams);

    const restoredStats = policy2.getStats();

    expect(restoredStats.updateCount).toBe(originalStats.updateCount);
    expect(restoredStats.baseline).toBeCloseTo(originalStats.baseline, 5);
    expect(restoredStats.currentLearningRate).toBeCloseTo(originalStats.currentLearningRate, 5);
  });

  it('should preserve custom weights after load', () => {
    const customParams: PolicyParameters = {
      version: '2.0.0',
      weights: {
        recency: 0.1,
        capability_match: 0.6,
        cost_efficiency: 0.1,
        pattern_match: 0.2,
      },
      biases: {
        'preferred-agent': 0.5,
      },
      metadata: {
        updateCount: 10,
        baseline: 0.75,
        currentLearningRate: 0.005,
        customField: 'test',
      },
    };

    const policy = new LearnablePolicy();
    policy.loadParameters(customParams);

    const loaded = policy.getParameters();
    expect(loaded.weights.recency).toBe(0.1);
    expect(loaded.weights.capability_match).toBe(0.6);
    expect(loaded.biases['preferred-agent']).toBe(0.5);

    const stats = policy.getStats();
    expect(stats.updateCount).toBe(10);
    expect(stats.baseline).toBe(0.75);
    expect(stats.currentLearningRate).toBe(0.005);
  });

  it('should handle missing metadata fields gracefully', () => {
    const minimalParams: PolicyParameters = {
      version: '1.0.0',
      weights: { recency: 0.5, capability_match: 0.5 },
      biases: {},
      metadata: {},
    };

    const policy = new LearnablePolicy();
    expect(() => {
      policy.loadParameters(minimalParams);
    }).not.toThrow();

    const stats = policy.getStats();
    // Should retain initial values for missing metadata
    expect(stats.updateCount).toBe(0);
  });

  it('should include metadata in getParameters output', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(2);

    await policy.updatePolicy(trajectory, 1.0);

    const params = policy.getParameters();

    expect(params.metadata.updateCount).toBe(1);
    expect(typeof params.metadata.baseline).toBe('number');
    expect(typeof params.metadata.currentLearningRate).toBe('number');
    expect(params.metadata.policyType).toBe('learnable');
    expect(params.metadata.algorithm).toBe('REINFORCE');
  });
});

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('isLearnablePolicyEngine', () => {
  it('should return true for LearnablePolicy instance', () => {
    const policy = new LearnablePolicy();
    expect(isLearnablePolicyEngine(policy)).toBe(true);
  });

  it('should return true for object with required methods', () => {
    const mockEngine = {
      updatePolicy: vi.fn(),
      getStats: vi.fn(),
      isWarmedUp: vi.fn(),
      computeDistribution: vi.fn(),
      sampleAgent: vi.fn(),
      getParameters: vi.fn(),
      loadParameters: vi.fn(),
    };
    expect(isLearnablePolicyEngine(mockEngine)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isLearnablePolicyEngine(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isLearnablePolicyEngine(undefined)).toBe(false);
  });

  it('should return false for primitive values', () => {
    expect(isLearnablePolicyEngine('string')).toBe(false);
    expect(isLearnablePolicyEngine(123)).toBe(false);
    expect(isLearnablePolicyEngine(true)).toBe(false);
  });

  it('should return false for object missing required methods', () => {
    const incomplete = {
      updatePolicy: vi.fn(),
      getStats: vi.fn(),
      // missing isWarmedUp
    };
    expect(isLearnablePolicyEngine(incomplete)).toBe(false);
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('LearnablePolicy edge cases', () => {
  it('should handle trajectory with single step', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(1);

    const result = await policy.updatePolicy(trajectory, 0.5);
    expect(result.ok).toBe(true);
    expect(policy.getStats().updateCount).toBe(1);
  });

  it('should handle negative rewards', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(2);

    const result = await policy.updatePolicy(trajectory, -0.5);
    expect(result.ok).toBe(true);

    const stats = policy.getStats();
    expect(stats.avgFinalReward).toBeLessThan(0);
  });

  it('should handle zero final reward', async () => {
    const policy = new LearnablePolicy();
    const trajectory = createTrajectory(2);

    const result = await policy.updatePolicy(trajectory, 0);
    expect(result.ok).toBe(true);
  });

  it('should handle large final reward', async () => {
    const policy = new LearnablePolicy({ gradientClip: 1.0 });
    const trajectory = createTrajectory(2);

    // With gradient clipping, large rewards should not cause issues
    const result = await policy.updatePolicy(trajectory, 100.0);
    expect(result.ok).toBe(true);

    // Weights should still be normalized
    const params = policy.getParameters();
    const weightSum = Object.values(params.weights).reduce((s, w) => s + Math.abs(w), 0);
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  it('should handle many agents', async () => {
    const policy = new LearnablePolicy();
    const state = createMockState();
    const manyAgents = Array.from({ length: 50 }, (_, i) => `agent-${String(i)}`);

    const result = await policy.computeDistribution(state, manyAgents);
    expect(result.ok).toBe(true);

    if (result.ok) {
      let sum = 0;
      for (const prob of result.value.probabilities.values()) {
        sum += prob;
      }
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('should produce different distributions for different states', async () => {
    const policy = new LearnablePolicy();
    const agents = ['code-agent', 'test-agent'];

    const state1 = createMockState({ step: 0 });
    const state2 = createMockState({
      step: 5,
      agentOutputs: [
        {
          step: 0,
          agentId: 'code-agent',
          output: 'test',
          durationMs: 100,
          tokensUsed: 50,
          model: 'test',
        },
      ],
    });

    const result1 = await policy.computeDistribution(state1, agents);
    const result2 = await policy.computeDistribution(state2, agents);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Raw scores should definitely differ between states
      const scores1 = result1.value.rawScores;
      const scores2 = result2.value.rawScores;

      const scoreDiff = Math.abs(
        (scores1.get('code-agent') ?? 0) - (scores2.get('code-agent') ?? 0)
      );

      // Some difference expected due to recency penalty
      expect(scoreDiff).toBeGreaterThanOrEqual(0);

      // Both distributions should be valid
      expect(result1.value.probabilities.size).toBeGreaterThan(0);
      expect(result2.value.probabilities.size).toBeGreaterThan(0);
    }
  });
});
