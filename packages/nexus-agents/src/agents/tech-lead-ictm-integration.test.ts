/**
 * Tests for tech-lead-ictm-integration.ts
 *
 * @see Issue #756 Phase 2
 */

import { describe, it, expect } from 'vitest';
import type { SubTask, TaskAnalysis, ExpertAssignment } from './tech-lead-types.js';
import { enrichAssignmentsWithICTM } from './tech-lead-ictm-integration.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSubTask(overrides: Partial<SubTask> = {}) {
  return {
    id: 'sub-1',
    parentTaskId: 'task-1',
    description: 'Implement auth module',
    expectedOutput: 'Working auth module',
    dependencies: [],
    priority: 'high' as const,
    status: 'pending' as const,
    complexity: 5,
    requiredCapabilities: ['code_generation'],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAnalysis(overrides: Partial<TaskAnalysis> = {}) {
  return {
    taskId: 'task-1',
    complexity: 5,
    taskType: 'implementation',
    requirements: ['Must support OAuth2'],
    risks: ['Token expiry'],
    needsDecomposition: true,
    approach: 'Build incrementally with test coverage',
    estimatedEffort: 8,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAssignment(overrides: Partial<ExpertAssignment> = {}) {
  return {
    subtaskId: 'sub-1',
    expertRole: 'code_expert' as const,
    selectionReason: 'Best match',
    confidence: 0.8,
    ...overrides,
  };
}

describe('enrichAssignmentsWithICTM', () => {
  it('returns enriched assignments with ictmConfig attached', () => {
    const subtasks = [makeSubTask()];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]!.ictmConfig).toBeDefined();
  });

  it('preserves original assignment fields', () => {
    const subtasks = [makeSubTask()];
    const assignments = [makeAssignment({ confidence: 0.9, selectionReason: 'Custom' })];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const enriched = result.assignments[0]!;

    expect(enriched.subtaskId).toBe('sub-1');
    expect(enriched.expertRole).toBe('code_expert');
    expect(enriched.selectionReason).toBe('Custom');
    expect(enriched.confidence).toBe(0.9);
  });

  it('populates inferences map for each matched subtask', () => {
    const subtasks = [makeSubTask({ id: 'a' }), makeSubTask({ id: 'b' })];
    const assignments = [makeAssignment({ subtaskId: 'a' }), makeAssignment({ subtaskId: 'b' })];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);

    expect(result.inferences.size).toBe(2);
    expect(result.inferences.has('a')).toBe(true);
    expect(result.inferences.has('b')).toBe(true);
  });

  it('averageConfidence is between 0 and 1', () => {
    const subtasks = [makeSubTask()];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);

    expect(result.averageConfidence).toBeGreaterThanOrEqual(0);
    expect(result.averageConfidence).toBeLessThanOrEqual(1);
  });

  it('handles empty assignments array', () => {
    const result = enrichAssignmentsWithICTM([], [], makeAnalysis());

    expect(result.assignments).toHaveLength(0);
    expect(result.inferences.size).toBe(0);
    expect(result.averageConfidence).toBe(0);
  });

  it('returns assignment unchanged when no matching subtask', () => {
    const assignments = [makeAssignment({ subtaskId: 'missing' })];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, [], analysis);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]!.ictmConfig).toBeUndefined();
    expect(result.inferences.size).toBe(0);
  });

  it('high-complexity subtask produces extended reasoning', () => {
    const subtasks = [makeSubTask({ complexity: 9 })];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const ictm = result.assignments[0]!.ictmConfig!;

    expect(ictm.model.reasoning).toBe('extended');
    expect(ictm.model.temperature).toBe(0.1);
  });

  it('low-complexity subtask produces minimal reasoning', () => {
    const subtasks = [makeSubTask({ complexity: 2 })];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const ictm = result.assignments[0]!.ictmConfig!;

    expect(ictm.model.reasoning).toBe('minimal');
    expect(ictm.model.temperature).toBe(0.5);
  });

  it('subtask with dependencies sets includeHistory=true', () => {
    const subtasks = [makeSubTask({ dependencies: ['other-task'] })];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const ictm = result.assignments[0]!.ictmConfig!;

    expect(ictm.context.includeHistory).toBe(true);
  });

  it('subtask without dependencies sets includeHistory=false', () => {
    const subtasks = [makeSubTask({ dependencies: [] })];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const ictm = result.assignments[0]!.ictmConfig!;

    expect(ictm.context.includeHistory).toBe(false);
  });

  it('processes multiple assignments correctly', () => {
    const subtasks = [
      makeSubTask({ id: 'a', complexity: 2 }),
      makeSubTask({ id: 'b', complexity: 8 }),
    ];
    const assignments = [makeAssignment({ subtaskId: 'a' }), makeAssignment({ subtaskId: 'b' })];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]!.ictmConfig!.model.reasoning).toBe('minimal');
    expect(result.assignments[1]!.ictmConfig!.model.reasoning).toBe('extended');
  });

  it('ictmConfig instructions contain subtask description', () => {
    const subtasks = [makeSubTask({ description: 'Build login flow' })];
    const assignments = [makeAssignment()];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const ictm = result.assignments[0]!.ictmConfig!;

    expect(ictm.instructions).toContain('Build login flow');
  });

  it('averageConfidence is average of all inference confidences', () => {
    const subtasks = [
      makeSubTask({ id: 'a', requiredCapabilities: ['code_generation'] }),
      makeSubTask({ id: 'b', requiredCapabilities: [] }),
    ];
    const assignments = [makeAssignment({ subtaskId: 'a' }), makeAssignment({ subtaskId: 'b' })];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
    const confidences = [...result.inferences.values()].map((i) => i.confidence);
    const expected = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    expect(result.averageConfidence).toBeCloseTo(expected);
  });

  it('mixed matched and unmatched assignments', () => {
    const subtasks = [makeSubTask({ id: 'exists' })];
    const assignments = [
      makeAssignment({ subtaskId: 'exists' }),
      makeAssignment({ subtaskId: 'missing' }),
    ];
    const analysis = makeAnalysis();

    const result = enrichAssignmentsWithICTM(assignments, subtasks, analysis);

    expect(result.assignments[0]!.ictmConfig).toBeDefined();
    expect(result.assignments[1]!.ictmConfig).toBeUndefined();
    expect(result.inferences.size).toBe(1);
  });
});
