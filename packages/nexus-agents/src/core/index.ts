/**
 * nexus-agents/core
 * Shared types, Result<T,E>, errors, and logger for Nexus Agents
 */

// Result pattern
export type { Result } from './result.js';
export { ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOr } from './result.js';

// Safe JSON substring extraction (ReDoS-safe, O(n))
export { extractJsonArray, extractJsonObject } from './json-extract.js';

// Circular Buffer — O(1) bounded collection (Source: Issue #407; relocated to core #3288)
export { CircularBuffer } from './circular-buffer.js';

// Bounded LRU cache — canonical size-bound LRU (#3292)
export { BoundedLRUCache } from './bounded-lru-cache.js';

// Tune adjustment store — bounded/decaying routing-demotion channel (#3147)
export {
  TuneAdjustmentStore,
  getTuneAdjustmentStore,
  resetTuneAdjustmentStore,
  TUNE_DEMOTION_FLOOR,
  TUNE_MAX_STEP,
  TUNE_DECAY_WINDOW_MS,
  type TuneAdjustment,
  type TuneDemotionStat,
  type TuneReversal,
  type TuneReversalCause,
  type TuneReversalListener,
} from './tune-adjustment-store.js';

// Step event vocabulary + `withStep` wrapper (#1930 — human console notifications)
export type {
  StepErrorCategory,
  StepStartedEvent,
  StepCompletedEvent,
  StepFailedEvent,
  StepEvent,
} from './step-events.js';
export { STEP_SUMMARY_MAX_LEN, truncateSummary } from './step-events.js';
export { stepBus } from './step-bus.js';
export type { StepOptions, StepContext } from './with-step.js';
export { withStep, currentStepId } from './with-step.js';
export { startConsoleRenderer } from './console-renderer.js';
export { startStepLoggerBridge } from './step-logger-bridge.js';
export type { BootstrapOptions, NotificationHandles } from './step-notifications.js';
export { bootstrapStepNotifications, shouldEnableConsoleRenderer } from './step-notifications.js';

// Command result pattern (Issue #584 - CLI result consolidation)
export type { CommandResult } from './command-result.js';
export {
  commandOk,
  commandErr,
  isCommandOk,
  isCommandErr,
  getCommandData,
} from './command-result.js';

// Error hierarchy
export {
  ErrorCode,
  NexusError,
  ValidationError,
  ConfigError,
  ModelError,
  AgentError,
  WorkflowError,
  SecurityError,
  TimeoutError,
  RateLimitError,
  // Agent failure taxonomy (Source: arxiv:2509.25370)
  AgentErrorCategory,
  AgentFailureError,
  MemoryFailureError,
  ReflectionFailureError,
  PlanningFailureError,
  ActionFailureError,
  // Error categories (ADR-0009 - Error Class Hierarchy)
  ErrorCategory,
  OperationError,
  ResourceError,
  // Utility functions
  toError,
  getErrorMessage,
  getErrorCategory,
  isRetryableError,
} from './errors.js';
export type { SerializedError, NexusErrorOptions, AgentFailureOptions } from './errors.js';

// Logger
export { createLogger, logger, sanitize, sanitizeDeep } from './logger.js';
export type {
  LogLevel,
  LogFormat,
  LogDestination,
  LogContext,
  LogEntry,
  ILogger,
} from './logger.js';

// Tracing
export {
  Tracer,
  getTracer,
  setTracer,
  withSpan,
  recordLLMMetrics,
  getTraceContext,
  calculateCost,
  generateTraceId,
  generateSpanId,
} from './trace.js';
export type {
  TraceContext,
  TraceSpan,
  SpanStatus,
  LLMMetrics,
  AggregatedMetrics,
  TracerConfig,
} from './trace.js';

// Trace Export & Visualization (Issue #132)
export {
  exportTraceToFile,
  exportTraceToString,
  visualizeTrace,
  printTrace,
  generateTraceFilename,
} from './trace-exporter.js';
export type { ExportFormat, ExportedTrace, VisualizationOptions } from './trace-exporter.js';

