/**
 * Tests for vote command GitHub recording functionality.
 * (Source: Issue #227)
 */

import { describe, it, expect } from 'vitest';
import type { VotingResult } from './vote-types.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
import { formatVoteComment } from './vote-command.js';

function createMockConsensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    proposalId: 'test-proposal-id',
    proposal: {
      title: 'CLI Vote',
      description: 'Test proposal',
      algorithm: 'supermajority',
    },
    outcome: 'approved',
    votes: new Map<string, Vote>(),
    voteCounts: { approve: 4, reject: 1, abstain: 0, total: 5 },
    approvalPercentage: 80,
    quorumReached: true,
    startedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    durationMs: 500,
    ...overrides,
  };
}

function createMockVotingResult(overrides: Partial<VotingResult> = {}): VotingResult {
  return {
    proposal: 'Test proposal for feature X',
    threshold: 'supermajority',
    result: createMockConsensusResult(),
    votes: [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'Good design', confidence: 0.9 },
        processingTimeMs: 100,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'approve', reasoning: 'Secure', confidence: 0.85 },
        processingTimeMs: 110,
        source: 'llm',
      },
      {
        role: 'devex',
        vote: { decision: 'approve', reasoning: 'Easy to use', confidence: 0.88 },
        processingTimeMs: 95,
        source: 'llm',
      },
      {
        role: 'ai_ml',
        vote: { decision: 'reject', reasoning: 'Concerns', confidence: 0.7 },
        processingTimeMs: 120,
        source: 'llm',
      },
      {
        role: 'pm',
        vote: { decision: 'approve', reasoning: 'Business value', confidence: 0.92 },
        processingTimeMs: 105,
        source: 'llm',
      },
    ],
    totalTimeMs: 530,
    dryRun: false,
    ...overrides,
  };
}

describe('formatVoteComment', () => {
  it('should format approved vote result as markdown', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('## Consensus Vote Result');
    expect(comment).toContain('**Result:** ✅ **APPROVED**');
    expect(comment).toContain('supermajority');
    expect(comment).toContain('Test proposal for feature X');
    expect(comment).toContain('| Agent | Decision | Confidence |');
  });

  it('should format rejected vote result with correct emoji', () => {
    const result = createMockVotingResult({
      result: createMockConsensusResult({
        outcome: 'rejected',
        voteCounts: { approve: 1, reject: 4, abstain: 0, total: 5 },
        approvalPercentage: 20,
      }),
    });
    const comment = formatVoteComment(result);

    expect(comment).toContain('**Result:** ❌ **REJECTED**');
  });

  it('should include vote table with all agents', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('| Software Architect | APPROVE |');
    expect(comment).toContain('| Security Engineer | APPROVE |');
    expect(comment).toContain('| Developer Experience | APPROVE |');
    expect(comment).toContain('| AI/ML Engineer | REJECT |');
    expect(comment).toContain('| Product Manager | APPROVE |');
  });

  it('should include confidence percentages', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('90%');
    expect(comment).toContain('85%');
  });

  it('should include vote summary', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('Approve: 4');
    expect(comment).toContain('Reject: 1');
    expect(comment).toContain('Abstain: 0');
    expect(comment).toContain('80.0% approval');
  });

  it('should truncate long proposals', () => {
    const longProposal = 'A'.repeat(300);
    const result = createMockVotingResult({ proposal: longProposal });
    const comment = formatVoteComment(result);

    expect(comment).toContain('A'.repeat(200) + '...');
    expect(comment).not.toContain('A'.repeat(201));
  });

  it('should include protocol attribution', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('CLAUDE.md Consensus Voting Protocol');
  });

  it('should include date in ET timezone', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('(ET)');
    // Date format should be MM/DD/YYYY
    expect(comment).toMatch(/\*\*Date:\*\* \d{2}\/\d{2}\/\d{4}/);
  });
});
