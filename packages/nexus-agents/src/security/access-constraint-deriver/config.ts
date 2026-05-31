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
import { resolveEnvMode } from '../env-mode.js';

/** Default mode when the env var is unset. Flipped from `off` → `audit`
 * in v2.50+ to surface telemetry by default. */
export const DEFAULT_ACCESS_POLICY_MODE: AccessPolicyMode = 'audit';

/**
 * Resolves the current access-policy mode from the environment.
 *
 * Returns `DEFAULT_ACCESS_POLICY_MODE` (currently `audit`) if the env var
 * is unset, empty, or invalid. Invalid values are coerced (never a fatal
 * startup error — a security layer must not fail-closed on a misconfiguration),
 * but a non-empty invalid value now emits a `warn` so the typo is observable
 * (#3130), via the shared `resolveEnvMode`.
 */
export function resolveAccessPolicyMode(env: NodeJS.ProcessEnv = process.env): AccessPolicyMode {
  return resolveEnvMode(
    env['NEXUS_ACCESS_POLICY_MODE'],
    AccessPolicyModeSchema,
    DEFAULT_ACCESS_POLICY_MODE,
    'NEXUS_ACCESS_POLICY_MODE'
  );
}
