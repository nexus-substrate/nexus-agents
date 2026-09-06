/**
 * A vote record keeps the grounds, not just the verdict (#5373).
 *
 * `generateVoteHash` already hashed `{role, decision, reasoning}` and the
 * record then discarded the text, so the chain attested to a value it did not
 * store and nobody could re-verify the hash without re-obtaining the
 * reasoning. On #5228 a contrarian rejection was clipped mid-sentence in the
 * terminal, the grounds were unrecoverable, and the same defect resurfaced a
 * round later — one round of a 7-voter panel is 7-13 minutes of model time,
 * and the objection was right both times.
 */
import { describe, it, expect } from 'vitest';

import { buildVoteRecord } from './vote-record-store.js';
import { verifyVoteRecordSet, MAX_VOTER_REASONING_CHARS } from './vote-record.js';
import type { AgentVoteResult, VoterRole } from '../cli/vote-types.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';

function agentVote(
  role: VoterRole,
  decision: Vote['decision'],
  reasoning: string,
  source: AgentVoteResult['source'] = 'llm'
): AgentVoteResult {
  return {
    role,
    vote: { decision, confidence: 0.9, reasoning },
    processingTimeMs: 5,
    source,
  };
}

function consensusResult(): ConsensusResult {
  const now = '2026-09-06T00:00:00.000Z';
  return {
    proposalId: 'p-1',
    proposal: { title: 'T', description: 'D', algorithm: 'higher_order' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 1, reject: 1, abstain: 0, total: 2 },
    approvalPercentage: 50,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 5,
  };
}

function record(votes: readonly AgentVoteResult[]): ReturnType<typeof buildVoteRecord> {
  return buildVoteRecord({
    resolvedDecision: undefined,
    id: 'vote-reasoning',
    proposal: 'Ratify something contested',
    strategy: 'supermajority',
    result: consensusResult(),
    votes,
  });
}

describe('voter reasoning is persisted (#5373)', () => {
  it('stores the dissenting voter grounds verbatim', () => {
    const dissent =
      'Rejecting: grouping by {tool, rule} discards the per-call context the ' +
      'gate is supposed to weigh, so a second offender reads as a first.';
    const r = record([
      agentVote('architect', 'approve', 'The shape matches the existing precedent.'),
      agentVote('catfish', 'reject', dissent),
    ]);

    const catfish = r.voters.find((v) => v.role === 'catfish');
    expect(catfish?.reasoning).toBe(dissent);
    expect(catfish?.reasoningTruncated).toBeUndefined();
    expect(r.version).toBe('1.6');
    expect(verifyVoteRecordSet([r])).toEqual({ ok: true, recordCount: 1 });
  });

  it('marks a clipped reasoning on the entry it clipped', () => {
    // Silent truncation is the failure this field exists to fix.
    const long = 'x'.repeat(MAX_VOTER_REASONING_CHARS + 500);
    const r = record([agentVote('catfish', 'reject', long)]);

    const catfish = r.voters.find((v) => v.role === 'catfish');
    expect(catfish?.reasoning).toHaveLength(MAX_VOTER_REASONING_CHARS);
    expect(catfish?.reasoningTruncated).toBe(true);
    expect(verifyVoteRecordSet([r])).toEqual({ ok: true, recordCount: 1 });
  });

  it('keeps an empty reasoning as an empty string, not as absence', () => {
    // An errored voter has no entry at all, so absence and "said nothing" must
    // not collapse into the same record shape.
    const r = record([agentVote('pm', 'approve', ''), agentVote('ai_ml', 'abstain', '', 'error')]);

    expect(r.voters).toHaveLength(1);
    expect(r.voters[0]?.role).toBe('pm');
    expect(r.voters[0]?.reasoning).toBe('');
    expect(r.panelCoverage?.erroredRoles).toEqual(['ai_ml']);
  });

  it('the stored reasoning is covered by the record hash', () => {
    const r = record([agentVote('catfish', 'reject', 'Original grounds.')]);
    const tampered = {
      ...r,
      voters: r.voters.map((v) => ({ ...v, reasoning: 'Rewritten grounds.' })),
    };

    expect(verifyVoteRecordSet([tampered]).ok).toBe(false);
  });
});
