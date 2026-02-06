/**
 * Tests for complexity-estimator.ts
 *
 * Covers TaskComplexityEstimator: estimate, factor computation,
 * score to level mapping, and createComplexityEstimator factory.
 */

import { describe, it, expect } from 'vitest';
import { TaskComplexityEstimator, createComplexityEstimator } from './complexity-estimator.js';
import type { Task } from '../core/index.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(description: string, overrides: Partial<Task> = {}) {
  return {
    id: 'task-1',
    description,
    context: {},
    ...overrides,
  } as Task;
}

// ============================================================================
// createComplexityEstimator
// ============================================================================

describe('createComplexityEstimator', () => {
  it('creates an estimator instance', () => {
    const estimator = createComplexityEstimator();
    expect(estimator).toBeInstanceOf(TaskComplexityEstimator);
  });
});

// ============================================================================
// TaskComplexityEstimator - estimate
// ============================================================================

describe('TaskComplexityEstimator - estimate', () => {
  const estimator = new TaskComplexityEstimator();

  it('returns all expected fields', () => {
    const result = estimator.estimate(makeTask('Fix the bug'));
    expect(result.level).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.factors).toBeDefined();
    expect(result.taskType).toBeDefined();
    expect(result.taskTypeConfidence).toBeGreaterThanOrEqual(0);
  });

  it('estimates simple tasks as simple or moderate', () => {
    const result = estimator.estimate(makeTask('Fix typo'));
    expect(['simple', 'moderate']).toContain(result.level);
  });

  it('estimates complex tasks higher', () => {
    const complexTask = makeTask(
      'First, design and architect a kubernetes-based microservices system with OAuth authentication. ' +
        'Then implement the REST API with typescript. ' +
        'Next, debug and troubleshoot the database sql queries. ' +
        'Finally, write comprehensive tests and run the build pipeline with npm.'
    );
    const result = estimator.estimate(complexTask);
    expect(result.score).toBeGreaterThan(0.3);
  });

  it('detects domain patterns', () => {
    const domainTask = makeTask('Deploy kubernetes containers using docker and terraform');
    const result = estimator.estimate(domainTask);
    expect(result.factors.domainFactor).toBeGreaterThan(0.2);
  });

  it('detects multi-step reasoning patterns', () => {
    const stepTask = makeTask(
      'First analyze the code. Then implement the fix. Finally run the tests.'
    );
    const result = estimator.estimate(stepTask);
    expect(result.factors.reasoningFactor).toBeGreaterThan(0.2);
  });

  it('detects tool usage patterns', () => {
    const toolTask = makeTask('Read file, edit code, run tests, and build with npm');
    const result = estimator.estimate(toolTask);
    expect(result.factors.toolFactor).toBeGreaterThan(0);
  });

  it('considers context history in complexity', () => {
    const taskWithHistory = makeTask('Continue the work', {
      context: {
        history: [
          {
            role: 'user' as const,
            content: 'Implement a complex kubernetes deployment system',
            timestamp: '',
          },
        ],
      },
    });
    const taskWithoutHistory = makeTask('Continue the work');
    const withHistory = estimator.estimate(taskWithHistory);
    const withoutHistory = estimator.estimate(taskWithoutHistory);
    expect(withHistory.score).toBeGreaterThan(withoutHistory.score);
  });

  it('score increases with description length', () => {
    const shortTask = makeTask('Fix bug');
    const longTask = makeTask('A '.repeat(300) + 'implement the feature');
    const shortResult = estimator.estimate(shortTask);
    const longResult = estimator.estimate(longTask);
    expect(longResult.factors.lengthFactor).toBeGreaterThan(shortResult.factors.lengthFactor);
  });
});
