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

import { describe, it, expect, expectTypeOf } from 'vitest';
import { createHash } from 'node:crypto';

import type { FallbackReason } from '../cli/vote-types.js';
import type { VoteRecord, VoterSummary } from './vote-record.js';
import { VoteRecordSchema, computeVoteRecordHash, verifyVoteRecordSet } from './vote-record.js';

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
    // #5818: `ok: true` alone could not distinguish a verified set from an
    // absent one. `notVerified` says which, matching `verifyChain`.
    expect(verifyVoteRecordSet([])).toEqual({ ok: true, recordCount: 0, notVerified: 'empty' });
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

  it('does NOT detect a deleted fork PARTNER — documented residual gap (#4011)', () => {
    // A fork resolved {approve @1, reject @1}. The `reject` partner is deleted,
    // leaving its `approve` survivor occupying sequence 1. No 0..maxSeq hole
    // appears, so verification still returns ok — sequence-gap omission detection
    // canNOT catch a deleted fork partner. This pins the disclosed limitation;
    // if a future change makes this detectable, update the vote-record.ts docs.
    const survivorOnly = [makeRecord('vote-1', 0), makeRecord('vote-2a', 1)];
    const result = verifyVoteRecordSet(survivorOnly);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // No `forks` surfaced (only one record now carries sequence 1) and no gap —
      // the deletion is invisible to verification, exactly as documented.
      expect(result.forks).toBeUndefined();
      expect(result.recordCount).toBe(2);
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

// ============================================================================
// optionTally — multi-option vote fidelity (#4452)
// ============================================================================

/** Strip the self-hash so a payload can be re-hashed with a variation applied. */
function payloadOf(record: VoteRecord): Omit<VoteRecord, 'hash'> {
  const copy: Record<string, unknown> = { ...record };
  delete copy['hash'];
  return copy as Omit<VoteRecord, 'hash'>;
}

describe('optionTally (#4452)', () => {
  it('leaves the hash BYTE-IDENTICAL for a record without it', () => {
    // The load-bearing back-compat property. Every historical 1.1/1.2 record
    // lacks optionTally; if adding the field changed their projection, the whole
    // persisted chain would flip to hash_mismatch — breaking the audit trail in
    // the act of fixing its fidelity. Mirrors how `ratifies` was folded in.
    const payload: Omit<VoteRecord, 'hash'> = {
      version: '1.1',
      id: 'r1',
      sequence: 0,
      recordedAt: '2026-06-15T00:00:00.000Z',
      proposalHash: 'a'.repeat(64),
      proposal: 'p',
      strategy: 'higher_order',
      decision: 'approved',
      approvalPercentage: 100,
      voteCounts: { approve: 7, reject: 0, abstain: 0, total: 7 },
      voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
    };
    // PINNED LITERAL, not a self-comparison. Recomputing the hash and comparing
    // it to itself cannot detect a projection change — mutation testing caught
    // exactly that weakness in the first version of this test. This constant is
    // the pre-#4452 projection; if a change alters it, historical records stop
    // verifying, and this fails.
    const PRE_4452 = 'edecd8cd8ea8d978733c73c77ffeddea85b04339b62db4c665b32165468c49a6';
    expect(computeVoteRecordHash(payload)).toBe(PRE_4452);
    // An explicitly-undefined tally must also take the absent path.
    expect(computeVoteRecordHash({ ...payload, optionTally: undefined })).toBe(PRE_4452);
  });

  it('changes the hash when present — the tally is tamper-evident', () => {
    const payload = payloadOf(makeRecord('r2', 0));
    const withTally = computeVoteRecordHash({
      ...payload,
      optionTally: [
        { option: 'A', count: 6 },
        { option: 'C', count: 1 },
      ],
    });
    expect(withTally).not.toBe(computeVoteRecordHash(payload));
  });

  it('is order-independent within the tally, like every other nested object', () => {
    const payload = payloadOf(makeRecord('r3', 0));
    const a = computeVoteRecordHash({
      ...payload,
      optionTally: [
        { option: 'A', count: 6 },
        { option: 'C', count: 1 },
      ],
    });
    // Same tally, keys of each entry written in the other order.
    const b = computeVoteRecordHash({
      ...payload,
      optionTally: [
        { count: 6, option: 'A' },
        { count: 1, option: 'C' },
      ],
    });
    expect(b).toBe(a);
  });

  it('distinguishes a 6-1 split from a 7-0 unanimity at equal approve counts', () => {
    // The #4452 defect in one assertion: both records are approve:7 / reject:0,
    // and today they are indistinguishable. With the tally they are not.
    const payload = payloadOf(
      makeRecord('r4', 0, { voteCounts: { approve: 7, reject: 0, abstain: 0, total: 7 } })
    );
    const split = computeVoteRecordHash({
      ...payload,
      optionTally: [
        { option: 'A', count: 6 },
        { option: 'C', count: 1 },
      ],
    });
    const unanimous = computeVoteRecordHash({
      ...payload,
      optionTally: [{ option: 'A', count: 7 }],
    });
    expect(split).not.toBe(unanimous);
  });
});

describe('one canonical voter-field order (#6057)', () => {
  // The voter-entry field list was enumerated in three places with nothing
  // linking them: the schema (what can be READ), the hash projection (what is
  // ATTESTED), and the builder (what is WRITTEN). #6049 and #6050 were both
  // that drift. Now one explicit tuple drives the projection and is compile-
  // checked against the schema in both directions.
  const MAXIMAL_1_7 = {
    version: '1.7' as const,
    id: 'vote-max',
    sequence: 0,
    recordedAt: '2026-06-15T00:00:00.000Z',
    proposalHash: 'c'.repeat(64),
    proposal: 'max',
    strategy: 'higher_order' as const,
    decision: 'approved' as const,
    approvalPercentage: 100,
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    voters: [
      {
        role: 'security' as const,
        decision: 'approve' as const,
        confidence: 0.9,
        reasoning: 'grounds',
        reasoningTruncated: true as const,
        retried: true as const,
      },
    ],
  };

  it('pins the MAXIMAL 1.7 entry — every voter field present — to a golden captured by execution', () => {
    // Captured on the pre-refactor projection BEFORE the tuple existed, and it
    // matched the plan's hand derivation. If this moves, a historical hash moved.
    expect(computeVoteRecordHash(MAXIMAL_1_7 as never)).toBe(
      '954c1f7aa2a4097a8e8964597791487f3d732f309469afb87c869bbed1e3b422'
    );
  });

  it("reordering a voter entry's keys does not change the hash", () => {
    // The projection rebuilds in canonical order, so a formatter or merge tool
    // that reorders object keys must not flip a legitimate record to
    // hash_mismatch. No voter-level test asserted this before.
    const v = MAXIMAL_1_7.voters[0]!;
    const reordered = {
      retried: v.retried,
      reasoning: v.reasoning,
      confidence: v.confidence,
      reasoningTruncated: v.reasoningTruncated,
      decision: v.decision,
      role: v.role,
    };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_7, voters: [reordered] })).toBe(
      computeVoteRecordHash(MAXIMAL_1_7 as never)
    );
  });

  it('an explicitly-undefined optional hashes identically to an absent one', () => {
    // Present-only means "has a value", not "has a key".
    const v = MAXIMAL_1_7.voters[0]!;
    const { retried: _r, ...withoutRetried } = v;
    const explicitUndefined = { ...withoutRetried, retried: undefined };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_7, voters: [explicitUndefined] })).toBe(
      computeVoteRecordHash({ ...MAXIMAL_1_7, voters: [withoutRetried] })
    );
  });

  it('the pair: dropping a present flag DOES move the hash', () => {
    // Without this, a projection that ignored `retried` entirely would pass the
    // two tests above.
    const v = MAXIMAL_1_7.voters[0]!;
    const { retried: _r, ...withoutRetried } = v;
    expect(computeVoteRecordHash({ ...MAXIMAL_1_7, voters: [withoutRetried] })).not.toBe(
      computeVoteRecordHash(MAXIMAL_1_7 as never)
    );
  });

  it('a 1.7 entry with the 1.8 keys explicitly undefined still hashes to the 1.7 golden (#6091, #6094)', () => {
    // The back-compat property stated directly: the SAME voter, with only the
    // pre-1.8 keys carrying values, projects to the same canonical string
    // whether or not the code knows about 1.8. Compared to the pinned 1.7
    // golden, not to a self-computed value.
    const v = MAXIMAL_1_7.voters[0]!;
    const asIf18 = { ...v, model: undefined, unverifiable: undefined };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_7, voters: [asIf18] })).toBe(
      '954c1f7aa2a4097a8e8964597791487f3d732f309469afb87c869bbed1e3b422'
    );
  });
});

