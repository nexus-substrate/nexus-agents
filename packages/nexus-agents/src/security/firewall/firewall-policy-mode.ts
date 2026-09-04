/**
 * Rollout gate for `HostileInputFirewall` behaviour changes (#5382, epic #5281).
 *
 * `HostileInputFirewall` is a PUBLISHED API: re-exported through
 * `src/exports/security.ts`, carried in `api-surface.txt`, and pinned by an
 * export-contract test. Epic #5281 found it has fallen BEHIND the hand-composed
 * production path rather than being dead scaffolding, and its remaining children
 * change what `process()` decides — #5380 raises one policy check to seven,
 * #5381 makes reputation gating mode-aware.
 *
 * A supermajority panel ratified this gate FIRST (6 approve / 1 reject; the lone
 * rejection argued the gate binds even more firmly than proposed) so those
 * changes have somewhere to land that is not a silent behaviour change shipped
 * in a patch release to consumers this repo cannot see.
 *
 * The invariant that makes it a gate: **`off` is the default, and under `off`
 * behaviour is byte-identical to pre-#5382.** A gate whose default changes
 * behaviour has not gated anything.
 *
 * Deliberately NOT a new mechanism. This is the third flag of exactly this shape
 * — `NEXUS_ACCESS_POLICY_MODE` (ClawGuard, #1977) and `NEXUS_REPUTATION_GATING`
 * (#3122) are the other two — so it delegates to the shared `resolveEnvMode`
 * helper (#3130) and coerces identically. `access-constraint-deriver/types.ts`
 * notes these env-var names are a stability contract; adding a fourth resolver
 * with subtly different coercion is the sprawl that helper exists to prevent.
 *
 * @module security/firewall/firewall-policy-mode
 */

import { z } from 'zod';
import { resolveEnvMode } from '../env-mode.js';
import type { ILogger } from '../../core/index.js';

/**
 * Rollout state for firewall policy behaviour.
 *
 * - `off` — pre-#5382 behaviour exactly. The default.
 * - `audit` — compute the stricter outcome and REPORT it, but enforce the old
 *   one. This is the mode that makes a rollout measurable: it answers "what
 *   would change?" without changing it.
 * - `enforce` — apply the stricter outcome.
 */
export const FirewallPolicyModeSchema = z.enum(['off', 'audit', 'enforce']);
export type FirewallPolicyMode = z.infer<typeof FirewallPolicyModeSchema>;

/**
 * Default is `off`, and that is the compatibility promise, not a placeholder.
 *
 * Note this differs from `DEFAULT_REPUTATION_GATING_MODE`, which is `enforce`
 * (#4667) — that flag governs an INTERNAL path this repo owns end to end, and
 * was flipped only after measurement over the real triage path. This one
 * governs a published surface with unknown external callers, so it starts off
 * and stays off until the same kind of measurement justifies a flip. Any future
 * flip is a MAJOR version change, not a patch.
 */
export const DEFAULT_FIREWALL_POLICY_MODE: FirewallPolicyMode = 'off';

/** Env var carrying the mode. Named to match its two sibling flags. */
export const FIREWALL_POLICY_ENV_VAR = 'NEXUS_FIREWALL_POLICY';

/**
 * Resolve the firewall policy mode from the environment.
 *
 * Never throws, because a security layer must not fail-closed at startup on an
 * operator typo (#3130). The two non-happy paths resolve DIFFERENTLY, though:
 * unset or empty resolves silently to `off` (absence is the normal state), while
 * an explicit-but-invalid value resolves to `audit` and emits one `warn`.
 *
 * @param env    Environment to read (injectable for tests).
 * @param logger Injectable for tests; defaults to the shared module logger.
 */
export function resolveFirewallPolicyMode(
  env: NodeJS.ProcessEnv = process.env,
  logger?: ILogger
): FirewallPolicyMode {
  return resolveEnvMode(
    env[FIREWALL_POLICY_ENV_VAR],
    FirewallPolicyModeSchema,
    DEFAULT_FIREWALL_POLICY_MODE,
    FIREWALL_POLICY_ENV_VAR,
    {
      ...(logger !== undefined ? { logger } : {}),
      // An explicit-but-invalid value lands on `audit`, NOT on the unset
      // default `off`. Unset means "the operator has not opted in" and `off` is
      // right for it; a typo means "the operator opted in and mistyped how",
      // and answering that with the most permissive mode hands them a firewall
      // that refuses nothing while they believe it is on. `audit` reports
      // without refusing, so it cannot break an external caller any more than
      // `off` can, and it emits the `wouldRefuse` telemetry the rollout is
      // supposed to be collecting — which `off` does not.
      invalidFallback: 'audit',
    }
  );
}
