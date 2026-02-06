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

// Subprocess adapter (extracted from base-adapter per Issue #272)
export { SubprocessCliAdapter, type CommandConfig } from './subprocess-adapter.js';

// Concrete adapters
export { ClaudeCliAdapter } from './adapters/claude-adapter.js';
export { GeminiCliAdapter } from './adapters/gemini-adapter.js';
export { CodexCliAdapter } from './adapters/codex-adapter.js';
export { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';

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
  integrateCapacityMonitorWithCircuitBreaker,
} from './circuit-breaker.js';
export type {
  CircuitState,
  FailureCategory,
  CircuitBreakerConfig,
  CircuitBreakerSnapshot,
  CircuitStateChangeEvent,
  CircuitStateChangeListener,
  ICircuitBreaker,
  CapacityMonitorIntegrationConfig,
} from './circuit-breaker.js';

// Task Analyzer (Issue #78)
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Backward compatibility, see Issue #574
export { analyzeTask, summarizeProfile, TaskProfileSchema } from './task-analyzer.js';
export type { TaskProfile, TaskType } from './task-analyzer.js';

// Task Router (Issue #78)
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Backward compatibility, deprecated in v3.0
export { TaskRouter, createTaskRouter, RoutingError, RouterConfigSchema } from './router.js';
export type { ITaskRouter, RoutingDecision, RouterConfig } from './router.js';

// Router Scoring Constants (Issue #78)
export { CAPABILITY_MATRIX, SCORING_WEIGHTS, SCORING_THRESHOLDS } from './router-scoring.js';

// Confidence Router (Issue #99)
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Backward compatibility, deprecated in v3.0
export { ConfidenceRouter, createConfidenceRouter } from './confidence-router.js';
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
export { CliToModelAdapter, createCliToModelAdapter } from './cli-to-model-adapter.js';

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

// DAAO - Difficulty-Aware Agent Orchestration (Issue #334, arXiv:2509.11079)
export {
  DAAOEstimator,
  createDAAOEstimator,
  estimateDAAODifficulty,
  routeByDAAODifficulty,
  encodeTaskFeatures,
} from './daao-estimator.js';
export type { IDAAOEstimator } from './daao-estimator.js';
export type {
  DAAOConfig,
  DAAODifficultyEstimate,
  DAAORoutingDecision,
  DAAOOutcome,
  DAAOCalibrationStats,
  EncodedFeatures,
  FeatureDimension,
  FeatureWeights,
  DAAOThresholds,
} from './daao-types.js';
export {
  DAAOConfigSchema,
  DAAOError,
  FEATURE_DIMENSIONS,
  DEFAULT_FEATURE_WEIGHTS,
  DEFAULT_DAAO_THRESHOLDS,
  DEFAULT_DAAO_CONFIG,
  DEFAULT_DAAO_TIER_TO_CLIS,
  EncodedFeaturesSchema,
  FeatureWeightsSchema,
} from './daao-types.js';

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
  filterAvailableClis,
  getNextCli,
  isChainExhausted,
  FallbackChainManager,
  createFallbackChainManager,
  createFallbackChainRegistry,
  DEFAULT_FALLBACK_CHAINS,
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

// Cascade Router Base (Issue #574)
export { CascadeRouterBase, DEFAULT_CASCADE_BASE_CONFIG } from './cascade-router-base.js';
export type {
  CascadeRouterBaseConfig,
  ModelExecutionResult,
  CascadeStageResult,
  CascadeExecutionResult,
  ICascadeRouter,
} from './cascade-router-base.js';
