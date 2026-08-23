/**
 * Tests for evaluation-structure.ts, evaluation-efficiency.ts,
 * and evaluation-completeness.ts
 *
 * Covers structural validation, efficiency scoring, completeness scoring,
 * redundancy penalties, cost estimation, constraint checks, and feedback.
 */

import { describe, it, expect } from 'vitest';
import type { AgentRole } from '../../core/types/agent.js';
import {
  evaluateStructure,
  hasValidSteps,
  hasNoCycles,
  hasValidDependencies,
  hasUniqueStepIds,
  hasValidAgentRoles,
  isViableWorkflow,
} from './evaluation-structure.js';
import {
  evaluateEfficiency,
  calculateParallelismScore,
  calculateDependencyEfficiency,
  calculateTimeoutScore,
  calculateStepCountScore,
  calculateRedundancyPenalty,
  estimateCost,
} from './evaluation-efficiency.js';
import {
  evaluateCompleteness,
  calculateAgentCoverageScore,
  calculateCapabilityCoverageScore,
  calculateConstraintScore,
  generateFeedback,
} from './evaluation-completeness.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { TaskSpecification } from './aflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    name: 'test',
    version: '1.0.0',
    inputs: [],
    steps: [
      { id: 'step1', agent: 'code_expert', action: 'Implement', inputs: {} },
      {
        id: 'step2',
        agent: 'testing_expert',
        action: 'Test',
        inputs: {},
        dependsOn: ['step1'],
      },
    ],
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskSpecification> = {}): TaskSpecification {
  return {
    description: 'Build a feature',
    requiredCapabilities: ['code', 'testing'],
    constraints: {
      requiredAgents: ['code_expert', 'testing_expert'],
    },
    ...overrides,
  } as unknown as TaskSpecification;
}

// ============================================================================
// evaluateStructure
// ============================================================================

describe('evaluateStructure', () => {
  it('returns 1.0 for valid workflow', () => {
    expect(evaluateStructure(makeWorkflow())).toBe(1.0);
  });

  it('returns less than 1.0 for invalid agent roles', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'invalid_role' as AgentRole, action: 'Do', inputs: {} }],
    });
    expect(evaluateStructure(wf)).toBeLessThan(1.0);
  });

  it('scores a zero-step workflow at zero, not on vacuous passes (#4585)', () => {
    // Previously asserted `toBeLessThanOrEqual(0.6)`, which encoded the
    // half-fixed state: only `hasValidSteps` and `hasNoCycles` named the empty
    // case, so `hasValidDependencies` / `hasUniqueStepIds` /
    // `hasValidAgentRoles` still passed vacuously and handed an empty workflow
    // 3 of 5. A workflow with zero steps satisfies no structural property.
    expect(evaluateStructure(makeWorkflow({ steps: [] }))).toBe(0);
  });
});

// ============================================================================
// hasValidSteps
// ============================================================================

describe('hasValidSteps', () => {
  it('returns true for valid steps', () => {
    expect(hasValidSteps(makeWorkflow())).toBe(true);
  });

  it('returns false for empty steps', () => {
    expect(hasValidSteps(makeWorkflow({ steps: [] }))).toBe(false);
  });

  it('returns false for step with empty id', () => {
    const wf = makeWorkflow({
      steps: [{ id: '', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    expect(hasValidSteps(wf)).toBe(false);
  });
});

// ============================================================================
// hasNoCycles
// ============================================================================

describe('hasNoCycles', () => {
  it('returns true for acyclic workflow', () => {
    expect(hasNoCycles(makeWorkflow())).toBe(true);
  });

  it('returns false for cyclic dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['b'] },
        { id: 'b', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['a'] },
      ],
    });
    expect(hasNoCycles(wf)).toBe(false);
  });

  it('returns true for no dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'Do', inputs: {} },
      ],
    });
    expect(hasNoCycles(wf)).toBe(true);
  });

  it('returns false for a zero-step workflow instead of a vacuous pass (#4585)', () => {
    // `[].some()` is false, so the old `!steps.some(hasCycle)` certified a
    // workflow with nothing in it as acyclic. There is no DAG to verify.
    expect(hasNoCycles(makeWorkflow({ steps: [] }))).toBe(false);
  });
});

