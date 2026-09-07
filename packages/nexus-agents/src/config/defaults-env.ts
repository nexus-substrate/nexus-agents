/**
 * Environment Variable Override Helpers
 *
 * Provides utilities for reading configuration from environment variables
 * with type-safe fallbacks to defaults.
 *
 * @module config/defaults-env
 */

import type {
  ToolRateLimitConfig,
} from './defaults-types.js';

// ============================================================================
// Environment Variable Parsers
// ============================================================================

/**
 * Parses an integer from an environment variable with fallback.
 */
export function parseIntEnv(envKey: string, fallback: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined) {
    return fallback;
  }
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Parses a float from an environment variable with fallback.
 */
export function parseFloatEnv(envKey: string, fallback: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined) {
    return fallback;
  }
  const parsed = parseFloat(envValue);
  return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
}

/**
 * Parses a boolean flag value with fallback — the ONE accept-set for every
 * `NEXUS_*` boolean flag (#5155): `true`/`1` are truthy, `false`/`0` are
 * falsy, case-insensitively. Any other value (including `yes`/`no`/`on`/`off`
 * and the empty string) returns the fallback; `config/env-schema.ts`
 * (`boolLooseStr`) reports those at startup so the fallback is never silent.
 *
 * Pure so consumers that read an injected env object rather than
 * `process.env` (e.g. `cli-adapters/subprocess-env.ts`) share the same set.
 */
export function parseBoolValue(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.toLowerCase();
  if (normalized === undefined) {
    return fallback;
  }
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
}

/**
 * Parses a boolean from an environment variable with fallback.
 * Delegates to {@link parseBoolValue}: only 'true'/'1' are truthy,
 * 'false'/'0' are falsy (case-insensitive); any other value returns the fallback.
 */
export function parseBoolEnv(envKey: string, fallback: boolean): boolean {
  return parseBoolValue(process.env[envKey], fallback);
}

// ============================================================================
// Config Getter Types (for lazy initialization)
// ============================================================================

/** Timeout defaults type from DEFAULTS object */
export interface TimeoutDefaultsConst {
  readonly cliMs: number;
  // cliSimpleMs / cliComplexMs removed in #4180 — see config/defaults.ts.
  readonly apiMs: number;
  readonly apiMaxMs: number;
  readonly workflowMs: number;
  readonly workflowMaxMs: number;
  readonly stepMs: number;
  readonly mcpMs: number;
  readonly mcpMaxMs: number;
  readonly healthCheckMs: number;
  readonly testGlobalMs: number;
  readonly testTaskMs: number;
  readonly circuitBreakerResetMs: number;
}

/** Tool rate limits type from DEFAULTS object */
export interface ToolRateLimitsConst {
  readonly orchestrate: ToolRateLimitConfig;
  readonly delegate: ToolRateLimitConfig;
  readonly workflow: ToolRateLimitConfig;
  readonly expert: ToolRateLimitConfig;
}

/** Rate limit defaults type from DEFAULTS object */
interface RateLimitDefaultsConst {
  readonly requestsPerMinute: number;
  readonly enabled: boolean;
  readonly maxConcurrent: number;
  readonly capacity: number;
  readonly refillRate: number;
  readonly refillIntervalMs: number;
}

/** Retry defaults type from DEFAULTS object */
interface RetryDefaultsConst {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterFactor: number;
}

/** Circuit breaker defaults type from DEFAULTS object */
interface CircuitBreakerDefaultsConst {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly halfOpenSuccessThreshold: number;
  readonly countTimeoutsAsFailures: boolean;
  readonly countAuthFailuresAsFailures: boolean;
  readonly countRateLimitsAsFailures: boolean;
  readonly halfOpenMaxRequests: number;
}

// ============================================================================
// Config Getter Factory Functions
// ============================================================================

/**
 * Creates a timeout getter function bound to the DEFAULTS object.
 */
export function createGetTimeout(
  timeoutDefaults: TimeoutDefaultsConst
): (key: keyof TimeoutDefaultsConst) => number {
  return (key: keyof TimeoutDefaultsConst): number => {
    const envKey = `NEXUS_TIMEOUT_${key.replace(/Ms$/, '').toUpperCase()}`;
    return parseIntEnv(envKey, timeoutDefaults[key]);
  };
}

// createGetWorkerConfig removed in #2977. createGetRetryConfig,
// createGetRateLimitConfig and createGetCircuitBreakerConfig removed in #5903
// for the same reason: their twelve NEXUS_* variables were registered,
// documented and echoed back by `config get` as `Source: (env)`, and read by
// nothing that runs. The rate limiter takes `enabled` from the config file
// (`cli-server-tools.ts`), retry builds DEFAULT_RETRY_CONFIG from the static
// DEFAULTS (`adapters/retry.ts`), and the production circuit breakers carry
// their own config. See the comment in config/defaults.ts.

/**
 * Creates a tool rate limit getter function bound to the DEFAULTS object.
 */
export function createGetToolRateLimit(
  toolRateLimits: ToolRateLimitsConst
): (tool: keyof ToolRateLimitsConst) => ToolRateLimitConfig {
  return (tool: keyof ToolRateLimitsConst): ToolRateLimitConfig => {
    return toolRateLimits[tool];
  };
}

// ============================================================================
// Documentation Helper
// ============================================================================

/** DEFAULTS structure for documentation generation */
interface DefaultsForDocs {
  readonly TIMEOUT_DEFAULTS: TimeoutDefaultsConst;
  readonly RATE_LIMIT_DEFAULTS: RateLimitDefaultsConst;
  readonly RETRY_DEFAULTS: RetryDefaultsConst;
  readonly CIRCUIT_BREAKER_DEFAULTS: CircuitBreakerDefaultsConst;
}

/**
 * Creates a documentation generator function bound to the DEFAULTS object.
 *
 * @param defaults - The DEFAULTS object
 * @returns Function that generates environment variable documentation
 */
export function createGetEnvVarDocumentation(defaults: DefaultsForDocs): () => string {
  return (): string => {
    const t = defaults.TIMEOUT_DEFAULTS;

    return `# Environment Variable Overrides

All defaults can be overridden via environment variables using the NEXUS_ prefix.

## Timeouts

| Variable | Default | Description |
| -------- | ------- | ----------- |
| NEXUS_TIMEOUT_CLI | ${String(t.cliMs)} | CLI execution timeout (ms) |
| NEXUS_TIMEOUT_API | ${String(t.apiMs)} | API request timeout (ms) |
| NEXUS_TIMEOUT_WORKFLOW | ${String(t.workflowMs)} | Workflow timeout (ms) |
| NEXUS_TIMEOUT_MCP | ${String(t.mcpMs)} | MCP operation timeout (ms) |


Rate-limit, retry and circuit-breaker sections removed in #5903: their twelve
variables were registered and documented but read by nothing that runs, so this
generator was advertising names an operator could set to no effect. Rate
limiting is configured through the config file's \`security.rateLimit\`.
`;
  };
}
