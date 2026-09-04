/**
 * nexus-agents/config - Configuration Schemas
 *
 * Aggregation module that re-exports all configuration schemas.
 * Individual schema categories are organized in separate files:
 * - schemas-core.ts: Logging, Provider, Model, Workflow
 * - schemas-expert.ts: Expert definitions and constants
 * - schemas-security.ts: Security, Policy, Sandbox, Timeout, RateLimit
 * - schemas-observability.ts: EventBus, Observability
 */

import { z } from 'zod';

// Re-export core schemas
export {
  LoggingConfigSchema,
  ProviderConfigSchema,
  ModelTiersSchema,
  ModelConfigSchema,
  WorkflowConfigSchema,
} from './schemas-core.js';

export type {
  LoggingConfig,
  ProviderConfig,
  ModelTiers,
  ModelConfig,
  WorkflowConfig,
} from './schemas-core.js';

// Re-export expert schemas
export {
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
  CustomExpertDefinitionSchema,
  ExpertDefinitionSchema,
  ExpertConfigSchema,
} from './schemas-expert.js';

export type {
  ExpertTier,
  ExpertDomain,
  CustomExpertDefinition,
  ExpertDefinition,
  ExpertConfig,
} from './schemas-expert.js';

// Re-export security schemas
export {
  PolicyConfigSchema,
  SandboxConfigSchema,
  TimeoutConfigSchema,
  ToolRateLimitSchema,
  DEFAULT_TOOL_RATE_LIMITS,
  SecurityConfigSchema,
} from './schemas-security.js';

export type {
  PolicyConfig,
  SandboxConfig,
  TimeoutConfig,
  ToolRateLimit,
  ToolCategory,
  SecurityConfig,
} from './schemas-security.js';

// Re-export observability schemas
export { EventBusConfigSchema, ObservabilityConfigSchema } from './schemas-observability.js';

export type { EventBusConfig, ObservabilityConfig } from './schemas-observability.js';

// Re-export skills schemas (Issue #491)
export {
  SkillLibraryConfigSchema,
  ExternalPackSourceSchema,
  DEFAULT_SKILL_LIBRARY_CONFIG as DEFAULT_SKILLS_CONFIG,
} from './schemas-skills.js';

export type { SkillLibraryConfig, ExternalPackSource } from './schemas-skills.js';

// Re-export SICA schemas (Issue #492)
export { SicaConfigSchema, DEFAULT_SICA_CONFIG } from './schemas-sica.js';

export type { SicaConfig } from './schemas-sica.js';

// Re-export gateway schemas (Issue #897)
export { GatewayConfigSchema } from './schemas-gateway.js';

export type { GatewayConfigType } from './schemas-gateway.js';

// Re-export routing schemas (Issue #475)
export {
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
} from './schemas-routing.js';

export type {
  BudgetConstraints,
  TopsisCriterion,
  TopsisConfig,
  DifficultyWeightsConfig,
  DifficultyThresholds,
  ZeroRouterConfig,
  LatencyTrackerConfig,
  RoutingMemoryConfig,
  RoutingConfig,
} from './schemas-routing.js';

// Import for local use in AppConfigSchema
import { ModelConfigSchema, WorkflowConfigSchema, LoggingConfigSchema } from './schemas-core.js';
import { ExpertConfigSchema } from './schemas-expert.js';
import { SecurityConfigSchema } from './schemas-security.js';
import { ObservabilityConfigSchema } from './schemas-observability.js';
import { RoutingConfigSchema } from './schemas-routing.js';
import { SkillLibraryConfigSchema } from './schemas-skills.js';
import { SicaConfigSchema } from './schemas-sica.js';
import { GatewayConfigSchema } from './schemas-gateway.js';
import { MemoryConfigSchema } from './schemas-memory.js';

// Memory schemas (Issue #5097)
export { MemoryDecayConfigSchema, MemoryConfigSchema } from './schemas-memory.js';
export type { MemoryDecayConfigInput, MemoryConfig } from './schemas-memory.js';

/**
 * Complete application configuration schema.
 */
export const AppConfigSchema = z.object({
  models: ModelConfigSchema,
  experts: ExpertConfigSchema.optional(),
  workflows: WorkflowConfigSchema.optional(),
  security: SecurityConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  /** Observability configuration (Issue #307) */
  observability: ObservabilityConfigSchema.optional(),
  /** Routing configuration (Issue #475) - used in orchestrator mode */
  routing: RoutingConfigSchema.optional(),
  /** Skill library configuration (Issue #491) */
  skills: SkillLibraryConfigSchema.optional(),
  /** SICA self-improvement configuration (Issue #492) */
  sica: SicaConfigSchema.optional(),
  /** Gateway middleware configuration (Issue #897) */
  gateway: GatewayConfigSchema.optional(),
  /** Memory configuration — today only `decay` reaches runtime (Issue #5097) */
  memory: MemoryConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Default configuration values.
 */
export const defaultConfig: Partial<AppConfig> = {
  models: {
    default: 'claude-sonnet',
    tiers: {
      fast: ['claude-haiku', 'gemini-flash'],
      balanced: ['claude-sonnet', 'gemini-pro'],
      powerful: ['claude-opus', 'codex-5.3'],
    },
  },
  logging: {
    level: 'info',
    format: 'json',
    // stderr is the safe default: MCP stdio transport reserves stdout for
    // JSON-RPC frames. Any log written to stdout corrupts the transport.
    destination: 'stderr',
  },
  security: {
    allowedPaths: ['./'],
    blockedPatterns: [],
    rateLimit: {
      enabled: true,
      requestsPerMinute: 60,
    },
    policy: {
      defaultMode: 'read-only',
      policyMode: 'enforce',
    },
    timeout: {
      defaultTimeoutMs: 30000,
      maxTimeoutMs: 300000,
      enableLogging: true,
      uriValidation: true,
    },
  },
};
