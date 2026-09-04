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
 * invalid/typo'd value rather than throwing. Unset or empty → `fallback`
 * silently (absence is normal, not a misconfiguration). A non-empty value that
 * fails to parse → `invalidFallback` (default: `fallback`) plus a `warn`, since
 * an explicit-but-invalid value is an operator error worth surfacing. Never
 * throws.
 *
 * @param raw      The raw env value (e.g. `process.env['NEXUS_X']`).
 * @param schema   Zod enum schema for the allowed values.
 * @param fallback Returned when `raw` is absent or empty.
 * @param varName  Env var name, for the warning message.
 * @param options  `logger` (injectable for tests) and `invalidFallback` (the
 *                 mode an explicit-but-invalid value lands on; defaults to
 *                 `fallback`). See the inline docs on the parameter.
 */
export function resolveEnvMode<T extends string>(
  raw: string | undefined,
  schema: ZodType<T>,
  fallback: T,
  varName: string,
  options: {
    /** Injectable for testing; defaults to the module logger. */
    readonly logger?: ILogger;
    /**
     * The mode an explicit-but-UNPARSEABLE value lands on. Defaults to
     * `fallback`, so a caller that does not pass it is byte-identical to the
     * previous behaviour.
     *
     * It exists because `fallback` answers two different questions with one
     * value: what absence means, and what a typo means. For a flag whose unset
     * default is the permissive end those answers should differ —
     * `NEXUS_FIREWALL_POLICY=enfroce` used to resolve to `off`, so an operator
     * who explicitly asked for enforcement got a gate that refuses nothing
     * (refines #3130; ratified by a 7-voter panel at the supermajority bar,
     * 5 of 6 approvers — rationale in the changeset).
     *
     * Constrained deliberately: typed as the same `T` as `fallback`, so it can
     * only select among the flag's own modes and can never introduce a fourth
     * behaviour. It must never be MORE permissive than `fallback` — a typo may
     * tighten the gate, never loosen it. A caller whose unset default is
     * already the strictest mode (e.g. `NEXUS_REPUTATION_GATING`, which
     * defaults to `enforce`) has nothing to correct and should not pass it.
     *
     * Declared inline rather than as an exported interface: no caller needs the
     * name (they pass object literals), and exporting it would add a symbol
     * with no cross-file consumer, which the #3024 gate correctly rejects.
     */
    readonly invalidFallback?: T;
  } = {}
): T {
  const { logger = defaultLogger, invalidFallback } = options;
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  const parsed = schema.safeParse(raw.toLowerCase());
  if (parsed.success) return parsed.data;
  const applied = invalidFallback ?? fallback;
  // Name the mode actually applied, not just "the default": when `applied`
  // differs from `fallback` a log line saying "coercing to default" would
  // describe a value the process did not use.
  logger.warn(`Invalid ${varName} value — coercing to ${applied}`, {
    raw,
    default: fallback,
    applied,
  });
  return applied;
}
