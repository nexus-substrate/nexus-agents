/**
 * Tests for the authentic vote-record hash chain (#3897). The core property:
 * tampering with a persisted record (flipping `decision`, altering
 * `approvalPercentage`, editing a voter) is DETECTED as a `hash_mismatch`,
 * because the chain hash covers the full payload — not just head fields.
 *
 * @module audit/vote-record.test
 */

import { describe, it, expect } from 'vitest';

import type { VoteRecord } from './vote-record.js';
import { computeVoteRecordHash, verifyVoteRecordChain } from './vote-record.js';

function makeRecord(
  id: string,
  previousHash: string | undefined,
  overrides: Partial<Omit<VoteRecord, 'hash'>> = {}
): VoteRecord {
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.0',
    id,
    recordedAt: '2026-06-15T00:00:00.000Z',
    proposalHash: 'a'.repeat(64),
    proposal: 'Promote loop X from advisory to enforce',
    strategy: 'higher_order',
    decision: 'approved',
    approvalPercentage: 85.7,
    voteCounts: { approve: 6, reject: 1, abstain: 0, total: 7 },
    voters: [
      { role: 'architect', decision: 'approve', confidence: 0.9 },
      { role: 'security', decision: 'reject', confidence: 0.6 },
    ],
    ...(previousHash !== undefined ? { previousHash } : {}),
    ...overrides,
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

function chain(...records: VoteRecord[]): VoteRecord[] {
  // Re-link each record onto the prior one's hash, then rehash.
  const out: VoteRecord[] = [];
  let prev: string | undefined;
  for (const r of records) {
    const payload: Omit<VoteRecord, 'hash'> = {
      version: r.version,
      id: r.id,
      recordedAt: r.recordedAt,
      proposalHash: r.proposalHash,
      proposal: r.proposal,
      strategy: r.strategy,
      decision: r.decision,
      approvalPercentage: r.approvalPercentage,
      voteCounts: r.voteCounts,
      voters: r.voters,
      ...(r.correlationId !== undefined ? { correlationId: r.correlationId } : {}),
      ...(prev !== undefined ? { previousHash: prev } : {}),
    };
    const linked: VoteRecord = { ...payload, hash: computeVoteRecordHash(payload) };
    out.push(linked);
    prev = linked.hash;
  }
  return out;
}

describe('verifyVoteRecordChain', () => {
  it('verifies an empty chain trivially', () => {
    expect(verifyVoteRecordChain([])).toEqual({ ok: true, recordCount: 0 });
  });

  it('verifies a well-formed single-record chain', () => {
    const records = chain(makeRecord('vote-1', undefined));
    expect(verifyVoteRecordChain(records)).toEqual({ ok: true, recordCount: 1 });
  });

  it('verifies a multi-record chain that round-trips', () => {
    const records = chain(
      makeRecord('vote-1', undefined),
      makeRecord('vote-2', undefined, { decision: 'rejected', approvalPercentage: 28.5 }),
      makeRecord('vote-3', undefined)
    );
    expect(verifyVoteRecordChain(records)).toEqual({ ok: true, recordCount: 3 });
  });

  it('DETECTS a flipped decision (rejected → approved) as hash_mismatch', () => {
    const records = chain(makeRecord('vote-1', undefined, { decision: 'rejected' }));
    // Forge: flip the decision on the persisted record WITHOUT rehashing.
    const tampered: VoteRecord[] = [{ ...records[0]!, decision: 'approved' }];
    const result = verifyVoteRecordChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.recordId).toBe('vote-1');
    }
  });

  it('DETECTS an altered approvalPercentage as hash_mismatch', () => {
    const records = chain(makeRecord('vote-1', undefined, { approvalPercentage: 51 }));
    const tampered: VoteRecord[] = [{ ...records[0]!, approvalPercentage: 99 }];
    const result = verifyVoteRecordChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an edited voter summary as hash_mismatch', () => {
    const records = chain(makeRecord('vote-1', undefined));
    const tampered: VoteRecord[] = [
      {
        ...records[0]!,
        voters: [{ role: 'security', decision: 'approve', confidence: 0.99 }],
      },
    ];
    const result = verifyVoteRecordChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS a broken back-link (re-ordered / spliced record) as previous_hash_mismatch', () => {
    const records = chain(
      makeRecord('vote-1', undefined),
      makeRecord('vote-2', undefined),
      makeRecord('vote-3', undefined)
    );
    // Drop the middle record: vote-3's previousHash no longer matches vote-1's hash.
    const spliced = [records[0]!, records[2]!];
    const result = verifyVoteRecordChain(spliced);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('previous_hash_mismatch');
      expect(result.recordIndex).toBe(1);
    }
  });
});