// ============================================================================
// hasValidDependencies
// ============================================================================

describe('hasValidDependencies', () => {
  it('returns true for valid refs', () => {
    expect(hasValidDependencies(makeWorkflow())).toBe(true);
  });

  it('returns false for missing dependency', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['missing'] }],
    });
    expect(hasValidDependencies(wf)).toBe(false);
  });

  it('returns false for a zero-step workflow instead of a vacuous pass (#4585)', () => {
    // `[].every()` is true, so an empty workflow used to certify that all of
    // its (nonexistent) dependencies resolve. There is nothing to resolve.
    expect(hasValidDependencies(makeWorkflow({ steps: [] }))).toBe(false);
  });
});

// ============================================================================
// hasUniqueStepIds
// ============================================================================

describe('hasUniqueStepIds', () => {
  it('returns true for unique IDs', () => {
    expect(hasUniqueStepIds(makeWorkflow())).toBe(true);
  });

  it('returns false for duplicate IDs', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'dup', agent: 'code_expert', action: 'Do', inputs: {} },
        { id: 'dup', agent: 'testing_expert', action: 'Test', inputs: {} },
      ],
    });
    expect(hasUniqueStepIds(wf)).toBe(false);
  });

  it('returns false for a zero-step workflow instead of a vacuous pass (#4585)', () => {
    // `0 === new Set([]).size` is true, so an empty workflow used to certify
    // uniqueness over an empty id list. No ids means no uniqueness observed.
    expect(hasUniqueStepIds(makeWorkflow({ steps: [] }))).toBe(false);
  });
});

// ============================================================================
// hasValidAgentRoles
// ============================================================================

describe('hasValidAgentRoles', () => {
  it('returns true for valid roles', () => {
    expect(hasValidAgentRoles(makeWorkflow())).toBe(true);
  });

  it('returns false for invalid role', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'nonexistent' as AgentRole, action: 'Do', inputs: {} }],
    });
    expect(hasValidAgentRoles(wf)).toBe(false);
  });

  it('returns false for a zero-step workflow instead of a vacuous pass (#4585)', () => {
    // `[].every()` is true, so an empty workflow used to certify that every
    // agent role is valid without ever reading a role.
    expect(hasValidAgentRoles(makeWorkflow({ steps: [] }))).toBe(false);
  });
});

// ============================================================================
// isViableWorkflow
// ============================================================================

describe('isViableWorkflow', () => {
  it('returns true for workflow meeting min steps', () => {
    expect(isViableWorkflow(makeWorkflow(), 2)).toBe(true);
  });

  it('returns false for workflow below min steps', () => {
    expect(isViableWorkflow(makeWorkflow(), 5)).toBe(false);
  });

  it('rejects a zero-step workflow even when minSteps is 0 (#4585)', () => {
    // `minSteps: 0` makes the length guard vacuous, so viability rests
    // entirely on the structural checks. This was already false before the
    // #4585 empty-case work (`hasValidSteps` requires >= 1 step) - the change
    // to `hasNoCycles` did not flip it - but nothing pinned it, so pin it.
    expect(isViableWorkflow(makeWorkflow({ steps: [] }), 0)).toBe(false);
  });
});

// ============================================================================
// evaluateEfficiency
// ============================================================================

