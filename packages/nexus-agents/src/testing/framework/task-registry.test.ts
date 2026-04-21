/**
 * Tests for task-registry.ts
 *
 * Covers task registration, retrieval, filtering, statistics,
 * duplicate detection, and factory function.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRegistry, createTaskRegistry, SAMPLE_TASKS } from './task-registry.js';
import type { EvaluationTask } from './types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeTask(overrides: Partial<EvaluationTask> = {}): EvaluationTask {
  return {
    id: 'task-1',
    name: 'Test Task',
    description: 'A test task',
    category: 'code_generation',
    difficulty: 'easy',
    expectedTaskType: 'code_implementation',
    ...overrides,
  };
}

// ============================================================================
// TaskRegistry — registration
// ============================================================================

describe('TaskRegistry - registration', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
  });

  it('registers a task', () => {
    registry.register(makeTask());
    expect(registry.count()).toBe(1);
  });

  it('throws on duplicate ID', () => {
    registry.register(makeTask({ id: 'dup' }));
    expect(() => {
      registry.register(makeTask({ id: 'dup' }));
    }).toThrow('already exists');
  });

  it('registers multiple tasks via registerAll', () => {
    registry.registerAll([makeTask({ id: 't1' }), makeTask({ id: 't2' })]);
    expect(registry.count()).toBe(2);
  });
});

// ============================================================================
// TaskRegistry — retrieval
// ============================================================================

describe('TaskRegistry - retrieval', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
    registry.register(makeTask({ id: 't1', name: 'First' }));
    registry.register(makeTask({ id: 't2', name: 'Second' }));
  });

  it('gets task by ID', () => {
    const task = registry.get('t1');
    expect(task?.name).toBe('First');
  });

  it('returns undefined for unknown ID', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('gets all tasks', () => {
    expect(registry.getAll()).toHaveLength(2);
  });

  it('checks if task exists', () => {
    expect(registry.has('t1')).toBe(true);
    expect(registry.has('t99')).toBe(false);
  });
});

// ============================================================================
// TaskRegistry — filtering
// ============================================================================

describe('TaskRegistry - filtering', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
    registry.registerAll([
      makeTask({ id: 't1', category: 'code_generation', difficulty: 'easy', tags: ['math'] }),
      makeTask({ id: 't2', category: 'code_review', difficulty: 'medium', tags: ['security'] }),
      makeTask({
        id: 't3',
        category: 'code_generation',
        difficulty: 'hard',
        tags: ['math', 'api'],
      }),
    ]);
  });

  it('returns all when no filter', () => {
    expect(registry.getFiltered()).toHaveLength(3);
  });

  it('returns all when empty filter', () => {
    expect(registry.getFiltered({})).toHaveLength(3);
  });

  it('filters by task IDs', () => {
    const tasks = registry.getFiltered({ taskIds: ['t1', 't3'] });
    expect(tasks).toHaveLength(2);
  });

  it('filters by categories', () => {
    const tasks = registry.getFiltered({ categories: ['code_generation'] });
    expect(tasks).toHaveLength(2);
  });

  it('filters by difficulties', () => {
    const tasks = registry.getFiltered({ difficulties: ['easy'] });
    expect(tasks).toHaveLength(1);
  });

  it('filters by tags', () => {
    const tasks = registry.getFiltered({ tags: ['math'] });
    expect(tasks).toHaveLength(2);
  });

  it('combines multiple filters (AND)', () => {
    const tasks = registry.getFiltered({
      categories: ['code_generation'],
      difficulties: ['easy'],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('t1');
  });

  it('getByCategory convenience method', () => {
    expect(registry.getByCategory('code_review')).toHaveLength(1);
  });

  it('getByDifficulty convenience method', () => {
    expect(registry.getByDifficulty('hard')).toHaveLength(1);
  });
});

// ============================================================================
// TaskRegistry — mutation
// ============================================================================

describe('TaskRegistry - mutation', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = new TaskRegistry();
    registry.register(makeTask({ id: 't1' }));
    registry.register(makeTask({ id: 't2' }));
  });

  it('removes a task', () => {
    expect(registry.remove('t1')).toBe(true);
    expect(registry.count()).toBe(1);
    expect(registry.has('t1')).toBe(false);
  });

  it('returns false when removing nonexistent task', () => {
    expect(registry.remove('nonexistent')).toBe(false);
  });

  it('clears all tasks', () => {
    registry.clear();
    expect(registry.count()).toBe(0);
  });
});

// ============================================================================
// TaskRegistry — statistics
// ============================================================================

describe('TaskRegistry - statistics', () => {
  it('returns category stats', () => {
    const registry = createTaskRegistry([
      makeTask({ id: 't1', category: 'code_generation' }),
      makeTask({ id: 't2', category: 'code_generation' }),
      makeTask({ id: 't3', category: 'code_review' }),
    ]);
    const stats = registry.getCategoryStats();
    expect(stats.get('code_generation')).toBe(2);
    expect(stats.get('code_review')).toBe(1);
  });

  it('returns difficulty stats', () => {
    const registry = createTaskRegistry([
      makeTask({ id: 't1', difficulty: 'easy' }),
      makeTask({ id: 't2', difficulty: 'easy' }),
      makeTask({ id: 't3', difficulty: 'hard' }),
    ]);
    const stats = registry.getDifficultyStats();
    expect(stats.get('easy')).toBe(2);
    expect(stats.get('hard')).toBe(1);
  });

  it('returns empty stats for empty registry', () => {
    const registry = new TaskRegistry();
    expect(registry.getCategoryStats().size).toBe(0);
    expect(registry.getDifficultyStats().size).toBe(0);
  });
});

// ============================================================================
// createTaskRegistry
// ============================================================================

describe('createTaskRegistry', () => {
  it('creates empty registry without tasks', () => {
    const registry = createTaskRegistry();
    expect(registry.count()).toBe(0);
  });

  it('creates registry with initial tasks', () => {
    const registry = createTaskRegistry([makeTask({ id: 't1' }), makeTask({ id: 't2' })]);
    expect(registry.count()).toBe(2);
  });
});

// ============================================================================
// SAMPLE_TASKS
// ============================================================================

describe('SAMPLE_TASKS', () => {
  it('has tasks defined', () => {
    expect(SAMPLE_TASKS.length).toBeGreaterThan(0);
  });

  it('all tasks have unique IDs', () => {
    const ids = SAMPLE_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all tasks have required fields', () => {
    for (const task of SAMPLE_TASKS) {
      expect(task.id).toBeDefined();
      expect(task.name).toBeDefined();
      expect(task.category).toBeDefined();
      expect(task.difficulty).toBeDefined();
    }
  });

  it('can be loaded into a registry', () => {
    const registry = createTaskRegistry(SAMPLE_TASKS);
    expect(registry.count()).toBe(SAMPLE_TASKS.length);
  });
});
