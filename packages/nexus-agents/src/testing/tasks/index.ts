/**
 * nexus-agents/testing/tasks - Task Registry Module
 *
 * Exports evaluation tasks and the task registry for CLI testing.
 */

// Task types
export type {
  TaskCategory,
  TaskDifficulty,
  ExpectedOutcome,
  ScoringCriterion,
  ScoringRubric,
  EvaluationTask,
  TaskEvaluationResult,
  CriterionScore,
  EvaluationSummary,
  CategoryStats,
  DifficultyStats,
} from './task-types.js';

// Task registry
export { TaskRegistry, EVALUATION_TASKS } from './task-registry.js';
