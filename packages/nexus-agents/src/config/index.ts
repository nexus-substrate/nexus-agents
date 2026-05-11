/**
 * nexus-agents/config
 * Configuration loading and validation for Nexus Agents
 */

// Schemas
export {
  AppConfigSchema,
  ModelConfigSchema,
  ModelTiersSchema,
  ProviderConfigSchema,
  ExpertConfigSchema,
  ExpertDefinitionSchema,
  CustomExpertDefinitionSchema,
  WorkflowConfigSchema,
  SecurityConfigSchema,
  SandboxConfigSchema,
  PolicyConfigSchema,
  TimeoutConfigSchema,
  LoggingConfigSchema,
  ToolRateLimitSchema,
  EventBusConfigSchema,
  ObservabilityConfigSchema,
  // Routing schemas (Issue #475)
  BudgetConstraintsSchema,
  TopsisCriterionSchema,
  TopsisConfigSchema,
  DifficultyWeightsConfigSchema,
  DifficultyThresholdsSchema,
  ZeroRouterConfigSchema,
  LatencyTrackerConfigSchema,
  RoutingMemoryConfigSchema,
  RoutingConfigSchema,
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_TOOL_RATE_LIMITS,
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
  defaultConfig,
  // Skills schemas (Issue #491, #654)
  SkillLibraryConfigSchema,
  ExternalPackSourceSchema,
  DEFAULT_SKILLS_CONFIG,
  // SICA schemas (Issue #492)
  SicaConfigSchema,
  DEFAULT_SICA_CONFIG,
} from './schemas.js';

export type {
  AppConfig,
  ModelConfig,
  ModelTiers,
  ProviderConfig,
  ExpertConfig,
  ExpertDefinition,
  CustomExpertDefinition,
  ExpertTier,
  ExpertDomain,
  WorkflowConfig,
  SecurityConfig,
  SandboxConfig,
  PolicyConfig,
  TimeoutConfig,
  LoggingConfig,
  ToolRateLimit,
  ToolCategory,
  EventBusConfig,
  ObservabilityConfig,
  // Routing types (Issue #475)
  BudgetConstraints,
  TopsisCriterion,
  TopsisConfig,
  DifficultyWeightsConfig,
  DifficultyThresholds,
  ZeroRouterConfig,
  LatencyTrackerConfig,
  RoutingMemoryConfig,
  RoutingConfig,
  // Skills types (Issue #491, #654)
  SkillLibraryConfig,
  ExternalPackSource,
  // SICA types (Issue #492)
  SicaConfig,
} from './schemas.js';

// Routing config adapter (Issue #475)
export { adaptRoutingConfig, getTopsisConfigFromYaml } from './routing-config-adapter.js';

// Centralized defaults
export {
  // Main defaults object
  DEFAULTS,
  TIMEOUT_PROFILES,
  // Environment override functions
  getTimeout,
  getRetryConfig,
  getRateLimitConfig,
  getWorkerConfig,
  getCircuitBreakerConfig,
  // Convenience accessors
  getTimeoutProfile,
  getTimeoutForCli,
  getToolRateLimit,
  // Type guards
  isTaskComplexity,
  isKnownCliName,
  // Environment helpers (internal use)
  parseIntEnv,
  parseFloatEnv,
  parseBoolEnv,
  // Documentation
  getEnvVarDocumentation,
  // Canonical timeout modules (Issue #984)
  CLI_TIMEOUTS,
  VOTE_TIMEOUTS,
  MCP_TIMEOUTS,
  WORKFLOW_TIMEOUTS,
  GRAPH_TIMEOUTS,
  PER_CLI_TASK_TIMEOUTS,
  API_TIMEOUTS,
  INTERNAL_TIMEOUTS,
  TEST_TIMEOUTS,
  TIMEOUT_ENV_VARS,
  getCliTimeoutProfile,
  getCliTimeout,
  resolveVoteTimeout,
  resolveEnvTimeout,
  validateTimeout as validateTimeoutCentral,
} from './defaults.js';

// ConfigManager (Issue #360)
export { ConfigManager, getConfigManager } from './config-manager.js';

// Config Loader (Issue #472 - Wire AppConfigSchema to runtime)
export {
  loadConfig,
  getConfig,
  clearConfigCache,
  reloadConfig,
  ConfigLoadError,
} from './config-loader.js';
export type { ConfigLoadResult, ConfigLoadOptions, ConfigLoadErrorCode } from './config-loader.js';

export type {
  ConfigSource,
  ConfigValueMeta,
  ConfigOverride,
  ConfigCategory,
} from './config-manager.js';

