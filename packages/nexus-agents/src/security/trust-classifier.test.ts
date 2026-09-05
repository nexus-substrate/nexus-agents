import { describe, it, expect } from 'vitest';
import {
  classifyTrust,
  mapAuthorAssociation,
  canInfluenceDecisions,
  requiresCorroboration,
  getRequiredTrustTier,
} from './trust-classifier.js';
import type { TrustTier, SanitizedInput } from './trust-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSanitizedInput(overrides: Partial<SanitizedInput> = {}): SanitizedInput {
  return {
    content: 'clean text',
    originalLength: 10,
    trustTier: '3',
    userRole: 'unknown',
    injectionFlags: [],
    strippedElements: [],
    wasModified: false,
    sanitizedAt: '2026-01-15T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. mapAuthorAssociation
// ---------------------------------------------------------------------------

describe('mapAuthorAssociation', () => {
  it('maps OWNER to owner', () => {
    expect(mapAuthorAssociation('OWNER')).toBe('owner');
  });

  it('maps MEMBER to member', () => {
    expect(mapAuthorAssociation('MEMBER')).toBe('member');
  });

  it('maps COLLABORATOR to collaborator', () => {
    expect(mapAuthorAssociation('COLLABORATOR')).toBe('collaborator');
  });

  it('maps CONTRIBUTOR to contributor', () => {
    expect(mapAuthorAssociation('CONTRIBUTOR')).toBe('contributor');
  });

  it('maps FIRST_TIMER to unknown', () => {
    expect(mapAuthorAssociation('FIRST_TIMER')).toBe('unknown');
  });

  it('maps FIRST_TIME_CONTRIBUTOR to unknown', () => {
    expect(mapAuthorAssociation('FIRST_TIME_CONTRIBUTOR')).toBe('unknown');
  });

  it('maps NONE to unknown', () => {
    expect(mapAuthorAssociation('NONE')).toBe('unknown');
  });

  it('maps MANNEQUIN to unknown', () => {
    expect(mapAuthorAssociation('MANNEQUIN')).toBe('unknown');
  });

  it('maps an unrecognized string to unknown', () => {
    expect(mapAuthorAssociation('SOMETHING_ELSE')).toBe('unknown');
  });

  it('handles lowercase input via toUpperCase normalization', () => {
    expect(mapAuthorAssociation('owner')).toBe('owner');
    expect(mapAuthorAssociation('collaborator')).toBe('collaborator');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyTrust
// ---------------------------------------------------------------------------

describe('classifyTrust', () => {
  it('assigns Tier 1 to an allowlisted user regardless of role', () => {
    const result = classifyTrust({
      username: 'trustedbot',
      authorAssociation: 'NONE',
      config: { allowlistedMaintainers: ['trustedbot'] },
    });

    expect(result.trustTier).toBe('1');
    expect(result.isAllowlisted).toBe(true);
    expect(result.wasDowngraded).toBe(false);
    expect(result.reason).toContain('allowlist');
  });

  it('assigns Tier 1 to an OWNER without allowlist', () => {
    const result = classifyTrust({
      username: 'repo-owner',
      authorAssociation: 'OWNER',
    });

    expect(result.trustTier).toBe('1');
    expect(result.userRole).toBe('owner');
    expect(result.isAllowlisted).toBe(false);
    expect(result.wasDowngraded).toBe(false);
  });

  it('assigns Tier 2 to a COLLABORATOR without allowlist', () => {
    const result = classifyTrust({
      username: 'collab-user',
      authorAssociation: 'COLLABORATOR',
    });

    expect(result.trustTier).toBe('2');
    expect(result.userRole).toBe('collaborator');
    expect(result.isAllowlisted).toBe(false);
  });

  it('assigns Tier 3 to an unknown user (NONE association)', () => {
    const result = classifyTrust({
      username: 'random-person',
      authorAssociation: 'NONE',
    });

    expect(result.trustTier).toBe('3');
    expect(result.userRole).toBe('unknown');
  });

  it('downgrades legacy sanitized input when the measurement marker is absent', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '4',
      injectionFlags: ['authority_claim'],
      wasModified: true,
    });

    const result = classifyTrust({
      username: 'collab-user',
      authorAssociation: 'COLLABORATOR',
      sanitizedInput,
    });

    // Base tier for collaborator is 2; sanitizedInput says 4 → downgrade
    expect(result.trustTier).toBe('4');
    expect(result.wasDowngraded).toBe(true);
    expect(result.reason).toContain('Downgraded');
    expect(result.reason).toContain('injection');
  });

  it('does not downgrade when the content tier is explicitly unmeasured', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '4',
      contentTierMeasured: false,
      injectionFlags: ['authority_claim'],
      wasModified: true,
    });

    const result = classifyTrust({
      username: 'repo-owner',
      authorAssociation: 'OWNER',
      sanitizedInput,
    });

    expect(result.trustTier).toBe('1');
    expect(result.wasDowngraded).toBe(false);
  });

  it('does not upgrade tier when sanitizedInput has a lower numeric tier', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '1', // Would be an upgrade for unknown user
    });

    const result = classifyTrust({
      username: 'random-person',
      authorAssociation: 'NONE',
      sanitizedInput,
    });

    // Base tier for unknown is 3; sanitizedInput says 1 → no upgrade allowed
    expect(result.trustTier).toBe('3');
    expect(result.wasDowngraded).toBe(false);
  });

  it('authority claim from non-maintainer triggers Tier 4 downgrade', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '4',
      injectionFlags: ['authority_claim', 'instruction_pattern'],
      wasModified: true,
    });

    const result = classifyTrust({
      username: 'attacker',
      authorAssociation: 'NONE',
      sanitizedInput,
    });

    expect(result.trustTier).toBe('4');
    expect(result.wasDowngraded).toBe(true);
  });

  it('allowlisted user bypasses sanitizedInput downgrade', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '4',
      injectionFlags: ['system_prompt_manipulation'],
      wasModified: true,
    });

    const result = classifyTrust({
      username: 'admin',
      authorAssociation: 'NONE',
      sanitizedInput,
      config: { allowlistedMaintainers: ['admin'] },
    });

    // Allowlisted users always get Tier 1, even with hostile content
    expect(result.trustTier).toBe('1');
    expect(result.isAllowlisted).toBe(true);
    expect(result.wasDowngraded).toBe(false);
  });

  it('uses empty allowlist when config is omitted', () => {
    const result = classifyTrust({
      username: 'someone',
      authorAssociation: 'MEMBER',
    });

    expect(result.trustTier).toBe('3');
    expect(result.isAllowlisted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. canInfluenceDecisions
// ---------------------------------------------------------------------------

describe('canInfluenceDecisions', () => {
  it('returns true for Tier 1', () => {
    expect(canInfluenceDecisions('1')).toBe(true);
  });

  it('returns true for Tier 2', () => {
    expect(canInfluenceDecisions('2')).toBe(true);
  });

  it('returns false for Tier 3', () => {
    expect(canInfluenceDecisions('3')).toBe(false);
  });

  it('returns false for Tier 4', () => {
    expect(canInfluenceDecisions('4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. requiresCorroboration
// ---------------------------------------------------------------------------

describe('requiresCorroboration', () => {
  it('returns false for Tier 1 (self-sufficient)', () => {
    expect(requiresCorroboration('1')).toBe(false);
  });

  it('returns true for Tier 2 (needs Tier 1 corroboration)', () => {
    expect(requiresCorroboration('2')).toBe(true);
  });

  it('returns false for Tier 3 (cannot influence decisions)', () => {
    expect(requiresCorroboration('3')).toBe(false);
  });

  it('returns false for Tier 4 (cannot influence decisions)', () => {
    expect(requiresCorroboration('4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. getRequiredTrustTier
// ---------------------------------------------------------------------------

describe('getRequiredTrustTier', () => {
  it('requires Tier 1 for GeneratePatchPlan', () => {
    expect(getRequiredTrustTier('GeneratePatchPlan')).toBe('1');
  });

  it('requires Tier 2 for DraftReply', () => {
    expect(getRequiredTrustTier('DraftReply')).toBe('2');
  });

  it('requires Tier 2 for ProposeLabels', () => {
    expect(getRequiredTrustTier('ProposeLabels')).toBe('2');
  });

  it('requires Tier 3 for SummarizeIssue', () => {
    expect(getRequiredTrustTier('SummarizeIssue')).toBe('3');
  });

  it('requires Tier 3 for ClassifyIssue', () => {
    expect(getRequiredTrustTier('ClassifyIssue')).toBe('3');
  });

  it('requires Tier 3 for IdentifyDuplicates', () => {
    expect(getRequiredTrustTier('IdentifyDuplicates')).toBe('3');
  });

  it('requires Tier 4 for RefuseAction (always allowed)', () => {
    expect(getRequiredTrustTier('RefuseAction')).toBe('4');
  });

  it('requires Tier 4 for RequestHumanApproval (always allowed)', () => {
    expect(getRequiredTrustTier('RequestHumanApproval')).toBe('4');
  });

  it('defaults to Tier 1 for unknown action types', () => {
    expect(getRequiredTrustTier('SomeUnknownAction')).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases: sanitizedInput injection downgrade scenarios
// ---------------------------------------------------------------------------

describe('classifyTrust edge cases', () => {
  it('does not downgrade when sanitizedInput tier equals base tier', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '3', // Same as unknown user base tier
    });

    const result = classifyTrust({
      username: 'user',
      authorAssociation: 'NONE',
      sanitizedInput,
    });

    expect(result.trustTier).toBe('3');
    expect(result.wasDowngraded).toBe(false);
  });

  it('downgrades owner from Tier 1 to Tier 4 on hostile content', () => {
    const sanitizedInput = makeSanitizedInput({
      trustTier: '4',
      injectionFlags: ['system_prompt_manipulation', 'fake_conversation'],
      wasModified: true,
    });

    const result = classifyTrust({
      username: 'repo-owner',
      authorAssociation: 'OWNER',
      sanitizedInput,
    });

    expect(result.trustTier).toBe('4');
    expect(result.wasDowngraded).toBe(true);
    expect(result.userRole).toBe('owner');
  });

  it('includes correct userRole even after downgrade', () => {
    const sanitizedInput = makeSanitizedInput({ trustTier: '4' });

    const result = classifyTrust({
      username: 'contrib',
      authorAssociation: 'CONTRIBUTOR',
      sanitizedInput,
    });

    expect(result.userRole).toBe('contributor');
    expect(result.trustTier).toBe('4');
  });

  it('handles all trust tiers exhaustively via canInfluenceDecisions', () => {
    const tiers: TrustTier[] = ['1', '2', '3', '4'];
    const results = tiers.map((t) => canInfluenceDecisions(t));
    expect(results).toEqual([true, true, false, false]);
  });
});
