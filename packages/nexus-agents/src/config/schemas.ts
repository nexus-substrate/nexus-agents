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
 * Valid model tiers for custom experts.
 */
export const VALID_EXPERT_TIERS = ['fast', 'balanced', 'powerful'] as const;
export type ExpertTier = (typeof VALID_EXPERT_TIERS)[number];

/**
 * Valid task domains for custom experts.
 */
export const VALID_EXPERT_DOMAINS = [
  'code',
  'security',
  'architecture',
  'documentation',
  'testing',
  'general',
] as const;
export type ExpertDomain = (typeof VALID_EXPERT_DOMAINS)[number];

/**
 * Maximum system prompt length (4000 characters).
 * This matches typical LLM system prompt limits while allowing detailed instructions.
 */
export const MAX_SYSTEM_PROMPT_LENGTH = 4000;

/**
 * Custom expert definition schema from YAML config.
 *
 * Defines a user-configurable expert with:
 * - systemPrompt: The expert's persona and instructions (max 4000 chars)
 * - tier: Model tier for routing (fast, balanced, powerful)
 * - domain: Primary domain of expertise
 * - capabilities: What this expert can do
 * - temperature: Model temperature (0-1)
 * - tools: Optional tool restrictions
 *
 * (Source: Issue #300)
 */
export const CustomExpertDefinitionSchema = z.object({
  /** System prompt defining the expert's persona (max 4000 characters) */
  systemPrompt: z
    .string()
    .min(1, 'System prompt is required')
    .max(
      MAX_SYSTEM_PROMPT_LENGTH,
      `System prompt must be at most ${String(MAX_SYSTEM_PROMPT_LENGTH)} characters`
    ),

  /** Model tier for routing */
  tier: z
    .enum(VALID_EXPERT_TIERS, {
      errorMap: (_issue, _ctx) => ({
        message: `Invalid tier. Valid options: ${VALID_EXPERT_TIERS.join(', ')}`,
      }),
    })
    .default('balanced'),

  /** Primary domain of expertise */
  domain: z
    .enum(VALID_EXPERT_DOMAINS, {
      errorMap: (_issue, _ctx) => ({
        message: `Invalid domain. Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`,
      }),
    })
    .default('general'),

  /** Secondary domains (optional) */
  secondaryDomains: z.array(z.enum(VALID_EXPERT_DOMAINS)).optional(),

  /** Expert capabilities */
  capabilities: z
    .array(z.string().min(1))
    .min(1, 'At least one capability is required')
    .default(['task_execution']),

  /** Model temperature (0-1) */
  temperature: z.number().min(0).max(1).default(0.3),

  /** Allowed tools (optional, unrestricted if not specified) */
  tools: z.array(z.string()).optional(),

  /** Human-readable description */
  description: z.string().optional(),

  /** Weight for expert selection scoring (0-1) */
  weight: z.number().min(0).max(1).default(1.0),

  /** Whether this expert is currently available */
  available: z.boolean().default(true),
});

export type CustomExpertDefinition = z.infer<typeof CustomExpertDefinitionSchema>;

/**
 * Legacy expert definition schema (for backwards compatibility).
 * Use CustomExpertDefinitionSchema for new implementations.
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
  /** Enable built-in experts */
  builtin: z.boolean().default(true),

  /** Custom expert definitions keyed by expert ID */
  custom: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]*$/, {
        message:
          'Expert ID must start with a letter and contain only lowercase letters, numbers, and underscores',
      }),
      CustomExpertDefinitionSchema
    )
    .optional(),
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
 * EventBus observability configuration schema.
 *
 * Controls EventBus integration with MCP server for agent-to-agent
 * communication visibility in Claude Desktop context.
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
export const EventBusConfigSchema = z.object({
  /** Enable EventBus integration (default: true) */
  enabled: z.boolean().default(true),
  /** Maximum events to retain in history (default: 1000) */
  maxHistorySize: z.number().positive().default(1000),
  /** Event patterns to subscribe to (default: all major patterns) */
  subscriptions: z
    .object({
      /** Subscribe to consensus events (consensus.*) */
      consensus: z.boolean().default(true),
      /** Subscribe to agent events (agent.*) */
      agent: z.boolean().default(true),
      /** Subscribe to protocol events (protocol.*) */
      protocol: z.boolean().default(true),
      /** Subscribe to session events (session.*) */
      session: z.boolean().default(true),
      /** Subscribe to message events (message.*) */
      message: z.boolean().default(false), // Off by default (high volume)
      /** Subscribe to byzantine detection events (byzantine.*) */
      byzantine: z.boolean().default(true),
    })
    .default({}),
  /** Logging configuration for events */
  logging: z
    .object({
      /** Log level for frequent events (default: debug) */
      frequentEventLevel: z.enum(['debug', 'info']).default('debug'),
      /** Log level for important events (default: info) */
      importantEventLevel: z.enum(['debug', 'info']).default('info'),
    })
    .default({}),
});

export type EventBusConfig = z.infer<typeof EventBusConfigSchema>;

/**
 * Observability configuration schema.
 *
 * Controls swarm-level observability features including EventBus integration.
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
export const ObservabilityConfigSchema = z.object({
  /** EventBus configuration */
  eventBus: EventBusConfigSchema.optional(),
  /** SwarmObserver maximum events (default: 10000) */
  swarmObserverMaxEvents: z.number().positive().default(10000),
});

export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;

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
  /** Observability configuration (Issue #307) */
  observability: ObservabilityConfigSchema.optional(),
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