export type {
  // Config structure types
  DefaultsConfig,
  TimeoutDefaults,
  TimeoutDefaultsConst,
  RateLimitDefaults,
  RateLimitDefaultsConst,
  RetryDefaults,
  RetryDefaultsConst,
  BufferDefaults,
  WorkerDefaults,
  WorkerDefaultsConst,
  CircuitBreakerDefaults,
  CircuitBreakerDefaultsConst,
  ContextDefaults,
  ProviderDefaults,
  SecurityDefaults,
  // Helper types
  TimeoutProfile,
  TaskComplexity,
  ToolRateLimitConfig,
  KnownCliName,
} from './defaults.js';

// Environment variable validation (Issue #1016)
export { validateNexusEnv, getKnownNexusVarNames } from './env-schema.js';
export type { EnvValidationResult, UnknownVar, InvalidVar } from './env-schema.js';

// Model Capabilities Matrix (Issue #683, Epic #682)
export {
  DEFAULT_MODEL_CAPABILITIES,
  DEFAULT_MODEL_PER_CLI,
  getModelCapabilities,
  findModelsByOutputModality,
  findModelsByInputModality,
  findModelsByToolCapability,
  findModelsByFeature,
  findModelsByProvider,
  findBestModelForOutput,
  modelSupportsAll,
  ModelCapabilitiesMatrixSchema,
  ModelCapabilitySchema,
  OUTPUT_MODALITIES,
  INPUT_MODALITIES,
  TOOL_CAPABILITIES,
  SPECIAL_FEATURES,
  PROVIDERS,
  MODEL_IDS,
  CLI_NAMES,
  CliNameSchema,
  DEFAULT_CLI,
  DEFAULT_ROUTING_CONFIDENCE,
  QualityScoresSchema,
  PricingSchema,
} from './model-capabilities.js';

export type {
  ModelCapabilitiesMatrix,
  ModelCapability,
  ModelId,
  OutputModality,
  InputModality,
  ToolCapability,
  SpecialFeature,
  Provider,
  CliNameLiteral,
  QualityScores,
  Pricing,
} from './model-capabilities.js';

// Model Config Helpers — derived functions from model registry (Issue #807)
export {
  getModelPricing,
  getModelDisplayName,
  getModelContextWindow,
  getModelMaxOutput,
  getModelQualityScores,
  getDefaultModelForCli,
  getCliModelName,
  resolveCliAlias,
  buildCapabilityProfiles,
  buildCliCapabilityProfiles,
  buildTopsisProfiles,
  buildMockModelInfo,
} from './model-config-helpers.js';

// Task Specialization Matrix — model-to-task mapping (Issue #858)
export {
  TASK_SPECIALIZATION_MATRIX,
  TASK_CATEGORIES,
  TaskCategorySchema,
  TaskSpecializationSchema,
  getSpecialization,
  detectTaskCategory,
  getTaskCategories,
} from './task-specialization.js';

export type {
  TaskSpecialization,
  TaskCategory,
  SpecializationMatch,
} from './task-specialization.js';

// Model Availability — runtime probes & fallback chains (Issue #869)
export {
  AvailabilityCache,
  getAvailabilityCache,
  resetAvailabilityCache,
  resolveFallback,
  getFallbackChain,
  getCliForModelId,
  filterAvailableModels,
} from './model-availability.js';

export type {
  ProbeResult,
  AvailabilityCacheConfig,
  ProbeFn,
  FallbackEntry,
} from './model-availability.js';

// Unified Model Registry (#2540) — single source of truth for per-model
// metadata (capability + behaviour). Replaces the prior split between
// `model-capabilities.ts` (still in-tree; migration in #2546) and the
// deleted `model-behavior-profile.ts`.
export {
  ModelRegistry,
  deriveEntry,
  getDefaultRegistry,
  setDefaultRegistry,
  DEFAULT_ENTRY,
} from './model-registry.js';
export type {
  ModelEntry,
  ModelRegistryOptions,
  EntrySource,
  ToolDefinitionFormat,
  PromptCachingMode,
} from './model-registry.js';

// (#2540 PR 6) Harness-driven cache of currently-available models.
// `ModelRegistry` answers "how should this model behave"; this cache
// answers "is this model routable right now". CompositeRouter (PR 7)
// gates on this cache before scoring.
export { AvailableModelsCache } from './available-models-cache.js';
export type {
  AvailableModelsSource,
  AvailableModel,
  AvailableModelsCacheOptions,
} from './available-models-cache.js';
