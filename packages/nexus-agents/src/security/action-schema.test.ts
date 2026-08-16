import { describe, it, expect } from 'vitest';

import {
  validateAgentAction,
  isReadOnlyAction,
  isMutatingAction,
  requiresHumanApproval,
  requiresCitation,
  AgentActionSchema,
} from './action-schema.js';

// ---------------------------------------------------------------------------
// Shared citation fixtures
// ---------------------------------------------------------------------------

const repoFileCitation = { type: 'repoFile' as const, path: 'CLAUDE.md' };

const repoFileWithCommit = {
  type: 'repoFile' as const,
  path: 'src/index.ts',
  line: 42,
  commit: 'abc1234',
};

const issueCommentCitation = {
  type: 'issueComment' as const,
  issueNumber: 818,
  commentId: 12345,
  author: 'williamzujkowski',
  authorTrustTier: '1' as const,
};

const ciResultCitation = {
  type: 'ciResult' as const,
  runId: 99001,
  status: 'pass' as const,
  job: 'lint',
};

const policyDocCitation = {
  type: 'policyDoc' as const,
  path: 'docs/architecture/SECURITY.md',
  section: 'Threat Model',
};

const maintainerCommandCitation = {
  type: 'maintainerCommand' as const,
  username: 'williamzujkowski',
  commentId: 55555,
};

// ---------------------------------------------------------------------------
// 1. validateAgentAction — valid actions
// ---------------------------------------------------------------------------

