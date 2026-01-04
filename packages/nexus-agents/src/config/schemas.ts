/**
 * nexus-agents/config - Configuration Schemas
 *
 * Zod schemas for all configuration types.
 */

import { z } from 'zod';

/**
 * Logging configuration schema.
 */
export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty']).default('json'),
  destination: z.enum(['stdout', 'stderr', 'file']).default('stdout'),
  filePath: z.string().optional(),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

/**
 * Provider configuration schema.
 */
export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().default(30000),
  maxRetries: z.number().nonnegative().default(3),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Model tier configuration.
 */
export const ModelTiersSchema = z.object({
  fast: z.array(z.string()).min(1),
  balanced: z.array(z.string()).min(1),
  powerful: z.array(z.string()).min(1),
});

export type ModelTiers = z.infer<typeof ModelTiersSchema>;

/**
 * Model configuration schema.
 */
export const ModelConfigSchema = z.object({
  default: z.string(),
  tiers: ModelTiersSchema,
  providers: z.record(ProviderConfigSchema).optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Expert configuration schema.
 */
export const ExpertDefinitionSchema = z.object({
  prompt: z.string().min(1),
  tier: z.enum(['fast', 'balanced', 'powerful']).default('balanced'),
  temperature: z.number().min(0).max(1).default(0.3),
  tools: z.array(z.string()).optional(),
});

export type ExpertDefinition = z.infer<typeof ExpertDefinitionSchema>;

/**
 * Expert configuration schema.
 */
export const ExpertConfigSchema = z.object({
  builtin: z.boolean().default(true),
  custom: z.record(ExpertDefinitionSchema).optional(),
});

export type ExpertConfig = z.infer<typeof ExpertConfigSchema>;

/**
 * Workflow configuration schema.
 */
export const WorkflowConfigSchema = z.object({
  templatesDir: z.string().default('./workflows'),
  timeout: z.number().positive().default(300000),
  maxParallel: z.number().positive().default(5),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

/**
 * Security configuration schema.
 */
export const SecurityConfigSchema = z.object({
  allowedPaths: z.array(z.string()).default(['./']),
  blockedPatterns: z.array(z.string()).default([]),
  rateLimit: z
    .object({
      enabled: z.boolean().default(true),
      requestsPerMinute: z.number().positive().default(60),
    })
    .default({}),
  secretsFile: z.string().optional(),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/**
 * Complete application configuration schema.
 */
export const AppConfigSchema = z.object({
  models: ModelConfigSchema,
  experts: ExpertConfigSchema.optional(),
  workflows: WorkflowConfigSchema.optional(),
  security: SecurityConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Default configuration values.
 */
export const defaultConfig: Partial<AppConfig> = {
  models: {
    default: 'claude-sonnet-4',
    tiers: {
      fast: ['claude-haiku-3', 'gpt-4o-mini'],
      balanced: ['claude-sonnet-4', 'gpt-4o'],
      powerful: ['claude-opus-4', 'o1-pro'],
    },
  },
  logging: {
    level: 'info',
    format: 'json',
    destination: 'stdout',
  },
};
