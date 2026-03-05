/**
 * nexus-agents/swe-bench - SWE-bench Integration
 *
 * Benchmark nexus-agents against real GitHub issues.
 *
 * @module swe-bench
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

// Types
export type {
  SWEBenchVariant,
  SWEBenchInstance,
  SWEBenchPrediction,
  SWEBenchRunResult,
  SWEBenchEvalResult,
  SWEBenchSummary,
  SWEBenchConfig,
  SWEBenchCheckpoint,
  SWEBenchDatasetInfo,
} from './types.js';

export { DEFAULT_SWE_BENCH_CONFIG, SWE_BENCH_DATASETS } from './types.js';

// Dataset loader
export {
  loadDataset,
  getInstance,
  listInstances,
  getDatasetInfo,
  filterByRepo,
  filterByVersion,
  DatasetLoadError,
} from './dataset-loader.js';

export type { DatasetLoadOptions, DatasetLoadResult } from './dataset-loader.js';

// Prediction writer
export {
  PredictionWriter,
  writePredictions,
  readPredictions,
  getCompletedInstanceIds,
  createPrediction,
  validatePrediction,
  PredictionWriteError,
} from './prediction-writer.js';

export type { PredictionWriterOptions } from './prediction-writer.js';

// Prompt templates
export {
  SWE_BENCH_SYSTEM_PROMPT,
  createInstancePrompt,
  createRetryPrompt,
  extractPatch,
  validatePatchFormat,
  createSummaryPrompt,
  createExplorationPrompt,
} from './prompt-template.js';

// Agent runner
export { runAgentOnInstance, createMockExecutor, AgentRunnerError } from './agent-runner.js';

export type {
  AgentContext,
  IAgentExecutor,
  AgentExecutionResult,
  RunOptions,
} from './agent-runner.js';

// Nexus agent executor (API-based)
export { NexusAgentExecutor, createNexusExecutorFromEnv } from './nexus-agent-executor.js';

export type { NexusAgentExecutorConfig } from './nexus-agent-executor.js';

// CLI agent executor (subprocess-based)
export {
  CliAgentExecutor,
  createCliExecutor,
  isCliAvailable as isSWEBenchCliAvailable,
} from './cli-agent-executor.js';

export type { CliAgentExecutorConfig } from './cli-agent-executor.js';

// Benchmark runner
export { createExecutor, runBenchmarkInstances, runSingleInstance } from './benchmark-runner.js';

export type {
  BenchmarkRunResult,
  BenchmarkRunOptions,
  ExecutorWithModel,
  IBenchmarkWriter,
} from './benchmark-runner.js';

// Parallel runner
export { runBenchmarkParallel, LockedWriter } from './parallel-runner.js';

// Instance priority sorting
export { sortByPriority, estimateDifficulty, REPO_COMPLEXITY } from './instance-sorter.js';
export type { SortOptions } from './instance-sorter.js';

// Memory enrichment
export {
  createBenchmarkMemory,
  buildEnrichedPrompt,
  recordOutcome,
  extractRepoName,
  extractPastSuccessRates,
} from './memory-enrichment.js';

// Evaluation harness types
export { DEFAULT_EVALUATION_CONFIG, EvaluationHarnessError } from './evaluation-harness-types.js';

export type {
  EvaluationHarnessConfig,
  EvaluationCacheLevel,
  EvaluationMode,
  TestStatus,
  TestCaseResult,
  ResolutionStatus,
  InstanceEvaluationResult,
  EvaluationMetrics,
  RepositoryMetrics,
  EvaluationRunResult,
  CompetitorSystem,
  CompetitorResult,
  ComparisonReport,
  EvaluationProgressCallback,
  EvaluationProgress,
  EvaluationPhase,
  EvaluationErrorCode,
  IEvaluationHarness,
  EvaluationValidationResult,
  LeaderboardEntry,
  LeaderboardSnapshot,
} from './evaluation-harness-types.js';

// Evaluation report types
export { DEFAULT_REPORT_CONFIG, ReportGenerationError } from './evaluation-report-types.js';

export type {
  ReportConfig,
  ReportFormat,
  ReportDetailLevel,
  StatisticalSummary,
  TimingStatistics,
  ResourceStatistics,
  FailureCategory,
  FailureAnalysis as SWEBenchFailureAnalysis,
  FailureStatistics,
  FailurePattern as SWEBenchFailurePattern,
  TokenUsageBreakdown,
  TokensByPhase,
  CostEstimate as SWEBenchCostEstimate,
  ModelPricing,
  ReportSummary,
  ReportMetrics,
  ReportRepositoryBreakdown,
  ReportComparison,
  ReportInstanceDetails,
  EvaluationReport,
  ReportMetadata,
  IReportGenerator,
} from './evaluation-report-types.js';

// SWE-Bench runner
export {
  SWEBenchRunner,
  SWEBenchRunnerError,
  createRunner,
  createVariantRunner,
  quickRun,
} from './swe-bench-runner.js';

export type {
  RunnerErrorCode,
  RunProgress,
  ProgressCallback,
  RunnerConfig,
} from './swe-bench-runner.js';

// Environment validator
export {
  validateEnvironment,
  validatePython,
  validateSwebench,
  validateDocker,
  validateDiskSpace,
  formatValidationResult,
} from './environment-validator.js';

export type {
  EnvironmentValidationResult,
  PythonValidation,
  SwebenchValidation,
  DockerValidation,
  DiskSpaceValidation,
} from './environment-validator.js';

// Harness executor
export {
  HarnessExecutor,
  createHarnessExecutor,
  createValidatedExecutor,
  executeHarness,
  HarnessExecutorError,
  DEFAULT_HARNESS_EXECUTION_CONFIG,
} from './harness-executor.js';

export type {
  HarnessExecutionConfig,
  HarnessExecutionResult,
  HarnessValidationResult,
  HarnessExecutionProgress,
  HarnessProgressCallback,
  IHarnessExecutor,
} from './harness-executor.js';

// Harness executor types (additional exports)
export { mapTestStatus, mapResolutionStatus } from './harness-executor-types.js';

export type {
  RawTestResult,
  RawInstanceResult,
  RawHarnessOutput,
  HarnessExecutionState,
  HarnessErrorCode,
} from './harness-executor-types.js';

// Harness executor helpers
export {
  buildHarnessArgs,
  buildHarnessCommand,
  getSwebenchVersion,
  getPythonVersion,
  getDockerVersion,
  parseProgressLine,
  transformTestResult,
  transformInstanceResult,
  transformHarnessOutput,
  validatePredictionsFile,
  calculateEstimatedRemaining,
  createInitialProgress,
  getResultsFilePath,
} from './harness-executor-helpers.js';

// Evaluation harness implementation
export {
  EvaluationHarness,
  createEvaluationHarness,
  createValidatedHarness,
  evaluatePredictions,
} from './evaluation-harness.js';

// Evaluation harness helpers
export {
  calculateMetrics,
  calculateRepositoryMetrics,
  extractRepoFromInstanceId,
  extractModelName,
  mapStateToPhase,
  transformHarnessProgress,
  createProgressAdapter,
  getMemoryInfo,
  getCpuCores,
} from './evaluation-harness-helpers.js';

export type { RawHarnessProgress, MemoryInfo } from './evaluation-harness-helpers.js';

// Patch applicator
export {
  PatchApplicator,
  createPatchApplicator,
  validatePatch,
  applyPatch,
  canApplyPatch,
} from './patch-applicator.js';

export type {
  IPatchApplicator,
  PatchValidationResult,
  PatchApplicationResult,
  PatchApplicationOptions,
  PatchFormat,
  PatchErrorCode,
} from './patch-applicator-types.js';

export { DEFAULT_PATCH_OPTIONS, PatchApplicatorError } from './patch-applicator-types.js';

// Test runner
export { TestRunner, createTestRunner, runTests, detectTestFramework } from './test-runner.js';

export type {
  ITestRunner,
  TestRunnerConfig,
  TestSuiteResult,
  FrameworkDetectionResult,
  TestFramework,
  TestRunnerErrorCode,
} from './test-runner-types.js';

export { DEFAULT_TEST_RUNNER_CONFIG, TestRunnerError } from './test-runner-types.js';

// Test runner parser
export {
  parseTestResults,
  parseJsonResults,
  parseStdoutResults,
  readJsonResults,
} from './test-runner-parser.js';

// Test runner Docker execution
export { executeInDocker, buildDockerArgs } from './test-runner-docker.js';

export type {
  DockerExecutionState,
  CancelledResultFactory,
  ErrorHandler,
} from './test-runner-docker.js';

// Report generator
export {
  ReportGenerator,
  createReportGenerator,
  generateReport,
  exportReport,
} from './report-generator.js';

// Trace logger
export { TraceLogger } from './trace-logger.js';

export type { TraceEventType, TraceEvent, RunStatus, TraceLoggerOptions } from './trace-logger.js';

// MCP config
export { generateMcpConfig, getDefaultAllowedTools } from './mcp-config.js';

export type { McpConfigOptions, GeneratedMcpConfig } from './mcp-config.js';
