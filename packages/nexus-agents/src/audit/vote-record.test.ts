/**
 * Tests for the authentic vote-record TAMPER-EVIDENT RECORD SET (#3897, model
 * revised #3927). Core properties:
 *  - tampering with a persisted record (flipping `decision`, altering
 *    `approvalPercentage`, editing a voter) is DETECTED as a `hash_mismatch`,
 *    because the self-hash covers the full payload (+ `sequence`), not just head
 *    fields;
 *  - the ledger is a SET, not a chain: order does not matter, concurrent forks
 *    (duplicate sequences) are benign, and omission shows up as a `sequence_gap`.
 *
 * @module audit/vote-record.test
 */

import { describe, it, expect } from 'vitest';

import type { VoteRecord } from './vote-record.js';
import { computeVoteRecordHash, verifyVoteRecordSet } from './vote-record.js';

/**
 * Build a self-hashed record at `sequence`. `previousHash` is advisory (NOT
 * covered by the hash) — set it to prove verification ignores it.
 */
function makeRecord(
  id: string,
  sequence: number,
  overrides: Partial<Omit<VoteRecord, 'hash'>> = {}
): VoteRecord {
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.1',
    id,
    sequence,
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
    ...overrides,
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

describe('verifyVoteRecordSet', () => {
  it('verifies an empty set trivially', () => {
    expect(verifyVoteRecordSet([])).toEqual({ ok: true, recordCount: 0 });
  });

  it('verifies a well-formed single record', () => {
    expect(verifyVoteRecordSet([makeRecord('vote-1', 0)])).toEqual({ ok: true, recordCount: 1 });
  });

  it('verifies a multi-record set that round-trips', () => {
    const records = [
      makeRecord('vote-1', 0),
      makeRecord('vote-2', 1, { decision: 'rejected', approvalPercentage: 28.5 }),
      makeRecord('vote-3', 2),
    ];
    expect(verifyVoteRecordSet(records)).toEqual({ ok: true, recordCount: 3 });
  });

  it('ignores an advisory previousHash entirely (position-independent self-hash)', () => {
    // A bogus previousHash must NOT affect verification — it is not hashed.
    const records = [
      makeRecord('vote-1', 0, { previousHash: 'f'.repeat(64) }),
      makeRecord('vote-2', 1, { previousHash: '9'.repeat(64) }),
    ];
    expect(verifyVoteRecordSet(records)).toEqual({ ok: true, recordCount: 2 });
  });

  it('tolerates file lines reordered relative to sequence (it is a set)', () => {
    const r0 = makeRecord('vote-1', 0);
    const r1 = makeRecord('vote-2', 1);
    const r2 = makeRecord('vote-3', 2);
    // Lines out of sequence order — still ok:true.
    expect(verifyVoteRecordSet([r2, r0, r1])).toEqual({ ok: true, recordCount: 3 });
  });

  it('DETECTS a flipped decision (rejected → approved) as hash_mismatch', () => {
    const record = makeRecord('vote-1', 0, { decision: 'rejected' });
    // Forge: flip the decision WITHOUT rehashing.
    const tampered: VoteRecord[] = [{ ...record, decision: 'approved' }];
    const result = verifyVoteRecordSet(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.recordId).toBe('vote-1');
    }
  });

  it('DETECTS an altered approvalPercentage as hash_mismatch', () => {
    const record = makeRecord('vote-1', 0, { approvalPercentage: 51 });
    const tampered: VoteRecord[] = [{ ...record, approvalPercentage: 99 }];
    const result = verifyVoteRecordSet(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an edited voter summary as hash_mismatch', () => {
    const record = makeRecord('vote-1', 0);
    const tampered: VoteRecord[] = [
      { ...record, voters: [{ role: 'security', decision: 'approve', confidence: 0.99 }] },
    ];
    const result = verifyVoteRecordSet(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS a tampered sequence as hash_mismatch (sequence is covered by the hash)', () => {
    const record = makeRecord('vote-1', 1);
    const tampered: VoteRecord[] = [{ ...record, sequence: 0 }];
    const result = verifyVoteRecordSet(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an omitted middle record as sequence_gap', () => {
    // Build 0,1,2 then drop sequence 1 — a gap in the 0..2 run.
    const spliced = [makeRecord('vote-1', 0), makeRecord('vote-3', 2)];
    const result = verifyVoteRecordSet(spliced);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('sequence_gap');
      expect(result.detail).toContain('missing sequence 1');
    }
  });

  it('treats DUPLICATE sequences (concurrent fork) as benign and surfaces them in forks', () => {
    // Two branches each appended sequence 1 from the same tip, then merged.
    const records = [
      makeRecord('vote-1', 0),
      makeRecord('vote-2a', 1, { proposal: 'branch A proposal' }),
      makeRecord('vote-2b', 1, { proposal: 'branch B proposal' }),
    ];
    const result = verifyVoteRecordSet(records);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recordCount).toBe(3);
      expect(result.forks).toEqual([1]);
    }
  });
});
