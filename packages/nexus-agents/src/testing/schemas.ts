/**
 * nexus-agents/testing - Result Storage Types and Schemas
 *
 * Type definitions and Zod schemas for CLI testing framework results.
 * These types define the structure of test run outputs stored as JSON.
 */

import { z } from 'zod';

// ============================================================================
// Constants and Enums
// ============================================================================

/**
 * Test status values.
 */
export const TestStatus = {
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ERROR: 'error',
  TIMEOUT: 'timeout',
} as const;

export type TestStatusType = (typeof TestStatus)[keyof typeof TestStatus];

/**
 * CLI adapter identifiers.
 */
export const CliAdapter = {
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  CODEX: 'codex',
} as const;

export type CliAdapterType = (typeof CliAdapter)[keyof typeof CliAdapter];

/**
 * Regression severity levels.
 */
export const RegressionSeverity = {
  MINOR: 'minor',
  MODERATE: 'moderate',
  SEVERE: 'severe',
} as const;

export type RegressionSeverityType = (typeof RegressionSeverity)[keyof typeof RegressionSeverity];

/**
 * Baseline target metrics for pass/fail evaluation.
 * Based on issue #98 requirements.
 */
export const BaselineTargets = {
  /** Routing optimal rate >= 75% */
  ROUTING_OPTIMAL_RATE: 0.75,
  /** Routing acceptable rate >= 90% */
  ROUTING_ACCEPTABLE_RATE: 0.9,
  /** Quality pass rate >= 80% */
  QUALITY_PASS_RATE: 0.8,
  /** Quality average score >= 70 */
  QUALITY_AVERAGE_SCORE: 70,
  /** Latency p95 <= 120s */
  LATENCY_P95_MS: 120_000,
  /** Success rate >= 95% */
  SUCCESS_RATE: 0.95,
} as const;

// ============================================================================
// Basic Schemas
// ============================================================================

/**
 * Schema for individual assertion results.
 */
