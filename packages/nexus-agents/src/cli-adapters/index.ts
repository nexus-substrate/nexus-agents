/**
 * nexus-agents/cli-adapters - CLI Adapter Module
 *
 * Evergreen CLI integration with defensive parsing and
 * transport-agnostic execution.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

// Types
export type {
  CliName,
  CliTransport,
  TokenUsage,
  CliResponse,
  CliError,
  CliErrorCode,
  VersionStatus,
  HealthStatus,
  CapacityStatus,
  ModelInfo,
  CapabilityProfile,
  CliTask,
  ExecutionOptions,
  ICliAdapter,
  ICliResponseParser,
  VersionRequirements,
} from './types.js';

export { CLI_VERSION_REQUIREMENTS, DEFAULT_CAPABILITIES } from './types.js';

// Base adapter
export { BaseCliAdapter, SubprocessCliAdapter } from './base-adapter.js';

// Concrete adapters
export { ClaudeCliAdapter } from './adapters/claude-adapter.js';
export { GeminiCliAdapter } from './adapters/gemini-adapter.js';
export { CodexCliAdapter } from './adapters/codex-adapter.js';

// Parsers
export { ClaudeResponseParser } from './parsers/claude-parser.js';
export type { ClaudeCliResponse } from './parsers/claude-parser.js';
export { GeminiResponseParser } from './parsers/gemini-parser.js';
export type { GeminiCliResponse } from './parsers/gemini-parser.js';
export { CodexResponseParser } from './parsers/codex-parser.js';
export type { CodexCliResponse } from './parsers/codex-parser.js';

// Factory
export {
  createCliAdapter,
  createAllAdapters,
  isCliAvailable,
  getAvailableClis,
} from './factory.js';
export type { CliAdapterConfig } from './factory.js';

// Circuit Breaker
export {
  CliCircuitBreaker,
  CircuitBreakerRegistry,
  CircuitError,
  CircuitErrorCode,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  mapCliErrorToCategory,
  createCircuitBreakerRegistryWithMetrics,
} from './circuit-breaker.js';
export type {
  CircuitState,
  FailureCategory,
  CircuitBreakerConfig,
  CircuitBreakerSnapshot,
  CircuitStateChangeEvent,
  CircuitStateChangeListener,
  ICircuitBreaker,
} from './circuit-breaker.js';

// Task Analyzer (Issue #78)
export { analyzeTask, summarizeProfile, TaskProfileSchema } from './task-analyzer.js';
export type { TaskProfile, TaskType } from './task-analyzer.js';

// Task Router (Issue #78)
export { TaskRouter, createTaskRouter, RoutingError, RouterConfigSchema } from './router.js';
export type { ITaskRouter, RoutingDecision, RouterConfig } from './router.js';

// Router Scoring Constants (Issue #78)
export { CAPABILITY_MATRIX, SCORING_WEIGHTS, SCORING_THRESHOLDS } from './router-scoring.js';
