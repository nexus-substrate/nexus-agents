/**
 * Environment Variable Override Helpers
 *
 * Provides utilities for reading configuration from environment variables
 * with type-safe fallbacks to defaults.
 *
 * @module config/defaults-env
 */

import type { ToolRateLimitConfig } from './defaults-types.js';

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

// The hand-written TimeoutDefaultsConst interface that lived here was removed
// in #4939 with its last consumer (createGetTimeout); the exported type of the
// same name is `typeof DEFAULTS.TIMEOUT_DEFAULTS` in config/defaults.ts.

/** Tool rate limits type from DEFAULTS object */
export interface ToolRateLimitsConst {
  readonly orchestrate: ToolRateLimitConfig;
  readonly delegate: ToolRateLimitConfig;
  readonly workflow: ToolRateLimitConfig;
  readonly expert: ToolRateLimitConfig;
}

// ============================================================================
// Config Getter Factory Functions
// ============================================================================

// createGetTimeout removed in #4939. It built `NEXUS_TIMEOUT_<KEY>` names at
// runtime for a getter (getTimeout) with zero production callers, so the four
// registered names — NEXUS_TIMEOUT_{CLI,API,WORKFLOW,MCP} — were read by nothing
// that runs. Same class as the removals below.
//
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

// createGetEnvVarDocumentation removed in #4939: its last remaining table was
// the four NEXUS_TIMEOUT_* rows, all of which named unread variables.
