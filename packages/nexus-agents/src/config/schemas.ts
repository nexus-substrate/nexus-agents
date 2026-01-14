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
 * Policy configuration schema.
 *
 * Controls authorization behavior for tool operations.
 * - defaultMode: Whether operations default to read-only or read-write
 * - policyMode: Whether to enforce denials or just warn (for migration)
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */
export const PolicyConfigSchema = z.object({
  /** Default execution mode for tool operations (default: 'read-only') */
  defaultMode: z.enum(['read-only', 'read-write']).default('read-only'),
  /** Policy enforcement mode (default: 'enforce') */
  policyMode: z.enum(['enforce', 'warn']).default('enforce'),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

/**
 * Sandbox configuration schema.
 *
 * Controls agent execution isolation.
 * - mode: 'none' (no isolation), 'policy' (allowlist enforcement), 'container' (Docker)
 * - fallbackToPolicy: Whether to fall back to policy mode if container unavailable
 *
 * (Source: Issue #175, ALIGNMENT_ROADMAP Phase 4)
 */
export const SandboxConfigSchema = z.object({
  /** Sandbox execution mode (default: 'policy') */
  mode: z.enum(['none', 'policy', 'container']).default('policy'),
  /** Fall back to policy mode if container mode unavailable (default: true) */
  fallbackToPolicy: z.boolean().default(true),
  /** Docker image to use in container mode (default: 'node:22-alpine') */
  dockerImage: z.string().optional(),
  /** Enable network access in container mode (default: false) */
  networkEnabled: z.boolean().default(false),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

/**
 * Timeout configuration schema.
 *
 * Controls timeout behavior for MCP operations to mitigate CVE-2026-0621.
 * - defaultTimeoutMs: Default timeout for operations
 * - maxTimeoutMs: Maximum allowed timeout
 * - enableLogging: Whether to log timeout events
 * - uriValidation: Whether to validate URIs against ReDoS patterns
 *
 * (Source: Issue #271, CVE-2026-0621 mitigation)
 */
export const TimeoutConfigSchema = z.object({
  /** Default timeout in milliseconds (default: 30000) */
  defaultTimeoutMs: z.number().positive().default(30000),
  /** Maximum timeout in milliseconds (default: 300000) */
  maxTimeoutMs: z.number().positive().default(300000),
  /** Whether to log timeout events (default: true) */
  enableLogging: z.boolean().default(true),
  /** Enable URI validation to prevent ReDoS (default: true) */
  uriValidation: z.boolean().default(true),
});

export type TimeoutConfig = z.infer<typeof TimeoutConfigSchema>;

/**
 * Per-tool rate limit configuration.
 * Allows different limits for each tool category.
 *
 * (Source: Issue #274 Phase 2 - per-tool rate limits)
 */
export const ToolRateLimitSchema = z.object({
  /** Maximum tokens (burst capacity) */
  capacity: z.number().positive().default(10),
  /** Tokens refilled per interval */
  refillRate: z.number().positive().default(10),
  /** Refill interval in milliseconds (default: 60000 = 1 minute) */
  refillIntervalMs: z.number().positive().default(60000),
});

export type ToolRateLimit = z.infer<typeof ToolRateLimitSchema>;

/**
 * Default per-tool rate limits per Issue #274.
 */
export const DEFAULT_TOOL_RATE_LIMITS = {
  orchestrate: { capacity: 10, refillRate: 10, refillIntervalMs: 60000 },
  delegate: { capacity: 20, refillRate: 20, refillIntervalMs: 60000 },
  workflow: { capacity: 5, refillRate: 5, refillIntervalMs: 60000 },
  expert: { capacity: 30, refillRate: 30, refillIntervalMs: 60000 },
} as const satisfies Record<string, ToolRateLimit>;

/**
 * Tool categories for rate limiting.
 */
export type ToolCategory = keyof typeof DEFAULT_TOOL_RATE_LIMITS;

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
      /** Per-tool rate limits (Issue #274 Phase 2) */
      perTool: z.record(ToolRateLimitSchema).optional(),
    })
    .default({}),
  secretsFile: z.string().optional(),
  /** Policy firewall configuration */
  policy: PolicyConfigSchema.optional(),
  /** Sandbox execution configuration (Issue #175) */
  sandbox: SandboxConfigSchema.optional(),
  /** Timeout configuration (Issue #271, CVE-2026-0621) */
  timeout: TimeoutConfigSchema.optional(),
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
