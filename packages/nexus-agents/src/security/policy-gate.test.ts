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

  it('requires approval for mutating action from tier 1', () => {
    const action = makePropose([maintainerSource]);
    const context = makeContext('1');
    const decision = evaluatePolicy(action, context);

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.violations).toHaveLength(0);
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

  it('skips label validation when existingLabels missing', () => {
    const action = makePropose([repoSource], ['nonexistent']);
    const ctx = makeContext('1');
    const decision = evaluatePolicy(action, ctx);

    const labelViolations = decision.violations.filter((v) => v.rule === 'INVALID_LABELS');
    expect(labelViolations).toHaveLength(0);
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
