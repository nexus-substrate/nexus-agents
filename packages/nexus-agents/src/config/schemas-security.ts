/**
 * nexus-agents/config - Security Configuration Schemas
 *
 * Schemas for security, policy, sandbox, timeout, and rate limiting.
 */

import { z } from 'zod';

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
  /** Per-tool timeout overrides in milliseconds (Issue #657) */
  perToolTimeout: z.record(z.string(), z.number().positive().max(600000)).optional(),
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
      perTool: z.record(z.string(), ToolRateLimitSchema).optional(),
    })
    .default(() => ({ enabled: true, requestsPerMinute: 60 })),
  secretsFile: z.string().optional(),
  /** Policy firewall configuration */
  policy: PolicyConfigSchema.optional(),
  /** Sandbox execution configuration (Issue #175) */
  sandbox: SandboxConfigSchema.optional(),
  /** Timeout configuration (Issue #271, CVE-2026-0621) */
  timeout: TimeoutConfigSchema.optional(),
  /** Tool allowlist — when set, only listed tools are registered (Issue #740) */
  toolAllowlist: z.array(z.string()).optional(),
  /** Audit logging configuration (Issue #740 Phase 2) */
  audit: z
    .object({
      /** Enable audit logging (default: true) */
      enabled: z.boolean().default(true),
      /** Log directory (default: ~/.nexus-agents/audit) */
      logDir: z.string().optional(),
      /** Minimum severity to log (default: 'info') */
      minSeverity: z.enum(['info', 'warning', 'critical']).default('info'),
      /** Enable tamper-evident hash chain (default: true) */
      enableHashChain: z.boolean().default(true),
      /** Maximum log file size in bytes (default: 10MB) */
      maxFileSizeBytes: z
        .number()
        .positive()
        .default(10 * 1024 * 1024),
      /** Maximum number of log files to retain (default: 10) */
      maxFiles: z.number().positive().default(10),
    })
    .optional(),
  /** Authentication configuration (Issue #739) */
  auth: z
    .object({
      /** Enable authentication for network-exposed transports (default: true) */
      enabled: z.boolean().default(true),
      /** Authentication method (default: 'token') */
      method: z.enum(['token', 'oauth2']).default('token'),
      /** Header name for bearer token (default: 'Authorization') */
      tokenHeader: z.string().default('Authorization'),
      /** Token file path (default: ~/.nexus-agents/auth/server-token) */
      tokenFile: z.string().optional(),
    })
    .optional(),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/**
 * Authentication configuration type.
 * (Source: Issue #739 - enable MCP authentication by default)
 */
export type AuthConfig = NonNullable<SecurityConfig['auth']>;
