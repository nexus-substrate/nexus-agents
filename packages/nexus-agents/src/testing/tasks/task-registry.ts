/**
 * nexus-agents/testing/tasks - Task Registry
 *
 * Registry for managing and querying evaluation tasks.
 * Task definitions are imported from ./definitions/
 */

import type { CliName } from '../types.js';
import type { EvaluationTask, TaskCategory, TaskDifficulty } from './task-types.js';
import { EVALUATION_TASKS } from './definitions/index.js';

// Re-export EVALUATION_TASKS and individual tasks for backwards compatibility
export { EVALUATION_TASKS } from './definitions/index.js';
export {
  TASK_001_SIMPLE_FUNCTION,
  TASK_002_ALGORITHM_DESIGN,
  TASK_003_CODEBASE_ANALYSIS,
  TASK_004_TEST_GENERATION,
  TASK_005_ARCHITECTURE_DECISION,
  TASK_006_REFACTORING,
  TASK_007_DEBUGGING,
  TASK_008_DOCUMENTATION,
  TASK_009_PERFORMANCE,
  TASK_010_ERROR_HANDLING,
  TASK_011_API_DESIGN,
  TASK_012_CONCURRENCY,
  TASK_013_SCHEMA_MIGRATION,
  TASK_014_SECURITY_REVIEW,
  TASK_015_INTEGRATION,
} from './definitions/index.js';

/**
 * Registry for managing and querying evaluation tasks.
 *
 * Provides efficient lookup by:
 * - Task ID
 * - Category
 * - Difficulty
 * - Optimal CLI
 * - Acceptable CLIs
 * - Tags
 */
export class TaskRegistry {
  private readonly tasks: ReadonlyMap<string, EvaluationTask>;
  private readonly byCategory: ReadonlyMap<TaskCategory, readonly EvaluationTask[]>;
  private readonly byDifficulty: ReadonlyMap<TaskDifficulty, readonly EvaluationTask[]>;
  private readonly byOptimalCli: ReadonlyMap<CliName, readonly EvaluationTask[]>;

  /**
   * Create a new TaskRegistry.
   * @param tasks - Array of evaluation tasks (defaults to EVALUATION_TASKS)
   */
  constructor(tasks: readonly EvaluationTask[] = EVALUATION_TASKS) {
    // Build task map
    this.tasks = new Map(tasks.map((t) => [t.id, t]));

    // Build category index
    const categoryMap = new Map<TaskCategory, EvaluationTask[]>();
    for (const task of tasks) {
      const existing = categoryMap.get(task.category) ?? [];
      existing.push(task);
      categoryMap.set(task.category, existing);
    }
    this.byCategory = categoryMap;

    // Build difficulty index
    const difficultyMap = new Map<TaskDifficulty, EvaluationTask[]>();
    for (const task of tasks) {
      const existing = difficultyMap.get(task.difficulty) ?? [];
      existing.push(task);
      difficultyMap.set(task.difficulty, existing);
    }
    this.byDifficulty = difficultyMap;

    // Build optimal CLI index
    const cliMap = new Map<CliName, EvaluationTask[]>();
    for (const task of tasks) {
      const existing = cliMap.get(task.optimalCli) ?? [];
      existing.push(task);
      cliMap.set(task.optimalCli, existing);
    }
    this.byOptimalCli = cliMap;
  }

  /**
   * Get all registered tasks.
   * @returns All evaluation tasks
   */
  getAllTasks(): readonly EvaluationTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get a task by ID.
   * @param id - Task identifier (e.g., "task-001")
   * @returns The task or undefined if not found
   */
  getTask(id: string): EvaluationTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get tasks filtered by category.
   * @param category - Task category to filter by
   * @returns Tasks in the specified category
   */
  getTasksByCategory(category: TaskCategory): readonly EvaluationTask[] {
    return this.byCategory.get(category) ?? [];
  }

  /**
   * Get tasks filtered by difficulty.
   * @param difficulty - Difficulty level to filter by
   * @returns Tasks at the specified difficulty
   */
  getTasksByDifficulty(difficulty: TaskDifficulty): readonly EvaluationTask[] {
    return this.byDifficulty.get(difficulty) ?? [];
  }

  /**
   * Get tasks where the specified CLI is optimal.
   * @param cli - CLI name to filter by
   * @returns Tasks where this CLI is optimal
   */
  getTasksByOptimalCli(cli: CliName): readonly EvaluationTask[] {
    return this.byOptimalCli.get(cli) ?? [];
  }

  /**
   * Get tasks that accept a specific CLI.
   * @param cli - CLI name to check
   * @returns Tasks that accept this CLI
   */
  getTasksAcceptingCli(cli: CliName): readonly EvaluationTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.acceptableClis.includes(cli));
  }

  /**
   * Get tasks filtered by tags.
   * @param tags - Tags to filter by (task must have ALL tags)
   * @returns Tasks matching all specified tags
   */
  getTasksByTags(tags: readonly string[]): readonly EvaluationTask[] {
    return Array.from(this.tasks.values()).filter((t) => tags.every((tag) => t.tags.includes(tag)));
  }

  /**
   * Get count of tasks per category.
   * @returns Map of category to task count
   */
  getCategoryCounts(): ReadonlyMap<TaskCategory, number> {
    const counts = new Map<TaskCategory, number>();
    for (const [category, tasks] of this.byCategory) {
      counts.set(category, tasks.length);
    }
    return counts;
  }

  /**
   * Get count of tasks per difficulty.
   * @returns Map of difficulty to task count
   */
  getDifficultyCounts(): ReadonlyMap<TaskDifficulty, number> {
    const counts = new Map<TaskDifficulty, number>();
    for (const [difficulty, tasks] of this.byDifficulty) {
      counts.set(difficulty, tasks.length);
    }
    return counts;
  }

  /**
   * Get total number of tasks.
   * @returns Total task count
   */
  getTaskCount(): number {
    return this.tasks.size;
  }
}
