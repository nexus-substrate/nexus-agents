/**
 * nexus-agents/testing/tasks - Task Registry Tests
 *
 * Comprehensive tests for the task registry and evaluation tasks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRegistry, EVALUATION_TASKS } from './task-registry.js';
import type { EvaluationTask, TaskCategory, TaskDifficulty } from './task-types.js';
import type { CliName } from '../types.js';

describe('EVALUATION_TASKS', () => {
  it('should contain exactly 15 tasks', () => {
    expect(EVALUATION_TASKS).toHaveLength(15);
  });

  it('should have unique task IDs', () => {
    const ids = EVALUATION_TASKS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have sequential task IDs from task-001 to task-015', () => {
    for (let i = 0; i < 15; i++) {
      const expectedId = `task-${String(i + 1).padStart(3, '0')}`;
      expect(EVALUATION_TASKS[i]?.id).toBe(expectedId);
    }
  });

  it('should have non-empty names for all tasks', () => {
    for (const task of EVALUATION_TASKS) {
      expect(task.name.length).toBeGreaterThan(0);
    }
  });

  it('should have non-empty prompts for all tasks', () => {
    for (const task of EVALUATION_TASKS) {
      expect(task.prompt.length).toBeGreaterThan(0);
    }
  });

  it('should have valid categories for all tasks', () => {
    const validCategories: TaskCategory[] = [
      'code_generation',
      'algorithm_design',
      'codebase_analysis',
      'test_generation',
      'architecture',
      'refactoring',
      'debugging',
      'documentation',
    ];

    for (const task of EVALUATION_TASKS) {
      expect(validCategories).toContain(task.category);
    }
  });

  it('should have valid difficulties for all tasks', () => {
    const validDifficulties: TaskDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

    for (const task of EVALUATION_TASKS) {
      expect(validDifficulties).toContain(task.difficulty);
    }
  });

  it('should have valid CLI names', () => {
    const validClis: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

    for (const task of EVALUATION_TASKS) {
      expect(validClis).toContain(task.optimalCli);
      expect(task.acceptableClis.length).toBeGreaterThan(0);
      for (const cli of task.acceptableClis) {
        expect(validClis).toContain(cli);
      }
    }
  });

  it('should include optimalCli in acceptableClis', () => {
    for (const task of EVALUATION_TASKS) {
      expect(task.acceptableClis).toContain(task.optimalCli);
    }
  });

  it('should have positive timeouts', () => {
    for (const task of EVALUATION_TASKS) {
      expect(task.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('should have valid scoring rubrics', () => {
    for (const task of EVALUATION_TASKS) {
      const { scoringRubric } = task;

      // Has criteria
      expect(scoringRubric.criteria.length).toBeGreaterThan(0);

      // Max total score is positive
      expect(scoringRubric.maxTotalScore).toBeGreaterThan(0);

      // Passing score is less than or equal to max
      expect(scoringRubric.passingScore).toBeLessThanOrEqual(scoringRubric.maxTotalScore);

      // Weights sum to approximately 1.0
      const totalWeight = scoringRubric.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);

      // Each criterion has valid data
      for (const criterion of scoringRubric.criteria) {
        expect(criterion.id.length).toBeGreaterThan(0);
        expect(criterion.description.length).toBeGreaterThan(0);
        expect(criterion.weight).toBeGreaterThan(0);
        expect(criterion.weight).toBeLessThanOrEqual(1);
        expect(criterion.maxScore).toBeGreaterThan(0);
      }
    }
  });

  it('should have non-empty tags', () => {
    for (const task of EVALUATION_TASKS) {
      expect(task.tags.length).toBeGreaterThan(0);
    }
  });
});

describe('TaskRegistry', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
  });

  describe('constructor', () => {
    it('should initialize with default tasks', () => {
      expect(registry.getTaskCount()).toBe(15);
    });

    it('should accept custom tasks', () => {
      const customTask: EvaluationTask = {
        id: 'custom-001',
        name: 'Custom Task',
        category: 'code_generation',
        difficulty: 'easy',
        description: 'A custom test task',
        prompt: 'Write hello world',
        expectedOutcome: {
          mustContain: ['hello'],
          mustNotContain: [],
        },
        scoringRubric: {
          criteria: [
            {
              id: 'test',
              description: 'Test criterion',
              weight: 1.0,
              maxScore: 10,
            },
          ],
          maxTotalScore: 10,
          passingScore: 5,
        },
        timeoutMs: 30000,
        optimalCli: 'codex',
        acceptableClis: ['codex', 'claude'],
        tags: ['test'],
      };

      const customRegistry = new TaskRegistry([customTask]);
      expect(customRegistry.getTaskCount()).toBe(1);
      expect(customRegistry.getTask('custom-001')).toBe(customTask);
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks', () => {
      const tasks = registry.getAllTasks();
      expect(tasks).toHaveLength(15);
    });

    it('should return a frozen array', () => {
      const tasks = registry.getAllTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('getTask', () => {
    it('should return task by ID', () => {
      const task = registry.getTask('task-001');
      expect(task).toBeDefined();
      expect(task?.id).toBe('task-001');
      expect(task?.name).toBe('Simple Function Generation');
    });

    it('should return undefined for non-existent ID', () => {
      const task = registry.getTask('task-999');
      expect(task).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const task = registry.getTask('');
      expect(task).toBeUndefined();
    });
  });

  describe('getTasksByCategory', () => {
    it('should return tasks for code_generation category', () => {
      const tasks = registry.getTasksByCategory('code_generation');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.category).toBe('code_generation');
      }
    });

    it('should return tasks for algorithm_design category', () => {
      const tasks = registry.getTasksByCategory('algorithm_design');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.category).toBe('algorithm_design');
      }
    });

    it('should return tasks for architecture category', () => {
      const tasks = registry.getTasksByCategory('architecture');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.category).toBe('architecture');
      }
    });

    it('should return empty array for category with no tasks', () => {
      // Create registry with subset of tasks that excludes a category
      const customRegistry = new TaskRegistry([EVALUATION_TASKS[0]!]);
      const tasks = customRegistry.getTasksByCategory('codebase_analysis');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('getTasksByDifficulty', () => {
    it('should return tasks for easy difficulty', () => {
      const tasks = registry.getTasksByDifficulty('easy');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.difficulty).toBe('easy');
      }
    });

    it('should return tasks for medium difficulty', () => {
      const tasks = registry.getTasksByDifficulty('medium');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.difficulty).toBe('medium');
      }
    });

    it('should return tasks for hard difficulty', () => {
      const tasks = registry.getTasksByDifficulty('hard');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.difficulty).toBe('hard');
      }
    });

    it('should return tasks for expert difficulty', () => {
      const tasks = registry.getTasksByDifficulty('expert');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.difficulty).toBe('expert');
      }
    });
  });

  describe('getTasksByOptimalCli', () => {
    it('should return tasks optimal for claude', () => {
      const tasks = registry.getTasksByOptimalCli('claude');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.optimalCli).toBe('claude');
      }
    });

    it('should return tasks optimal for codex', () => {
      const tasks = registry.getTasksByOptimalCli('codex');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.optimalCli).toBe('codex');
      }
    });

    it('should return tasks optimal for gemini', () => {
      const tasks = registry.getTasksByOptimalCli('gemini');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.optimalCli).toBe('gemini');
      }
    });
  });

  describe('getTasksAcceptingCli', () => {
    it('should return tasks accepting claude', () => {
      const tasks = registry.getTasksAcceptingCli('claude');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.acceptableClis).toContain('claude');
      }
    });

    it('should return tasks accepting codex', () => {
      const tasks = registry.getTasksAcceptingCli('codex');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.acceptableClis).toContain('codex');
      }
    });

    it('should return tasks accepting gemini', () => {
      const tasks = registry.getTasksAcceptingCli('gemini');
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.acceptableClis).toContain('gemini');
      }
    });

    it('should return more tasks for accepting than optimal', () => {
      // All optimal tasks should be in accepting, but accepting may have more
      const optimalClaude = registry.getTasksByOptimalCli('claude');
      const acceptingClaude = registry.getTasksAcceptingCli('claude');

      expect(acceptingClaude.length).toBeGreaterThanOrEqual(optimalClaude.length);

      // Verify all optimal are in accepting
      for (const task of optimalClaude) {
        expect(acceptingClaude).toContain(task);
      }
    });
  });

  describe('getTasksByTags', () => {
    it('should return tasks matching single tag', () => {
      const tasks = registry.getTasksByTags(['typescript']);
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.tags).toContain('typescript');
      }
    });

    it('should return tasks matching multiple tags', () => {
      const tasks = registry.getTasksByTags(['algorithm', 'advanced']);
      for (const task of tasks) {
        expect(task.tags).toContain('algorithm');
        expect(task.tags).toContain('advanced');
      }
    });

    it('should return empty array for non-existent tags', () => {
      const tasks = registry.getTasksByTags(['nonexistent-tag-xyz']);
      expect(tasks).toHaveLength(0);
    });

    it('should return all tasks for empty tags array', () => {
      const tasks = registry.getTasksByTags([]);
      expect(tasks).toHaveLength(15);
    });
  });

  describe('getCategoryCounts', () => {
    it('should return counts for all categories with tasks', () => {
      const counts = registry.getCategoryCounts();
      expect(counts.size).toBeGreaterThan(0);

      let total = 0;
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(0);
        total += count;
      }
      expect(total).toBe(15);
    });
  });

  describe('getDifficultyCounts', () => {
    it('should return counts for all difficulties', () => {
      const counts = registry.getDifficultyCounts();
      expect(counts.size).toBe(4); // easy, medium, hard, expert

      let total = 0;
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(0);
        total += count;
      }
      expect(total).toBe(15);
    });
  });

  describe('getTaskCount', () => {
    it('should return 15 for default registry', () => {
      expect(registry.getTaskCount()).toBe(15);
    });
  });
});

describe('Task Content Validation', () => {
  describe('Task 001 - Simple Function Generation', () => {
    it('should have correct optimal CLI and category', () => {
      const task = EVALUATION_TASKS[0];
      expect(task?.optimalCli).toBe('codex');
      expect(task?.category).toBe('code_generation');
      expect(task?.difficulty).toBe('easy');
    });

    it('should have formatBytes in prompt', () => {
      const task = EVALUATION_TASKS[0];
      expect(task?.prompt).toContain('formatBytes');
    });
  });

  describe('Task 002 - Complex Algorithm Design', () => {
    it('should have correct optimal CLI and category', () => {
      const task = EVALUATION_TASKS[1];
      expect(task?.optimalCli).toBe('claude');
      expect(task?.category).toBe('algorithm_design');
      expect(task?.difficulty).toBe('hard');
    });

    it('should have LRUCache in prompt', () => {
      const task = EVALUATION_TASKS[1];
      expect(task?.prompt).toContain('LRUCache');
    });
  });

  describe('Task 003 - Large Codebase Analysis', () => {
    it('should have correct optimal CLI and category', () => {
      const task = EVALUATION_TASKS[2];
      expect(task?.optimalCli).toBe('gemini');
      expect(task?.category).toBe('codebase_analysis');
      expect(task?.difficulty).toBe('hard');
    });
  });

  describe('Task 005 - Architecture Decision', () => {
    it('should have correct optimal CLI and difficulty', () => {
      const task = EVALUATION_TASKS[4];
      expect(task?.optimalCli).toBe('claude');
      expect(task?.category).toBe('architecture');
      expect(task?.difficulty).toBe('expert');
    });

    it('should have three architecture options in prompt', () => {
      const task = EVALUATION_TASKS[4];
      expect(task?.prompt).toContain('Option A');
      expect(task?.prompt).toContain('Option B');
      expect(task?.prompt).toContain('Option C');
    });
  });

  describe('Task 014 - Security Code Review', () => {
    it('should have correct optimal CLI and category', () => {
      const task = EVALUATION_TASKS[13];
      expect(task?.optimalCli).toBe('claude');
      expect(task?.category).toBe('debugging');
      expect(task?.difficulty).toBe('hard');
    });

    it('should include security vulnerabilities in expected outcome', () => {
      const task = EVALUATION_TASKS[13];
      expect(task?.expectedOutcome.mustContain).toContain('SQL injection');
    });
  });

  describe('Task 015 - Integration Pattern', () => {
    it('should have correct optimal CLI and difficulty', () => {
      const task = EVALUATION_TASKS[14];
      expect(task?.optimalCli).toBe('claude');
      expect(task?.category).toBe('architecture');
      expect(task?.difficulty).toBe('expert');
    });

    it('should have high passing score for expert task', () => {
      const task = EVALUATION_TASKS[14];
      expect(task?.scoringRubric.passingScore).toBeGreaterThanOrEqual(7);
    });
  });
});

describe('CLI Distribution', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
  });

  it('should have balanced distribution across optimal CLIs', () => {
    const claudeTasks = registry.getTasksByOptimalCli('claude');
    const codexTasks = registry.getTasksByOptimalCli('codex');
    const geminiTasks = registry.getTasksByOptimalCli('gemini');

    // Claude should have the most (complex reasoning tasks)
    expect(claudeTasks.length).toBeGreaterThanOrEqual(codexTasks.length);

    // Each CLI should have at least some optimal tasks
    expect(claudeTasks.length).toBeGreaterThan(0);
    expect(codexTasks.length).toBeGreaterThan(0);
    expect(geminiTasks.length).toBeGreaterThan(0);

    // Total should be 15
    expect(claudeTasks.length + codexTasks.length + geminiTasks.length).toBe(15);
  });

  it('should have each CLI able to handle multiple tasks', () => {
    const claudeAccepted = registry.getTasksAcceptingCli('claude');
    const codexAccepted = registry.getTasksAcceptingCli('codex');
    const geminiAccepted = registry.getTasksAcceptingCli('gemini');

    // Each CLI should be acceptable for multiple tasks
    expect(claudeAccepted.length).toBeGreaterThan(5);
    expect(codexAccepted.length).toBeGreaterThan(3);
    expect(geminiAccepted.length).toBeGreaterThan(3);
  });
});

describe('Difficulty Distribution', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
  });

  it('should have tasks at all difficulty levels', () => {
    const easy = registry.getTasksByDifficulty('easy');
    const medium = registry.getTasksByDifficulty('medium');
    const hard = registry.getTasksByDifficulty('hard');
    const expert = registry.getTasksByDifficulty('expert');

    expect(easy.length).toBeGreaterThan(0);
    expect(medium.length).toBeGreaterThan(0);
    expect(hard.length).toBeGreaterThan(0);
    expect(expert.length).toBeGreaterThan(0);
  });

  it('should have appropriate timeout for difficulty', () => {
    const easy = registry.getTasksByDifficulty('easy');
    const expert = registry.getTasksByDifficulty('expert');

    // Easy tasks should have shorter timeouts
    const avgEasyTimeout = easy.reduce((sum, t) => sum + t.timeoutMs, 0) / easy.length;
    const avgExpertTimeout = expert.reduce((sum, t) => sum + t.timeoutMs, 0) / expert.length;

    expect(avgExpertTimeout).toBeGreaterThan(avgEasyTimeout);
  });

  it('should have higher passing scores for harder tasks', () => {
    const easy = registry.getTasksByDifficulty('easy');
    const expert = registry.getTasksByDifficulty('expert');

    // Expert tasks generally have higher passing score requirements
    const avgEasyPassingScore =
      easy.reduce((sum, t) => sum + t.scoringRubric.passingScore, 0) / easy.length;
    const avgExpertPassingScore =
      expert.reduce((sum, t) => sum + t.scoringRubric.passingScore, 0) / expert.length;

    expect(avgExpertPassingScore).toBeGreaterThanOrEqual(avgEasyPassingScore);
  });
});
