/**
 * nexus-agents/core
 * Shared types, Result<T,E>, errors, and logger for Nexus Agents
 */

// Result pattern
export type { Result } from './result.js';
export { ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOr } from './result.js';

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
} from './errors.js';
export type { SerializedError, NexusErrorOptions } from './errors.js';

// Logger
export { createLogger, logger, sanitize } from './logger.js';
export type { LogLevel, LogContext, LogEntry, ILogger } from './logger.js';

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

// Types
export * from './types/index.js';
