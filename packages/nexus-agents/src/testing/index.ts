/**
 * nexus-agents/testing - Testing Utilities
 *
 * Provides mock implementations, test helpers, and type definitions
 * for the CLI integration testing framework.
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  CliName,
  CliTransport,
  CliAdapterConfig,
  CliRequest,
  CliResponse,
  CliStopReason,
  CliTokenUsage,
  CliHealth,
  CliExecutionError,
  CliCapabilityProfile,
  ICliTestAdapter,
  MockCliResponse,
  MockCliConfig,
  TaskTestResult,
  CliRoutingStats,
  RoutingMetrics,
  RoutingResult,
} from './types.js';

export { CliErrorCode, TaskCategory } from './types.js';

// ============================================================================
// Task Types
// ============================================================================

export type {
  EvaluationTask,
  ExpectedOutcome,
  ScoringRubric,
  RubricCriterion,
  ScoringLevel,
  AutomatedCheck,
  TaskExecutionContext,
  TaskRegistryConfig,
} from './task-types.js';

export {
  TaskDifficulty,
  ExpectedOutputType,
  CriterionScoringType,
  AutomatedCheckType,
  RubricTemplate,
  CategoryCliMapping,
  CategoryAcceptableClis,
} from './task-types.js';

// ============================================================================
// Schema Types and Zod Schemas
// ============================================================================

// Constants
export { TestStatus, CliAdapter, RegressionSeverity, BaselineTargets } from './schemas.js';

// Zod Schemas for validation
export {
  AssertionResultSchema,
  TestCaseResultSchema,
  TestSuiteResultSchema,
  EnvironmentInfoSchema,
  TestRunConfigSchema,
  TokenUsageSchema,
  LatencyMetricsSchema,
  CliLatencyMetricsSchema,
  RoutingResultSchema,
  CategoryRoutingMetricsSchema,
  CliRoutingMetricsSchema,
  CriterionScoreSchema,
  ValidationResultSchema,
  QualityResultSchema,
  ScoreDistributionSchema,
  TaskTimestampsSchema,
  TaskErrorSchema,
  PerformanceResultSchema,
  DetailedTaskResultSchema,
  TaskTestResultSchema,
  ReliabilityMetricsSchema,
  TokenMetricsSchema,
  RegressionItemSchema,
  ImprovementItemSchema,
  MetricDeltasSchema,
  BaselineComparisonSchema,
  TestSummarySchema,
  TestRunResultSchema,
  ExtendedTestRunResultSchema,
  ResultWriterConfigSchema,
} from './schemas.js';

// Inferred types from Zod schemas
export type {
  TestStatusType,
  CliAdapterType,
  RegressionSeverityType,
  AssertionResult,
  TestCaseResult,
  TestSuiteResult,
  EnvironmentInfo,
  TestRunConfig,
  TokenUsage,
  LatencyMetrics,
  CliLatencyMetrics,
  CategoryRoutingMetrics,
  CliRoutingMetrics,
  CriterionScore,
  ValidationResult,
  QualityResult,
  ScoreDistribution,
  TaskTimestamps,
  TaskError,
  PerformanceResult,
  DetailedTaskResult,
  ReliabilityMetrics,
  TokenMetrics,
  RegressionItem,
  ImprovementItem,
  MetricDeltas,
  BaselineComparison,
  TestSummary,
  TestRunResult,
  ExtendedTestRunResult,
  ResultWriterConfig,
} from './schemas.js';

// ============================================================================
// Mock Adapters
// ============================================================================

export {
  MockCliAdapter,
  createTestAdapter,
  createFailingAdapter,
  createSlowAdapter,
} from './adapters/index.js';

export type { MockAdapterConfig, RecordedRequest } from './adapters/index.js';

// ============================================================================
// Testing Framework Components
// ============================================================================

export { MetricsCollector, createMetricsCollector } from './framework/index.js';

export type {
  LatencyMeasurement,
  MeasurementHandle,
  LatencyMetrics as FrameworkLatencyMetrics,
  ReliabilityMetrics as FrameworkReliabilityMetrics,
  TokenMetrics as FrameworkTokenMetrics,
  CliBreakdown,
  AggregateMetrics,
} from './framework/index.js';

// ============================================================================
// Scoring Utilities
// ============================================================================

export {
  RoutingScorer,
  evaluateRouting,
  calculateRoutingMetrics,
  getByCategory,
  getCliStats,
} from './scoring/index.js';
