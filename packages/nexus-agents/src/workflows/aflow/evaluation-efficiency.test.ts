/**
 * Tests for evaluation-efficiency.ts
 *
 * Covers evaluateEfficiency, calculateParallelismScore,
 * calculateDependencyEfficiency, calculateTimeoutScore,
 * calculateStepCountScore, calculateRedundancyPenalty, estimateCost.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateEfficiency,
  calculateParallelismScore,
  calculateDependencyEfficiency,
  calculateTimeoutScore,
  calculateStepCountScore,
  calculateRedundancyPenalty,
  estimateCost,
} from './evaluation-efficiency.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { TaskSpecification } from './aflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}) {
  return {
    name: 'test',
    version: '1.0.0',
    inputs: [],
    steps: [
      { id: 'step1', agent: 'code_expert', action: 'implement', inputs: {} },
      {
        id: 'step2',
        agent: 'testing_expert',
        action: 'test',
        inputs: {},
        dependsOn: ['step1'],
      },
    ],
    ...overrides,
  } as WorkflowDefinition;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(overrides: Partial<TaskSpecification> = {}) {
  return {
    description: 'Build feature',
    requiredCapabilities: ['code'],
    constraints: { requiredAgents: ['code_expert', 'testing_expert'] },
    ...overrides,
  } as TaskSpecification;
}

// ============================================================================
// calculateParallelismScore
// ============================================================================

describe('calculateParallelismScore', () => {
  it('returns 1 for single step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    expect(calculateParallelismScore(wf)).toBe(1);
  });

  it('returns 0 for no parallel steps', () => {
    expect(calculateParallelismScore(makeWorkflow())).toBe(0);
  });

  it('returns 1 when max parallel reached', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {}, parallel: true },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {} },
      ],
    });
    // maxParallel = floor(2/2) = 1, parallelSteps = 1
    expect(calculateParallelismScore(wf)).toBe(1);
  });

  it('returns 1 for empty workflow', () => {
    const wf = makeWorkflow({ steps: [] });
    expect(calculateParallelismScore(wf)).toBe(1);
  });
});

// ============================================================================
// calculateDependencyEfficiency
// ============================================================================

describe('calculateDependencyEfficiency', () => {
  it('returns 1 for single step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    expect(calculateDependencyEfficiency(wf)).toBe(1);
  });

  it('returns 0.5 for no dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {} },
      ],
    });
    expect(calculateDependencyEfficiency(wf)).toBe(0.5);
  });

  it('returns 1 for optimal dependencies (N-1 for N steps)', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {}, dependsOn: ['s1'] },
        { id: 's3', agent: 'security_expert', action: 'audit', inputs: {}, dependsOn: ['s2'] },
      ],
    });
    // 2 deps / maxReasonable(2) = 1 → abs(2-2)/4 = 0 → score = 1
    expect(calculateDependencyEfficiency(wf)).toBe(1);
  });

  it('returns 0 for too many dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {} },
        {
          id: 's2',
          agent: 'testing_expert',
          action: 'test',
          inputs: {},
          dependsOn: ['s1', 's1', 's1', 's1'],
        },
      ],
    });
    // totalDeps=4, maxReasonable=1, 4 > 1*2 → return 0
    expect(calculateDependencyEfficiency(wf)).toBe(0);
  });
});

// ============================================================================
// calculateTimeoutScore
// ============================================================================

describe('calculateTimeoutScore', () => {
  it('returns 1 when within bounds', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {}, timeout: 30000 },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {}, timeout: 30000 },
      ],
    });
    const task = makeTask({ constraints: { maxTotalTimeout: 300000 } });
    expect(calculateTimeoutScore(wf, task)).toBe(1);
  });

  it('penalizes exceeding max timeout', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {}, timeout: 200000 },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {}, timeout: 200000 },
      ],
    });
    const task = makeTask({ constraints: { maxTotalTimeout: 300000 } });
    const score = calculateTimeoutScore(wf, task);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns 0.5 when way under timeout', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, timeout: 1000 }],
    });
    const task = makeTask({ constraints: { maxTotalTimeout: 300000 } });
    expect(calculateTimeoutScore(wf, task)).toBe(0.5);
  });

  it('uses default max timeout when not specified', () => {
    const wf = makeWorkflow();
    const task = makeTask();
    const score = calculateTimeoutScore(wf, task);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// calculateStepCountScore
// ============================================================================

describe('calculateStepCountScore', () => {
  it('returns 1 when step count matches required', () => {
    const wf = makeWorkflow();
    const task = makeTask({ constraints: { requiredAgents: ['code_expert', 'testing_expert'] } });
    expect(calculateStepCountScore(wf, task)).toBe(1);
  });

  it('penalizes too few steps', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const task = makeTask({
      constraints: { requiredAgents: ['code_expert', 'testing_expert', 'security_expert'] },
    });
    // 1 step / 3 required = 0.333
    expect(calculateStepCountScore(wf, task)).toBeCloseTo(1 / 3, 2);
  });

  it('penalizes way too many steps', () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({
      id: `s${String(i)}`,
      agent: 'code_expert' as const,
      action: 'do',
      inputs: {},
    }));
    const wf = makeWorkflow({ steps });
    const task = makeTask({ constraints: { requiredAgents: ['code_expert', 'testing_expert'] } });
    // 10 > 2*3=6, so penalty applied
    const score = calculateStepCountScore(wf, task);
    expect(score).toBeLessThan(1);
  });

  it('returns 1 for steps within 3x range', () => {
    const steps = Array.from({ length: 5 }, (_, i) => ({
      id: `s${String(i)}`,
      agent: 'code_expert' as const,
      action: 'do',
      inputs: {},
    }));
    const wf = makeWorkflow({ steps });
    const task = makeTask({ constraints: { requiredAgents: ['code_expert', 'testing_expert'] } });
    // 5 <= 2*3=6
    expect(calculateStepCountScore(wf, task)).toBe(1);
  });
});

// ============================================================================
// calculateRedundancyPenalty
// ============================================================================

describe('calculateRedundancyPenalty', () => {
  it('returns 0 for no redundancy', () => {
    expect(calculateRedundancyPenalty(makeWorkflow())).toBe(0);
  });

  it('penalizes duplicate agent-action combos', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'implement', inputs: {} },
        { id: 's2', agent: 'code_expert', action: 'implement', inputs: {} },
      ],
    });
    const penalty = calculateRedundancyPenalty(wf);
    expect(penalty).toBeGreaterThan(0);
  });

  it('penalizes same-agent sequences', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'implement', inputs: {} },
        { id: 's2', agent: 'code_expert', action: 'review', inputs: {} },
      ],
    });
    const penalty = calculateRedundancyPenalty(wf);
    expect(penalty).toBeGreaterThan(0);
  });

  it('returns 0 for empty workflow', () => {
    const wf = makeWorkflow({ steps: [] });
    expect(calculateRedundancyPenalty(wf)).toBe(0);
  });

  it('returns 0 for single step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'implement', inputs: {} }],
    });
    expect(calculateRedundancyPenalty(wf)).toBe(0);
  });
});

// ============================================================================
// estimateCost
// ============================================================================

describe('estimateCost', () => {
  it('calculates base cost per step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const cost = estimateCost(wf);
    expect(cost).toBeGreaterThan(0);
  });

  it('adds retry costs', () => {
    const noRetries = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const withRetries = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, retries: 3 }],
    });
    expect(estimateCost(withRetries)).toBeGreaterThan(estimateCost(noRetries));
  });

  it('adds timeout costs', () => {
    const shortTimeout = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, timeout: 1000 }],
    });
    const longTimeout = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, timeout: 120000 }],
    });
    expect(estimateCost(longTimeout)).toBeGreaterThan(estimateCost(shortTimeout));
  });

  it('returns integer', () => {
    const cost = estimateCost(makeWorkflow());
    expect(cost).toBe(Math.round(cost));
  });
});

// ============================================================================
// evaluateEfficiency (integration)
// ============================================================================

describe('evaluateEfficiency', () => {
  it('returns a score between 0 and 1', () => {
    const score = evaluateEfficiency(makeWorkflow(), makeTask());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('averages all sub-scores', () => {
    // Single step workflow should have high parallelism (1) and dep efficiency (1)
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const score = evaluateEfficiency(wf, makeTask());
    expect(score).toBeGreaterThan(0);
  });
});
