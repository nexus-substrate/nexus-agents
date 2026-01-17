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
  WorkflowConfigSchema,
  SecurityConfigSchema,
  SandboxConfigSchema,
  LoggingConfigSchema,
  ToolRateLimitSchema,
  EventBusConfigSchema,
  ObservabilityConfigSchema,
  DEFAULT_TOOL_RATE_LIMITS,
  defaultConfig,
} from './schemas.js';

export type {
  AppConfig,
  ModelConfig,
  ModelTiers,
  ProviderConfig,
  ExpertConfig,
  ExpertDefinition,
  WorkflowConfig,
  SecurityConfig,
  SandboxConfig,
  LoggingConfig,
  ToolRateLimit,
  ToolCategory,
  EventBusConfig,
  ObservabilityConfig,
} from './schemas.js';
