/**
 * nexus-agents/testing/framework - Framework Exports
 *
 * Testing framework components for CLI adapter evaluation.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

// Existing metrics collector exports
export {
  MetricsCollector,
  createMetricsCollector,
  type LatencyMeasurement,
  type MeasurementHandle,
  type LatencyMetrics,
  type ReliabilityMetrics,
  type TokenMetrics,
  type CliBreakdown,
  type AggregateMetrics,
} from './metrics-collector.js';

// Evaluation Types
export type {
  TaskDifficulty,
  TaskCategory,
  EvaluationTask,
  RubricCriterion,
  EvaluationRubric,
  CriterionScore,
  RubricScore,
  RoutingDecisionDetails,
  RoutingScore,
  TaskTestResult,
  AggregatedMetrics,
  CliMetrics,
  CategoryMetrics,
  DifficultyMetrics,
  EnvironmentInfo,
  TestRunResult,
  TaskFilter,
  TestProgress,
  ProgressCallback,
  TestRunnerConfig,
} from './types.js';
export { DEFAULT_TEST_RUNNER_CONFIG } from './types.js';

// Task Registry
export { TaskRegistry, createTaskRegistry, SAMPLE_TASKS } from './task-registry.js';

// Rubric Scorer
export { RubricScorer, createRubricScorer, DEFAULT_RUBRICS } from './rubric-scorer.js';

// Routing Scorer
export {
  RoutingScorer,
  createRoutingScorer,
  DEFAULT_ROUTING_SCORER_CONFIG,
} from './routing-scorer.js';
export type { RoutingScorerConfig } from './routing-scorer.js';

// Test Runner
export { TestRunner, createTestRunner, TestRunError } from './test-runner.js';