describe('validateAgentAction — valid actions', () => {
  it('accepts SummarizeIssue with repoFile source', () => {
    const action = {
      type: 'SummarizeIssue',
      summary: 'This issue describes a race condition in the event loop handler.',
      sources: [repoFileCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('SummarizeIssue');
    }
  });

  it('accepts ProposeLabels with issueComment source', () => {
    const action = {
      type: 'ProposeLabels',
      labels: ['bug', 'security'],
      reason: 'Issue describes a vulnerability in input validation.',
      sources: [issueCommentCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('ProposeLabels');
    }
  });

  it('accepts DraftReply with ciResult source', () => {
    const action = {
      type: 'DraftReply',
      body: 'The CI pipeline passed for this change. Looks good to merge.',
      requiresApproval: true,
      sources: [ciResultCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('DraftReply');
    }
  });

  it('accepts RefuseAction without sources', () => {
    const action = {
      type: 'RefuseAction',
      reason: 'Untrusted input attempted to trigger a merge action.',
      escalateTo: 'maintainer',
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('RefuseAction');
    }
  });

  it('accepts RequestHumanApproval without sources', () => {
    const action = {
      type: 'RequestHumanApproval',
      reason: 'Conflicting information between issue body and CI results.',
      context: 'Issue #42 claims a fix but CI run 99001 shows failure on the same branch.',
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('RequestHumanApproval');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. validateAgentAction — invalid actions
// ---------------------------------------------------------------------------

describe('validateAgentAction — invalid actions', () => {
  it('rejects input missing the type field', () => {
    const action = { summary: 'No type provided here', sources: [repoFileCitation] };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('validation failed');
    }
  });

  it('rejects an unknown action type', () => {
    const action = {
      type: 'DeleteEverything',
      reason: 'I am rogue',
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('validation failed');
    }
  });

  it('rejects SummarizeIssue with missing sources', () => {
    const action = {
      type: 'SummarizeIssue',
      summary: 'This issue describes a race condition in the event loop handler.',
      sources: [],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('sources');
    }
  });

  it('rejects SummarizeIssue with summary too short', () => {
    const action = {
      type: 'SummarizeIssue',
      summary: 'Short',
      sources: [repoFileCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
  });

  it('rejects ProposeLabels with more than 5 labels', () => {
    const action = {
      type: 'ProposeLabels',
      labels: ['bug', 'feature', 'security', 'docs', 'performance', 'question'],
      reason: 'Too many labels being applied at once.',
      sources: [repoFileCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. SourceCitation validation
// ---------------------------------------------------------------------------

describe('SourceCitation validation', () => {
  it('validates repoFile with a valid commit hash', () => {
    const action = {
      type: 'SummarizeIssue',
      summary: 'A commit-referenced citation with full 40-char SHA.',
      sources: [repoFileWithCommit],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
  });

  it('rejects repoFile with an invalid commit hash', () => {
    const action = {
      type: 'SummarizeIssue',
      summary: 'A commit-referenced citation with invalid SHA.',
      sources: [{ type: 'repoFile', path: 'README.md', commit: 'ZZZZ' }],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
  });

  it('validates issueComment with authorTrustTier', () => {
    const action = {
      type: 'ClassifyIssue',
      category: 'bug',
      confidence: 0.85,
      sources: [issueCommentCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
  });

  it('validates ciResult citation', () => {
    const action = {
      type: 'ClassifyIssue',
      category: 'performance',
      confidence: 0.7,
      sources: [ciResultCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
  });

  it('validates policyDoc citation', () => {
    const action = {
      type: 'IdentifyDuplicates',
      candidates: [100, 200],
      similarity: [0.9, 0.8],
      sources: [policyDocCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
  });

  it('validates maintainerCommand citation', () => {
    const action = {
      type: 'ProposeLabels',
      labels: ['enhancement'],
      reason: 'Maintainer explicitly requested this label.',
      sources: [maintainerCommandCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. isReadOnlyAction
// ---------------------------------------------------------------------------

describe('isReadOnlyAction', () => {
  it('returns true for SummarizeIssue', () => {
    expect(isReadOnlyAction('SummarizeIssue')).toBe(true);
  });

  it('returns true for ClassifyIssue', () => {
    expect(isReadOnlyAction('ClassifyIssue')).toBe(true);
  });

  it('returns false for DraftReply', () => {
    expect(isReadOnlyAction('DraftReply')).toBe(false);
  });

  it('returns false for ProposeLabels', () => {
    expect(isReadOnlyAction('ProposeLabels')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. isMutatingAction
// ---------------------------------------------------------------------------

describe('isMutatingAction', () => {
  it('returns true for ProposeLabels', () => {
    expect(isMutatingAction('ProposeLabels')).toBe(true);
  });

  it('returns true for DraftReply', () => {
    expect(isMutatingAction('DraftReply')).toBe(true);
  });

  it('returns true for GeneratePatchPlan', () => {
    expect(isMutatingAction('GeneratePatchPlan')).toBe(true);
  });

  it('returns false for SummarizeIssue', () => {
    expect(isMutatingAction('SummarizeIssue')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. requiresCitation
// ---------------------------------------------------------------------------

describe('requiresCitation', () => {
  it('returns true for SummarizeIssue', () => {
    expect(requiresCitation('SummarizeIssue')).toBe(true);
  });

  it('returns true for GeneratePatchPlan', () => {
    expect(requiresCitation('GeneratePatchPlan')).toBe(true);
  });

  it('returns false for RequestHumanApproval', () => {
    expect(requiresCitation('RequestHumanApproval')).toBe(false);
  });

  it('returns false for RefuseAction', () => {
    expect(requiresCitation('RefuseAction')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. GeneratePatchPlan
// ---------------------------------------------------------------------------

describe('GeneratePatchPlan', () => {
  it('requires at least 2 sources', () => {
    const action = {
      type: 'GeneratePatchPlan',
      files: [
        {
          path: 'src/foo.ts',
          operation: 'modify',
          description: 'Fix the race condition in the event handler.',
        },
      ],
      rationale: 'The race condition causes data loss under concurrent writes.',
      requiresApproval: true,
      sources: [repoFileCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('sources');
    }
  });

  it('accepts a valid GeneratePatchPlan with 2 sources and approval', () => {
    const action = {
      type: 'GeneratePatchPlan',
      files: [
        {
          path: 'src/foo.ts',
          operation: 'modify',
          description: 'Fix the race condition in the event handler.',
        },
      ],
      rationale: 'The race condition causes data loss under concurrent writes.',
      requiresApproval: true,
      sources: [repoFileCitation, ciResultCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('GeneratePatchPlan');
    }
  });

  it('rejects GeneratePatchPlan when requiresApproval is false', () => {
    const action = {
      type: 'GeneratePatchPlan',
      files: [
        {
          path: 'src/foo.ts',
          operation: 'modify',
          description: 'Fix the race condition in the event handler.',
        },
      ],
      rationale: 'The race condition causes data loss under concurrent writes.',
      requiresApproval: false,
      sources: [repoFileCitation, ciResultCitation],
    };
    const result = validateAgentAction(action);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. AgentActionSchema parse (direct Zod usage)
// ---------------------------------------------------------------------------

describe('AgentActionSchema', () => {
  it('parses a valid ClassifyIssue action', () => {
    const input = {
      type: 'ClassifyIssue',
      category: 'security',
      confidence: 0.95,
      sources: [policyDocCitation],
    };
    const result = AgentActionSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects ClassifyIssue with out-of-range confidence', () => {
    const input = {
      type: 'ClassifyIssue',
      category: 'bug',
      confidence: 1.5,
      sources: [repoFileCitation],
    };
    const result = AgentActionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// requiresHumanApproval (#4463)
// ============================================================================

describe('requiresHumanApproval', () => {
  it('gates DraftReply — it publishes under the project identity', () => {
    expect(requiresHumanApproval('DraftReply')).toBe(true);
  });

  it('does NOT gate reversible internal mutations', () => {
    // Both reach the approval check having already cleared citation,
    // trust-tier, influence-block, Rule-of-Two and label-validity. Labels
    // are one click to undo; a patch PLAN applies nothing.
    expect(requiresHumanApproval('ProposeLabels')).toBe(false);
    expect(requiresHumanApproval('GeneratePatchPlan')).toBe(false);
  });

  it('does not gate read-only actions', () => {
    expect(requiresHumanApproval('SummarizeIssue')).toBe(false);
    expect(requiresHumanApproval('ClassifyIssue')).toBe(false);
  });

  it('stays narrower than isMutatingAction, which the influence block still uses', () => {
    // Regression guard: narrowing approval must NOT narrow the untrusted-input
    // influence block. Low-trust input must not drive ANY mutating action.
    for (const t of ['ProposeLabels', 'GeneratePatchPlan'] as const) {
      expect(isMutatingAction(t)).toBe(true);
      expect(requiresHumanApproval(t)).toBe(false);
    }
  });
});
