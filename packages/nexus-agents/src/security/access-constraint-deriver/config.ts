/**
 * Access Constraint Deriver — Configuration (#1977).
 *
 * Reads the NEXUS_ACCESS_POLICY_MODE env var to determine operating mode.
 *
 * **Default: `audit`** — violations are logged but not blocked. This gives
 * operators telemetry on policy-relevant tool calls out of the box without
 * blocking any traffic. Set `NEXUS_ACCESS_POLICY_MODE=off` to opt out of
 * audit-level logging entirely; set `enforce` to actually block violating
 * tool calls after the audit telemetry shows acceptable precision.
 *
 * @module security/access-constraint-deriver/config
 */

import { AccessPolicyModeSchema, type AccessPolicyMode } from './types.js';

/** Default mode when the env var is unset. Flipped from `off` → `audit`
 * in v2.50+ to surface telemetry by default. */
export const DEFAULT_ACCESS_POLICY_MODE: AccessPolicyMode = 'audit';

/**
 * Resolves the current access-policy mode from the environment.
 *
 * Returns `DEFAULT_ACCESS_POLICY_MODE` (currently `audit`) if the env var
 * is unset, empty, or invalid. Invalid values are silently coerced — they
 * are never a fatal startup error, because this is a security layer and
 * production must not fail-closed on a misconfiguration.
 */
export function resolveAccessPolicyMode(env: NodeJS.ProcessEnv = process.env): AccessPolicyMode {
  const raw = env['NEXUS_ACCESS_POLICY_MODE'];
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_ACCESS_POLICY_MODE;
  const parsed = AccessPolicyModeSchema.safeParse(raw.toLowerCase());
  return parsed.success ? parsed.data : DEFAULT_ACCESS_POLICY_MODE;
}
