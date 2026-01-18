/**
 * Rule-Based Policy Tests
 *
 * Tests for the rule-based policy engine.
 *
 * @module agents/orchestration/rule-based-policy.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleBasedPolicy, createRuleBasedPolicy } from './rule-based-policy.js';
import type { PuppeteerState } from './puppeteer-types.js';
import type { Task } from '../../core/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestTask = (description = 'Test task'): Task => ({
  id: 'test-task',
  description,
  context: {},
});

const createTestState = (overrides: Partial<PuppeteerState> = {}): PuppeteerState => ({
  step: 0,
  task: createTestTask(),
  agentOutputs: [],
  context: 'Test context',
  metadata: {
    progress: 0,
    totalCost: 0,
    totalTokens: 0,
    elapsedMs: 0,
    startedAt: new Date().toISOString(),
  },
  sessionId: 'test-session',
  ...overrides,
});

const DEFAULT_AGENTS = [
  'puppet-decomposer',
  'puppet-reflector',
  'puppet-refiner',
  'puppet-critic',
  'puppet-executor',
  'puppet-terminator',
];

// =============================================================================
// Constructor Tests
// =============================================================================

describe('RuleBasedPolicy', () => {
  describe('constructor', () => {
    it('creates with default config', () => {
      const policy = new RuleBasedPolicy();
      expect(policy).toBeDefined();
    });

    it('creates with custom config', () => {
      const policy = new RuleBasedPolicy({
        temperature: 0.5,
        deterministic: true,
        repetitionPenalty: 0.5,
      });
      expect(policy).toBeDefined();
    });
  });

  describe('createRuleBasedPolicy factory', () => {
    it('creates RuleBasedPolicy instance', () => {
      const policy = createRuleBasedPolicy();
      expect(policy).toBeInstanceOf(RuleBasedPolicy);
    });
  });
});

// =============================================================================
// Compute Distribution Tests
// =============================================================================

describe('computeDistribution', () => {
  let policy: RuleBasedPolicy;

  beforeEach(() => {
    policy = new RuleBasedPolicy();
  });

  it('returns error for empty agent list', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_AGENTS');
    }
  });

  it('returns distribution for valid agents', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.probabilities.size).toBe(DEFAULT_AGENTS.length);
    }
  });

  it('probabilities sum to approximately 1', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      let sum = 0;
      for (const prob of result.value.probabilities.values()) {
        sum += prob;
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('includes raw scores', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rawScores.size).toBe(DEFAULT_AGENTS.length);
    }
  });

  it('includes reasoning', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reasoning).toBeDefined();
      expect(result.value.reasoning.length).toBeGreaterThan(0);
    }
  });

  it('favors decomposer at step 0', async () => {
    const state = createTestState({ step: 0 });
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const decomposerProb = result.value.probabilities.get('puppet-decomposer') ?? 0;
      const executorProb = result.value.probabilities.get('puppet-executor') ?? 0;
      expect(decomposerProb).toBeGreaterThan(executorProb);
    }
  });

  it('penalizes recently used agents', async () => {
    const state = createTestState({
      step: 3,
      agentOutputs: [
        {
          step: 0,
          agentId: 'puppet-decomposer',
          output: 'out',
          durationMs: 100,
          tokensUsed: 50,
          model: 'test',
        },
        {
          step: 1,
          agentId: 'puppet-executor',
          output: 'out',
          durationMs: 100,
          tokensUsed: 50,
          model: 'test',
        },
        {
          step: 2,
          agentId: 'puppet-executor',
          output: 'out',
          durationMs: 100,
          tokensUsed: 50,
          model: 'test',
        },
      ],
    });
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Executor was used twice recently, should have lower probability
      const executorProb = result.value.probabilities.get('puppet-executor') ?? 1;
      const reflectorProb = result.value.probabilities.get('puppet-reflector') ?? 0;
      // Reflector wasn't used, should have better chance
      expect(executorProb).toBeLessThan(0.5);
      expect(reflectorProb).toBeGreaterThan(0);
    }
  });

  it('responds to task keywords', async () => {
    const state = createTestState({
      task: createTestTask('Break down this complex task into subtasks'),
    });
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Decomposer should score well for "break" and "complex"
      const decomposerScore = result.value.rawScores.get('puppet-decomposer') ?? 0;
      expect(decomposerScore).toBeGreaterThan(0);
    }
  });

  it('favors terminator near completion', async () => {
    const state = createTestState({
      step: 8,
      metadata: {
        progress: 0.9,
        totalCost: 0.5,
        totalTokens: 5000,
        elapsedMs: 10000,
        startedAt: new Date().toISOString(),
      },
    });
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const terminatorProb = result.value.probabilities.get('puppet-terminator') ?? 0;
      expect(terminatorProb).toBeGreaterThan(0.1);
    }
  });
});

// =============================================================================
// Sample Agent Tests
// =============================================================================

describe('sampleAgent', () => {
  it('returns agent from distribution (deterministic)', async () => {
    const policy = new RuleBasedPolicy({ deterministic: true });
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const sampled = policy.sampleAgent(result.value);
      expect(DEFAULT_AGENTS).toContain(sampled);
    }
  });

  it('returns agent from distribution (stochastic)', async () => {
    const policy = new RuleBasedPolicy({ deterministic: false, temperature: 1.0 });
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const sampled = policy.sampleAgent(result.value);
      expect(DEFAULT_AGENTS).toContain(sampled);
    }
  });

  it('deterministic mode returns highest probability agent', async () => {
    const policy = new RuleBasedPolicy({ deterministic: true });
    const state = createTestState();
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const sampled = policy.sampleAgent(result.value);

      // Find the agent with highest probability
      let maxProb = -1;
      let maxAgent = '';
      for (const [agentId, prob] of result.value.probabilities) {
        if (prob > maxProb) {
          maxProb = prob;
          maxAgent = agentId;
        }
      }

      expect(sampled).toBe(maxAgent);
    }
  });
});

// =============================================================================
// Parameters Tests
// =============================================================================

describe('parameters', () => {
  let policy: RuleBasedPolicy;

  beforeEach(() => {
    policy = new RuleBasedPolicy();
  });

  it('getParameters returns policy parameters', () => {
    const params = policy.getParameters();

    expect(params.version).toBeDefined();
    expect(params.weights).toBeDefined();
    expect(params.biases).toBeDefined();
    expect(params.metadata).toBeDefined();
  });

  it('loadParameters updates policy', () => {
    const customParams = {
      version: '2.0.0',
      weights: { custom: 1.0 },
      biases: { 'puppet-executor': 0.5 },
      metadata: { updated: true },
    };

    policy.loadParameters(customParams);
    const retrieved = policy.getParameters();

    expect(retrieved.version).toBe('2.0.0');
    expect(retrieved.biases['puppet-executor']).toBe(0.5);
  });

  it('default weights include expected keys', () => {
    const params = policy.getParameters();

    expect(params.weights['recency']).toBeDefined();
    expect(params.weights['capability_match']).toBeDefined();
    expect(params.weights['cost_efficiency']).toBeDefined();
    expect(params.weights['pattern_match']).toBeDefined();
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  let policy: RuleBasedPolicy;

  beforeEach(() => {
    policy = new RuleBasedPolicy();
  });

  it('handles single agent', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, ['puppet-executor']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.probabilities.get('puppet-executor')).toBe(1);
    }
  });

  it('handles unknown agent IDs', async () => {
    const state = createTestState();
    const result = await policy.computeDistribution(state, ['unknown-agent-1', 'unknown-agent-2']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should still produce valid distribution
      let sum = 0;
      for (const prob of result.value.probabilities.values()) {
        sum += prob;
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('handles empty task description', async () => {
    const state = createTestState({ task: createTestTask('') });
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
  });

  it('handles very long task description', async () => {
    const longDesc = 'x'.repeat(10000);
    const state = createTestState({ task: createTestTask(longDesc) });
    const result = await policy.computeDistribution(state, DEFAULT_AGENTS);

    expect(result.ok).toBe(true);
  });
});

// =============================================================================
// Temperature Tests
// =============================================================================

describe('temperature effects', () => {
  it('low temperature produces more peaked distribution', async () => {
    const lowTempPolicy = new RuleBasedPolicy({ temperature: 0.1 });
    const highTempPolicy = new RuleBasedPolicy({ temperature: 2.0 });

    const state = createTestState();

    const lowResult = await lowTempPolicy.computeDistribution(state, DEFAULT_AGENTS);
    const highResult = await highTempPolicy.computeDistribution(state, DEFAULT_AGENTS);

    expect(lowResult.ok).toBe(true);
    expect(highResult.ok).toBe(true);

    if (lowResult.ok && highResult.ok) {
      // Calculate entropy-like measure (sum of squared probs)
      let lowSum = 0;
      let highSum = 0;
      for (const prob of lowResult.value.probabilities.values()) {
        lowSum += prob * prob;
      }
      for (const prob of highResult.value.probabilities.values()) {
        highSum += prob * prob;
      }

      // Lower temperature should have higher concentration (higher sum of squares)
      expect(lowSum).toBeGreaterThan(highSum);
    }
  });
});
