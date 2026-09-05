/**
 * nexus-agents/security - Policy Gate Tests
 *
 * Comprehensive test suite for the policy gate module.
 *
 * @module security/policy-gate.test
 */

import { describe, it, expect } from 'vitest';

import type { SourceCitation } from './action-schema.js';
import type { ActionContext } from './policy-gate.js';
import { evaluatePolicy, canProceed } from './policy-gate.js';
import { createAuditTrail } from './audit-trail.js';

// ============================================================================
// Test Helpers - Source Citations
// ============================================================================

const repoSource: SourceCitation = { type: 'repoFile', path: 'src/main.ts' };
const maintainerSource: SourceCitation = {
  type: 'maintainerCommand',
  username: 'admin',
  commentId: 1,
};
const tier1Comment: SourceCitation = {
  type: 'issueComment',
  issueNumber: 1,
  commentId: 1,
  author: 'admin',
  authorTrustTier: '1',
};
const tier3Comment: SourceCitation = {
  type: 'issueComment',
  issueNumber: 1,
  commentId: 2,
  author: 'stranger',
  authorTrustTier: '3',
};

// ============================================================================
// Test Helpers - Action Factories
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSummarize(sources: SourceCitation[]) {
  return {
    type: 'SummarizeIssue' as const,
    summary: 'Test summary text',
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePropose(sources: SourceCitation[], labels = ['bug']) {
  return {
    type: 'ProposeLabels' as const,
    labels,
    reason: 'Test reason',
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDraft(sources: SourceCitation[]) {
  return {
    type: 'DraftReply' as const,
    body: 'Test reply body',
    requiresApproval: true as const,
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePatch(sources: SourceCitation[]) {
  return {
    type: 'GeneratePatchPlan' as const,
    files: [{ path: 'src/file.ts', operation: 'modify' as const, description: 'Fix bug' }],
    rationale: 'Fix bug found in CI',
    requiresApproval: true as const,
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeApproval() {
  return {
    type: 'RequestHumanApproval' as const,
    reason: 'Need permission',
    context: 'Action blocked by policy',
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeRefuse() {
  return {
    type: 'RefuseAction' as const,
    reason: 'Cannot proceed',
    escalateTo: 'maintainer' as const,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(tier: '1' | '2' | '3' | '4', overrides?: Partial<ActionContext>) {
  return {
    inputTrustTier: tier,
    hasWriteAccess: false,
    hasSecretAccess: false,
    ...overrides,
  };
}

// ============================================================================
// Test Suite - evaluatePolicy()
// ============================================================================

describe('evaluatePolicy', () => {
  it('allows read-only action from tier 1 with valid citation', () => {
    const action = makeSummarize([repoSource]);
    const context = makeContext('1');
    const decision = evaluatePolicy(action, context);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.violations).toHaveLength(0);
  });

  it('requires approval for a PUBLISHING action from tier 1', () => {
    // DraftReply posts text under the project's identity on a surface others
    // read; deleting it later does not un-publish it.
    const action = makeDraft([maintainerSource]);
    const context = makeContext('1');
    const decision = evaluatePolicy(action, context);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.violations).toHaveLength(0);
  });

  it('does NOT require approval for a reversible internal mutation (#4463)', () => {
    // ProposeLabels reaches this point having already cleared citation,
    // trust-tier, influence-block, Rule-of-Two and label-validity, and undoes
    // in one click.
    const decision = evaluatePolicy(
      makePropose([maintainerSource]),
      makeContext('1', { existingLabels: new Set(['bug']) })
    );
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.violations).toHaveLength(0);

    // GeneratePatchPlan stays gated: its schema encodes requiresApproval:
    // literal(true) plus a two-source corroboration minimum.
    const patch = evaluatePolicy(makePatch([maintainerSource, maintainerSource]), makeContext('1'));
    expect(patch.requiresApproval).toBe(true);
  });

  it('blocks action missing required citation', () => {
    const action = makeSummarize([]);
    const context = makeContext('1');
    const decision = evaluatePolicy(action, context);

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContainEqual(
      expect.objectContaining({
        rule: 'REQUIRE_CITATION',
        severity: 'block',
      })
    );
  });

  it('blocks action when input trust tier insufficient', () => {
    const action = makePatch([tier3Comment, tier3Comment]);
    const context = makeContext('3');
    const decision = evaluatePolicy(action, context);

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContainEqual(
      expect.objectContaining({
        rule: 'INSUFFICIENT_TRUST',
        severity: 'block',
      })
    );
  });

  it('blocks mutating action from untrusted tier 3 input', () => {
    const action = makePropose([tier3Comment]);
    const context = makeContext('3');
    const decision = evaluatePolicy(action, context);

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContainEqual(
      expect.objectContaining({
        rule: 'UNTRUSTED_INFLUENCE',
        severity: 'block',
      })
    );
  });

  it('blocks on rule of two violation', () => {
    const action = makeSummarize([tier3Comment]);
    const ctx = makeContext('3', { hasWriteAccess: true, hasSecretAccess: true });
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContainEqual(
      expect.objectContaining({
        rule: 'RULE_OF_TWO',
        severity: 'block',
      })
    );
  });

  it('allows when rule of two partial (no violation)', () => {
    const action = makeSummarize([tier3Comment]);
    const ctx = makeContext('3', { hasWriteAccess: true, hasSecretAccess: false });
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(true);
  });

  it('blocks when proposed labels invalid', () => {
    const action = makePropose([repoSource], ['nonexistent', 'bug']);
    const existing = new Set(['bug', 'feature']);
    const ctx = makeContext('1', { existingLabels: existing });
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContainEqual(
      expect.objectContaining({
        rule: 'INVALID_LABELS',
        severity: 'block',
        message: expect.stringContaining('nonexistent'),
      })
    );
  });

  it('blocks label proposals when the repository label set is unavailable', () => {
    const action = makePropose([repoSource], ['nonexistent']);
    const ctx = makeContext('1');
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContainEqual({
      rule: 'LABEL_SET_UNAVAILABLE',
      severity: 'block',
      message: 'repository label set not supplied; label validity unevaluated',
    });
  });

  it('warns on source trust mismatch', () => {
    const action = makePatch([tier3Comment, tier3Comment]);
    const ctx = makeContext('1');
    const decision = evaluatePolicy(action, ctx);

    const warnings = decision.violations.filter((v) => v.severity === 'warn');
    expect(warnings).toContainEqual(
      expect.objectContaining({
        rule: 'SOURCE_TRUST_MISMATCH',
      })
    );
  });

  it('collects multiple blocking violations', () => {
    const action = makePatch([]);
    const ctx = makeContext('3', { hasWriteAccess: true, hasSecretAccess: true });
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(false);
    const blockViolations = decision.violations.filter((v) => v.severity === 'block');
    expect(blockViolations.length).toBeGreaterThan(1);
  });

  it('allows RequestHumanApproval even from tier 4', () => {
    const action = makeApproval();
    const ctx = makeContext('4');
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(true);
  });

  it('allows RefuseAction even from tier 4', () => {
    const action = makeRefuse();
    const ctx = makeContext('4');
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(true);
  });

  it('allows DraftReply from tier 2 with approval', () => {
    const action = makeDraft([tier1Comment]);
    const ctx = makeContext('2');
    const decision = evaluatePolicy(action, ctx);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it('includes evaluatedAt timestamp', () => {
    const action = makeSummarize([repoSource]);
    const ctx = makeContext('1');
    const decision = evaluatePolicy(action, ctx);

    expect(decision.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// Test Suite - canProceed()
// ============================================================================

describe('canProceed', () => {
  it('allows read-only action at correct tier', () => {
    expect(canProceed('SummarizeIssue', '3')).toBe(true);
  });

  it('blocks read-only action above tier requirement', () => {
    expect(canProceed('GeneratePatchPlan', '3')).toBe(false);
  });

  it('allows mutating action at tier 1', () => {
    expect(canProceed('ProposeLabels', '1')).toBe(true);
  });

  it('allows mutating action at tier 2', () => {
    expect(canProceed('ProposeLabels', '2')).toBe(true);
  });

  it('blocks mutating action at tier 3', () => {
    expect(canProceed('ProposeLabels', '3')).toBe(false);
  });

  it('allows safety actions at tier 4', () => {
    expect(canProceed('RequestHumanApproval', '4')).toBe(true);
    expect(canProceed('RefuseAction', '4')).toBe(true);
  });
});

describe('evaluatePolicy audit emission (#3191)', () => {
  it('emits a policy_gate audit event when an audit trail is supplied', () => {
    const trail = createAuditTrail();
    const decision = evaluatePolicy(makePropose([maintainerSource]), makeContext('1'), trail);
    const events = trail.query();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'policy_gate',
      allowed: decision.allowed,
      requiresApproval: decision.requiresApproval,
      inputTrustTier: '1',
    });
  });

  it('emits nothing and stays pure when no audit trail is supplied', () => {
    const decision = evaluatePolicy(makeSummarize([repoSource]), makeContext('1'));
    expect(decision.allowed).toBe(true); // no trail arg → no side effect, same result
  });

  it('records violation rules in the event for a blocked action', () => {
    const trail = createAuditTrail();
    evaluatePolicy(makeSummarize([]), makeContext('1'), trail); // missing citation → block
    const events = trail.query();
    expect(events[0]).toMatchObject({ type: 'policy_gate', allowed: false });
    expect(
      (events[0] as unknown as { violationRules: readonly string[] }).violationRules
    ).toContain('REQUIRE_CITATION');
  });
});

describe('privilege-granting labels are never proposable (#4688)', () => {
  // A consensus panel chose tier-aware corroboration, which lets a bounded
  // proposal cite the input it was derived from. The dissenting seat objected
  // that labels are not zero-blast-radius because they gate CI — and in THIS
  // repo that is verifiably true:
  //
  //   .github/workflows/governor-review.yml triggers on label events, and
  //   `owner-ratified` is the label that BYPASSES the governor ratification
  //   gate. .github/workflows/pr-review.yml honours `skip-pr-review`.
  //
  // Nothing applies a proposed label today (`addLabels` has no non-test
  // caller), so this is latent rather than live. It stops being latent the
  // moment someone wires triage output to `addLabels` — exactly the kind of
  // change that looks harmless in review. The denylist has to exist BEFORE
  // that wiring, not after.
  //
  // These use TIER 1 deliberately. At tier 3 ProposeLabels is already refused
  // by the influence block, so a tier-3 fixture would pass without exercising
  // the denylist at all — green for the wrong reason.

  it('blocks the governance-bypass label even from a Tier 1 source', () => {
    const decision = evaluatePolicy(
      makePropose([repoSource], ['bug', 'owner-ratified']),
      makeContext('1')
    );
    expect(decision.allowed).toBe(false);
    expect(JSON.stringify(decision)).toContain('PRIVILEGED_LABEL');
  });

  it('blocks a label that would skip review', () => {
    const decision = evaluatePolicy(
      makePropose([repoSource], ['skip-pr-review']),
      makeContext('1')
    );
    expect(decision.allowed).toBe(false);
    expect(JSON.stringify(decision)).toContain('PRIVILEGED_LABEL');
  });

  it('blocks on the ACTION effect, not the author — OWNER included', () => {
    // An OWNER-authored issue body must not be able to propose its own
    // ratification. That is the self-modification hazard the governor exists
    // to prevent, and it does not soften with author trust.
    const decision = evaluatePolicy(
      makePropose([maintainerSource], ['owner-ratified']),
      makeContext('1')
    );
    expect(decision.allowed).toBe(false);
    expect(JSON.stringify(decision)).toContain('PRIVILEGED_LABEL');
  });

  it('blocks a privileged label regardless of case (#4689 follow-up)', () => {
    // The denylist was exact-match while `check-governor-ratification.ts:131`
    // compares `l.toLowerCase()` — so `Owner-Ratified` would have slipped the
    // guard and still satisfied the ratification gate. A guard must reject at
    // least as broadly as its consumer accepts.
    for (const variant of ['Owner-Ratified', 'OWNER-RATIFIED', 'Skip-PR-Review']) {
      const decision = evaluatePolicy(makePropose([repoSource], [variant]), makeContext('1'));
      expect(decision.allowed, `variant '${variant}' must be blocked`).toBe(false);
      expect(JSON.stringify(decision)).toContain('PRIVILEGED_LABEL');
    }
  });

  it('still allows ordinary labels', () => {
    const decision = evaluatePolicy(
      makePropose([repoSource], ['bug', 'documentation']),
      makeContext('1', { existingLabels: new Set(['bug', 'documentation']) })
    );
    expect(decision.allowed).toBe(true);
    expect(JSON.stringify(decision)).not.toContain('PRIVILEGED_LABEL');
  });

  it('does not depend on existingLabels being supplied', () => {
    // checkLabelValidity returns early when the repo label set is unknown, so
    // a denylist layered on top of it would inherit that vacuous pass.
    // `makeContext` supplies no `existingLabels`, which is exactly the
    // unknown-label-set state that makes checkLabelValidity return early.
    const decision = evaluatePolicy(
      makePropose([repoSource], ['owner-ratified']),
      makeContext('1')
    );
    expect(decision.allowed).toBe(false);
    expect(JSON.stringify(decision)).toContain('PRIVILEGED_LABEL');
  });
});