describe('evaluateEfficiency', () => {
  it('returns a score between 0 and 1', () => {
    const score = evaluateEfficiency(makeWorkflow(), makeTask());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// calculateParallelismScore
// ============================================================================

describe('calculateParallelismScore', () => {
  it('returns 1 for single step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    expect(calculateParallelismScore(wf)).toBe(1);
  });

  it('returns 0 for no parallel steps', () => {
    expect(calculateParallelismScore(makeWorkflow())).toBe(0);
  });

  it('increases with parallel steps', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, parallel: true },
        { id: 's2', agent: 'testing_expert', action: 'Test', inputs: {} },
      ],
    });
    expect(calculateParallelismScore(wf)).toBeGreaterThan(0);
  });
});

// ============================================================================
// calculateDependencyEfficiency
// ============================================================================

describe('calculateDependencyEfficiency', () => {
  it('returns 1 for single step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    expect(calculateDependencyEfficiency(wf)).toBe(1);
  });

  it('returns 0.5 for no dependencies with multiple steps', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'Do', inputs: {} },
        { id: 's2', agent: 'testing_expert', action: 'Test', inputs: {} },
      ],
    });
    expect(calculateDependencyEfficiency(wf)).toBe(0.5);
  });

  it('returns 1 for optimal dependency count', () => {
    // 2 steps with 1 dep = optimal (steps - 1 = 1)
    expect(calculateDependencyEfficiency(makeWorkflow())).toBe(1);
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
        { id: 's1', agent: 'code_expert', action: 'Implement', inputs: {} },
        { id: 's2', agent: 'code_expert', action: 'Implement', inputs: {} },
      ],
    });
    expect(calculateRedundancyPenalty(wf)).toBeGreaterThan(0);
  });

  it('penalizes sequential same-agent steps', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'Step 1', inputs: {} },
        { id: 's2', agent: 'code_expert', action: 'Step 2', inputs: {} },
      ],
    });
    expect(calculateRedundancyPenalty(wf)).toBeGreaterThan(0);
  });
});

// ============================================================================
// estimateCost
// ============================================================================

describe('estimateCost', () => {
  it('calculates base cost per step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const cost = estimateCost(wf);
    expect(cost).toBeGreaterThan(0);
  });

  it('increases with retries', () => {
    const noRetries = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const withRetries = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, retries: 3 }],
    });
    expect(estimateCost(withRetries)).toBeGreaterThan(estimateCost(noRetries));
  });

  it('increases with more steps', () => {
    const oneStep = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const twoSteps = makeWorkflow();
    expect(estimateCost(twoSteps)).toBeGreaterThan(estimateCost(oneStep));
  });
});

// ============================================================================
// evaluateCompleteness
// ============================================================================

describe('evaluateCompleteness', () => {
  it('returns a score between 0 and 1', () => {
    const score = evaluateCompleteness(makeWorkflow(), makeTask());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// calculateTimeoutScore
// ============================================================================

describe('calculateTimeoutScore', () => {
  it('returns 1 for reasonable timeout', () => {
    // Steps carry explicit modest per-step timeouts; the COST_MODEL fallback
    // default was centralized up to the single-llm class guard (300s, #3736),
    // so a timeout-less 2-step workflow now exceeds the 300s default budget.
    const wf = makeWorkflow({
      steps: [
        { id: 'step1', agent: 'code_expert', action: 'Implement', inputs: {}, timeout: 60000 },
        { id: 'step2', agent: 'testing_expert', action: 'Test', inputs: {}, timeout: 60000 },
      ],
    });
    const score = calculateTimeoutScore(wf, makeTask());
    expect(score).toBeGreaterThan(0);
  });

  it('penalizes timeout exceeding max', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, timeout: 500000 },
        { id: 's2', agent: 'code_expert', action: 'Do', inputs: {}, timeout: 500000 },
      ],
    });
    const task = makeTask({ constraints: { maxTotalTimeout: 100000 } });
    const score = calculateTimeoutScore(wf, task);
    expect(score).toBeLessThan(1);
  });
});

// ============================================================================
// calculateStepCountScore
// ============================================================================

