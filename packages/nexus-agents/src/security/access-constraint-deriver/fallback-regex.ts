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
  return firstMatch(content, keywords) !== undefined;
}

/** The first keyword that occurs in `content`, or `undefined` if none does. */
function firstMatch(content: string, keywords: readonly string[]): string | undefined {
  const lower = content.toLowerCase();
  return keywords.find((k) => lower.includes(k));
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
  const { operations, refuseVerbMatched } = classifyOperations(userObjective);

  return {
    allowedTools: [],
    allowedPathPatterns: [],
    allowedOperations: operations,
    objectiveHash: hash,
    derivedAt: new Date().toISOString(),
    source: 'fallback-keyword',
    mode,
    ...(refuseVerbMatched !== undefined && { refuseVerbMatched }),
  };
}

interface OperationClassification {
  readonly operations: readonly AccessOperation[];
  /** The matched destructive verb, when the refuse branch fired. */
  readonly refuseVerbMatched?: string;
}

function classifyOperations(userObjective: string): OperationClassification {
  const refuseVerb = firstMatch(userObjective, REFUSE_VERBS);
  if (refuseVerb !== undefined) {
    // Empty operations, and the matched verb carried alongside so the decision
    // can name it (#5895).
    //
    // This does NOT deny. The comment here used to claim "the enforcer will
    // deny anything the policy is consulted for, forcing a human-approval
    // escalation upstream" — it does not, and never did. `checkAccess` reaches
    // its empty-`allowedTools` guard first (enforcer.ts, #5022) and returns
    // `unmeasured`, and no code anywhere reads `allowedOperations`. Until an
    // operations reader exists, the refuse branch is a disclosure signal, not
    // a screen; #5895 records the decision and the reasoning.
    return { operations: [], refuseVerbMatched: refuseVerb };
  }
  if (matchesAny(userObjective, READ_WRITE_VERBS)) {
    return { operations: ['read', 'write'] };
  }
  if (matchesAny(userObjective, READ_ONLY_VERBS)) {
    return { operations: ['read'] };
  }
  // Ambiguous — most restrictive.
  return { operations: ['read'] };
}

/** Exposed for tests. */
export const FALLBACK_KEYWORDS = {
  readOnly: READ_ONLY_VERBS,
  readWrite: READ_WRITE_VERBS,
  refuse: REFUSE_VERBS,
};