// Formatting helpers (LOOP H-K consolidation)
export {
  formatDuration,
  formatDurationCompact,
  formatCost,
  formatTokens,
  formatPercentage,
} from './trace-exporter-helpers.js';

// Artifact provenance
export {
  ArtifactType,
  ARTIFACT_SCHEMA_VERSION,
  ArtifactTypeSchema,
  ArtifactMetadataSchema,
  createArtifact,
  createArtifactSchema,
  isArtifact,
  isArtifactOfType,
  deriveArtifact,
} from './artifact.js';
export type {
  Artifact,
  ArtifactMetadata,
  ArtifactTypeValue,
  CreateArtifactInput,
} from './artifact.js';

// Error Metrics
export { ErrorMetricsCollector, errorMetrics, recordError } from './metrics.js';
export type { ErrorMetrics, RecordErrorOptions, MetricsExport } from './metrics.js';

// Safe Regex (Issue #341 - ReDoS prevention)
export {
  escapeRegex,
  validatePattern,
  safeRegex,
  literalRegex,
  safeTest,
  safeMatch,
  safeReplace,
  SafeRegexError,
  MAX_PATTERN_LENGTH,
} from './safe-regex.js';

// Zod Helpers (LOOP H-K consolidation - 20+ duplicate implementations)
export {
  formatZodIssue,
  formatZodError,
  formatZodIssuesAsArray,
  formatZodIssueWithRoot,
  isZodError,
} from './zod-helpers.js';

// Task Analysis
export {
  TaskTypeClassifier,
  createTaskTypeClassifier,
  type TaskType,
  type ClassificationResult,
  type ClassificationSignal,
  type TaskTypeClassifierConfig,
} from './task-analysis/index.js';

// Shared Task Analyzer (ADR-0004, Issue #574)
export type {
  ISharedTaskAnalyzer,
  TaskAnalysisResult,
  SharedTaskAnalyzerConfig,
  ReasoningKnowledgeType,
  ComplexityLevel,
  TaskTypeCategory,
  TaskCapabilities,
} from './task-analysis/index.js';
export { SharedTaskAnalyzer, createSharedTaskAnalyzer } from './task-analysis/index.js';

// Task Profile Adapter (Issue #586 - Legacy compatibility)
export type { TaskProfile, BanditContext } from './task-analysis/index.js';
export {
  taskAnalysisResultToTaskProfile,
  taskAnalysisResultToBanditContext,
  summarizeTaskProfile,
} from './task-analysis/index.js';

// Time Provider (Determinism - System Mandate)
export type { ITimeProvider, TimeProviderConfig } from './time-provider.js';
export {
  SystemTimeProvider,
  FixedTimeProvider,
  getTimeProvider,
  setTimeProvider,
  resetTimeProvider,
  getCurrentDateString,
  createTimeProvider,
} from './time-provider.js';

// Random Provider (Determinism - System Mandate)
export type { IRandomProvider, RandomProviderConfig } from './random-provider.js';
export {
  SystemRandomProvider,
  SeededRandomProvider,
  getRandomProvider,
  setRandomProvider,
  resetRandomProvider,
  createRandomProvider,
} from './random-provider.js';

// Token Estimation (Issue #574 - Router consolidation)
export type {
  TokenEstimatorProvider,
  TokenEstimate,
  TokenEstimateOptions,
  ITokenEstimator,
} from './token-estimator.js';
export {
  TokenEstimator,
  getTokenEstimator,
  createTokenEstimator,
  resetTokenEstimator,
  estimateTokens,
  estimateTokensForProvider,
} from './token-estimator.js';

// Routing Interfaces (Issue #588 - Layer separation)
export type {
  ICompositeRouter,
  CompositeRoutingDecision,
  CompositeRoutingError,
  CompositeRouterStats,
  CompositeRouterConfig,
  CliName,
  CliTask,
  CliResponse,
  CliError,
  ICliAdapter,
  IZeroRouter,
  ILatencyTracker,
  IRoutingMemory,
} from './routing/index.js';
export { createCompositeRouter } from './routing/index.js';

// Types
export * from './types/index.js';
