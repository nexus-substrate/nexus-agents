/**
 * nexus-agents/config - Core Configuration Schemas
 *
 * Basic infrastructure schemas: Logging, Provider, Model configuration.
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
  baseUrl: z.url().optional(),
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
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Workflow configuration schema.
 */
export const WorkflowConfigSchema = z.object({
  templatesDir: z.string().default('./workflows'),
  timeout: z.number().positive().default(300000),
  maxParallel: z.number().positive().default(5),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
