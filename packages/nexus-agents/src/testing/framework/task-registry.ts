/**
 * nexus-agents/testing/framework - Task Registry
 *
 * Registry for managing evaluation tasks.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { EvaluationTask, TaskCategory, TaskDifficulty, TaskFilter } from './types.js';

/**
 * Registry for evaluation tasks.
 * Provides task storage, retrieval, and filtering.
 */
export class TaskRegistry {
  private readonly tasks: Map<string, EvaluationTask> = new Map();

  /**
   * Registers a task in the registry.
   * @param task - Task to register
   * @throws Error if task ID already exists
   */
  register(task: EvaluationTask): void {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task with ID '${task.id}' already exists`);
    }
    this.tasks.set(task.id, task);
  }

  /**
   * Registers multiple tasks.
   * @param tasks - Tasks to register
   */
  registerAll(tasks: readonly EvaluationTask[]): void {
    for (const task of tasks) {
      this.register(task);
    }
  }

  /**
   * Gets a task by ID.
   * @param id - Task ID
   * @returns Task or undefined
   */
  get(id: string): EvaluationTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Gets all registered tasks.
   * @returns Array of all tasks
   */
  getAll(): readonly EvaluationTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Gets tasks matching the provided filter.
   * @param filter - Filter criteria
   * @returns Matching tasks
   */
  getFiltered(filter?: TaskFilter): readonly EvaluationTask[] {
    if (filter === undefined) {
      return this.getAll();
    }

    let result = Array.from(this.tasks.values());

    // Filter by task IDs
    if (filter.taskIds !== undefined && filter.taskIds.length > 0) {
      const idSet = new Set(filter.taskIds);
      result = result.filter((task) => idSet.has(task.id));
    }

    // Filter by categories
    if (filter.categories !== undefined && filter.categories.length > 0) {
      const categorySet = new Set(filter.categories);
      result = result.filter((task) => categorySet.has(task.category));
    }

    // Filter by difficulties
    if (filter.difficulties !== undefined && filter.difficulties.length > 0) {
      const difficultySet = new Set(filter.difficulties);
      result = result.filter((task) => difficultySet.has(task.difficulty));
    }

    // Filter by tags
    if (filter.tags !== undefined && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags);
      result = result.filter((task) => task.tags?.some((tag) => tagSet.has(tag)) ?? false);
    }

    return result;
  }

  /**
   * Gets tasks by category.
   * @param category - Category to filter by
   * @returns Tasks in the category
   */
  getByCategory(category: TaskCategory): readonly EvaluationTask[] {
    return this.getFiltered({ categories: [category] });
  }

  /**
   * Gets tasks by difficulty.
   * @param difficulty - Difficulty to filter by
   * @returns Tasks with the difficulty
   */
  getByDifficulty(difficulty: TaskDifficulty): readonly EvaluationTask[] {
    return this.getFiltered({ difficulties: [difficulty] });
  }

  /**
   * Gets the count of registered tasks.
   * @returns Number of tasks
   */
  count(): number {
    return this.tasks.size;
  }

  /**
   * Checks if a task exists.
   * @param id - Task ID
   * @returns True if task exists
   */
  has(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * Removes a task from the registry.
   * @param id - Task ID to remove
   * @returns True if task was removed
   */
  remove(id: string): boolean {
    return this.tasks.delete(id);
  }

  /**
   * Clears all tasks from the registry.
   */
  clear(): void {
    this.tasks.clear();
  }

  /**
   * Gets category statistics.
   * @returns Map of category to task count
   */
  getCategoryStats(): Map<TaskCategory, number> {
    const stats = new Map<TaskCategory, number>();
    for (const task of this.tasks.values()) {
      const count = stats.get(task.category) ?? 0;
      stats.set(task.category, count + 1);
    }
    return stats;
  }

  /**
   * Gets difficulty statistics.
   * @returns Map of difficulty to task count
   */
  getDifficultyStats(): Map<TaskDifficulty, number> {
    const stats = new Map<TaskDifficulty, number>();
    for (const task of this.tasks.values()) {
      const count = stats.get(task.difficulty) ?? 0;
      stats.set(task.difficulty, count + 1);
    }
    return stats;
  }
}

/**
 * Creates a task registry with optional initial tasks.
 * @param tasks - Initial tasks to register
 * @returns New TaskRegistry instance
 */
export function createTaskRegistry(tasks?: readonly EvaluationTask[]): TaskRegistry {
  const registry = new TaskRegistry();
  if (tasks !== undefined) {
    registry.registerAll(tasks);
  }
  return registry;
}

/**
 * Sample evaluation tasks for testing the framework.
 */
export const SAMPLE_TASKS: readonly EvaluationTask[] = [
  {
    id: 'code-gen-easy-1',
    name: 'Simple Function Implementation',
    description: 'Implement a function that calculates the factorial of a number.',
    category: 'code_generation',
    difficulty: 'easy',
    expectedTaskType: 'code_implementation',
    expectedPatterns: ['function', 'factorial', 'return'],
    minimumScore: 0.7,
    preferredClis: ['codex', 'claude'],
    tags: ['math', 'recursion'],
  },
  {
    id: 'code-gen-medium-1',
    name: 'REST API Endpoint',
    description: 'Implement a REST API endpoint for user authentication with JWT token generation.',
    category: 'code_generation',
    difficulty: 'medium',
    expectedTaskType: 'code_implementation',
    expectedPatterns: ['async', 'jwt', 'token', 'authenticate'],
    minimumScore: 0.6,
    preferredClis: ['codex', 'claude'],
    tags: ['api', 'auth', 'jwt'],
  },
  {
    id: 'arch-hard-1',
    name: 'Microservice Architecture Design',
    description:
      'Design a microservice architecture for an e-commerce platform with inventory, orders, and payment services.',
    category: 'architecture',
    difficulty: 'hard',
    expectedTaskType: 'architecture',
    expectedPatterns: ['service', 'api', 'database', 'message'],
    minimumScore: 0.5,
    preferredClis: ['claude'],
    tags: ['microservices', 'design', 'e-commerce'],
  },
  {
    id: 'review-medium-1',
    name: 'Security Code Review',
    description:
      'Review the following code for security vulnerabilities: function getUserData(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }',
    category: 'code_review',
    difficulty: 'medium',
    expectedTaskType: 'code_review',
    expectedPatterns: ['sql injection', 'parameterized', 'sanitize'],
    minimumScore: 0.7,
    preferredClis: ['claude'],
    tags: ['security', 'sql', 'review'],
  },
  {
    id: 'debug-easy-1',
    name: 'Fix Array Index Bug',
    description:
      'Debug and fix: const arr = [1,2,3]; for(let i = 0; i <= arr.length; i++) { console.log(arr[i]); }',
    category: 'debugging',
    difficulty: 'easy',
    expectedTaskType: 'code_implementation',
    expectedPatterns: ['<', 'length', 'undefined'],
    minimumScore: 0.8,
    preferredClis: ['codex', 'claude'],
    tags: ['bug', 'array', 'loop'],
  },
  {
    id: 'test-medium-1',
    name: 'Write Unit Tests',
    description:
      'Write unit tests for a UserService class with methods: create, update, delete, findById.',
    category: 'testing',
    difficulty: 'medium',
    expectedTaskType: 'test_generation',
    expectedPatterns: ['describe', 'it', 'expect', 'mock'],
    minimumScore: 0.6,
    preferredClis: ['codex'],
    tags: ['testing', 'unit', 'vitest'],
  },
  {
    id: 'doc-easy-1',
    name: 'Document Function',
    description:
      'Write JSDoc documentation for: function processPayment(amount, currency, userId) { /* implementation */ }',
    category: 'documentation',
    difficulty: 'easy',
    expectedTaskType: 'documentation',
    expectedPatterns: ['@param', '@returns', 'amount', 'currency'],
    minimumScore: 0.7,
    preferredClis: ['claude', 'gemini'],
    tags: ['jsdoc', 'documentation'],
  },
  {
    id: 'refactor-hard-1',
    name: 'Extract Service Layer',
    description:
      'Refactor this monolithic controller to extract a service layer with proper dependency injection and error handling.',
    category: 'refactoring',
    difficulty: 'hard',
    expectedTaskType: 'code_implementation',
    expectedPatterns: ['service', 'constructor', 'inject', 'interface'],
    minimumScore: 0.5,
    preferredClis: ['claude', 'codex'],
    tags: ['refactor', 'service', 'di'],
  },
];
