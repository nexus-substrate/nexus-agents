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
import { createHash } from 'node:crypto';

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

  it('verifies a record whose nested voteCounts keys were reordered (#3962, hash is order-independent)', () => {
    // A writer-produced record (canonical voteCounts key order).
    const canonical = makeRecord('vote-1', 0);
    // Simulate a formatter / `jq -S` / merge tool reordering the nested
    // voteCounts keys (total, abstain, reject, approve) WITHOUT touching `hash`.
    // Pre-fix this flipped the record to hash_mismatch; now it must still verify.
    const reordered: VoteRecord = {
      ...canonical,
      voteCounts: { total: 7, abstain: 0, reject: 1, approve: 6 },
    };
    // Sanity: the values are identical, only key insertion order differs.
    expect(JSON.stringify(reordered.voteCounts)).not.toBe(JSON.stringify(canonical.voteCounts));
    expect(verifyVoteRecordSet([reordered])).toEqual({ ok: true, recordCount: 1 });
  });

  it('produces the SAME hash for canonical-order voteCounts before/after reorder (#3962, no rehash needed)', () => {
    // Lock the order-independence: a payload with canonical key order and the
    // same payload with reordered voteCounts keys must hash identically. This
    // guarantees existing writer-produced (canonical-order) records still verify
    // unchanged — the fix does NOT alter the hash of a canonical record.
    const base: Omit<VoteRecord, 'hash'> = {
      version: '1.1',
      id: 'vote-hash-lock',
      sequence: 0,
      recordedAt: '2026-06-15T00:00:00.000Z',
      proposalHash: 'b'.repeat(64),
      proposal: 'lock the canonical hash',
      strategy: 'higher_order',
      decision: 'approved',
      approvalPercentage: 85.7,
      voteCounts: { approve: 6, reject: 1, abstain: 0, total: 7 },
      voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
    };
    const reordered: Omit<VoteRecord, 'hash'> = {
      ...base,
      voteCounts: { total: 7, abstain: 0, reject: 1, approve: 6 },
    };
    expect(computeVoteRecordHash(reordered)).toBe(computeVoteRecordHash(base));
    // And a record built from the canonical payload self-verifies.
    const record: VoteRecord = { ...base, hash: computeVoteRecordHash(base) };
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
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

describe('ratifies subject-binding field (#3927 item 1, schema 1.2)', () => {
  it('verifies a 1.2 record that carries ratifies', () => {
    const record = makeRecord('vote-1', 0, { version: '1.2', ratifies: 'loop:dev-pipeline' });
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('folds ratifies into the self-hash — editing it is a hash_mismatch', () => {
    const record = makeRecord('vote-1', 0, { version: '1.2', ratifies: 'loop:dev-pipeline' });
    // An attacker repoints the ratified subject without recomputing the hash.
    const tampered: VoteRecord = { ...record, ratifies: 'loop:some-other-loop' };
    const result = verifyVoteRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('detects ADDING a ratifies field to a record that had none (forgery)', () => {
    const record = makeRecord('vote-1', 0); // no ratifies — hash computed without it
    const forged: VoteRecord = { ...record, ratifies: 'loop:promote-me' };
    const result = verifyVoteRecordSet([forged]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('detects REMOVING a ratifies field from a record that had one (forgery)', () => {
    const record = makeRecord('vote-1', 0, { version: '1.2', ratifies: 'loop:promote-me' });
    const forged: VoteRecord = { ...record };
    delete forged.ratifies; // strip the field the hash was computed over
    const result = verifyVoteRecordSet([forged]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('back-compat: a record WITHOUT ratifies hashes byte-identically to the pre-1.2 projection', () => {
    // The hash of a no-ratifies payload must not change when the `ratifies`
    // capability is added — historical 1.1 records must re-verify unchanged. We
    // prove the canonical projection omits the key entirely (not `ratifies:null`).
    const payload: Omit<VoteRecord, 'hash'> = {
      version: '1.1',
      id: 'vote-legacy',
      sequence: 0,
      recordedAt: '2026-06-15T00:00:00.000Z',
      proposalHash: 'b'.repeat(64),
      proposal: 'legacy proposal',
      strategy: 'higher_order',
      decision: 'approved',
      approvalPercentage: 85.7,
      voteCounts: { approve: 6, reject: 1, abstain: 0, total: 7 },
      voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
    };
    // Recompute the expected hash from the exact pre-1.2 canonical projection
    // (correlationId folded as null, NO ratifies key).
    const expectedCanonical = JSON.stringify({
      version: '1.1',
      id: 'vote-legacy',
      sequence: 0,
      recordedAt: '2026-06-15T00:00:00.000Z',
      proposalHash: 'b'.repeat(64),
      proposal: 'legacy proposal',
      strategy: 'higher_order',
      decision: 'approved',
      approvalPercentage: 85.7,
      voteCounts: { approve: 6, reject: 1, abstain: 0, total: 7 },
      voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
      correlationId: null,
    });
    const expected = createHash('sha256').update(expectedCanonical).digest('hex');
    expect(computeVoteRecordHash(payload)).toBe(expected);
    expect(verifyVoteRecordSet([{ ...payload, hash: expected }])).toEqual({
      ok: true,
      recordCount: 1,
    });
  });
});
