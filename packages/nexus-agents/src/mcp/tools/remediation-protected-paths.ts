/**
 * Protected-path / self-modification guard for autonomous remediation
 * (#3540 phase 3 / #3653, consensus-vote condition 2).
 *
 * The loop must NEVER autonomously weaken its own safety rails (runaway guard,
 * lease, capability boundary, consensus/voter config, the enforce path itself)
 * or touch auth / secrets / access-control / CI. Two layers enforce this:
 *
 *  1. **CODEOWNERS** (the hard human attestation at merge): PRs touching these
 *     paths require @owner review regardless — see /CODEOWNERS.
 *  2. **This proactive guard**: the enforce orchestrator checks the typed plan's
 *     declared targets BEFORE implementing and refuses to auto-remediate one that
 *     touches a protected path (fail-closed → leaves it for a human). Defense in
 *     depth on top of CODEOWNERS, since the plan's targets are known up front.
 *
 * Pure + dependency-free.
 *
 * @module mcp/tools/remediation-protected-paths
 */

// @export-no-consumer-yet — see #3648
// The enforce entry point (#3648) calls planTouchesProtectedPath before IMPLEMENT
// to refuse self-modifying/secret-touching remediations. Built ahead for it.

import type { RemediationPlan } from './improvement-remediation-capability.js';

/**
 * Path fragments that may NOT be autonomously remediated. Matched as
 * case-insensitive substrings of a normalized path, so they catch the file
 * wherever it lives. Covers: the loop's own safety rails, consensus/voter config,
 * governance rules, CI, and auth/secrets/access-control.
 */
export const PROTECTED_PATH_FRAGMENTS: readonly string[] = [
  // The capability-loop's own machinery (no self-modification).
  'improvement-remediation',
  'remediation-priority',
  'remediation-circuit-breaker',
  'remediation-protected-paths',
  'auto-remediation-lease',
  'improvement-enforce-readiness',
  'improvement-review',
  // Consensus / voter configuration (can't weaken its own judge).
  'src/consensus/',
  // Governance rules (Rule-of-Two, untrusted-input, etc.).
  '.rules/',
  'claude.md',
  'agents.md',
  'codeowners',
  // CI / supply chain (secret exposure).
  '.github/workflows/',
  // Security + auth + secrets + access-control.
  'src/security/',
  'token-resolver',
  'access-constraint',
  'secret',
  'credential',
];

/** Normalize a path for matching (forward slashes, lowercase, no leading ./). */
function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

/** True if `path` is a protected safety-rail / auth / secrets / CI / governance path. */
export function isProtectedPath(path: string): boolean {
  const p = normalize(path);
  return PROTECTED_PATH_FRAGMENTS.some((frag) => p.includes(frag));
}

/** Whether a remediation plan declares any protected target, and which. */
export interface ProtectedPathCheck {
  readonly protected: boolean;
  readonly paths: readonly string[];
}

/**
 * Inspect a typed {@link RemediationPlan}'s declared step targets for protected
 * paths. Fail-closed at the enforce path: a true result means "do not
 * auto-remediate — requires human attestation".
 */
export function planTouchesProtectedPath(plan: RemediationPlan): ProtectedPathCheck {
  const hits = plan.steps
    .map((s) => s.targetPath)
    .filter((t): t is string => t !== undefined && isProtectedPath(t));
  return { protected: hits.length > 0, paths: hits };
}
