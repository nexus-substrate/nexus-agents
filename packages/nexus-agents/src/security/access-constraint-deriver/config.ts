/**
 * Access Constraint Deriver — Configuration (#1977).
 *
 * Reads the NEXUS_ACCESS_POLICY_MODE env var to determine operating mode.
 * Default is `off` during initial rollout; switch to `audit` once the module
 * is wired into the dispatch path with telemetry; switch to `enforce` only
 * after empirical validation per the vote conditions on issue #1977.
 *
 * @module security/access-constraint-deriver/config
 */

import { AccessPolicyModeSchema, type AccessPolicyMode } from './types.js';

/**
 * Resolves the current access-policy mode from the environment.
 *
 * Returns `off` (safe default) if the env var is unset, empty, or invalid.
 * Invalid values are silently coerced — they are never a fatal startup error,
 * because this is a security layer and production must not fail-closed on a
 * misconfiguration.
 */
export function resolveAccessPolicyMode(env: NodeJS.ProcessEnv = process.env): AccessPolicyMode {
  const raw = env['NEXUS_ACCESS_POLICY_MODE'];
  if (typeof raw !== 'string' || raw.length === 0) return 'off';
  const parsed = AccessPolicyModeSchema.safeParse(raw.toLowerCase());
  return parsed.success ? parsed.data : 'off';
}
