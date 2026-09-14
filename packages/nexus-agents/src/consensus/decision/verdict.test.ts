/**
 * `consensus/decision/verdict` (#6000 step 1) — the pure functions that turn a
 * tally into a decision, imported DIRECTLY from the governed module.
 *
 * `evaluateThreshold` was module-private in `consensus/strategies.ts`; this is
 * its first direct test. The rest are pinned here at their new home; the
 * behavioural suites that exercise them through `buildResponse` and the engine
 * are unchanged and still pass through the re-exports.
 */

import { describe, it, expect } from 'vitest';
import {
  determineFinalStatus,
  evaluateThreshold,
  mapOutcomeToDecision,
  resolveVoteDecision,
} from './verdict.js';
import { determineFinalStatus as fromResultBuilder } from '../result-builder.js';
import { determineFinalStatus as fromBarrel } from '../index.js';
import {
  mapOutcomeToDecision as mapFromMcpTypes,
  resolveVoteDecision as resolveFromMcpTypes,
  type ConsensusVoteInput,
  type ExtendedVotingResult,
} from '../../mcp/tools/consensus-vote-types.js';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';

describe('evaluateThreshold', () => {
  it('inclusive: an exact 2/3 clears a supermajority bar', () => {
    expect(evaluateThreshold(2, 3, 2 / 3, true)).toEqual({
      approved: true,
      approvalPercentage: (2 / 3) * 100,
    });
  });

  it('strict: a tie at the bar is not enough for a simple majority', () => {
    expect(evaluateThreshold(2, 4, 0.5, false).approved).toBe(false);
    expect(evaluateThreshold(3, 4, 0.5, false).approved).toBe(true);
  });
});

describe('determineFinalStatus', () => {
  it('approves only when quorum was reached AND the strategy approved', () => {
    expect(determineFinalStatus(true, true)).toBe('approved');
    expect(determineFinalStatus(true, false)).toBe('rejected');
    expect(determineFinalStatus(false, true)).toBe('rejected');
    expect(determineFinalStatus(false, false)).toBe('rejected');
  });
});

describe('mapOutcomeToDecision', () => {
  it('carries approved/rejected/timeout through and reads everything else as pending', () => {
    expect(mapOutcomeToDecision('approved')).toBe('approved');
    expect(mapOutcomeToDecision('rejected')).toBe('rejected');
    expect(mapOutcomeToDecision('timeout')).toBe('timeout');
    expect(mapOutcomeToDecision('voting')).toBe('pending');
    expect(mapOutcomeToDecision('closed')).toBe('pending');
  });
});

/** A seat that answered. */
function seat(
  role: VoterRole,
  decision: 'approve' | 'reject' | 'abstain',
  source: AgentVoteResult['source'] = 'llm'
): AgentVoteResult {
  return { role, vote: { decision, reasoning: 'r', confidence: 0.9 }, processingTimeMs: 1, source };
}

function panelResult(
  votes: readonly AgentVoteResult[],
  outcome: 'approved' | 'rejected',
  extra: Partial<ExtendedVotingResult> = {}
): ExtendedVotingResult {
  const approve = votes.filter((v) => v.vote.decision === 'approve').length;
  const reject = votes.filter((v) => v.vote.decision === 'reject').length;
  const abstain = votes.filter((v) => v.vote.decision === 'abstain').length;
  return {
    proposal: 'p',
    threshold: 'simple_majority',
    strategy: 'simple_majority',
    result: {
      proposalId: 'id',
      proposal: { title: 't', description: 'p', algorithm: 'simple_majority' },
      outcome,
      votes: new Map(),
      voteCounts: { approve, reject, abstain, total: votes.length },
      approvalPercentage: approve + reject > 0 ? (approve / (approve + reject)) * 100 : 0,
      quorumReached: true,
      startedAt: 'now',
      closedAt: 'now',
      durationMs: 1,
    },
    votes,
    totalTimeMs: 1,
    simulateVotes: false,
    ...extra,
  };
}

const FULL_PANEL: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

const input: ConsensusVoteInput = { proposal: 'p', quickMode: false, simulateVotes: false };

describe('resolveVoteDecision', () => {
  it('a full approving panel is approved', () => {
    const votes = FULL_PANEL.map((r) => seat(r, 'approve'));
    expect(resolveVoteDecision(input, panelResult(votes, 'approved'), 0)).toEqual({
      decision: 'approved',
    });
  });

  it('an error-policy short-circuit is no_quorum, not rejected (#4053)', () => {
    const votes = FULL_PANEL.map((r) => seat(r, 'approve'));
    const result = panelResult(votes, 'rejected', { policyReason: 'fail_closed: 1 voter errored' });
    expect(resolveVoteDecision(input, result, 1).decision).toBe('no_quorum');
  });

  it('too few respondents void an approval under every policy (#5780)', () => {
    // 7 requested, 3 errored, 1 abstained: 3 respondents, floor is 5.
    const votes = [
      seat('architect', 'approve'),
      seat('security', 'approve'),
      seat('devex', 'reject'),
      seat('ai_ml', 'abstain'),
      seat('pm', 'abstain', 'error'),
      seat('catfish', 'abstain', 'error'),
      seat('scope_steward', 'abstain', 'error'),
    ];
    const outcome = resolveVoteDecision(input, panelResult(votes, 'approved', { panelSize: 7 }), 3);
    expect(outcome.decision).toBe('no_quorum');
    expect(outcome.degradeReason).toContain('3 of 7 voters decided; 5 required');
  });

  it('absolute_quorum: one errored seat degrades to no_quorum, naming the seat (#4132)', () => {
    const votes = FULL_PANEL.map((r) => seat(r, 'approve', r === 'pm' ? 'error' : 'llm'));
    const result = panelResult(votes, 'approved', { panelSize: 7, contrarianRequested: true });
    const outcome = resolveVoteDecision({ ...input, errorPolicy: 'absolute_quorum' }, result, 1);
    expect(outcome.decision).toBe('no_quorum');
    expect(outcome.degradeReason).toContain('voter(s) [pm] errored');
  });

  it('absolute_quorum: a genuine reject with zero errors still blocks', () => {
    const votes = FULL_PANEL.map((r) => seat(r, 'reject'));
    const result = panelResult(votes, 'rejected', { panelSize: 7, contrarianRequested: true });
    expect(
      resolveVoteDecision({ ...input, errorPolicy: 'absolute_quorum' }, result, 0).decision
    ).toBe('rejected');
  });

  it('the previous home re-exports the SAME functions, not copies', () => {
    expect(resolveFromMcpTypes).toBe(resolveVoteDecision);
    expect(mapFromMcpTypes).toBe(mapOutcomeToDecision);
    expect(fromResultBuilder).toBe(determineFinalStatus);
    expect(fromBarrel).toBe(determineFinalStatus);
  });
});
