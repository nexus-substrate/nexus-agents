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
  BaseAdapterOptions,
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
export { BaseCliAdapter } from './base-adapter.js';

// Capacity Tracker (Issue #456 - Real API rate limit tracking)
export {
  CapacityTracker,
  createCapacityTracker,
  getDefaultConfig,
  DEFAULT_TOKEN_LIMITS,
  DEFAULT_REQUEST_LIMITS,
  RATE_LIMIT_WINDOW_MS,
} from './capacity-tracker.js';
export type { CapacityTrackerConfig } from './capacity-tracker.js';

// CLI Retry Loop (Issue #1596 — unified retry for all CLI adapters)
export {
  executeCliRetryLoop,
  calculateBackoffDelay,
  isRetryableError,
  categorizeError,
} from './cli-retry-loop.js';
export type { CliRetryLoopConfig, CliRetryResult } from './cli-retry-loop.js';

// Subprocess adapter (extracted from base-adapter per Issue #272)
export {
  SubprocessCliAdapter,
  isTransientError,
  type CommandConfig,
  type TransientRetryConfig,
} from './subprocess-adapter.js';

// Concrete adapters
export { ClaudeCliAdapter } from './adapters/claude-adapter.js';
export { GeminiCliAdapter } from './adapters/gemini-adapter.js';
export { CodexCliAdapter } from './adapters/codex-adapter.js';
export { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';
export { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';

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
// `createCircuitBreakerRegistryWithMetrics` and
// `integrateCapacityMonitorWithCircuitBreaker` (+ the
// `CapacityMonitorIntegrationConfig` type) were removed in #3018 — both
// were exported but had zero non-test callers. The simpler
// `CircuitBreakerRegistry` below is what production adapters actually use.
export {
  CliCircuitBreaker,
  CircuitBreakerRegistry,
  CircuitError,
  CircuitErrorCode,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  mapCliErrorToCategory,
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

// Task Router types (Issue #78, #816)
// TaskRouter class removed in v3.0 — use CompositeRouter (canonical path)
export { RoutingError, RouterConfigSchema } from './router-types.js';
export type { ITaskRouter, RoutingDecision, RouterConfig } from './router-types.js';

// Router Scoring Constants (Issue #78)
export { CAPABILITY_MATRIX, SCORING_WEIGHTS, SCORING_THRESHOLDS } from './router-scoring.js';

// Confidence Router types (Issue #99)
// ConfidenceRouter class removed — use CompositeRouter with ConfidenceCascadeStage
export type {
  IConfidenceRouter,
  ConfidenceEstimate,
  ConfidenceFactors,
  CascadeOptions,
  CascadeResult,
} from './types.js';

// Budget Router (Issue #102)
export { BudgetRouter, createBudgetRouter } from './budget-router.js';
export type {
  IBudgetRouter,
  BudgetConstraint,
  SessionBudget,
  BudgetExceededError,
  BudgetWarning,
  BudgetRoutingResult,
  BudgetRouterOptions,
} from './types.js';

// Agreement Cascade Router (Issue #121, arXiv:2410.10347)
export {
  AgreementCascadeRouter,
  createAgreementCascadeRouter,
  createDefaultCascadeStages,
  AgreementCascadeConfigSchema,
  DEFAULT_CASCADE_CONFIG,
} from './agreement-cascade-router.js';
export type {
  IAgreementCascadeRouter,
  AgreementCascadeConfig,
  CascadeStage,
  StageResult,
  CascadeResult as AgreementCascadeResult,
  AgreementResult,
  ResponseCluster,
} from './agreement-cascade-router.js';

// TOPSIS Multi-Criteria Router (Issue #146, arXiv:2509.07571)
export { TopsisRouter, createTopsisRouter, selectModelWithTopsis } from './topsis-router.js';
export type { SelectModelOptions } from './topsis-router.js';
export type {
  TopsisCredential,
  TopsisModelProfile,
  TopsisConfig,
  TopsisScore,
  TopsisResult,
} from './topsis-types.js';
export {
  DEFAULT_TOPSIS_CONFIG,
  DEFAULT_TOPSIS_CRITERIA,
  PLAN_BILLING_TOPSIS_CRITERIA,
  DEFAULT_MODEL_PROFILES,
} from './topsis-types.js';

// CLI-to-Model Adapter Bridge
export {
  CliToModelAdapter,
  createCliToModelAdapter,
  type CliToModelAdapterConfig,
} from './cli-to-model-adapter.js';

// CLI Detection Cache (Issue #165)
export {
  CliDetectionCache,
  createCliDetectionCache,
  DEFAULT_CACHE_CONFIG,
  CliDetectionCacheConfigSchema,
} from './cli-detection-cache.js';
export type {
  ICliDetectionCache,
  CliDetectionCacheConfig,
  CliHealthResult,
  CacheStats,
} from './cli-detection-cache.js';

// Composite Router (Issue #166)
export {
  CompositeRouter,
  createCompositeRouter,
  CompositeRouterConfigSchema,
  DEFAULT_COMPOSITE_CONFIG,
  CompositeRoutingError,
} from './composite-router.js';
export type {
  ICompositeRouter,
  CompositeRouterConfig,
  CompositeRoutingDecision,
  CompositeRouterStats,
} from './composite-router.js';

// Routing Memory types (moved from core/types - Issue #286)
export { RoutingMemoryError } from './routing-memory-types.js';
export type {
  IRoutingMemory,
  TaskProfileSummary,
  RoutingDecisionRecord,
  TaskOutcomeRecord,
  PreferenceSignal,
  PreferenceRecord,
  PreferenceFilter,
  ExperienceStep,
  ExperienceRecord,
  ActionRecord,
  RoutingMemoryExport,
  RoutingMemoryStats,
} from './routing-memory-types.js';

// PreferenceRouter - Preference-Trained Routing (Issue #148, arXiv:2406.18665)
export {
  PreferenceRouter,
  createPreferenceRouter,
  InMemoryPreferenceStore,
  QueryFeatureExtractor,
  DEFAULT_PREFERENCE_ROUTER_CONFIG,
} from './preference-router.js';
export type {
  PreferenceDataPoint,
  QueryFeatures,
  PreferencePrediction,
  PreferenceRoutingDecision,
  PreferenceRouterConfig,
  PreferenceModelStats,
  IPreferenceDataStore,
} from './preference-router.js';
export { PreferenceRouterConfigSchema } from './preference-router-types.js';

// ZeroRouter - Universal Difficulty Space Routing (Issue #338)
export {
  ZeroRouter,
  createZeroRouter,
  estimateTaskDifficulty,
  routeByTaskDifficulty,
  ZeroRouterConfigSchema,
  ZeroRoutingError,
  DEFAULT_DIFFICULTY_THRESHOLDS,
} from './zero-router.js';
export type {
  IZeroRouter,
  ZeroRouterConfig,
  DifficultyEstimate,
  DifficultyOutcome,
  CalibrationStats,
  ZeroRoutingDecision,
  DifficultyLevel,
  ModelTier,
} from './zero-router.js';

// Difficulty Space utilities (Issue #338)
export {
  estimateDifficultySpace,
  aggregateDifficulty,
  findDominantDimension,
  classifyDifficultyLevel,
  calculateEstimateConfidence,
  summarizeDifficultySpace,
  normalize,
} from './difficulty-space.js';
export type {
  DifficultySpace,
  DifficultyDimension,
  DifficultyWeights,
  DifficultyThresholds,
} from './zero-router-types.js';
export { DIFFICULTY_DIMENSIONS, DEFAULT_DIFFICULTY_WEIGHTS } from './zero-router-types.js';

// DAAO — Difficulty-Aware Agent Orchestration (arXiv:2509.11079, originally
// Issue #334) was retired in #2940. The composite-router pipeline uses
// ZeroRouter's `decision.difficulty` / `decision.tier` for the same role
// (#334 ended up being implemented via ZeroRouter, not DAAO). The DAAO
// surface (DAAOEstimator, createDAAOEstimator, estimateDAAODifficulty,
// routeByDAAODifficulty, encodeTaskFeatures, all types + schemas in
// daao-types.ts + daao-feature-extraction.ts) had only the unit tests
// and `routing-integration.test.ts` as consumers. If a true alternate
// difficulty estimator with different feature weights comes back as a
// real requirement, reintroduce alongside the wiring stage in the same
// PR (activation-or-delete YAGNI — pattern from #2937–#3018).

// CLI Circuit Breaker Integration (Issue #359)
export {
  CliCircuitBreakerIntegration,
  createCliCircuitBreakerIntegration,
} from './cli-circuit-breaker.js';
export type {
  ICliCircuitBreakerIntegration,
  CliCircuitBreakerConfig,
  CircuitProtectedResult,
  CliCircuitHealthStatus,
} from './cli-circuit-breaker.js';

// CLI Timeout Profiles (Issue #357)
export {
  getTimeoutForTask,
  getTimeoutForTaskAuto,
  estimateTaskComplexity,
  CLI_TIMEOUT_PROFILES,
  DEFAULT_TIMEOUT_PROFILE,
} from './cli-timeout-profiles.js';
export type { TimeoutProfile, TaskComplexity } from './cli-timeout-profiles.js';

// Task Classifier for Fallback Chains (Issue #362)
export {
  classifyTask,
  isCodeTask,
  isResearchTask,
  getAllTaskTypes,
  DEFAULT_CLASSIFICATION_PATTERNS,
  ClassificationPatternsSchema,
} from './task-classifier.js';
export type {
  FallbackTaskType,
  TaskClassification,
  ClassificationPatterns,
} from './task-classifier.js';

// Fallback Chain Registry (Issue #362)
export {
  getFallbackChain,
  getFallbackChainForCategory,
  filterAvailableClis,
  getNextCli,
  isChainExhausted,
  FallbackChainManager,
  createFallbackChainManager,
  createFallbackChainRegistry,
  DEFAULT_FALLBACK_CHAINS,
  CATEGORY_CHAIN_OVERRIDES,
  FallbackChainSchema,
  FallbackChainRegistrySchema,
} from './fallback-chains.js';
export type {
  FallbackChain,
  FallbackChainRegistry,
  FallbackChainMetrics,
  FallbackMetricsRegistry,
  FallbackOutcome,
} from './fallback-chains.js';

// Latency Tracker (Issue #361)
export {
  LatencyTracker,
  createLatencyTracker,
  LatencyTrackerConfigSchema,
  LatencyTrackerError,
  EMPTY_LATENCY_STATS,
  DEFAULT_LATENCY_TRACKER_CONFIG,
} from './latency-tracker.js';
export type {
  ILatencyTracker,
  LatencyTrackerConfig,
  LatencySample,
  LatencyStats,
  LatencyScore,
  LatencyTrackerStats,
} from './latency-tracker.js';

// Response Cache (Issue #358)
export {
  InMemoryResponseCache,
  createResponseCache,
  generateCacheKey,
  withCache,
  ResponseCacheConfigSchema,
  DEFAULT_RESPONSE_CACHE_CONFIG,
  ResponseCacheError,
} from './response-cache.js';
export type {
  CacheEntry,
  ResponseCacheConfig,
  ResponseCacheStats,
  IResponseCache,
  CacheKeyOptions,
  WithCacheOptions,
  ResponseCacheErrorCode,
} from './response-cache.js';

// Unified Routing Types (Issue #574)
export {
  UnifiedRoutingDecisionSchema,
  RoutingDecisionBuilder,
  createRoutingDecisionBuilder,
  createSimpleRoutingDecision,
} from './unified-routing-types.js';
export type { RoutingStrategy, UnifiedRoutingDecision } from './unified-routing-types.js';

// Typed Structured Output (Issue #1897) — removed in #3018. `generateObject`
// was the Zod-schema-driven retry-with-feedback helper, but had zero
// non-test callers in the tree. If structured output comes back as a
// production need, reintroduce alongside its consumer (same activation-
// or-delete YAGNI pattern as #2937 / #2938 / #2939 / #2940).

// Cascade Router Base (Issue #574)
export { CascadeRouterBase, DEFAULT_CASCADE_BASE_CONFIG } from './cascade-router-base.js';
export type {
  CascadeRouterBaseConfig,
  ModelExecutionResult,
  CascadeStageResult,
  CascadeExecutionResult,
  ICascadeRouter,
} from './cascade-router-base.js';
