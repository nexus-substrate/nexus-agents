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

// Nexus agent executor
export { NexusAgentExecutor, createNexusExecutorFromEnv } from './nexus-agent-executor.js';

export type { NexusAgentExecutorConfig } from './nexus-agent-executor.js';

// Benchmark runner
export { createExecutor, runBenchmarkInstances } from './benchmark-runner.js';

export type { BenchmarkRunResult, BenchmarkRunOptions } from './benchmark-runner.js';
