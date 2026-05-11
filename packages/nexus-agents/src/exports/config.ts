/**
 * Config exports - Configuration schemas
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  AppConfigSchema,
  ModelConfigSchema,
  ModelTiersSchema,
  ProviderConfigSchema,
  ExpertConfigSchema as ConfigExpertConfigSchema,
  ExpertDefinitionSchema as ConfigExpertDefinitionSchema,
  WorkflowConfigSchema,
  SecurityConfigSchema,
  LoggingConfigSchema,
  defaultConfig,
  type AppConfig,
  type ModelConfig,
  type ModelTiers,
  type ProviderConfig,
  type ExpertConfig as ConfigExpertConfig,
  type ExpertDefinition as ConfigExpertDefinition,
  type WorkflowConfig,
  type SecurityConfig,
  type LoggingConfig,
} from '../config/index.js';

// Environment variable validation (Issue #1016)
export {
  validateNexusEnv,
  getKnownNexusVarNames,
  type EnvValidationResult,
  type UnknownVar,
  type InvalidVar,
} from '../config/index.js';

// Model Availability — probes & fallback chains (Issue #869)
export {
  AvailabilityCache,
  getAvailabilityCache,
  resetAvailabilityCache,
  resolveFallback,
  getFallbackChain,
  getCliForModelId,
  filterAvailableModels,
  type ProbeResult,
  type AvailabilityCacheConfig,
  type ProbeFn,
  type FallbackEntry,
} from '../config/index.js';

// (#2540) Unified ModelRegistry + harness-driven AvailableModelsCache.
// Registry answers "how should this model behave"; cache answers
// "is this model routable right now". Both are public surface.
export {
  ModelRegistry,
  deriveEntry,
  getDefaultRegistry,
  setDefaultRegistry,
  DEFAULT_ENTRY,
  AvailableModelsCache,
  getDefaultAvailableModelsCache,
  setDefaultAvailableModelsCache,
  type ModelEntry,
  type ModelRegistryOptions,
  type EntrySource,
  type ToolDefinitionFormat,
  type PromptCachingMode,
  type AvailableModelsSource,
  type AvailableModel,
  type AvailableModelsCacheOptions,
} from '../config/index.js';
