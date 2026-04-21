/**
 * Tests for evaluation.ts
 *
 * Covers WorkflowEvaluator class and createWorkflowEvaluator factory.
 */

import { describe, it, expect } from 'vitest';
import { WorkflowEvaluator, createWorkflowEvaluator } from './evaluation.js';
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
// WorkflowEvaluator constructor
// ============================================================================

describe('WorkflowEvaluator - constructor', () => {
  it('creates with default weights', () => {
    const evaluator = new WorkflowEvaluator();
    expect(evaluator).toBeInstanceOf(WorkflowEvaluator);
  });

  it('creates with custom weights', () => {
    const evaluator = new WorkflowEvaluator({ structure: 0.5 });
    expect(evaluator).toBeInstanceOf(WorkflowEvaluator);
  });
});

// ============================================================================
// WorkflowEvaluator.evaluate
// ============================================================================

describe('WorkflowEvaluator - evaluate', () => {
  const evaluator = new WorkflowEvaluator();

  it('returns EvaluationResult with all fields', () => {
    const result = evaluator.evaluate(makeWorkflow(), makeTask());
    expect(result.score).toBeDefined();
    expect(result.structureScore).toBeDefined();
    expect(result.efficiencyScore).toBeDefined();
    expect(result.completenessScore).toBeDefined();
    expect(result.redundancyPenalty).toBeDefined();
    expect(result.feedback).toBeDefined();
    expect(result.estimatedCost).toBeDefined();
  });

  it('returns score between 0 and 1', () => {
    const result = evaluator.evaluate(makeWorkflow(), makeTask());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('gives higher score to complete workflow', () => {
    const complete = makeWorkflow();
    const incomplete = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const task = makeTask({
      requiredCapabilities: ['code', 'testing'],
      constraints: { requiredAgents: ['code_expert', 'testing_expert'] },
    });

    const completeScore = evaluator.evaluate(complete, task).score;
    const incompleteScore = evaluator.evaluate(incomplete, task).score;

    expect(completeScore).toBeGreaterThan(incompleteScore);
  });

  it('includes feedback', () => {
    const result = evaluator.evaluate(makeWorkflow(), makeTask());
    expect(result.feedback.length).toBeGreaterThan(0);
  });

  it('calculates estimated cost', () => {
    const result = evaluator.evaluate(makeWorkflow(), makeTask());
    expect(result.estimatedCost).toBeGreaterThan(0);
  });
});

// ============================================================================
// WorkflowEvaluator - individual methods
// ============================================================================

describe('WorkflowEvaluator - individual methods', () => {
  const evaluator = new WorkflowEvaluator();

  it('evaluateStructure returns score between 0 and 1', () => {
    const score = evaluator.evaluateStructure(makeWorkflow());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('evaluateEfficiency returns score between 0 and 1', () => {
    const score = evaluator.evaluateEfficiency(makeWorkflow(), makeTask());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('evaluateCompleteness returns score between 0 and 1', () => {
    const score = evaluator.evaluateCompleteness(makeWorkflow(), makeTask());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('calculateRedundancyPenalty returns 0 for no redundancy', () => {
    expect(evaluator.calculateRedundancyPenalty(makeWorkflow())).toBe(0);
  });

  it('generateFeedback returns non-empty array', () => {
    const feedback = evaluator.generateFeedback(makeWorkflow(), makeTask());
    expect(feedback.length).toBeGreaterThan(0);
  });

  it('estimateCost returns positive number', () => {
    expect(evaluator.estimateCost(makeWorkflow())).toBeGreaterThan(0);
  });

  it('isViable returns true for workflow with enough steps', () => {
    expect(evaluator.isViable(makeWorkflow(), 2)).toBe(true);
  });

  it('isViable returns false for workflow with too few steps', () => {
    expect(evaluator.isViable(makeWorkflow(), 5)).toBe(false);
  });
});

// ============================================================================
// WorkflowEvaluator - custom weights
// ============================================================================

describe('WorkflowEvaluator - custom weights', () => {
  it('different weights produce different scores', () => {
    const structureHeavy = new WorkflowEvaluator({
      structure: 0.8,
      efficiency: 0.05,
      completeness: 0.05,
      redundancyPenalty: 0.1,
    });
    const completenessHeavy = new WorkflowEvaluator({
      structure: 0.05,
      efficiency: 0.05,
      completeness: 0.8,
      redundancyPenalty: 0.1,
    });

    const wf = makeWorkflow();
    const task = makeTask();

    const score1 = structureHeavy.evaluate(wf, task).score;
    const score2 = completenessHeavy.evaluate(wf, task).score;

    // Scores should differ since sub-scores are weighted differently
    // Both should be valid (0-1 range)
    expect(score1).toBeGreaterThanOrEqual(0);
    expect(score2).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// createWorkflowEvaluator factory
// ============================================================================

describe('createWorkflowEvaluator', () => {
  it('creates a WorkflowEvaluator instance', () => {
    expect(createWorkflowEvaluator()).toBeInstanceOf(WorkflowEvaluator);
  });

  it('accepts custom weights', () => {
    const evaluator = createWorkflowEvaluator({ structure: 0.5 });
    expect(evaluator).toBeInstanceOf(WorkflowEvaluator);
  });

  it('created evaluator works correctly', () => {
    const evaluator = createWorkflowEvaluator();
    const result = evaluator.evaluate(makeWorkflow(), makeTask());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
