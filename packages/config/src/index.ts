/**
 * @nexus-agents/config
 * Configuration loading and validation for Nexus Agents
 */

export const VERSION = '0.0.1';

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
  LoggingConfigSchema,
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
  LoggingConfig,
} from './schemas.js';
