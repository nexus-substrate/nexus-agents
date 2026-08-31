/**
 * The review-posting gate must consume the policy verdict, not re-derive one.
 *
 * `postReviewToGitHub` blocked on `hasRuleOfTwoViolation` alone, discarding the
 * `allowed` and `requiresApproval` that `evaluatePolicy` had just computed. The
 * surrounding JSDoc documented that as intentional — "the policy gate audits
 * the action but only blocks on Rule of Two violations."
 *
 * Measured before acting, by driving `evaluatePolicy` with the exact action
 * `auditReviewAction` constructs:
 *
 *   tier 1  allowed=true   violations=[]
 *   tier 2  allowed=true   violations=[]
 *   tier 3  allowed=false  blocking=[INSUFFICIENT_TRUST, UNTRUSTED_INFLUENCE, RULE_OF_TWO]
 *   tier 4  allowed=false  blocking=[INSUFFICIENT_TRUST, UNTRUSTED_INFLUENCE, RULE_OF_TWO]
 *
 * So the narrow gate and the full verdict are currently EQUIVALENT, and no
 * review is published against a blocking verdict today. This is a latent
 * fragility, not a live hole — and the equivalence is accidental: it holds only
 * because `auditReviewAction` hardcodes `hasWriteAccess: true` and
 * `hasSecretAccess: true`, which is what makes `checkRuleOfTwo` fire at tier 3+.
 * Make either conditional — a read-only token path — and RULE_OF_TWO stops
 * firing while INSUFFICIENT_TRUST and UNTRUSTED_INFLUENCE still do.
 *
 * These tests pin the measurement, so that if the access flags ever change,
 * this fails rather than silently widening what gets published.
 *
 * @module dogfooding/pr-reviewer-policy-verdict.test
 */

import { describe, it, expect } from 'vitest';

import { evaluatePolicy, type ActionContext } from '../security/policy-gate.js';
import { reviewPostingBlock } from './pr-reviewer-helpers.js';

/** The action `auditReviewAction` builds, kept identical on purpose. */
function reviewPostingAction(): Parameters<typeof evaluatePolicy>[0] {
  return {
    type: 'DraftReply',
    body: 'PR review comment',
    requiresApproval: true,
    sources: [{ type: 'repoFile', path: 'packages/nexus-agents/src/dogfooding/pr-reviewer.ts' }],
  };
}

function contextAt(tier: ActionContext['inputTrustTier']): ActionContext {
  return { inputTrustTier: tier, hasWriteAccess: true, hasSecretAccess: true };
}

describe('review-posting policy verdict', () => {
  it.each(['1', '2'] as const)('permits posting at trust tier %s', (tier) => {
    const decision = evaluatePolicy(reviewPostingAction(), contextAt(tier));
    expect(decision.allowed).toBe(true);
    expect(decision.violations).toEqual([]);
  });

  it.each(['3', '4'] as const)('blocks posting at trust tier %s', (tier) => {
    const decision = evaluatePolicy(reviewPostingAction(), contextAt(tier));
    expect(decision.allowed).toBe(false);
    expect(decision.violations.map((v) => v.rule).sort()).toEqual([
      'INSUFFICIENT_TRUST',
      'RULE_OF_TWO',
      'UNTRUSTED_INFLUENCE',
    ]);
  });

  it('never blocks on a rule that leaves the action allowed', () => {
    // The invariant the caller now relies on. Gating on `allowed` must be at
    // least as strict as the old RULE_OF_TWO-only gate at every tier, or this
    // change would have REMOVED protection rather than added it.
    for (const tier of ['1', '2', '3', '4'] as const) {
      const decision = evaluatePolicy(reviewPostingAction(), contextAt(tier));
      const hasRuleOfTwo = decision.violations.some((v) => v.rule === 'RULE_OF_TWO');
      if (hasRuleOfTwo) expect(decision.allowed).toBe(false);
    }
  });

  it('cannot gate on requiresApproval, which is true exactly when allowed', () => {
    // Recorded because it is the obvious-looking fix and it is wrong.
    // `needsApproval = !hasBlockingViolation && requiresHumanApproval(type)`,
    // and DraftReply is always approval-required — so blocking on
    // `requiresApproval` would refuse every review that passed the gate.
    const permitted = evaluatePolicy(reviewPostingAction(), contextAt('1'));
    expect(permitted.allowed).toBe(true);
    expect(permitted.requiresApproval).toBe(true);

    const blocked = evaluatePolicy(reviewPostingAction(), contextAt('4'));
    expect(blocked.allowed).toBe(false);
    expect(blocked.requiresApproval).toBe(false);
  });
});

describe('reviewPostingBlock consumes the verdict rather than re-deriving it', () => {
  it('blocks on a blocking violation that is NOT Rule of Two', () => {
    // The case the old gate could not see, and the reason this change exists.
    // It is unreachable today only because auditReviewAction hardcodes
    // hasWriteAccess/hasSecretAccess to true; nothing in the type system says
    // it must stay that way.
    const blocked = reviewPostingBlock({
      allowed: false,
      hasRuleOfTwoViolation: false,
      violations: [{ rule: 'INSUFFICIENT_TRUST' }, { rule: 'UNTRUSTED_INFLUENCE' }],
    });

    expect(blocked).toBeDefined();
    expect(blocked?.label).toBe('Policy gate');
    expect(blocked?.reason).toBe('Policy gate: INSUFFICIENT_TRUST, UNTRUSTED_INFLUENCE');
  });

  it('keeps the Rule of Two label for that distinctive condition', () => {
    // Untrusted input + write access + secrets at once reads very differently
    // from a trust-tier block, and operators grep for it by name.
    const blocked = reviewPostingBlock({
      allowed: false,
      hasRuleOfTwoViolation: true,
      violations: [{ rule: 'RULE_OF_TWO' }],
    });

    expect(blocked?.label).toBe('Rule of Two');
    expect(blocked?.reason).toBe('Rule of Two: RULE_OF_TWO');
  });

  it('permits posting when the gate allowed it', () => {
    // The pair. A function that always blocks would satisfy both tests above
    // and disable review posting entirely.
    expect(
      reviewPostingBlock({ allowed: true, hasRuleOfTwoViolation: false, violations: [] })
    ).toBeUndefined();
  });

  it('permits posting on a non-blocking violation', () => {
    // `allowed` is already the gate's own severity-aware verdict, so a warn-level
    // violation must NOT block — re-deriving from violations.length would.
    expect(
      reviewPostingBlock({
        allowed: true,
        hasRuleOfTwoViolation: false,
        violations: [{ rule: 'SOURCE_TRUST_MISMATCH' }],
      })
    ).toBeUndefined();
  });
});
