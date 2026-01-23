/**
 * Trajectory Converter Tests
 *
 * @module agents/orchestration/trajectory-converter.test
 */

import { describe, it, expect } from 'vitest';
import type { PuppeteerStepResult, AgentDistribution, PuppeteerState } from './puppeteer-types.js';
import {
  convertTrajectory,
  convertSingleStep,
  isValidDistribution,
  convertTrajectoryWithValidation,
} from './trajectory-converter.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/** Create a mock agent distribution. */
function createMockDistribution(probabilities: Record<string, number>): AgentDistribution {
  return {
    probabilities: new Map(Object.entries(probabilities)),
    rawScores: new Map(Object.entries(probabilities)),
    reasoning: 'mock distribution',
  };
}

/** Create a mock Puppeteer state. */
function createMockState(step: number): PuppeteerState {
  return {
    step,
    task: {
      id: 'test-task',
      description: 'Test task',
      context: {
        workingDirectory: '/test',
        files: [],
        metadata: { testStep: step },
      },
    },
    agentOutputs: [],
    context: `Step ${String(step)}`,
    metadata: {
      progress: step * 0.2,
      totalCost: step * 0.1,
      totalTokens: step * 100,
      elapsedMs: step * 1000,
      startedAt: '2025-01-23T00:00:00Z',
    },
    sessionId: 'test-session',
  };
}

/** Options for creating mock step results. */
interface MockStepOptions {
  step?: number;
  agent?: string;
  reward?: number;
  distribution?: Record<string, number>;
}

/** Build default distribution for agent. */
function buildDefaultDistribution(selectedAgent: string): Record<string, number> {
  return {
    'agent-1': selectedAgent === 'agent-1' ? 0.7 : 0.15,
    'agent-2': selectedAgent === 'agent-2' ? 0.7 : 0.15,
    'agent-3': selectedAgent === 'agent-3' ? 0.7 : 0.15,
  };
}

/** Normalized mock step options. */
interface NormalizedOptions {
  step: number;
  agent: string;
  reward: number;
  distribution?: Record<string, number>;
}

/** Normalize options from overloaded signature. */
function normalizeOptions(
  stepOrOptions: number | MockStepOptions,
  agent: string,
  reward: number
): NormalizedOptions {
  if (typeof stepOrOptions === 'number') {
    return { step: stepOrOptions, agent, reward };
  }
  const opts: NormalizedOptions = {
    step: stepOrOptions.step ?? 0,
    agent: stepOrOptions.agent ?? 'agent-1',
    reward: stepOrOptions.reward ?? 1.0,
  };
  if (stepOrOptions.distribution !== undefined) {
    opts.distribution = stepOrOptions.distribution;
  }
  return opts;
}

