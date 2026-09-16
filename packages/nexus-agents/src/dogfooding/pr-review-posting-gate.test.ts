/**
 * The review-posting gate's corroboration check runs INSIDE the firewall
 * (#6309): one row per `NEXUS_FIREWALL_POLICY` mode, like #5383's, plus the
 * named empty case for a stage that did not run.
 *
 * @module dogfooding/pr-review-posting-gate.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { HostileInputFirewall } from '../security/firewall/firewall-pipeline.js';
import type { FirewallConfig } from '../security/firewall/firewall-types.js';
import { createGitHubAdapter } from '../security/firewall/github-adapter.js';
import type { GitHubInput } from '../security/firewall/github-adapter.js';
import type { SourceCitation } from '../security/action-schema.js';
import { auditReviewAction } from './pr-review-posting-gate.js';
import { reviewPostingBlock } from './pr-reviewer-helpers.js';
import { _setUntrustedInputFirewallForTests } from './untrusted-input-firewall.js';

/** An OWNER author: tier 1, so the policy stage allows and only corroboration can block. */
const owner: GitHubInput = {
  type: 'pull_request',
  username: 'owner',
  authorAssociation: 'OWNER',
  title: 'Fix the thing',
  body: 'benign description',
};
/** The live path's posture (write + secrets); at tier 1 the Rule of Two does not fire. */
const gate = {
  context: { hasWriteAccess: true, hasSecretAccess: true },
  enforcedTier: '1',
} as const;
/** A tier-2 comment: accepted by the policy stage, but DraftReply's floor is a Tier 1 source. */
const uncorroborated: SourceCitation[] = [
  { type: 'issueComment', issueNumber: 1, commentId: 7, author: 'someone', authorTrustTier: '2' },
];
const corroborated: SourceCitation[] = [{ type: 'repoFile', path: 'README.md' }];
const MISSING = 'At least one Tier 1 source citation';
const draft = (sources: readonly SourceCitation[]): Parameters<typeof auditReviewAction>[0] => ({
  body: 'Ordinary review body',
  sources,
});

function firewallWith(overrides: Partial<FirewallConfig> = {}): HostileInputFirewall {
  return new HostileInputFirewall({
    adapter: createGitHubAdapter(),
    contentDowngrade: false,
    ...overrides,
    stages: { corroboration: true, ...overrides.stages },
  });
}

describe('auditReviewAction — corroboration runs inside the firewall (#6309)', () => {
  const log = { warn: vi.fn() };

  afterEach(() => {
    _setUntrustedInputFirewallForTests(undefined);
    log.warn.mockReset();
  });

  it('under off: the same verdict as the direct validateCorroboration call — INSUFFICIENT_CORROBORATION, not posted', () => {
    _setUntrustedInputFirewallForTests(firewallWith({ policyMode: 'off' }));

    const verdict = auditReviewAction(draft(uncorroborated), owner, gate, log);

    expect(verdict).toEqual({
      allowed: false,
      hasRuleOfTwoViolation: false,
      violations: [{ rule: 'INSUFFICIENT_CORROBORATION', message: MISSING }],
    });
    expect(reviewPostingBlock(verdict)?.reason).toBe('Policy gate: INSUFFICIENT_CORROBORATION');
  });

  it('under off: a corroborated review is allowed with no violations', () => {
    // The pair: a gate that always blocks satisfies every refusal row.
    _setUntrustedInputFirewallForTests(firewallWith({ policyMode: 'off' }));

    const verdict = auditReviewAction(draft(corroborated), owner, gate, log);

    expect(verdict).toEqual({ allowed: true, hasRuleOfTwoViolation: false, violations: [] });
  });

  it('under audit: the same verdict — the would-be refusal is telemetry, not a block', () => {
    // `wouldRefuse` and the missing sources are pinned on the decision itself
    // in untrusted-input-firewall.test.ts; this row pins that the posting
    // verdict is unchanged from `off`.
    _setUntrustedInputFirewallForTests(firewallWith({ policyMode: 'audit' }));

    const verdict = auditReviewAction(draft(uncorroborated), owner, gate, log);

    expect(verdict).toEqual({
      allowed: false,
      hasRuleOfTwoViolation: false,
      violations: [{ rule: 'INSUFFICIENT_CORROBORATION', message: MISSING }],
    });
  });

  it('under enforce: the firewall refuses, and the post is blocked with the stage and the missing sources named', () => {
    _setUntrustedInputFirewallForTests(firewallWith({ policyMode: 'enforce' }));

    const verdict = auditReviewAction(draft(uncorroborated), owner, gate, log);

    expect(verdict.allowed).toBe(false);
    expect(verdict.hasRuleOfTwoViolation).toBe(false);
    expect(verdict.violations).toEqual([
      {
        rule: 'INSUFFICIENT_CORROBORATION',
        message: expect.stringContaining('refused at stage corroboration'),
      },
    ]);
    expect(verdict.violations[0]?.message).toContain(MISSING);
    expect(reviewPostingBlock(verdict)?.reason).toBe('Policy gate: INSUFFICIENT_CORROBORATION');
  });

  it('under enforce: a corroborated review is still allowed — the stage is not a kill switch', () => {
    _setUntrustedInputFirewallForTests(firewallWith({ policyMode: 'enforce' }));

    const verdict = auditReviewAction(draft(corroborated), owner, gate, log);

    expect(verdict).toEqual({ allowed: true, hasRuleOfTwoViolation: false, violations: [] });
  });

  it('keeps the #5796 marker: a floor cleared only by author-supplied paths is reported', () => {
    _setUntrustedInputFirewallForTests(firewallWith({ policyMode: 'off' }));
    const authorSupplied: SourceCitation[] = [
      { type: 'repoFile', path: 'docs/new-in-this-pr.md', existsOnBaseRef: false },
    ];

    const verdict = auditReviewAction(draft(authorSupplied), owner, gate, log);

    expect(verdict.allowed).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      'Corroboration cleared only by author-supplied paths',
      expect.objectContaining({ citedPaths: 1 })
    );
  });

  it('fails closed when the corroboration stage did not run: an unevaluated DraftReply is not posted', () => {
    // The named empty case: `evaluated: false` is not a satisfied verdict and
    // not an unsatisfied one. It lands as FIREWALL_ERROR, like an unevaluated
    // policy stage, so the review is not posted and the reason says why.
    _setUntrustedInputFirewallForTests(firewallWith({ stages: { corroboration: false } }));

    const verdict = auditReviewAction(draft(corroborated), owner, gate, log);

    expect(verdict.allowed).toBe(false);
    expect(verdict.violations.map((v) => v.rule)).toEqual(['FIREWALL_ERROR']);
    expect(verdict.violations[0]?.message).toContain('did not evaluate corroboration');
  });
});
