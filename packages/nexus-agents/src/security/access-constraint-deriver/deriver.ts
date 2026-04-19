/**
 * Access Constraint Deriver — Policy derivation (#1977).
 *
 * **Current state: skeleton only — `off` and `audit` modes return an
 * unrestricted `bypass` policy; the LLM-based derivation path is not
 * yet wired up.** The full implementation (LLM call via
 * UnifiedAdapterRegistry + regex fallback) is tracked in #1977 and
 * must satisfy the 7 PR conditions from the design-approval vote
 * before being enabled.
 *
 * @module security/access-constraint-deriver/deriver
 */

import { createHash } from 'node:crypto';
import { resolveAccessPolicyMode } from './config.js';
import type { TaskAccessPolicy, AccessPolicyMode } from './types.js';

/**
 * Derives an access policy for the given user objective.
 *
 * In the current skeleton state this returns a bypass policy (no
 * restrictions) in all modes. Once the LLM derivation path lands, the
 * `audit` and `enforce` modes will call the LLM and apply the resulting
 * constraints; `off` will continue to return bypass.
 */
export function deriveAccessPolicy(userObjective: string): Promise<TaskAccessPolicy> {
  const mode = resolveAccessPolicyMode();
  // TODO(#1977): in audit/enforce mode, call LLM-based deriver with regex
  // fallback. Gate on the 7 PR conditions (UnifiedAdapterRegistry, Zod,
  // hardcoded unbypassable denylist, trust-tier input gating, timeout+cache,
  // <500ms p95 validation, deterministic mocked tests). The Promise return
  // type is already correct for the future async LLM integration; the
  // skeleton resolves synchronously.
  return Promise.resolve(buildBypassPolicy(userObjective, mode));
}

/** Builds an unrestricted policy. */
function buildBypassPolicy(userObjective: string, mode: AccessPolicyMode): TaskAccessPolicy {
  return {
    allowedTools: '*',
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: hashObjective(userObjective),
    derivedAt: new Date().toISOString(),
    source: 'bypass',
    mode,
  };
}

/** Stable SHA-256 hash of a user objective for audit + policy caching. */
export function hashObjective(userObjective: string): string {
  return createHash('sha256').update(userObjective, 'utf8').digest('hex').slice(0, 16);
}
