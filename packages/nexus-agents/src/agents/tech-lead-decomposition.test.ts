/**
 * Tests for tech-lead-decomposition.ts
 *
 * Covers heuristicDecomposition for all task types.
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../core/index.js';
import type { TaskAnalysis } from './tech-lead-types.js';
import { heuristicDecomposition } from './tech-lead-decomposition.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTask(id = 'task-1'): Task {
  return {
    id,
    description: 'Test task',
  } as Task;
}

function makeAnalysis(taskType: TaskAnalysis['taskType'], complexity = 5): TaskAnalysis {
  return {
    taskType,
    complexity,
    requiredCapabilities: [],
    estimatedSteps: 3,
    parallelizable: false,
  } as TaskAnalysis;
}

// ============================================================================
// heuristicDecomposition
// ============================================================================

describe('heuristicDecomposition', () => {
  describe('implementation task type', () => {
    it('creates 3 subtasks for implementation', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 10);
      expect(subtasks).toHaveLength(3);
    });

    it('creates design, implement, test subtasks', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 10);
      expect(subtasks[0]?.description).toContain('Design');
      expect(subtasks[1]?.description).toContain('Implement');
      expect(subtasks[2]?.description).toContain('test');
    });

    it('sets correct dependency chain', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 10);
      expect(subtasks[0]?.dependencies).toEqual([]);
      expect(subtasks[1]?.dependencies).toContain(`${makeTask().id}-sub-1`);
      expect(subtasks[2]?.dependencies).toContain(`${makeTask().id}-sub-2`);
    });

    it('marks implementation as critical priority', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 10);
      expect(subtasks[1]?.priority).toBe('critical');
    });
  });

  describe('architecture task type', () => {
    it('creates 3 subtasks for architecture', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('architecture'), 10);
      expect(subtasks).toHaveLength(3);
    });

    it('creates analyze, design, document subtasks', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('architecture'), 10);
      expect(subtasks[0]?.description).toContain('Analyze');
      expect(subtasks[1]?.description).toContain('Design');
      expect(subtasks[2]?.description).toContain('Document');
    });
  });

  describe('security_audit task type', () => {
    it('creates 3 subtasks for security audit', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('security_audit'), 10);
      expect(subtasks).toHaveLength(3);
    });

    it('has two independent subtasks and one dependent', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('security_audit'), 10);
      // Subtasks 1 and 2 have no deps, subtask 3 depends on both
      expect(subtasks[0]?.dependencies).toEqual([]);
      expect(subtasks[1]?.dependencies).toEqual([]);
      expect(subtasks[2]?.dependencies).toHaveLength(2);
    });

    it('marks vulnerability review as critical', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('security_audit'), 10);
      expect(subtasks[0]?.priority).toBe('critical');
    });
  });

  describe('generic task type', () => {
    it('creates 3 subtasks for unknown type', () => {
      const subtasks = heuristicDecomposition(
        makeTask(),
        makeAnalysis('research' as TaskAnalysis['taskType']),
        10
      );
      expect(subtasks).toHaveLength(3);
    });

    it('uses task complexity for main subtask', () => {
      const subtasks = heuristicDecomposition(
        makeTask(),
        makeAnalysis('research' as TaskAnalysis['taskType'], 8),
        10
      );
      // Second subtask (main execution) should have the complexity
      expect(subtasks[1]?.complexity).toBe(8);
    });
  });

  describe('maxSubtasks limit', () => {
    it('limits subtasks to maxSubtasks', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 2);
      expect(subtasks).toHaveLength(2);
    });

    it('returns all subtasks when limit exceeds count', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 100);
      expect(subtasks).toHaveLength(3);
    });

    it('returns empty when maxSubtasks is 0', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 0);
      expect(subtasks).toHaveLength(0);
    });
  });

  describe('ID generation', () => {
    it('uses task ID as base for subtask IDs', () => {
      const task = makeTask('my-task');
      const subtasks = heuristicDecomposition(task, makeAnalysis('implementation'), 10);
      expect(subtasks[0]?.id).toBe('my-task-sub-1');
      expect(subtasks[1]?.id).toBe('my-task-sub-2');
    });

    it('sets parentTaskId on all subtasks', () => {
      const task = makeTask('parent');
      const subtasks = heuristicDecomposition(task, makeAnalysis('implementation'), 10);
      for (const sub of subtasks) {
        expect(sub.parentTaskId).toBe('parent');
      }
    });

    it('all subtasks start as pending', () => {
      const subtasks = heuristicDecomposition(makeTask(), makeAnalysis('implementation'), 10);
      for (const sub of subtasks) {
        expect(sub.status).toBe('pending');
      }
    });
  });
});
