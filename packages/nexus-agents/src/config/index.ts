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
  DEFAULT_TOOL_RATE_LIMITS,
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
  defaultConfig,
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
} from './schemas.js';

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
