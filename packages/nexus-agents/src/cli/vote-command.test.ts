/**
 * Tests for vote command GitHub recording functionality.
 * (Source: Issue #227)
 */

import { describe, it, expect } from 'vitest';
import type { VotingResult } from './vote-types.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
import { formatVoteComment, formatVoteRow, explainOutcome } from './vote-command.js';
import type { AgentVoteResult } from './voter-agents.js';

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
    simulateVotes: false,
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

// ============================================================================
// Issue #2441 — fail-closed UX: errors must NOT render as `[sim]`
// ============================================================================

function makeVoteRow(overrides: Partial<AgentVoteResult> = {}): AgentVoteResult {
  return {
    role: 'architect',
    vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
    processingTimeMs: 100,
    source: 'llm',
    ...overrides,
  };
}

// Strip ANSI escape codes so tests don't depend on the active color theme.
function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, '');
}

describe('formatVoteRow (#2441)', () => {
  it('renders an LLM vote with no badge', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'llm' })));
    expect(row).not.toContain('[SIMULATED]');
    expect(row).not.toContain('ERROR');
    expect(row).toContain('APPROVE');
  });

  it('renders a simulated vote with the loud red [SIMULATED] badge', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'simulation' })));
    // Loud, capitalized — NOT the old quiet `[sim]`.
    expect(row).toContain('[SIMULATED]');
    expect(row).not.toMatch(/\[sim\]/);
  });

  it('renders an errored vote as ✗ ERROR with the parsed reason — never as [sim]', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'error', error: 'Not logged in' })));
    expect(row).toContain('✗');
    expect(row).toContain('ERROR');
    expect(row).toContain('Not logged in');
    // The whole point of #2441: errors must be visually distinct from simulations.
    expect(row).not.toContain('[SIMULATED]');
    expect(row).not.toMatch(/\[sim\]/);
  });

  it('truncates multi-line error reasons to the first line', () => {
    const row = stripAnsi(
      formatVoteRow(makeVoteRow({ source: 'error', error: 'auth failed\nstack trace here' }))
    );
    expect(row).toContain('auth failed');
    expect(row).not.toContain('stack trace');
  });

  it('falls back to "execution failed" when no error message is attached', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'error' })));
    expect(row).toContain('execution failed');
  });
});

describe('explainOutcome (#2441)', () => {
  const baseVotes: readonly AgentVoteResult[] = [
    makeVoteRow({ role: 'architect', source: 'llm' }),
    makeVoteRow({ role: 'security', source: 'error', error: 'Not logged in' }),
    makeVoteRow({ role: 'scope_steward', source: 'error', error: 'MCP closed' }),
  ];

  it('returns empty string when outcome is approved', () => {
    expect(
      explainOutcome({ outcome: 'approved', quorumReached: true, errored: 0, votes: [] })
    ).toBe('');
  });

  it('explains "quorum not reached" with errored-voter count when applicable', () => {
    const explained = stripAnsi(
      explainOutcome({ outcome: 'rejected', quorumReached: false, errored: 2, votes: baseVotes })
    );
    expect(explained).toContain('quorum not reached');
    expect(explained).toContain('2 of 3 voter(s) failed');
    expect(explained).toContain('1 vote(s) recorded');
  });

  it('explains "quorum not reached" without error count when no voters errored', () => {
    const explained = stripAnsi(
      explainOutcome({ outcome: 'rejected', quorumReached: false, errored: 0, votes: [] })
    );
    expect(explained).toContain('quorum not reached');
    expect(explained).not.toContain('voter(s) failed');
  });

  it('returns empty string when rejected with quorum reached (real defeat, not infrastructure)', () => {
    const explained = explainOutcome({
      outcome: 'rejected',
      quorumReached: true,
      errored: 0,
      votes: [],
    });
    expect(explained).toBe('');
  });
});
