/**
 * A vote record must be able to say that the panel was degraded (#5738).
 *
 * `toVoterSummaries` dropped every voter at `source: 'error'` and
 * `buildVoteRecord` copied only approve/reject/abstain/total, so a seven-role
 * panel that lost four voters persisted as a clean three-voter record: the
 * errored roles absent, `total: 3`, no error count, no marker. Under
 * `reduce_denominator` — the default for supermajority — a 6-of-7 panel with
 * one dead voter recorded as a unanimous six-voter approval, which is the
 * record a human spot-check of a governor-path merge reads.
 *
 * Measured before the fix: 23 of 199 records in the live ledger carried a
 * denominator that was neither the full panel nor quick mode, with nothing
 * saying why.
 */
import { describe, it, expect } from 'vitest';

import { buildVoteRecord } from './vote-record-store.js';
import { verifyVoteRecordSet } from './vote-record.js';
import type { AgentVoteResult } from '../cli/vote-types.js';
import type { VoterRole } from '../cli/vote-types.js';
import type { Vote } from '../consensus/types.js';
import type { ConsensusResult } from '../consensus/types.js';

function agentVote(
  role: VoterRole,
  decision: Vote['decision'],
  source: AgentVoteResult['source'] = 'llm'
): AgentVoteResult {
  return {
    role,
    vote: { decision, confidence: 0.8, reasoning: 'because' },
    processingTimeMs: 10,
    source,
  };
}

function consensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  const now = '2026-09-06T00:00:00.000Z';
  return {
    proposalId: 'p-1',
    proposal: { title: 'T', description: 'D', algorithm: 'higher_order' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 6, reject: 0, abstain: 0, total: 6 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 5,
    ...overrides,
  };
}

/** Six live voters plus one that errored — the 2026-09-05 ratification shape. */
const sixOfSeven: readonly AgentVoteResult[] = [
  agentVote('architect', 'approve'),
  agentVote('security', 'approve'),
  agentVote('devex', 'approve'),
  agentVote('ai_ml', 'approve'),
  agentVote('pm', 'approve'),
  agentVote('catfish', 'approve'),
  agentVote('scope_steward', 'abstain', 'error'),
];

describe('panelCoverage (#5738)', () => {
  it('names the errored role and counts it', () => {
    const record = buildVoteRecord({
      resolvedDecision: undefined,
      id: 'vote-degraded',
      proposal: 'Ratify PR #5465',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: sixOfSeven,
    });

    expect(record.panelCoverage).toEqual({
      requested: 7,
      responded: 6,
      errored: 1,
      erroredRoles: ['scope_steward'],
    });
    // The record must not read as a clean six-voter panel any more.
    expect(record.version).toBe('1.5');
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('reports every errored role of a badly degraded panel', () => {
    const fourErrored: readonly AgentVoteResult[] = [
      agentVote('architect', 'abstain', 'error'),
      agentVote('security', 'approve'),
      agentVote('devex', 'approve'),
      agentVote('ai_ml', 'abstain', 'error'),
      agentVote('pm', 'abstain', 'error'),
      agentVote('catfish', 'reject'),
      agentVote('scope_steward', 'abstain', 'error'),
    ];
    const record = buildVoteRecord({
      resolvedDecision: 'no_quorum',
      id: 'vote-no-quorum',
      proposal: 'Ratify PR #5722',
      strategy: 'supermajority',
      result: consensusResult({
        voteCounts: { approve: 2, reject: 1, abstain: 0, total: 3 },
        approvalPercentage: 66.7,
      }),
      votes: fourErrored,
    });

    expect(record.panelCoverage?.errored).toBe(4);
    expect(record.panelCoverage?.responded).toBe(3);
    expect(record.panelCoverage?.erroredRoles).toEqual([
      'architect',
      'ai_ml',
      'pm',
      'scope_steward',
    ]);
  });

  it('omits the field entirely when the whole panel responded', () => {
    // Absence is the pre-1.5 projection: a clean panel must re-hash exactly as
    // it did before, so every historical record still verifies.
    const record = buildVoteRecord({
      resolvedDecision: undefined,
      id: 'vote-clean',
      proposal: 'Ratify something uneventful',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: sixOfSeven.slice(0, 6),
    });

    expect(record.panelCoverage).toBeUndefined();
    expect(record.version).toBe('1.2');
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });
});