describe('calculateStepCountScore', () => {
  it('returns 1 for matching step count', () => {
    const score = calculateStepCountScore(makeWorkflow(), makeTask());
    expect(score).toBe(1);
  });

  it('penalizes too few steps', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const task = makeTask({
      constraints: { requiredAgents: ['code_expert', 'testing_expert', 'security_expert'] },
    });
    const score = calculateStepCountScore(wf, task);
    expect(score).toBeLessThan(1);
  });
});

// ============================================================================
// calculateCapabilityCoverageScore
// ============================================================================

describe('calculateCapabilityCoverageScore', () => {
  it('returns 1 when no capabilities required', () => {
    const task = makeTask({ requiredCapabilities: [] });
    expect(calculateCapabilityCoverageScore(makeWorkflow(), task)).toBe(1);
  });

  it('returns fraction for partial coverage', () => {
    const task = makeTask({ requiredCapabilities: ['code', 'security', 'testing'] });
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'implement', inputs: {} }],
    });
    const score = calculateCapabilityCoverageScore(wf, task);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

// ============================================================================
// calculateAgentCoverageScore
// ============================================================================

describe('calculateAgentCoverageScore', () => {
  it('returns 1 when all required agents present', () => {
    expect(calculateAgentCoverageScore(makeWorkflow(), makeTask())).toBe(1);
  });

  it('returns 1 when no agents required', () => {
    const task = makeTask({ constraints: {} });
    expect(calculateAgentCoverageScore(makeWorkflow(), task)).toBe(1);
  });

  it('returns fraction for partial coverage', () => {
    const task = makeTask({
      constraints: {
        requiredAgents: ['code_expert', 'testing_expert', 'security_expert'],
      },
    });
    const score = calculateAgentCoverageScore(makeWorkflow(), task);
    expect(score).toBeCloseTo(2 / 3);
  });
});

// ============================================================================
// calculateConstraintScore
// ============================================================================

describe('calculateConstraintScore', () => {
  it('returns 1 for no constraints', () => {
    expect(calculateConstraintScore(makeWorkflow())).toBe(1);
  });

  it('returns 0 when forbidden agent present', () => {
    const wf = makeWorkflow();
    const score = calculateConstraintScore(wf, {
      forbiddenAgents: ['code_expert'],
    });
    expect(score).toBeLessThan(1);
  });

  it('returns 1 when max retries respected', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, retries: 2 }],
    });
    const score = calculateConstraintScore(wf, { maxRetriesPerStep: 3 });
    expect(score).toBe(1);
  });
});

// ============================================================================
// generateFeedback
// ============================================================================

describe('generateFeedback', () => {
  it('reports good structure for valid workflow', () => {
    const feedback = generateFeedback(makeWorkflow(), makeTask());
    expect(feedback.some((f) => f.includes('looks good'))).toBe(true);
  });

  it('reports missing agents', () => {
    const task = makeTask({
      constraints: { requiredAgents: ['security_expert'] },
    });
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const feedback = generateFeedback(wf, task);
    expect(feedback.some((f) => f.includes('Missing'))).toBe(true);
  });

  it('suggests parallel for multi-step workflows', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 's1', agent: 'code_expert', action: 'A', inputs: {} },
        { id: 's2', agent: 'testing_expert', action: 'B', inputs: {} },
        { id: 's3', agent: 'security_expert', action: 'C', inputs: {} },
      ],
    });
    const feedback = generateFeedback(wf, makeTask());
    expect(feedback.some((f) => f.includes('parallel'))).toBe(true);
  });

  it('reports cycle detection', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'A', inputs: {}, dependsOn: ['b'] },
        { id: 'b', agent: 'code_expert', action: 'B', inputs: {}, dependsOn: ['a'] },
      ],
    });
    const feedback = generateFeedback(wf, makeTask());
    expect(feedback.some((f) => f.includes('cycles'))).toBe(true);
  });

  it('warns about too-simple workflows', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const feedback = generateFeedback(wf, makeTask());
    expect(feedback.some((f) => f.includes('fewer than 2'))).toBe(true);
  });
});
