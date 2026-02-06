/**
 * Tests for aegean-helpers-utils.ts
 *
 * Covers vote parsing, vote creation, task building, leader selection,
 * and quorum evaluation for the Aegean Byzantine-fault-tolerant protocol.
 */

import { describe, it, expect } from 'vitest';
import {
  parseVoteStatus,
  extractReasoning,
  createTimeoutVote,
  createLeaderVote,
  createVoteFromOutput,
  createProposalTask,
  createProposal,
  createVoteTask,
  selectLeader,
  evaluateQuorumStatus,
} from './aegean-helpers-utils.js';
import type { Task } from '../../core/index.js';

// ============================================================================
// parseVoteStatus
// ============================================================================

describe('parseVoteStatus', () => {
  it('parses accept from string output', () => {
    const result = parseVoteStatus('I accept this proposal');
    expect(result.status).toBe('accept');
    expect(result.confidence).toBe(0.8);
  });

  it('parses reject from string output', () => {
    const result = parseVoteStatus('I reject this proposal');
    expect(result.status).toBe('reject');
    expect(result.confidence).toBe(0.8);
  });

  it('parses approve keyword', () => {
    expect(parseVoteStatus('I approve').status).toBe('accept');
  });

  it('parses agree keyword', () => {
    expect(parseVoteStatus('I agree with this').status).toBe('accept');
  });

  it('parses disagree keyword as reject', () => {
    expect(parseVoteStatus('I disagree').status).toBe('reject');
  });

  it('parses disapprove keyword as reject', () => {
    expect(parseVoteStatus('I disapprove').status).toBe('reject');
  });

  it('returns pending for ambiguous output', () => {
    const result = parseVoteStatus('I need more information');
    expect(result.status).toBe('pending');
    expect(result.confidence).toBe(0.5);
  });

  it('handles non-string input by stringifying', () => {
    const result = parseVoteStatus({ decision: 'yes' });
    expect(result.status).toBe('accept');
  });

  it('is case-insensitive', () => {
    expect(parseVoteStatus('ACCEPT').status).toBe('accept');
    expect(parseVoteStatus('REJECT').status).toBe('reject');
  });

  it('returns pending for empty string', () => {
    expect(parseVoteStatus('').status).toBe('pending');
  });
});

// ============================================================================
// extractReasoning
// ============================================================================

describe('extractReasoning', () => {
  it('returns string output as-is when under max length', () => {
    const result = extractReasoning('Short reasoning');
    expect(result).toBe('Short reasoning');
  });

  it('truncates long output', () => {
    const long = 'x'.repeat(600);
    const result = extractReasoning(long, 500);
    expect(result).toHaveLength(500);
  });

  it('stringifies non-string input', () => {
    const result = extractReasoning({ key: 'value' });
    expect(result).toContain('key');
    expect(result).toContain('value');
  });

  it('uses custom max length', () => {
    const result = extractReasoning('hello world', 5);
    expect(result).toBe('hello');
  });
});

// ============================================================================
// createTimeoutVote
// ============================================================================

describe('createTimeoutVote', () => {
  it('creates vote with timeout status', () => {
    const vote = createTimeoutVote('agent-1', 'proposal-1');
    expect(vote.agentId).toBe('agent-1');
    expect(vote.proposalId).toBe('proposal-1');
    expect(vote.status).toBe('timeout');
    expect(vote.confidence).toBe(0);
    expect(vote.reasoning).toContain('not respond');
  });

  it('has a numeric timestamp', () => {
    const vote = createTimeoutVote('a', 'p');
    expect(typeof vote.timestamp).toBe('number');
  });
});

// ============================================================================
// createLeaderVote
// ============================================================================

describe('createLeaderVote', () => {
  it('creates vote with accept status', () => {
    const vote = createLeaderVote('leader-1', 'proposal-1');
    expect(vote.agentId).toBe('leader-1');
    expect(vote.proposalId).toBe('proposal-1');
    expect(vote.status).toBe('accept');
    expect(vote.confidence).toBe(1.0);
  });

  it('has reasoning about leader', () => {
    const vote = createLeaderVote('leader-1', 'p-1');
    expect(vote.reasoning).toContain('Leader');
  });
});

// ============================================================================
// createVoteFromOutput
// ============================================================================

describe('createVoteFromOutput', () => {
  it('creates accept vote from accepting output', () => {
    const result = createVoteFromOutput('agent-1', 'prop-1', 'I accept', 100);
    expect(result.vote.status).toBe('accept');
    expect(result.vote.agentId).toBe('agent-1');
    expect(result.vote.proposalId).toBe('prop-1');
    expect(result.tokensUsed).toBe(100);
  });

  it('creates reject vote from rejecting output', () => {
    const result = createVoteFromOutput('agent-2', 'prop-1', 'I reject this', 200);
    expect(result.vote.status).toBe('reject');
  });

  it('creates pending vote from ambiguous output', () => {
    const result = createVoteFromOutput('agent-3', 'prop-1', 'maybe later', 50);
    expect(result.vote.status).toBe('pending');
  });

  it('includes reasoning from output', () => {
    const result = createVoteFromOutput('a', 'p', 'I accept because it is good', 10);
    expect(result.vote.reasoning).toContain('accept because');
  });
});