/** Create a mock Puppeteer step result with customizable properties. */
function createMockStepResult(
  stepOrOptions: number | MockStepOptions = 0,
  agent: string = 'agent-1',
  reward: number = 1.0
): PuppeteerStepResult {
  const opts = normalizeOptions(stepOrOptions, agent, reward);
  const distribution = opts.distribution ?? buildDefaultDistribution(opts.agent);

  return {
    selectedAgent: opts.agent,
    distribution: createMockDistribution(distribution),
    agentOutput: {
      step: opts.step,
      agentId: opts.agent,
      output: { result: 'success' },
      durationMs: 100,
      tokensUsed: 50,
      model: 'claude-opus',
    },
    newState: createMockState(opts.step + 1),
    reward: opts.reward,
    shouldTerminate: false,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('convertTrajectory', () => {
  it('converts a sequence of steps to trajectory steps', () => {
    const steps = [
      createMockStepResult(0, 'agent-1', 1.0),
      createMockStepResult(1, 'agent-2', 0.5),
      createMockStepResult(2, 'agent-3', 0.8),
    ];

    const trajectory = convertTrajectory(steps);

    expect(trajectory).toHaveLength(3);
    expect(trajectory[0]?.action).toBe('agent-1');
    expect(trajectory[0]?.reward).toBe(1.0);
    expect(trajectory[1]?.action).toBe('agent-2');
    expect(trajectory[1]?.reward).toBe(0.5);
    expect(trajectory[2]?.action).toBe('agent-3');
    expect(trajectory[2]?.reward).toBe(0.8);
  });

  it('extracts log probabilities correctly', () => {
    const steps = [createMockStepResult(0, 'agent-1')];
    const trajectory = convertTrajectory(steps);

    expect(trajectory).toHaveLength(1);
    const logProb = trajectory[0]?.logProb ?? 0;
    // log(0.7) ≈ -0.357
    expect(logProb).toBeCloseTo(Math.log(0.7), 5);
    expect(logProb).toBeLessThan(0); // log of prob < 1 is negative
  });

  it('includes state from each step', () => {
    const steps = [createMockStepResult(0, 'agent-1'), createMockStepResult(1, 'agent-2')];
    const trajectory = convertTrajectory(steps);

    expect(trajectory[0]?.state.step).toBe(1); // newState has step incremented
    expect(trajectory[1]?.state.step).toBe(2);
  });

  it('preserves order of steps', () => {
    const steps = [
      createMockStepResult(0, 'agent-1'),
      createMockStepResult(1, 'agent-2'),
      createMockStepResult(2, 'agent-3'),
    ];
    const trajectory = convertTrajectory(steps);

    expect(trajectory.map((s) => s.action)).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  it('handles empty trajectory', () => {
    const trajectory = convertTrajectory([]);
    expect(trajectory).toHaveLength(0);
  });

  it('throws error when agent not in distribution', () => {
    const step = createMockStepResult({
      step: 0,
      agent: 'unknown-agent',
      distribution: { 'agent-1': 0.7, 'agent-2': 0.3 },
    });
    expect(() => convertTrajectory([step])).toThrow('not found in distribution');
  });
});

describe('convertSingleStep', () => {
  it('converts a single step to trajectory step', () => {
    const step = createMockStepResult(0, 'agent-1', 1.5);
    const trajectoryStep = convertSingleStep(step);

    expect(trajectoryStep.action).toBe('agent-1');
    expect(trajectoryStep.reward).toBe(1.5);
    expect(trajectoryStep.state).toBe(step.newState);
  });

  it('computes correct log probability', () => {
    const step = createMockStepResult(0, 'agent-1');
    const trajectoryStep = convertSingleStep(step);

    expect(trajectoryStep.logProb).toBeCloseTo(Math.log(0.7), 5);
  });

  it('throws when agent not found', () => {
    const step = createMockStepResult({
      step: 0,
      agent: 'unknown-agent',
      distribution: { 'agent-1': 0.7, 'agent-2': 0.3 },
    });
    expect(() => convertSingleStep(step)).toThrow();
  });
});

describe('isValidDistribution', () => {
  it('validates correct distribution', () => {
    const dist = createMockDistribution({
      'agent-1': 0.5,
      'agent-2': 0.3,
      'agent-3': 0.2,
    });
    expect(isValidDistribution(dist)).toBe(true);
  });

  it('rejects empty distribution', () => {
    const dist = createMockDistribution({});
    expect(isValidDistribution(dist)).toBe(false);
  });

  it('rejects non-normalized distribution', () => {
    const dist = createMockDistribution({
      'agent-1': 0.5,
      'agent-2': 0.3,
    }); // sums to 0.8
    expect(isValidDistribution(dist)).toBe(false);
  });

  it('rejects probability > 1', () => {
    const dist = createMockDistribution({
      'agent-1': 1.5,
    });
    expect(isValidDistribution(dist)).toBe(false);
  });

  it('rejects negative probability', () => {
    const dist = createMockDistribution({
      'agent-1': -0.5,
      'agent-2': 1.5,
    });
    expect(isValidDistribution(dist)).toBe(false);
  });

  it('rejects non-finite probability', () => {
    const dist: AgentDistribution = {
      probabilities: new Map([['agent-1', Infinity]]),
      rawScores: new Map([['agent-1', Infinity]]),
      reasoning: 'test',
    };
    expect(isValidDistribution(dist)).toBe(false);
  });

  it('respects minimum agent count', () => {
    const dist = createMockDistribution({
      'agent-1': 1.0,
    });
    expect(isValidDistribution(dist, 1)).toBe(true);
    expect(isValidDistribution(dist, 2)).toBe(false);
  });

  it('allows floating point rounding error', () => {
    const dist = createMockDistribution({
      'agent-1': 0.3333333,
      'agent-2': 0.3333333,
      'agent-3': 0.3333334,
    }); // sums to 1.0 within tolerance
    expect(isValidDistribution(dist)).toBe(true);
  });
});

describe('convertTrajectoryWithValidation', () => {
  it('converts valid trajectory', () => {
    const steps = [createMockStepResult(0, 'agent-1'), createMockStepResult(1, 'agent-2')];
    const trajectory = convertTrajectoryWithValidation(steps);

    expect(trajectory).toBeDefined();
    expect(trajectory).toHaveLength(2);
  });

  it('returns undefined for invalid distribution', () => {
    const step = createMockStepResult({
      step: 0,
      agent: 'agent-1',
      distribution: { 'agent-1': 0.5, 'agent-2': 0.3 }, // Not normalized
    });
    const trajectory = convertTrajectoryWithValidation([step]);

    expect(trajectory).toBeUndefined();
  });

  it('returns undefined if any step has invalid distribution', () => {
    const steps = [
      createMockStepResult(0, 'agent-1'),
      createMockStepResult({
        step: 1,
        agent: 'agent-2',
        distribution: { 'agent-2': 0.5 }, // Invalid - not normalized
      }),
    ];

    const trajectory = convertTrajectoryWithValidation(steps);
    expect(trajectory).toBeUndefined();
  });

  it('returns undefined when agent not in distribution', () => {
    const step = createMockStepResult({
      step: 0,
      agent: 'unknown-agent',
      distribution: { 'agent-1': 0.7, 'agent-2': 0.3 },
    });
    const trajectory = convertTrajectoryWithValidation([step]);

    expect(trajectory).toBeUndefined();
  });

  it('handles empty trajectory', () => {
    const trajectory = convertTrajectoryWithValidation([]);
    expect(trajectory).toEqual([]);
  });
});

describe('log probability edge cases', () => {
  it('handles very small probability', () => {
    const dist = createMockDistribution({
      'agent-1': 1e-10,
      'agent-2': 1.0 - 1e-10,
    });
    const step: PuppeteerStepResult = {
      ...createMockStepResult(0),
      selectedAgent: 'agent-1',
      distribution: dist,
    };
    const trajectoryStep = convertSingleStep(step);

    // Should not be -Infinity due to MIN_PROBABILITY clamping
    expect(Number.isFinite(trajectoryStep.logProb)).toBe(true);
    expect(trajectoryStep.logProb).toBeLessThan(0);
  });

  it('handles probability of 1.0', () => {
    const dist = createMockDistribution({
      'agent-1': 1.0,
    });
    const step: PuppeteerStepResult = {
      ...createMockStepResult(0),
      selectedAgent: 'agent-1',
      distribution: dist,
    };
    const trajectoryStep = convertSingleStep(step);

    // log(1) = 0
    expect(trajectoryStep.logProb).toBeCloseTo(0, 5);
  });
});

describe('trajectory step properties', () => {
  it('trajectory steps are immutable (readonly)', () => {
    const steps = [createMockStepResult(0)];
    const trajectory = convertTrajectory(steps);

    expect(trajectory).toHaveLength(1);
    const step = trajectory[0];
    expect(step).toBeDefined();
    // TypeScript guarantees readonly, but we can't test runtime immutability directly
    // Just verify the type is correct
    expect(step?.action).toBeDefined();
    expect(step?.reward).toBeDefined();
    expect(step?.logProb).toBeDefined();
    expect(step?.state).toBeDefined();
  });

  it('matches PolicyTrajectoryStep interface', () => {
    const step = createMockStepResult(0, 'agent-1', 2.5);
    const trajectoryStep = convertSingleStep(step);

    // Verify interface structure
    expect(trajectoryStep).toHaveProperty('state');
    expect(trajectoryStep).toHaveProperty('action');
    expect(trajectoryStep).toHaveProperty('reward');
    expect(trajectoryStep).toHaveProperty('logProb');

    // Verify types
    expect(typeof trajectoryStep.action).toBe('string');
    expect(typeof trajectoryStep.reward).toBe('number');
    expect(typeof trajectoryStep.logProb).toBe('number');
    expect(typeof trajectoryStep.state).toBe('object');
  });
});