describe('schema 1.8: `model` and `unverifiable` per seat (#6091, #6094)', () => {
  // Same tier logic as 1.7: both fields are appended PRESENT-ONLY after
  // `retried`, so every 1.7-and-earlier entry projects byte-identically. The
  // 1.7 golden above and PRE_4452 are the guard for that; this block pins the
  // new maximal form.
  const MAXIMAL_1_8 = {
    version: '1.8' as const,
    id: 'vote-max-18',
    sequence: 0,
    recordedAt: '2026-09-10T00:00:00.000Z',
    proposalHash: 'd'.repeat(64),
    proposal: 'max',
    strategy: 'supermajority' as const,
    decision: 'no_quorum' as const,
    approvalPercentage: 0,
    voteCounts: { approve: 0, reject: 0, abstain: 1, total: 1 },
    voters: [
      {
        role: 'scope_steward' as const,
        decision: 'abstain' as const,
        confidence: 0,
        reasoning: "repository reads failed with 'bwrap: loopback: Failed RTM_NEWADDR'",
        reasoningTruncated: true as const,
        retried: true as const,
        model: 'codex-5.3',
        unverifiable: true as const,
      },
    ],
  };

  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    const parsed = VoteRecordSchema.safeParse({
      ...MAXIMAL_1_8,
      hash: computeVoteRecordHash(MAXIMAL_1_8),
    });
    expect(parsed.success).toBe(true);
  });

  it('pins the MAXIMAL 1.8 entry to a golden captured by execution', () => {
    // Captured by running `computeVoteRecordHash` on this exact fixture once
    // the projection carried both fields, then pinned. If it moves, the
    // canonical voter order or the present-only rule changed.
    expect(computeVoteRecordHash(MAXIMAL_1_8)).toBe(
      'eaba3ce41c8dd4208b126bc907cd7978bc305b38c361766495edcd8ad4864fcd'
    );
  });

  it("reordering a 1.8 voter entry's keys does not change the hash", () => {
    const v = MAXIMAL_1_8.voters[0]!;
    const reordered = {
      unverifiable: v.unverifiable,
      model: v.model,
      retried: v.retried,
      reasoning: v.reasoning,
      confidence: v.confidence,
      reasoningTruncated: v.reasoningTruncated,
      decision: v.decision,
      role: v.role,
    };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_8, voters: [reordered] })).toBe(
      computeVoteRecordHash(MAXIMAL_1_8)
    );
  });

  it('an explicitly-undefined model or flag hashes identically to an absent one', () => {
    const v = MAXIMAL_1_8.voters[0]!;
    const { model: _m, unverifiable: _u, ...bare } = v;
    const explicit = { ...bare, model: undefined, unverifiable: undefined };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_8, voters: [explicit] })).toBe(
      computeVoteRecordHash({ ...MAXIMAL_1_8, voters: [bare] })
    );
  });

  it('dropping `model` alone moves the hash; dropping `unverifiable` alone moves it too', () => {
    const v = MAXIMAL_1_8.voters[0]!;
    const { model: _m, ...withoutModel } = v;
    const { unverifiable: _u, ...withoutFlag } = v;
    const full = computeVoteRecordHash(MAXIMAL_1_8);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_8, voters: [withoutModel] })).not.toBe(full);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_8, voters: [withoutFlag] })).not.toBe(full);
  });
});

