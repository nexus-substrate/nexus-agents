/**
 * Tests for evaluation-completeness.ts
 *
 * Covers evaluateCompleteness, calculateAgentCoverageScore,
 * calculateCapabilityCoverageScore, calculateConstraintScore,
 * and generateFeedback.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateCompleteness,
  calculateAgentCoverageScore,
  calculateCapabilityCoverageScore,
  calculateConstraintScore,
  generateFeedback,
} from './evaluation-completeness.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { TaskSpecification, TaskConstraints } from './aflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
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
  };
}

function makeTask(overrides: Partial<TaskSpecification> = {}): TaskSpecification {
  return {
    description: 'Build feature',
    requiredCapabilities: ['code', 'testing'],
    constraints: { requiredAgents: ['code_expert', 'testing_expert'] },
    ...overrides,
  } as unknown as TaskSpecification;
}

// ============================================================================
// calculateAgentCoverageScore
// ============================================================================

describe('calculateAgentCoverageScore', () => {
  it('returns 1 when all required agents present', () => {
    expect(calculateAgentCoverageScore(makeWorkflow(), makeTask())).toBe(1);
  });

  it('returns 1 when no agents required', () => {
    const task = makeTask({ constraints: { requiredAgents: [] } });
    expect(calculateAgentCoverageScore(makeWorkflow(), task)).toBe(1);
  });

  it('returns 1 when constraints undefined', () => {
    const task = makeTask({ constraints: undefined });
    expect(calculateAgentCoverageScore(makeWorkflow(), task)).toBe(1);
  });

  it('returns partial score for missing agents', () => {
    const task = makeTask({
      constraints: { requiredAgents: ['code_expert', 'testing_expert', 'security_expert'] },
    });
    // 2 of 3 present
    expect(calculateAgentCoverageScore(makeWorkflow(), task)).toBeCloseTo(2 / 3, 2);
  });

  it('returns 0 when no required agents present', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const task = makeTask({ constraints: { requiredAgents: ['security_expert'] } });
    expect(calculateAgentCoverageScore(wf, task)).toBe(0);
  });
});

// ============================================================================
// calculateCapabilityCoverageScore
// ============================================================================

describe('calculateCapabilityCoverageScore', () => {
  it('returns 1 when all capabilities covered', () => {
    const task = makeTask({ requiredCapabilities: ['code', 'testing'] });
    // code_expert agent 'implement' action matches 'code' capability
    // testing_expert agent 'test' action matches 'testing' capability
    expect(calculateCapabilityCoverageScore(makeWorkflow(), task)).toBe(1);
  });

  it('returns 1 when no capabilities required', () => {
    const task = makeTask({ requiredCapabilities: [] });
    expect(calculateCapabilityCoverageScore(makeWorkflow(), task)).toBe(1);
  });

  it('returns partial score for missing capabilities', () => {
    const task = makeTask({ requiredCapabilities: ['code', 'security', 'documentation'] });
    const score = calculateCapabilityCoverageScore(makeWorkflow(), task);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('matches capability by agent name', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'security_expert', action: 'custom', inputs: {} }],
    });
    const task = makeTask({ requiredCapabilities: ['security'] });
    // 'security_expert'.includes('security') → covered
    expect(calculateCapabilityCoverageScore(wf, task)).toBe(1);
  });
});

// ============================================================================
// calculateConstraintScore
// ============================================================================

describe('calculateConstraintScore', () => {
  it('returns 1 when no constraints', () => {
    expect(calculateConstraintScore(makeWorkflow())).toBe(1);
  });

  it('returns 1 when constraints undefined', () => {
    expect(calculateConstraintScore(makeWorkflow(), undefined)).toBe(1);
  });

  it('checks forbidden agents', () => {
    const constraints: TaskConstraints = {
      forbiddenAgents: ['code_expert'],
    };
    // code_expert is in the workflow → violated
    expect(calculateConstraintScore(makeWorkflow(), constraints)).toBe(0);
  });

  it('passes when forbidden agents not present', () => {
    const constraints: TaskConstraints = {
      forbiddenAgents: ['security_expert'],
    };
    expect(calculateConstraintScore(makeWorkflow(), constraints)).toBe(1);
  });

  it('checks max retries per step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, retries: 5 }],
    });
    const constraints: TaskConstraints = { maxRetriesPerStep: 3 };
    expect(calculateConstraintScore(wf, constraints)).toBe(0);
  });

  it('passes max retries when within limit', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, retries: 2 }],
    });
    const constraints: TaskConstraints = { maxRetriesPerStep: 3 };
    expect(calculateConstraintScore(wf, constraints)).toBe(1);
  });

  it('checks parallel requirement', () => {
    const constraints: TaskConstraints = { requireParallel: true };
    // No parallel steps in default workflow
    expect(calculateConstraintScore(makeWorkflow(), constraints)).toBe(0);
  });

  it('passes parallel requirement when met', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {}, parallel: true }],
    });
    const constraints: TaskConstraints = { requireParallel: true };
    expect(calculateConstraintScore(wf, constraints)).toBe(1);
  });

  it('does not credit a zero-step workflow with forbidden-agent compliance (#4585)', () => {
    const constraints: TaskConstraints = { forbiddenAgents: ['code_expert'] };
    // `![].some(isForbidden)` is true: an empty workflow used to score a
    // perfect 1 on a constraint it was never measured against.
    expect(calculateConstraintScore(makeWorkflow({ steps: [] }), constraints)).toBe(0);
  });

  it('does not credit a zero-step workflow on step-derived constraints (#4585)', () => {
    const constraints: TaskConstraints = { maxRetriesPerStep: 3, requireParallel: false };
    expect(calculateConstraintScore(makeWorkflow({ steps: [] }), constraints)).toBe(0);
  });

  it('averages multiple constraint checks', () => {
    const constraints: TaskConstraints = {
      forbiddenAgents: ['security_expert'], // passes
      requireParallel: true, // fails
    };
    // 1 pass + 0 fail = 0.5
    expect(calculateConstraintScore(makeWorkflow(), constraints)).toBe(0.5);
  });
});

// ============================================================================
// generateFeedback
// ============================================================================

describe('generateFeedback', () => {
  it('returns positive feedback for good workflow', () => {
    const feedback = generateFeedback(makeWorkflow(), makeTask());
    expect(feedback.length).toBeGreaterThan(0);
  });

  it('warns about too few steps', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const feedback = generateFeedback(wf, makeTask());
    expect(feedback.some((f) => f.includes('fewer than 2'))).toBe(true);
  });

  it('identifies missing required agents', () => {
    const task = makeTask({
      constraints: { requiredAgents: ['security_expert'] },
    });
    const feedback = generateFeedback(makeWorkflow(), task);
    expect(feedback.some((f) => f.includes('security_expert'))).toBe(true);
  });

  it('suggests parallel execution', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {} },
        { id: 's3', agent: 'security_expert', action: 'audit', inputs: {} },
      ],
    });
    const feedback = generateFeedback(wf, makeTask());
    expect(feedback.some((f) => f.includes('parallel'))).toBe(true);
  });

  it('warns about steps with no dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 's2', agent: 'testing_expert', action: 'test', inputs: {} },
      ],
    });
    const feedback = generateFeedback(wf, makeTask());
    expect(feedback.some((f) => f.includes('no dependencies'))).toBe(true);
  });

  it('reports a zero-step workflow as empty, not as cyclic (#4585)', () => {
    const feedback = generateFeedback(makeWorkflow({ steps: [] }), makeTask());
    expect(feedback.some((f) => f.includes('no steps'))).toBe(true);
    expect(feedback.some((f) => f.includes('cycle'))).toBe(false);
  });

  it('returns "looks good" when no issues', () => {
    const wf = makeWorkflow();
    const task = makeTask({ constraints: { requiredAgents: ['code_expert', 'testing_expert'] } });
    const feedback = generateFeedback(wf, task);
    expect(feedback.some((f) => f.includes('looks good'))).toBe(true);
  });
});

// ============================================================================
// evaluateCompleteness (integration)
// ============================================================================

describe('evaluateCompleteness', () => {
  it('returns a score between 0 and 1', () => {
    const score = evaluateCompleteness(makeWorkflow(), makeTask());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns 1 for perfect completeness', () => {
    const task = makeTask({
      requiredCapabilities: ['code', 'testing'],
      constraints: { requiredAgents: ['code_expert', 'testing_expert'] },
    });
    expect(evaluateCompleteness(makeWorkflow(), task)).toBe(1);
  });

  it('returns lower score for incomplete workflow', () => {
    const task = makeTask({
      requiredCapabilities: ['code', 'testing', 'security', 'documentation'],
      constraints: { requiredAgents: ['code_expert', 'testing_expert', 'security_expert'] },
    });
    const score = evaluateCompleteness(makeWorkflow(), task);
    expect(score).toBeLessThan(1);
  });
});