// ============================================================================
// createProposalTask
// ============================================================================

describe('createProposalTask', () => {
  const baseTask: Task = {
    id: 'task-1',
    description: 'Solve the problem',
    context: {},
  };

  it('creates task with round-specific ID', () => {
    const task = createProposalTask(baseTask, 0);
    expect(task.id).toBe('task-1-proposal-0');
  });

  it('includes round number in description', () => {
    const task = createProposalTask(baseTask, 2);
    expect(task.description).toContain('round 3');
  });

  it('preserves original task description', () => {
    const task = createProposalTask(baseTask, 0);
    expect(task.description).toContain('Solve the problem');
  });
});

// ============================================================================
// createProposal
// ============================================================================

describe('createProposal', () => {
  it('creates proposal with correct structure', () => {
    const proposal = createProposal(0, 'leader-1', { answer: 42 });
    expect(proposal.round).toBe(0);
    expect(proposal.leaderId).toBe('leader-1');
    expect(proposal.value).toEqual({ answer: 42 });
    expect(proposal.proposalId).toContain('proposal-0');
  });

  it('has numeric timestamp', () => {
    const proposal = createProposal(1, 'l', 'value');
    expect(typeof proposal.timestamp).toBe('number');
  });
});

// ============================================================================
// createVoteTask
// ============================================================================

describe('createVoteTask', () => {
  it('creates vote task with proposal context', () => {
    const proposal = {
      proposalId: 'p-1',
      round: 0,
      leaderId: 'leader',
      value: 'solution',
      timestamp: Date.now(),
    };
    const task = createVoteTask(proposal, 'agent-1');
    expect(task.id).toBe('vote-p-1-agent-1');
    expect(task.description).toContain('ACCEPT or REJECT');
    expect(task.description).toContain('solution');
  });
});

// ============================================================================
// selectLeader
// ============================================================================

describe('selectLeader', () => {
  const experts = ['alice', 'bob', 'charlie'];

  it('selects first expert for round 0', () => {
    expect(selectLeader(experts, 0)).toBe('alice');
  });

  it('rotates through experts', () => {
    expect(selectLeader(experts, 1)).toBe('bob');
    expect(selectLeader(experts, 2)).toBe('charlie');
  });

  it('wraps around using modulo', () => {
    expect(selectLeader(experts, 3)).toBe('alice');
    expect(selectLeader(experts, 4)).toBe('bob');
  });
});

// ============================================================================
// evaluateQuorumStatus
// ============================================================================

describe('evaluateQuorumStatus', () => {
  it('detects quorum with enough accepts', () => {
    const result = evaluateQuorumStatus({
      votes: [
        { agentId: 'a1', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 1 },
        { agentId: 'a2', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 2 },
        { agentId: 'a3', proposalId: 'p', status: 'reject', confidence: 0.8, timestamp: 3 },
      ],
      totalAgents: 3,
      byzantineTolerance: 0,
    });
    expect(result.accepts).toBe(2);
    expect(result.rejects).toBe(1);
    expect(result.hasQuorum).toBe(true);
    expect(result.consensusReached).toBe(true);
  });

  it('detects no quorum with insufficient accepts', () => {
    const result = evaluateQuorumStatus({
      votes: [
        { agentId: 'a1', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 1 },
        { agentId: 'a2', proposalId: 'p', status: 'reject', confidence: 0.8, timestamp: 2 },
        { agentId: 'a3', proposalId: 'p', status: 'reject', confidence: 0.8, timestamp: 3 },
      ],
      totalAgents: 3,
      byzantineTolerance: 0,
    });
    expect(result.accepts).toBe(1);
    expect(result.rejects).toBe(2);
    expect(result.hasQuorum).toBe(false);
  });

  it('counts pending and timeout votes', () => {
    const result = evaluateQuorumStatus({
      votes: [
        { agentId: 'a1', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 1 },
        { agentId: 'a2', proposalId: 'p', status: 'pending', confidence: 0.5, timestamp: 2 },
        { agentId: 'a3', proposalId: 'p', status: 'timeout', confidence: 0, timestamp: 3 },
      ],
      totalAgents: 3,
      byzantineTolerance: 0,
    });
    expect(result.pending).toBe(2);
    expect(result.accepts).toBe(1);
  });

  it('accounts for byzantine tolerance in quorum size', () => {
    // quorum = ceil((5 + 1 + 1) / 2) = 4
    const result = evaluateQuorumStatus({
      votes: [
        { agentId: 'a1', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 1 },
        { agentId: 'a2', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 2 },
        { agentId: 'a3', proposalId: 'p', status: 'accept', confidence: 0.8, timestamp: 3 },
      ],
      totalAgents: 5,
      byzantineTolerance: 1,
    });
    expect(result.required).toBe(4);
    expect(result.hasQuorum).toBe(false);
  });

  it('handles empty votes', () => {
    const result = evaluateQuorumStatus({
      votes: [],
      totalAgents: 3,
      byzantineTolerance: 0,
    });
    expect(result.accepts).toBe(0);
    expect(result.rejects).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.hasQuorum).toBe(false);
  });
});