describe('schema 1.9: `assignedCli` and `fallback` per seat (#6115)', () => {
  // Same tier logic as 1.8: both keys are appended PRESENT-ONLY after
  // `unverifiable`, so every 1.8-and-earlier entry projects byte-identically.
  // The 1.7 and 1.8 goldens above are the guard for that; this block pins the
  // new maximal form. `fallback` is the first NESTED voter field, so its own
  // keys are rebuilt in canonical order too (#3962) — the reorder test below
  // reorders both levels.
  const MAXIMAL_1_9 = {
    version: '1.9' as const,
    id: 'vote-max-19',
    sequence: 0,
    recordedAt: '2026-09-13T00:00:00.000Z',
    proposalHash: 'e'.repeat(64),
    proposal: 'max',
    strategy: 'supermajority' as const,
    decision: 'approved' as const,
    approvalPercentage: 100,
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    voters: [
      {
        role: 'devex' as const,
        decision: 'approve' as const,
        confidence: 0.8,
        reasoning: 'grounds',
        reasoningTruncated: true as const,
        retried: true as const,
        model: 'gemini-3.1-pro-preview',
        unverifiable: true as const,
        assignedCli: 'codex',
        fallback: { fromCli: 'codex', fromModel: 'codex-5.3', reason: 'capacity' as const },
      },
    ],
  };

  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    const parsed = VoteRecordSchema.safeParse({
      ...MAXIMAL_1_9,
      hash: computeVoteRecordHash(MAXIMAL_1_9),
    });
    expect(parsed.success).toBe(true);
  });

  it('pins the MAXIMAL 1.9 entry to a golden captured by execution', () => {
    // Captured by running `computeVoteRecordHash` on this exact fixture once
    // the projection carried both fields, then pinned. If it moves, the
    // canonical voter order, the nested fallback order, or the present-only
    // rule changed.
    expect(computeVoteRecordHash(MAXIMAL_1_9)).toBe(
      '11457d041d2adcbd4c2f3c5def01e69d008d0fa105b60c720bf84d2543085228'
    );
  });

  it('a 1.8 entry with the 1.9 keys explicitly undefined still hashes to the 1.8 golden', () => {
    // The back-compat property stated directly, against the PINNED 1.8
    // golden rather than a self-computed value: a record that lacks the new
    // keys must not move.
    const v18 = {
      role: 'scope_steward' as const,
      decision: 'abstain' as const,
      confidence: 0,
      reasoning: "repository reads failed with 'bwrap: loopback: Failed RTM_NEWADDR'",
      reasoningTruncated: true as const,
      retried: true as const,
      model: 'codex-5.3',
      unverifiable: true as const,
      assignedCli: undefined,
      fallback: undefined,
    };
    const record18 = {
      version: '1.8' as const,
      id: 'vote-max-18',
      sequence: 0,
      recordedAt: '2026-09-10T00:00:00.000Z',
      proposalHash: 'd'.repeat(64),
      proposal: 'max',
      strategy: 'supermajority' as const,
      decision: 'no_quorum' as const,
      approvalPercentage: 0,
      voteCounts: { approve: 0, reject: 0, abstain: 1, total: 1 },
      voters: [v18],
    };
    expect(computeVoteRecordHash(record18)).toBe(
      'eaba3ce41c8dd4208b126bc907cd7978bc305b38c361766495edcd8ad4864fcd'
    );
  });

  it("reordering a 1.9 voter entry's keys — and the nested fallback's — does not change the hash", () => {
    const v = MAXIMAL_1_9.voters[0]!;
    const reordered = {
      fallback: {
        reason: v.fallback.reason,
        fromModel: v.fallback.fromModel,
        fromCli: v.fallback.fromCli,
      },
      assignedCli: v.assignedCli,
      unverifiable: v.unverifiable,
      model: v.model,
      retried: v.retried,
      reasoning: v.reasoning,
      confidence: v.confidence,
      reasoningTruncated: v.reasoningTruncated,
      decision: v.decision,
      role: v.role,
    };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [reordered] })).toBe(
      computeVoteRecordHash(MAXIMAL_1_9)
    );
  });

  it('an explicitly-undefined assignedCli, fallback or fromModel hashes identically to an absent one', () => {
    const v = MAXIMAL_1_9.voters[0]!;
    const { assignedCli: _a, fallback: _f, ...bare } = v;
    const explicit = { ...bare, assignedCli: undefined, fallback: undefined };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [explicit] })).toBe(
      computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [bare] })
    );
    const { fromModel: _m, ...fallbackWithoutModel } = v.fallback;
    const explicitNested = { ...v, fallback: { ...fallbackWithoutModel, fromModel: undefined } };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [explicitNested] })).toBe(
      computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [{ ...v, fallback: fallbackWithoutModel }] })
    );
  });

  it('dropping `assignedCli` alone moves the hash; dropping `fallback` alone moves it; dropping `fromModel` alone moves it', () => {
    const v = MAXIMAL_1_9.voters[0]!;
    const { assignedCli: _a, ...withoutAssigned } = v;
    const { fallback: _f, ...withoutFallback } = v;
    const { fromModel: _m, ...fallbackWithoutModel } = v.fallback;
    const full = computeVoteRecordHash(MAXIMAL_1_9);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [withoutAssigned] })).not.toBe(full);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [withoutFallback] })).not.toBe(full);
    expect(
      computeVoteRecordHash({ ...MAXIMAL_1_9, voters: [{ ...v, fallback: fallbackWithoutModel }] })
    ).not.toBe(full);
  });

  it('the read schema accepts exactly the live `SeatFallback` shape and nothing wider', () => {
    const base = { ...MAXIMAL_1_9, hash: computeVoteRecordHash(MAXIMAL_1_9) };
    const v = MAXIMAL_1_9.voters[0]!;
    const withKey = (fallback: unknown): unknown => ({ ...base, voters: [{ ...v, fallback }] });
    expect(
      VoteRecordSchema.safeParse(withKey({ fromCli: 'codex', reason: 'unknown' })).success
    ).toBe(true);
    // An unknown reason class, a missing `fromCli`, and an extra key are all
    // refused: the record must not accept a shape the live result cannot emit.
    expect(VoteRecordSchema.safeParse(withKey({ fromCli: 'codex', reason: 'bored' })).success).toBe(
      false
    );
    expect(VoteRecordSchema.safeParse(withKey({ reason: 'timeout' })).success).toBe(false);
    expect(
      VoteRecordSchema.safeParse(withKey({ fromCli: 'codex', reason: 'timeout', toCli: 'gemini' }))
        .success
    ).toBe(false);
  });

  it('the recorded reason vocabulary IS the live FallbackReason — neither side can drift alone', () => {
    // A class added to `FallbackReason` without the schema learning it would
    // make the #6054 write-time validation refuse every record that carries
    // it; a class in the schema the live type lacks would accept a record no
    // producer can write. Checked by `pnpm typecheck`, not at runtime.
    expectTypeOf<NonNullable<VoterSummary['fallback']>['reason']>().toEqualTypeOf<FallbackReason>();
  });
});
