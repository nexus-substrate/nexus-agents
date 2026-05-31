/**
 * Shared resolver for `off`/`audit`/`enforce`-style security-mode env vars
 * (#3130). Both `resolveAccessPolicyMode` (ClawGuard, #1977) and
 * `resolveReputationGatingMode` (reputation gating, #3122) parse an enum env
 * var, coerce an invalid value to a safe default, and must NEVER throw — a
 * security layer must not fail-closed on a misconfiguration at startup.
 *
 * Previously the coercion was silent: a typo'd `enforce` (`enfroce`) degraded
 * to the default with no signal. This helper keeps the never-throw coercion but
 * emits a one-line `warn` so the misconfiguration is observable, and guarantees
 * both flags behave identically.
 *
 * @module security/env-mode
 */

import type { ZodType } from 'zod';
import { createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';

const defaultLogger = createLogger({ component: 'env-mode' });

/**
 * Resolve an enum-valued env var to one of its allowed values, coercing an
 * invalid/typo'd value to `fallback`. Unset or empty → `fallback` silently
 * (absence is normal, not a misconfiguration). A non-empty value that fails to
 * parse → `fallback` plus a `warn` (an explicit-but-invalid value is an operator
 * error worth surfacing). Never throws.
 *
 * @param raw     The raw env value (e.g. `process.env['NEXUS_X']`).
 * @param schema  Zod enum schema for the allowed values.
 * @param fallback Default returned when `raw` is absent/empty/invalid.
 * @param varName Env var name, for the warning message.
 * @param logger  Injectable for testing (defaults to the module logger).
 */
export function resolveEnvMode<T extends string>(
  raw: string | undefined,
  schema: ZodType<T>,
  fallback: T,
  varName: string,
  logger: ILogger = defaultLogger
): T {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  const parsed = schema.safeParse(raw.toLowerCase());
  if (parsed.success) return parsed.data;
  logger.warn(`Invalid ${varName} value — coercing to default`, { raw, default: fallback });
  return fallback;
}
