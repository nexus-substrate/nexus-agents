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
