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
  LoggingConfig,
  ToolRateLimit,
  ToolCategory,
  EventBusConfig,
  ObservabilityConfig,
} from './schemas.js';
