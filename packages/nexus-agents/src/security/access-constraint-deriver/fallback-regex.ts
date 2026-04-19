/**
 * Access Constraint Deriver — Regex/keyword fallback (#1977 condition 1 partial).
 *
 * Deterministic keyword-based policy derivation used when:
 * - Trust-tier gate rejects the LLM path (Tier 3/4 input)
 * - LLM call fails or times out
 * - `NEXUS_ACCESS_POLICY_MODE=off` (bypass is returned, this module unused)
 *
 * The fallback is intentionally conservative: ambiguous tasks default to
 * read-only, destructive verbs require human approval (refuse).
 *
 * @module security/access-constraint-deriver/fallback-regex
 */

import type { AccessOperation, TaskAccessPolicy, AccessPolicyMode } from './types.js';

/** Keyword groups that map to specific operation sets. */
const READ_ONLY_VERBS = [
  'read',
  'view',
  'show',
  'display',
  'summarize',
  'summarise',
  'explain',
  'describe',
  'list',
  'find',
  'search',
  'audit',
  'review',
  'analyze',
  'analyse',
  'inspect',
  'check',
];

const READ_WRITE_VERBS = [
  'fix',
  'refactor',
  'implement',
  'update',
  'modify',
  'change',
  'edit',
  'rename',
  'rewrite',
  'add',
  'create new',
  'write code',
  'patch',
];

/** Verbs that REQUIRE explicit human approval — fallback refuses them. */
const REFUSE_VERBS = [
  'deploy',
  'release',
  'publish',
  'merge pr',
  'force push',
  'reset hard',
  'drop table',
  'delete all',
  'rm -rf',
  'push to prod',
  'transfer ownership',
];

/** Case-insensitive match of any keyword in the content. */
function matchesAny(content: string, keywords: readonly string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Derive a conservative policy from keyword matching.
 *
 * Decision order:
 * 1. If objective contains any REFUSE verb → refuse (empty tool allowlist,
 *    'refuse' operations) — caller should RefuseAction to user.
 * 2. If objective contains READ_WRITE verb → allow read + write ops, but
 *    no network or execute.
 * 3. If objective contains READ_ONLY verb → allow read only.
 * 4. Otherwise ambiguous → default to most restrictive (read-only).
 */
export function deriveFallbackPolicy(
  userObjective: string,
  mode: AccessPolicyMode,
  hash: string
): TaskAccessPolicy {
  const allowedOperations = classifyOperations(userObjective);

  return {
    allowedTools: [],
    allowedPathPatterns: [],
    allowedOperations,
    objectiveHash: hash,
    derivedAt: new Date().toISOString(),
    source: 'fallback-keyword',
    mode,
  };
}

function classifyOperations(userObjective: string): readonly AccessOperation[] {
  if (matchesAny(userObjective, REFUSE_VERBS)) {
    // Empty operations — the enforcer will deny anything the policy is
    // consulted for, forcing a human-approval escalation upstream.
    return [];
  }
  if (matchesAny(userObjective, READ_WRITE_VERBS)) {
    return ['read', 'write'];
  }
  if (matchesAny(userObjective, READ_ONLY_VERBS)) {
    return ['read'];
  }
  // Ambiguous — most restrictive.
  return ['read'];
}

/** Exposed for tests. */
export const FALLBACK_KEYWORDS = {
  readOnly: READ_ONLY_VERBS,
  readWrite: READ_WRITE_VERBS,
  refuse: REFUSE_VERBS,
};
