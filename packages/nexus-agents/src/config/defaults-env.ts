/**
 * Environment Variable Override Helpers
 *
 * Provides utilities for reading configuration from environment variables
 * with type-safe fallbacks to defaults.
 *
 * @module config/defaults-env
 */

import type {
  CircuitBreakerDefaults,
  RateLimitDefaults,
  RetryDefaults,
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

/**
 * Creates a retry config getter function bound to the DEFAULTS object.
 */
export function createGetRetryConfig(retryDefaults: RetryDefaultsConst): () => RetryDefaults {
  return (): RetryDefaults => {
    return {
      maxRetries: parseIntEnv('NEXUS_RETRY_MAX_RETRIES', retryDefaults.maxRetries),
      baseDelayMs: parseIntEnv('NEXUS_RETRY_BASE_DELAY', retryDefaults.baseDelayMs),
      maxDelayMs: parseIntEnv('NEXUS_RETRY_MAX_DELAY', retryDefaults.maxDelayMs),
      jitterFactor: parseFloatEnv('NEXUS_RETRY_JITTER', retryDefaults.jitterFactor),
    };
  };
}

/**
 * Creates a rate limit config getter function bound to the DEFAULTS object.
 */
export function createGetRateLimitConfig(
  rateLimitDefaults: RateLimitDefaultsConst
): () => RateLimitDefaults {
  return (): RateLimitDefaults => {
    return {
      requestsPerMinute: parseIntEnv('NEXUS_RATE_LIMIT_RPM', rateLimitDefaults.requestsPerMinute),
      enabled: parseBoolEnv('NEXUS_RATE_LIMIT_ENABLED', rateLimitDefaults.enabled),
      maxConcurrent: parseIntEnv(
        'NEXUS_RATE_LIMIT_MAX_CONCURRENT',
        rateLimitDefaults.maxConcurrent
      ),
      capacity: parseIntEnv('NEXUS_RATE_LIMIT_CAPACITY', rateLimitDefaults.capacity),
      refillRate: parseIntEnv('NEXUS_RATE_LIMIT_REFILL_RATE', rateLimitDefaults.refillRate),
      refillIntervalMs: parseIntEnv(
        'NEXUS_RATE_LIMIT_REFILL_INTERVAL',
        rateLimitDefaults.refillIntervalMs
      ),
    };
  };
}

// createGetWorkerConfig removed in #2977 — see comment in config/defaults.ts.

/**
 * Creates a circuit breaker config getter function bound to the DEFAULTS object.
 */
export function createGetCircuitBreakerConfig(
  cbDefaults: CircuitBreakerDefaultsConst
): () => CircuitBreakerDefaults {
  return (): CircuitBreakerDefaults => {
    return {
      failureThreshold: parseIntEnv('NEXUS_CIRCUIT_BREAKER_THRESHOLD', cbDefaults.failureThreshold),
      resetTimeoutMs: parseIntEnv('NEXUS_CIRCUIT_BREAKER_RESET_TIMEOUT', cbDefaults.resetTimeoutMs),
      halfOpenSuccessThreshold: cbDefaults.halfOpenSuccessThreshold,
      countTimeoutsAsFailures: cbDefaults.countTimeoutsAsFailures,
      countAuthFailuresAsFailures: cbDefaults.countAuthFailuresAsFailures,
      countRateLimitsAsFailures: cbDefaults.countRateLimitsAsFailures,
      halfOpenMaxRequests: cbDefaults.halfOpenMaxRequests,
    };
  };
}

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
    const r = defaults.RATE_LIMIT_DEFAULTS;
    const rt = defaults.RETRY_DEFAULTS;
    const cb = defaults.CIRCUIT_BREAKER_DEFAULTS;

    return `# Environment Variable Overrides

All defaults can be overridden via environment variables using the NEXUS_ prefix.

## Timeouts

| Variable | Default | Description |
| -------- | ------- | ----------- |
| NEXUS_TIMEOUT_CLI | ${String(t.cliMs)} | CLI execution timeout (ms) |
| NEXUS_TIMEOUT_API | ${String(t.apiMs)} | API request timeout (ms) |
| NEXUS_TIMEOUT_WORKFLOW | ${String(t.workflowMs)} | Workflow timeout (ms) |
| NEXUS_TIMEOUT_MCP | ${String(t.mcpMs)} | MCP operation timeout (ms) |

## Rate Limits

| Variable | Default | Description |
| -------- | ------- | ----------- |
| NEXUS_RATE_LIMIT_RPM | ${String(r.requestsPerMinute)} | Requests per minute |
| NEXUS_RATE_LIMIT_ENABLED | ${String(r.enabled)} | Enable rate limiting |
| NEXUS_RATE_LIMIT_CAPACITY | ${String(r.capacity)} | Token bucket capacity |

## Retries

| Variable | Default | Description |
| -------- | ------- | ----------- |
| NEXUS_RETRY_MAX_RETRIES | ${String(rt.maxRetries)} | Maximum retry attempts |
| NEXUS_RETRY_BASE_DELAY | ${String(rt.baseDelayMs)} | Base delay (ms) |
| NEXUS_RETRY_MAX_DELAY | ${String(rt.maxDelayMs)} | Maximum delay (ms) |
| NEXUS_RETRY_JITTER | ${String(rt.jitterFactor)} | Jitter factor (0-1) |

## Circuit Breaker

| Variable | Default | Description |
| -------- | ------- | ----------- |
| NEXUS_CIRCUIT_BREAKER_THRESHOLD | ${String(cb.failureThreshold)} | Failure threshold |
| NEXUS_CIRCUIT_BREAKER_RESET_TIMEOUT | ${String(cb.resetTimeoutMs)} | Reset timeout (ms) |
`;
  };
}