export const AssertionResultSchema = z.object({
  name: z.string().describe('Name of the assertion'),
  passed: z.boolean().describe('Whether the assertion passed'),
  expected: z.unknown().optional().describe('Expected value'),
  actual: z.unknown().optional().describe('Actual value'),
  message: z.string().optional().describe('Error or info message'),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;

/**
 * Schema for individual test case results.
 */
export const TestCaseResultSchema = z.object({
  name: z.string().describe('Test case name'),
  description: z.string().optional().describe('Test case description'),
  status: z.enum(['passed', 'failed', 'skipped', 'error', 'timeout']).describe('Test status'),
  durationMs: z.number().nonnegative().describe('Test duration in milliseconds'),
  assertions: z.array(AssertionResultSchema).describe('Assertion results'),
  error: z.string().optional().describe('Error message if test failed'),
  stackTrace: z.string().optional().describe('Stack trace if available'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
});

export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;

/**
 * Schema for test suite results (group of test cases).
 */
export const TestSuiteResultSchema = z.object({
  name: z.string().describe('Test suite name'),
  description: z.string().optional().describe('Test suite description'),
  adapter: z.enum(['claude', 'gemini', 'codex']).describe('CLI adapter used'),
  testCases: z.array(TestCaseResultSchema).describe('Individual test results'),
  durationMs: z.number().nonnegative().describe('Total suite duration'),
  passed: z.number().nonnegative().describe('Number of passed tests'),
  failed: z.number().nonnegative().describe('Number of failed tests'),
  skipped: z.number().nonnegative().describe('Number of skipped tests'),
  errors: z.number().nonnegative().describe('Number of error tests'),
});

export type TestSuiteResult = z.infer<typeof TestSuiteResultSchema>;

// ============================================================================
// Environment and Configuration Schemas
// ============================================================================

/**
 * Schema for environment information.
 */
export const EnvironmentInfoSchema = z.object({
  nodeVersion: z.string().describe('Node.js version'),
  os: z.string().describe('Operating system'),
  osVersion: z.string().describe('OS version'),
  arch: z.string().describe('Architecture'),
  timezone: z.string().describe('Timezone (should be America/New_York)'),
  cliVersions: z
    .record(z.enum(['claude', 'gemini', 'codex']), z.string().nullable())
    .describe('CLI versions'),
  packageVersion: z.string().describe('Package version'),
  gitCommit: z.string().optional().describe('Git commit hash'),
  gitBranch: z.string().optional().describe('Git branch'),
});

export type EnvironmentInfo = z.infer<typeof EnvironmentInfoSchema>;

/**
 * Schema for test run configuration.
 */
export const TestRunConfigSchema = z.object({
  temperature: z.number().min(0).max(2).describe('Temperature (should be 0.0 for reproducibility)'),
  taskTimeoutMs: z.number().positive().describe('Timeout per task in milliseconds'),
  maxRetries: z.number().int().nonnegative().describe('Maximum retries per task'),
  parallel: z.boolean().describe('Whether to run in parallel'),
  parallelWorkers: z.number().int().positive().describe('Number of parallel workers'),
  includeCategories: z.array(z.string()).describe('Categories included'),
  targetClis: z.array(z.enum(['claude', 'gemini', 'codex'])).describe('CLIs being tested'),
  baselineRunId: z.string().optional().describe('Baseline run ID for comparison'),
});

export type TestRunConfig = z.infer<typeof TestRunConfigSchema>;

// ============================================================================
// Token and Performance Schemas
// ============================================================================

/**
 * Schema for token usage statistics.
 */
export const TokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative().describe('Input tokens consumed'),
  outputTokens: z.number().nonnegative().describe('Output tokens generated'),
  totalTokens: z.number().nonnegative().describe('Total tokens'),
  cachedTokens: z.number().nonnegative().optional().describe('Cached tokens'),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Schema for latency metrics.
 */
export const LatencyMetricsSchema = z.object({
  p50: z.number().nonnegative().describe('50th percentile (median) in milliseconds'),
  p75: z.number().nonnegative().describe('75th percentile in milliseconds'),
  p90: z.number().nonnegative().describe('90th percentile in milliseconds'),
  p95: z.number().nonnegative().describe('95th percentile in milliseconds'),
  p99: z.number().nonnegative().describe('99th percentile in milliseconds'),
  mean: z.number().nonnegative().describe('Mean latency in milliseconds'),
  stdDev: z.number().nonnegative().describe('Standard deviation in milliseconds'),
  min: z.number().nonnegative().describe('Minimum latency in milliseconds'),
  max: z.number().nonnegative().describe('Maximum latency in milliseconds'),
});

export type LatencyMetrics = z.infer<typeof LatencyMetricsSchema>;

/**
 * Schema for CLI-specific latency metrics.
 */
export const CliLatencyMetricsSchema = z.object({
  requestCount: z.number().nonnegative().describe('Number of requests'),
  p50: z.number().nonnegative().describe('50th percentile in milliseconds'),
  p95: z.number().nonnegative().describe('95th percentile in milliseconds'),
  mean: z.number().nonnegative().describe('Mean latency in milliseconds'),
});

export type CliLatencyMetrics = z.infer<typeof CliLatencyMetricsSchema>;

// ============================================================================
// Routing Schemas
// ============================================================================

/**
 * Schema for routing result.
 */
export const RoutingResultSchema = z.object({
  selectedCli: z.enum(['claude', 'gemini', 'codex']).describe('CLI that was selected'),
  optimalCli: z.enum(['claude', 'gemini', 'codex']).describe('Optimal CLI for this task'),
  isOptimal: z.boolean().describe('Whether routing was optimal'),
  isAcceptable: z.boolean().describe('Whether routing was acceptable'),
  confidence: z.number().min(0).max(1).describe('Routing confidence score (0.0 - 1.0)'),
  reasoning: z.string().optional().describe('Routing reasoning'),
});

export type RoutingResult = z.infer<typeof RoutingResultSchema>;

/**
 * Schema for category routing metrics.
 */
export const CategoryRoutingMetricsSchema = z.object({
  taskCount: z.number().nonnegative().describe('Number of tasks in category'),
  optimalRate: z.number().min(0).max(1).describe('Optimal routing rate'),
  acceptableRate: z.number().min(0).max(1).describe('Acceptable routing rate'),
  averageConfidence: z.number().min(0).max(1).describe('Average routing confidence'),
});

export type CategoryRoutingMetrics = z.infer<typeof CategoryRoutingMetricsSchema>;

/**
 * Schema for CLI routing metrics.
 */
export const CliRoutingMetricsSchema = z.object({
  selectedCount: z.number().nonnegative().describe('Times this CLI was selected'),
  optimalCount: z.number().nonnegative().describe('Times this CLI was optimal choice'),
  selectionRate: z.number().min(0).max(1).describe('Selection rate'),
  accuracyWhenSelected: z.number().min(0).max(1).describe('Accuracy when selected'),
});

export type CliRoutingMetrics = z.infer<typeof CliRoutingMetricsSchema>;

// ============================================================================
// Quality Schemas
// ============================================================================

/**
 * Schema for criterion score.
 */
export const CriterionScoreSchema = z.object({
  criterionId: z.string().describe('Criterion identifier'),
  criterionName: z.string().describe('Criterion name'),
  points: z.number().nonnegative().describe('Points awarded'),
  maxPoints: z.number().positive().describe('Maximum points possible'),
  normalizedScore: z.number().min(0).max(1).describe('Normalized score (0.0 - 1.0)'),
  weight: z.number().positive().describe('Weight applied'),
  notes: z.string().optional().describe('Scoring notes'),
});

export type CriterionScore = z.infer<typeof CriterionScoreSchema>;

/**
 * Schema for validation result.
 */
export const ValidationResultSchema = z.object({
  type: z.string().describe('Validation type'),
  passed: z.boolean().describe('Whether validation passed'),
  message: z.string().describe('Validation message'),
  expected: z.unknown().optional().describe('Expected value'),
  actual: z.unknown().optional().describe('Actual value'),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Schema for quality result.
 */
export const QualityResultSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall quality score (0 - 100)'),
  passed: z.boolean().describe('Whether task passed quality threshold'),
  threshold: z.number().min(0).max(100).describe('Passing threshold used'),
  criterionScores: z.array(CriterionScoreSchema).describe('Individual criterion scores'),
  validationResults: z.array(ValidationResultSchema).describe('Validation results'),
});

export type QualityResult = z.infer<typeof QualityResultSchema>;

/**
 * Schema for score distribution.
 */
export const ScoreDistributionSchema = z.object({
  bucket0to20: z.number().nonnegative().describe('Scores 0-20'),
  bucket21to40: z.number().nonnegative().describe('Scores 21-40'),
  bucket41to60: z.number().nonnegative().describe('Scores 41-60'),
  bucket61to80: z.number().nonnegative().describe('Scores 61-80'),
  bucket81to100: z.number().nonnegative().describe('Scores 81-100'),
});

export type ScoreDistribution = z.infer<typeof ScoreDistributionSchema>;

// ============================================================================
// Task Result Schemas
// ============================================================================

/**
 * Schema for task timestamps.
 */
export const TaskTimestampsSchema = z.object({
  startedAt: z.string().datetime().describe('When task started (ISO 8601)'),
  completedAt: z.string().datetime().describe('When task completed (ISO 8601)'),
  durationMs: z.number().nonnegative().describe('Duration in milliseconds'),
});

export type TaskTimestamps = z.infer<typeof TaskTimestampsSchema>;

/**
 * Schema for task error.
 */
export const TaskErrorSchema = z.object({
  code: z.string().describe('Error code'),
  message: z.string().describe('Error message'),
  stack: z.string().optional().describe('Stack trace'),
  retryable: z.boolean().describe('Whether error is retryable'),
});

export type TaskError = z.infer<typeof TaskErrorSchema>;

/**
 * Schema for performance result.
 */
export const PerformanceResultSchema = z.object({
  durationMs: z.number().nonnegative().describe('Total execution time in milliseconds'),
  timeToFirstTokenMs: z.number().nonnegative().optional().describe('Time to first token'),
  tokenUsage: TokenUsageSchema.describe('Token usage statistics'),
  stopReason: z
    .enum(['end_turn', 'max_tokens', 'timeout', 'error', 'stop_sequence'])
    .describe('Stop reason'),
  truncated: z.boolean().describe('Response truncated flag'),
  retries: z.number().int().nonnegative().describe('Retry count'),
});

export type PerformanceResult = z.infer<typeof PerformanceResultSchema>;

/**
 * Schema for detailed task test result.
 */
export const DetailedTaskResultSchema = z.object({
  taskId: z.string().describe('Task identifier'),
  taskName: z.string().describe('Task name'),
  category: z.string().describe('Task category'),
  difficulty: z.enum(['simple', 'moderate', 'complex']).describe('Task difficulty'),
  status: z.enum(['passed', 'failed', 'error', 'timeout', 'skipped']).describe('Task status'),
  routedCli: z.enum(['claude', 'gemini', 'codex']).describe('CLI that was routed to'),
  routing: RoutingResultSchema.describe('Routing evaluation result'),
  quality: QualityResultSchema.describe('Quality evaluation result'),
  performance: PerformanceResultSchema.describe('Performance metrics'),
  response: z.string().optional().describe('Raw response content'),
  error: TaskErrorSchema.optional().describe('Error details if failed'),
  attempts: z.number().int().positive().describe('Number of attempts made'),
  timestamps: TaskTimestampsSchema.describe('Execution timestamps'),
});

export type DetailedTaskResult = z.infer<typeof DetailedTaskResultSchema>;

/**
 * Schema for task-level test results (simplified for backward compatibility).
 */
export const TaskTestResultSchema = z.object({
  taskId: z.string().describe('Unique task identifier'),
  taskName: z.string().describe('Human-readable task name'),
  category: z.string().describe('Task category'),
  status: z.enum(['passed', 'failed', 'skipped', 'error']).describe('Test status'),
  metrics: z.object({
    qualityScore: z.number().min(0).max(100).describe('Quality score (0-100)'),
    latencyMs: z.number().nonnegative().describe('Response latency in milliseconds'),
    routingAccuracy: z.number().min(0).max(100).describe('Routing accuracy (0-100)'),
    reliability: z.number().min(0).max(100).describe('Reliability score (0-100)'),
  }),
  cli: z.enum(['claude', 'gemini', 'codex']).describe('CLI that executed the task'),
  expectedCli: z.enum(['claude', 'gemini', 'codex']).optional().describe('Expected optimal CLI'),
  retryCount: z.number().int().nonnegative().default(0).describe('Number of retries'),
  error: z.string().optional().describe('Error message if failed'),
});

export type TaskTestResult = z.infer<typeof TaskTestResultSchema>;

// ============================================================================
// Aggregate Metrics Schemas
// ============================================================================

/**
 * Schema for reliability metrics.
 */
export const ReliabilityMetricsSchema = z.object({
  successRate: z.number().min(0).max(1).describe('Overall success rate'),
  totalRetries: z.number().nonnegative().describe('Total retry count'),
  timeoutCount: z.number().nonnegative().describe('Timeout count'),
  errorCount: z.number().nonnegative().describe('Error count'),
  circuitBreakerTrips: z.number().nonnegative().describe('Circuit breaker trip count'),
});

export type ReliabilityMetrics = z.infer<typeof ReliabilityMetricsSchema>;

/**
 * Schema for token metrics.
 */
export const TokenMetricsSchema = z.object({
  totalInputTokens: z.number().nonnegative().describe('Total input tokens'),
  totalOutputTokens: z.number().nonnegative().describe('Total output tokens'),
  totalTokens: z.number().nonnegative().describe('Total tokens'),
  averagePerTask: z.number().nonnegative().describe('Average tokens per task'),
});

export type TokenMetrics = z.infer<typeof TokenMetricsSchema>;

// ============================================================================
// Comparison Schemas
// ============================================================================

/**
 * Schema for regression item.
 */
export const RegressionItemSchema = z.object({
  metric: z.string().describe('Metric name'),
  baseline: z.number().describe('Baseline value'),
  current: z.number().describe('Current value'),
  percentChange: z.number().describe('Percentage change'),
  severity: z.enum(['minor', 'moderate', 'severe']).describe('Severity level'),
});

export type RegressionItem = z.infer<typeof RegressionItemSchema>;

/**
 * Schema for improvement item.
 */
export const ImprovementItemSchema = z.object({
  metric: z.string().describe('Metric name'),
  baseline: z.number().describe('Baseline value'),
  current: z.number().describe('Current value'),
  percentChange: z.number().describe('Percentage change'),
});

export type ImprovementItem = z.infer<typeof ImprovementItemSchema>;

/**
 * Schema for metric deltas.
 */
export const MetricDeltasSchema = z.object({
  qualityScore: z.number().describe('Quality score delta'),
  passRate: z.number().describe('Pass rate delta'),
  routingOptimalRate: z.number().describe('Routing optimal rate delta'),
  latencyP95: z.number().describe('Latency p95 delta'),
  successRate: z.number().describe('Success rate delta'),
});

export type MetricDeltas = z.infer<typeof MetricDeltasSchema>;

/**
 * Schema for baseline comparison.
 */
export const BaselineComparisonSchema = z.object({
  baselineRunId: z.string().describe('Baseline run ID'),
  baselineTimestamp: z.string().datetime().describe('Baseline run timestamp'),
  improved: z.boolean().describe('Whether current run is better overall'),
  regressions: z.array(RegressionItemSchema).describe('Regressions detected'),
  improvements: z.array(ImprovementItemSchema).describe('Improvements detected'),
  deltas: MetricDeltasSchema.describe('Metric deltas'),
});

export type BaselineComparison = z.infer<typeof BaselineComparisonSchema>;

// ============================================================================
// Test Run Result Schemas
// ============================================================================

/**
 * Schema for test summary.
 */
export const TestSummarySchema = z.object({
  totalTasks: z.number().nonnegative().describe('Total number of tasks'),
  passedTasks: z.number().nonnegative().describe('Number of tasks passed'),
  failedTasks: z.number().nonnegative().describe('Number of tasks failed'),
  skippedTasks: z.number().nonnegative().describe('Number of tasks skipped'),
  errorTasks: z.number().nonnegative().describe('Number of tasks with errors'),
  passRate: z.number().min(0).max(1).describe('Overall pass rate (0.0 - 1.0)'),
  averageQualityScore: z.number().min(0).max(100).describe('Average quality score'),
  routingOptimalRate: z.number().min(0).max(1).describe('Routing accuracy'),
  routingAcceptableRate: z.number().min(0).max(1).describe('Acceptable routing rate'),
});

export type TestSummary = z.infer<typeof TestSummarySchema>;

/**
 * Schema for complete test run results.
 */
export const TestRunResultSchema = z.object({
  id: z.string().describe('Unique identifier for this test run'),
  timestamp: z.string().datetime().describe('ISO 8601 timestamp when run started'),
  timezone: z.string().describe('Timezone used (e.g., America/New_York)'),
  suites: z.array(TestSuiteResultSchema).describe('Test suite results'),
  totalDurationMs: z.number().nonnegative().describe('Total run duration'),
  summary: z.object({
    totalTests: z.number().nonnegative(),
    passed: z.number().nonnegative(),
    failed: z.number().nonnegative(),
    skipped: z.number().nonnegative(),
    errors: z.number().nonnegative(),
    passRate: z.number().min(0).max(100).describe('Pass rate as percentage'),
  }),
  environment: z.object({
    nodeVersion: z.string(),
    platform: z.string(),
    arch: z.string(),
    nexusAgentsVersion: z.string(),
  }),
  metadata: z.record(z.unknown()).optional().describe('Additional run metadata'),
});

export type TestRunResult = z.infer<typeof TestRunResultSchema>;

/**
 * Schema for extended test run result with detailed task results.
 */
export const ExtendedTestRunResultSchema = TestRunResultSchema.extend({
  taskResults: z.array(TaskTestResultSchema).describe('Per-task test results with metrics'),
  detailedTaskResults: z
    .array(DetailedTaskResultSchema)
    .optional()
    .describe('Detailed per-task results'),
  comparison: BaselineComparisonSchema.optional().describe('Comparison with baseline'),
});

export type ExtendedTestRunResult = z.infer<typeof ExtendedTestRunResultSchema>;

/**
 * Schema for result writer configuration.
 */
export const ResultWriterConfigSchema = z.object({
  outputDir: z.string().describe('Directory to write results to'),
  keepHistory: z
    .number()
    .int()
    .positive()
    .default(10)
    .describe('Number of historical runs to keep'),
  includeDetailedResults: z.boolean().default(true).describe('Include detailed task results'),
  prettyPrint: z.boolean().default(true).describe('Pretty print JSON output'),
});

export type ResultWriterConfig = z.infer<typeof ResultWriterConfigSchema>;
