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

import type { FallbackReason, RetriedFrom } from '../cli/vote-types.js';
import type { ErrorPolicy } from '../mcp/tools/consensus-vote-types.js';
import type { VoteRecord, VoterSummary } from './vote-record.js';
import {
  computeReasoningDigest,
  findReasoningCommitmentDefect,
  mintReasoningNonce,
} from './reasoning-commitment.js';
import {
  MAX_VOTER_REASONING_CHARS,
  VOTE_RECORD_SIGNATURE_NAMESPACE,
  VoteRecordSchema,
  computeVoteRecordHash,
  verifyVoteRecordSet,
} from './vote-record.js';

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

describe('schema 1.10: `ratifiesPr` PR-ratification binding (#5130 step 1)', () => {
  // Record-level, present-only, folded AFTER `ratifies` — the last key in the
  // canonical projection — so every 1.9-and-earlier record projects
  // byte-identically. The 1.9 golden above is the guard for that; this block
  // pins the new maximal RECORD form (every record-level optional present, not
  // just every voter field) and proves the binding is tamper-evident.
  const MAXIMAL_1_10 = {
    version: '1.10' as const,
    id: 'vote-max-110',
    sequence: 3,
    recordedAt: '2026-09-14T00:00:00.000Z',
    proposalHash: 'f'.repeat(64),
    proposal: 'Ratify PR #6200 at its head',
    strategy: 'supermajority' as const,
    decision: 'approved' as const,
    approvalPercentage: 100,
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    voters: [
      {
        role: 'architect' as const,
        decision: 'approve' as const,
        confidence: 0.9,
        reasoning: 'grounds',
        model: 'claude-opus',
        assignedCli: 'claude',
      },
    ],
    correlationId: 'consensus-1-abcdef01',
    optionTally: [{ option: 'A', count: 1 }],
    optionCoverage: { approverCount: 1, selectedCount: 1, unattributedApprovals: 0 },
    panelCoverage: { requested: 2, responded: 1, errored: 1, erroredRoles: ['security'] },
    ratifies: 'loop:dev-pipeline',
    ratifiesPr: { pr: 6200, headSha: '0123456789abcdef0123456789abcdef01234567' },
    previousHash: '9'.repeat(64),
  };

  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    const parsed = VoteRecordSchema.safeParse({
      ...MAXIMAL_1_10,
      hash: computeVoteRecordHash(MAXIMAL_1_10),
    });
    expect(parsed.success).toBe(true);
  });

  it('pins the MAXIMAL 1.10 record to a golden captured by execution', () => {
    // Captured by running `computeVoteRecordHash` on this exact fixture once
    // the projection carried `ratifiesPr`, then pinned. If it moves, the
    // record-level canonical order or the present-only rule changed.
    expect(computeVoteRecordHash(MAXIMAL_1_10)).toBe(
      '587422106245586745a76eb3a3deb5f7121beef80912abb9cf80384d6a8df3b2'
    );
  });

  it('a 1.9 record with `ratifiesPr` explicitly undefined still hashes to the 1.9 golden', () => {
    const record19 = {
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
      ratifiesPr: undefined,
    };
    expect(computeVoteRecordHash(record19)).toBe(
      '11457d041d2adcbd4c2f3c5def01e69d008d0fa105b60c720bf84d2543085228'
    );
  });

  it('editing either binding field is a hash_mismatch — the binding is tamper-evident', () => {
    const record: VoteRecord = { ...MAXIMAL_1_10, hash: computeVoteRecordHash(MAXIMAL_1_10) };
    const repointedPr: VoteRecord = {
      ...record,
      ratifiesPr: { ...MAXIMAL_1_10.ratifiesPr, pr: 6201 },
    };
    const repointedSha: VoteRecord = {
      ...record,
      ratifiesPr: { ...MAXIMAL_1_10.ratifiesPr, headSha: 'a'.repeat(40) },
    };
    for (const tampered of [repointedPr, repointedSha]) {
      const result = verifyVoteRecordSet([tampered]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('hash_mismatch');
    }
  });

  it('detects ADDING a binding to a record that had none, and REMOVING one that had it', () => {
    const unbound = makeRecord('vote-1', 0, { version: '1.2', ratifies: 'loop:x' });
    const forgedIn: VoteRecord = {
      ...unbound,
      ratifiesPr: { pr: 1, headSha: 'b'.repeat(40) },
    };
    expect(verifyVoteRecordSet([forgedIn]).ok).toBe(false);

    const bound: VoteRecord = { ...MAXIMAL_1_10, hash: computeVoteRecordHash(MAXIMAL_1_10) };
    const forgedOut: VoteRecord = { ...bound };
    delete forgedOut.ratifiesPr;
    const result = verifyVoteRecordSet([forgedOut]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it("reordering the binding's keys does not change the hash (#3962 at one more level)", () => {
    const reordered = {
      ...MAXIMAL_1_10,
      ratifiesPr: { headSha: MAXIMAL_1_10.ratifiesPr.headSha, pr: MAXIMAL_1_10.ratifiesPr.pr },
    };
    expect(computeVoteRecordHash(reordered)).toBe(computeVoteRecordHash(MAXIMAL_1_10));
  });

  it('the read schema accepts only a positive-integer PR and a lowercase 40-hex head sha', () => {
    const base = { ...MAXIMAL_1_10, hash: computeVoteRecordHash(MAXIMAL_1_10) };
    const withBinding = (ratifiesPr: unknown): unknown => ({ ...base, ratifiesPr });
    const accepts = (ratifiesPr: unknown): boolean =>
      VoteRecordSchema.safeParse(withBinding(ratifiesPr)).success;
    expect(accepts({ pr: 1, headSha: 'a'.repeat(40) })).toBe(true);
    // Not a commit: too short, uppercase, a branch name.
    expect(accepts({ pr: 1, headSha: 'a'.repeat(39) })).toBe(false);
    expect(accepts({ pr: 1, headSha: 'A'.repeat(40) })).toBe(false);
    expect(accepts({ pr: 1, headSha: 'main' })).toBe(false);
    // Not a PR number: zero, negative, fractional, a string.
    expect(accepts({ pr: 0, headSha: 'a'.repeat(40) })).toBe(false);
    expect(accepts({ pr: -6200, headSha: 'a'.repeat(40) })).toBe(false);
    expect(accepts({ pr: 1.5, headSha: 'a'.repeat(40) })).toBe(false);
    expect(accepts({ pr: '6200', headSha: 'a'.repeat(40) })).toBe(false);
    // An extra key: the binding is exactly {pr, headSha}, nothing wider.
    expect(accepts({ pr: 1, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40) })).toBe(false);
  });
});

/**
 * The maximal 1.10 RECORD (every record-level optional present) and its 1.11
 * extension. Module-scoped so the 1.11 block can pin them and the 1.12 block
 * can prove a 1.11 record still hashes to the 1.11 golden.
 */
const MAXIMAL_1_10_PAYLOAD = {
  version: '1.10' as const,
  id: 'vote-max-110',
  sequence: 3,
  recordedAt: '2026-09-14T00:00:00.000Z',
  proposalHash: 'f'.repeat(64),
  proposal: 'Ratify PR #6200 at its head',
  strategy: 'supermajority' as const,
  decision: 'approved' as const,
  approvalPercentage: 100,
  voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
  voters: [
    {
      role: 'architect' as const,
      decision: 'approve' as const,
      confidence: 0.9,
      reasoning: 'grounds',
      model: 'claude-opus',
      assignedCli: 'claude',
    },
  ],
  correlationId: 'consensus-1-abcdef01',
  optionTally: [{ option: 'A', count: 1 }],
  optionCoverage: { approverCount: 1, selectedCount: 1, unattributedApprovals: 0 },
  panelCoverage: { requested: 2, responded: 1, errored: 1, erroredRoles: ['security'] },
  ratifies: 'loop:dev-pipeline',
  ratifiesPr: { pr: 6200, headSha: '0123456789abcdef0123456789abcdef01234567' },
  previousHash: '9'.repeat(64),
};
const MAXIMAL_1_11 = {
  ...MAXIMAL_1_10_PAYLOAD,
  version: '1.11' as const,
  id: 'vote-max-111',
  errorPolicy: 'absolute_quorum' as const,
};
const GOLDEN_1_10 = '587422106245586745a76eb3a3deb5f7121beef80912abb9cf80384d6a8df3b2';
const GOLDEN_1_11 = 'a8cbec584f9c341125e5378cb5f541ecf53b4e8ce8b162f35f494c63483098cf';

describe('schema 1.11: `errorPolicy` — the policy the panel ran under (#6211)', () => {
  // Record-level, present-only, folded AFTER `ratifiesPr` — the new last key
  // in the canonical projection — so every 1.10-and-earlier record projects
  // byte-identically. The 1.10 golden above is the guard for that; this block
  // pins the new maximal RECORD form and proves the policy is tamper-evident.
  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    const parsed = VoteRecordSchema.safeParse({
      ...MAXIMAL_1_11,
      hash: computeVoteRecordHash(MAXIMAL_1_11),
    });
    expect(parsed.success).toBe(true);
  });

  it('pins the MAXIMAL 1.11 record to a golden captured by execution', () => {
    // Captured by running `computeVoteRecordHash` on this exact fixture once
    // the projection carried `errorPolicy`, then pinned — and reproduced by
    // hand-deriving the canonical string (`errorPolicy` last, after
    // `ratifiesPr`) with `node -e` + sha256. If it moves, the record-level
    // canonical order or the present-only rule changed.
    expect(computeVoteRecordHash(MAXIMAL_1_11)).toBe(GOLDEN_1_11);
  });

  it('a 1.10 record with `errorPolicy` explicitly undefined still hashes to the 1.10 golden', () => {
    // Against the PINNED literal, not a self-computed value: a record that
    // lacks the new key must project exactly as it did before the key existed.
    expect(computeVoteRecordHash({ ...MAXIMAL_1_10_PAYLOAD, errorPolicy: undefined })).toBe(
      GOLDEN_1_10
    );
  });

  it('dropping `errorPolicy` alone moves the hash — the policy is folded, not decorative', () => {
    const { errorPolicy: _dropped, ...without } = MAXIMAL_1_11;
    expect(computeVoteRecordHash(without)).not.toBe(computeVoteRecordHash(MAXIMAL_1_11));
  });

  it('editing the policy is a hash_mismatch — a record cannot be relabelled absolute_quorum after the fact', () => {
    const record: VoteRecord = { ...MAXIMAL_1_11, hash: computeVoteRecordHash(MAXIMAL_1_11) };
    const relabelled: VoteRecord = { ...record, errorPolicy: 'reduce_denominator' };
    const result = verifyVoteRecordSet([relabelled]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('detects ADDING a policy to a record that had none, and REMOVING one that had it', () => {
    const unpolicied = makeRecord('vote-1', 0, { version: '1.2', ratifies: 'loop:x' });
    const forgedIn: VoteRecord = { ...unpolicied, errorPolicy: 'absolute_quorum' };
    expect(verifyVoteRecordSet([forgedIn]).ok).toBe(false);

    const policied: VoteRecord = { ...MAXIMAL_1_11, hash: computeVoteRecordHash(MAXIMAL_1_11) };
    const forgedOut: VoteRecord = { ...policied };
    delete forgedOut.errorPolicy;
    const result = verifyVoteRecordSet([forgedOut]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('the read schema accepts exactly the four policies the tool accepts and nothing else', () => {
    const base = { ...MAXIMAL_1_11, hash: computeVoteRecordHash(MAXIMAL_1_11) };
    const accepts = (errorPolicy: unknown): boolean =>
      VoteRecordSchema.safeParse({ ...base, errorPolicy }).success;
    for (const policy of [
      'reduce_denominator',
      'count_as_abstain',
      'fail_closed',
      'absolute_quorum',
    ]) {
      expect(accepts(policy)).toBe(true);
    }
    expect(accepts('absolute-quorum')).toBe(false);
    expect(accepts('')).toBe(false);
    expect(accepts(true)).toBe(false);
    expect(accepts({ policy: 'absolute_quorum' })).toBe(false);
  });

  it('the recorded vocabulary IS the live ErrorPolicy — neither side can drift alone', () => {
    // A policy added to `ErrorPolicySchema` without the record learning it
    // would make the #6054 write-time validation refuse every record that
    // carries it; one the record accepts that the tool never runs would let a
    // ledger line claim a policy no panel can be configured with. Checked by
    // `pnpm typecheck`, not at runtime.
    expectTypeOf<NonNullable<VoteRecord['errorPolicy']>>().toEqualTypeOf<ErrorPolicy>();
  });
});

/**
 * The maximal 1.12 RECORD (every voter-level optional present). Module-scoped
 * on the `MAXIMAL_1_11` rule so the 1.13 block can prove a 1.12 record still
 * hashes to the 1.12 golden.
 */
const PARSE_FAILURE =
  'Vote parsing failed: Vote response parsing failed: Unexpected end of JSON input';
const MAXIMAL_1_12 = {
  ...MAXIMAL_1_11,
  version: '1.12' as const,
  id: 'vote-max-112',
  voters: [
    {
      role: 'catfish' as const,
      decision: 'abstain' as const,
      confidence: 0,
      reasoning: 'UNVERIFIABLE: could not read the artifact',
      reasoningTruncated: true as const,
      retried: true as const,
      model: 'gemini-3.1-pro-preview',
      unverifiable: true as const,
      assignedCli: 'codex',
      fallback: { fromCli: 'codex', fromModel: 'codex-5.3', reason: 'capacity' as const },
      retriedFrom: {
        source: 'error' as const,
        error: PARSE_FAILURE,
        errorTruncated: true as const,
      },
    },
  ],
};
const GOLDEN_1_12 = '99b69c30289a2cd0dff2aeb0f120478007d2c08029f8ab1eb17220541482a52c';

describe('schema 1.12: `retriedFrom` — what a recovered seat was retried from (#6246)', () => {
  // Voter-level, present-only, appended AFTER `fallback` — the new last voter
  // key in the canonical order — so every 1.11-and-earlier entry projects
  // byte-identically. The 1.9 voter golden and the 1.11 record golden above
  // are the guard for that; this block pins the new maximal form, at both
  // levels, and proves the carried cause is tamper-evident.

  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    const parsed = VoteRecordSchema.safeParse({
      ...MAXIMAL_1_12,
      hash: computeVoteRecordHash(MAXIMAL_1_12),
    });
    expect(parsed.success).toBe(true);
  });

  it('pins the MAXIMAL 1.12 record to a golden captured by execution', () => {
    // Captured by running `computeVoteRecordHash` on this exact fixture once
    // the projection carried `retriedFrom`, then pinned — and reproduced by
    // hand-deriving the canonical string (`retriedFrom` last among the voter
    // keys, nested `source`, `error`, `errorTruncated`) with `node` + sha256.
    // If it moves, the canonical voter order, the nested order, or the
    // present-only rule changed.
    expect(computeVoteRecordHash(MAXIMAL_1_12)).toBe(GOLDEN_1_12);
  });

  it('a 1.11 record with `retriedFrom` explicitly undefined still hashes to the 1.11 golden', () => {
    // Against the PINNED literal, not a self-computed value: an entry that
    // lacks the new key must project exactly as it did before the key existed.
    const v = MAXIMAL_1_11.voters[0]!;
    expect(
      computeVoteRecordHash({ ...MAXIMAL_1_11, voters: [{ ...v, retriedFrom: undefined }] })
    ).toBe(GOLDEN_1_11);
  });

  it("reordering a 1.12 voter entry's keys — and the nested retriedFrom's — does not change the hash", () => {
    const v = MAXIMAL_1_12.voters[0]!;
    const reordered = {
      retriedFrom: {
        errorTruncated: v.retriedFrom.errorTruncated,
        error: v.retriedFrom.error,
        source: v.retriedFrom.source,
      },
      fallback: v.fallback,
      assignedCli: v.assignedCli,
      unverifiable: v.unverifiable,
      model: v.model,
      retried: v.retried,
      reasoningTruncated: v.reasoningTruncated,
      reasoning: v.reasoning,
      confidence: v.confidence,
      decision: v.decision,
      role: v.role,
    };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_12, voters: [reordered] })).toBe(
      computeVoteRecordHash(MAXIMAL_1_12)
    );
  });

  it('an explicitly-undefined error or errorTruncated hashes identically to an absent one', () => {
    const v = MAXIMAL_1_12.voters[0]!;
    const bare = { ...v, retriedFrom: { source: v.retriedFrom.source } };
    const explicit = {
      ...v,
      retriedFrom: { source: v.retriedFrom.source, error: undefined, errorTruncated: undefined },
    };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_12, voters: [explicit] })).toBe(
      computeVoteRecordHash({ ...MAXIMAL_1_12, voters: [bare] })
    );
  });

  it('dropping `retriedFrom` alone moves the hash; dropping the nested `error` alone moves it; dropping `errorTruncated` alone moves it', () => {
    const v = MAXIMAL_1_12.voters[0]!;
    const { retriedFrom: _r, ...withoutFrom } = v;
    const { error: _e, ...fromWithoutError } = v.retriedFrom;
    const { errorTruncated: _t, ...fromWithoutMarker } = v.retriedFrom;
    const full = computeVoteRecordHash(MAXIMAL_1_12);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_12, voters: [withoutFrom] })).not.toBe(full);
    expect(
      computeVoteRecordHash({ ...MAXIMAL_1_12, voters: [{ ...v, retriedFrom: fromWithoutError }] })
    ).not.toBe(full);
    expect(
      computeVoteRecordHash({ ...MAXIMAL_1_12, voters: [{ ...v, retriedFrom: fromWithoutMarker }] })
    ).not.toBe(full);
  });

  it('editing the carried cause is a hash_mismatch — the join cannot be rewritten after the fact', () => {
    // The property that makes the carried cause evidence rather than decoration:
    // the parse failure the seat recovered from cannot be edited into a
    // friendlier one, and the source cannot be relabelled, without the record
    // failing verification.
    const record: VoteRecord = { ...MAXIMAL_1_12, hash: computeVoteRecordHash(MAXIMAL_1_12) };
    const v = record.voters[0]!;
    const causeEdited: VoteRecord = {
      ...record,
      voters: [{ ...v, retriedFrom: { ...v.retriedFrom!, error: 'transient rate limit' } }],
    };
    const edited = verifyVoteRecordSet([causeEdited]);
    expect(edited.ok).toBe(false);
    if (!edited.ok) expect(edited.reason).toBe('hash_mismatch');
    const relabelled: VoteRecord = {
      ...record,
      voters: [{ ...v, retriedFrom: { ...v.retriedFrom!, source: 'unverifiable' } }],
    };
    const result = verifyVoteRecordSet([relabelled]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('the read schema accepts exactly the live `RetriedFrom` shape and nothing wider', () => {
    const base = { ...MAXIMAL_1_12, hash: computeVoteRecordHash(MAXIMAL_1_12) };
    const v = MAXIMAL_1_12.voters[0]!;
    const withKey = (retriedFrom: unknown): boolean =>
      VoteRecordSchema.safeParse({ ...base, voters: [{ ...v, retriedFrom }] }).success;
    expect(withKey({ source: 'error' })).toBe(true);
    expect(withKey({ source: 'unverifiable', error: 'x' })).toBe(true);
    // A source the retry never produces, a missing source, a marker that is
    // not literally true, an extra key, and a cause over the #5373 bound are
    // all refused: the record must not accept a shape the live result cannot emit.
    expect(withKey({ source: 'timeout' })).toBe(false);
    expect(withKey({ error: 'x' })).toBe(false);
    expect(withKey({ source: 'error', errorTruncated: false })).toBe(false);
    expect(withKey({ source: 'error', reason: 'capacity' })).toBe(false);
    expect(withKey({ source: 'error', error: 'e'.repeat(MAX_VOTER_REASONING_CHARS + 1) })).toBe(
      false
    );
  });

  it('the recorded source vocabulary IS the live RetriedFrom source — neither side can drift alone', () => {
    // A source added on the live side without the schema learning it would
    // make the #6054 write-time validation refuse every record that carries
    // it; one the schema accepts that the retry never produces would accept a
    // record no producer can write. Checked by `pnpm typecheck`, not at runtime.
    expectTypeOf<NonNullable<VoterSummary['retriedFrom']>['source']>().toEqualTypeOf<
      RetriedFrom['source']
    >();
  });
});

describe('schema 1.13: a salted digest of the reasoning is hashed, not the text (#6263, #5748 step 1)', () => {
  // The committed ledger holds model-written prose INSIDE the hash, so nothing
  // can ever be removed from it without `hash_mismatch`. On this tier each
  // voter entry carries `reasoningNonce` (32 random bytes, hex) and
  // `reasoningDigest = sha256(reasoningNonce ‖ reasoning)`; the record hash
  // folds ONLY the digest. The OPENING — the text AND the nonce — travels on
  // the record outside the hash, and the verifier re-opens the commitment
  // whenever both are present. The nonce must be outside the hash because the
  // salt is the secret (#6274 panel 1): a public salt lets `sha256(nonce ‖
  // guess)` confirm any low-entropy reasoning once the text is dropped, and
  // a hashed salt cannot be dropped without breaking the hash and the #3927
  // signature. With both dropped (step 2, #6264) the digest stays hash-covered
  // and is an opaque commitment. The clip marker `reasoningTruncated` stays
  // folded — only the opening is exempt. Older tiers keep folding the text;
  // the 1.12 golden is the guard for that.
  const NONCE = '0f'.repeat(32);
  const REASONING = 'UNVERIFIABLE: could not read the artifact';
  // Derived independently of the implementation: `printf '%s%s' "$nonce"
  // "$reasoning" | sha256sum` — 105 bytes in, this out.
  const DIGEST = 'd2cf1bdb5a01bf735a13969c50df30b26816a2a4904dc2209e96b509bf0d9545';
  const v12 = MAXIMAL_1_12.voters[0]!;
  const MAXIMAL_1_13 = {
    ...MAXIMAL_1_12,
    version: '1.13' as const,
    id: 'vote-max-113',
    voters: [{ ...v12, reasoning: REASONING, reasoningNonce: NONCE, reasoningDigest: DIGEST }],
  };
  const GOLDEN_1_13 = 'b93e7c041fa4be70490f4640b5353114e41bf4834415d21180df5c5569c1ba51';
  const asRecord = (payload: Omit<VoteRecord, 'hash'>): VoteRecord => ({
    ...payload,
    hash: computeVoteRecordHash(payload),
  });

  it('the fixture is schema-valid — otherwise every test below passes for the wrong reason', () => {
    expect(VoteRecordSchema.safeParse(asRecord(MAXIMAL_1_13)).success).toBe(true);
  });

  it('computeReasoningDigest is sha256 over the hex nonce followed by the text, and matches sha256sum', () => {
    expect(computeReasoningDigest(NONCE, REASONING)).toBe(DIGEST);
    expect(
      createHash('sha256')
        .update(NONCE + REASONING)
        .digest('hex')
    ).toBe(DIGEST);
  });

  it('mintReasoningNonce returns 32 random bytes as lowercase hex, fresh each call', () => {
    const a = mintReasoningNonce();
    const b = mintReasoningNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('pins the MAXIMAL 1.13 record to a golden derived BY HAND before the projection existed', () => {
    // The canonical string was built by hand in the documented order — the
    // voter keys through `retriedFrom` (`reasoningTruncated` in its 1.6
    // slot, `reasoning` and `reasoningNonce` OMITTED), then
    // `reasoningDigest` — hashed with node's sha256 in a scratch script and
    // cross-checked with coreutils `sha256sum` over the same bytes, so the
    // literal is not the implementation agreeing with itself. The same
    // hand-built string with `"reasoningNonce":…` inserted before the digest
    // reproduces the golden the panel rejected (`eaebde85…9d62`, nonce
    // folded), and with the text in its 1.6 slot instead reproduces the
    // 1.12 golden — both cross-checks that the hand string is right. If it
    // moves, the canonical voter order or the digest-tier fold rule changed.
    expect(computeVoteRecordHash(MAXIMAL_1_13)).toBe(GOLDEN_1_13);
  });

  it('a 1.12 record with the 1.13 keys explicitly undefined still hashes to the 1.12 golden', () => {
    // Against the PINNED literal: an older tier keeps folding the text exactly
    // as before, and knows nothing of the digest keys.
    expect(
      computeVoteRecordHash({
        ...MAXIMAL_1_12,
        voters: [{ ...v12, reasoningNonce: undefined, reasoningDigest: undefined }],
      })
    ).toBe(GOLDEN_1_12);
  });

  it('on the digest tier the TEXT is outside the hash: editing or dropping reasoning leaves the hash unchanged', () => {
    // The digest, not the hash, is what binds the text (next test). Only the
    // opening: the clip marker is hashed (the two `reasoningTruncated` tests).
    const v = MAXIMAL_1_13.voters[0]!;
    const textEdited = { ...MAXIMAL_1_13, voters: [{ ...v, reasoning: REASONING + '!' }] };
    const { reasoning: _r, ...withoutText } = v;
    expect(computeVoteRecordHash(textEdited)).toBe(GOLDEN_1_13);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_13, voters: [withoutText] })).toBe(GOLDEN_1_13);
  });

  it('dropping BOTH text and nonce leaves the record hash unchanged — the redaction property step 2 rests on', () => {
    // Asserted as hash-value EQUALITY, not `not.toBe`: the hash — and any
    // #3927 signature over it — survives the whole opening being dropped,
    // which is what lets step 2 (#6264) redact without re-signing. Under the
    // rejected fold (nonce hashed) this moved the hash (#6274 panel 1). The
    // schema still refuses the shape on THIS tier (a commitment with nothing
    // to open it); step 2 admits it under a redaction record.
    const { reasoning: _r, reasoningNonce: _n, ...redacted } = MAXIMAL_1_13.voters[0]!;
    expect(redacted.reasoningDigest).toBe(DIGEST);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_13, voters: [redacted] })).toBe(GOLDEN_1_13);
    expect(computeVoteRecordHash({ ...MAXIMAL_1_13, voters: [redacted] })).toBe(
      computeVoteRecordHash(MAXIMAL_1_13)
    );
    const parsed = VoteRecordSchema.safeParse(asRecord({ ...MAXIMAL_1_13, voters: [redacted] }));
    expect(parsed.success).toBe(false);
  });

  it('editing text AND nonce together to a different opening is a hash_mismatch — the digest re-opening fails while the record hash cannot see it', () => {
    // A second opening of the same commitment is a second preimage. The
    // record hash is unchanged (both keys are outside it), so it is ONLY the
    // verifier's re-opening of `sha256(nonce ‖ text)` against the
    // hash-covered digest that refuses the record.
    const record = asRecord(MAXIMAL_1_13);
    const v = record.voters[0]!;
    const other: VoteRecord = {
      ...record,
      voters: [{ ...v, reasoning: 'a different argument', reasoningNonce: 'a5'.repeat(32) }],
    };
    expect(computeVoteRecordHash(other)).toBe(record.hash);
    const result = verifyVoteRecordSet([other]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.detail).toContain('reasoningDigest');
    }
  });

  it('editing reasoning WITHOUT recomputing the digest is a hash_mismatch naming the digest — the commitment is checked, not decorative', () => {
    // The issue asks for exactly this verdict. The record hash cannot see the
    // text, so `verifyVoteRecordSet` re-opens the commitment: with nonce and
    // text both present it recomputes sha256(nonce ‖ text) and compares.
    // Without this the tier would be WEAKER than 1.12 until step 2 lands.
    const record = asRecord(MAXIMAL_1_13);
    const v = record.voters[0]!;
    const edited: VoteRecord = { ...record, voters: [{ ...v, reasoning: REASONING + '!' }] };
    const result = verifyVoteRecordSet([edited]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.detail).toContain('reasoningDigest');
      expect(result.detail).toContain('catfish');
    }
  });

  it('dropping `reasoningTruncated` from a truncated 1.13 record is a hash_mismatch — the clip marker is hashed, only the text is exempt', () => {
    // The #5748 decision exempts the raw `reasoning` TEXT from the hash so it
    // can later be dropped; the marker is a boolean with no privacy content,
    // redaction keeps it, and an unhashed marker would let "this argument was
    // clipped" be silently erased from a committed record.
    const record = asRecord(MAXIMAL_1_13);
    const { reasoningTruncated: _t, ...withoutMarker } = record.voters[0]!;
    expect(withoutMarker.reasoning).toBe(REASONING);
    const result = verifyVoteRecordSet([{ ...record, voters: [withoutMarker] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('adding `reasoningTruncated` to an untruncated 1.13 record is a hash_mismatch', () => {
    // `sequence: 0` so the lone baseline record is not a sequence gap.
    const { reasoningTruncated: _t, ...untruncated } = MAXIMAL_1_13.voters[0]!;
    const record = asRecord({ ...MAXIMAL_1_13, sequence: 0, voters: [untruncated] });
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
    const marked = { ...record, voters: [{ ...untruncated, reasoningTruncated: true as const }] };
    const result = verifyVoteRecordSet([marked]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('flipping one byte of reasoning and RE-PRODUCING the entry changes the digest and the hash', () => {
    const v = MAXIMAL_1_13.voters[0]!;
    const flipped = REASONING.slice(0, -1) + 'T';
    const reproduced = {
      ...MAXIMAL_1_13,
      voters: [
        { ...v, reasoning: flipped, reasoningDigest: computeReasoningDigest(NONCE, flipped) },
      ],
    };
    expect(reproduced.voters[0]!.reasoningDigest).not.toBe(DIGEST);
    expect(computeVoteRecordHash(reproduced)).not.toBe(GOLDEN_1_13);
    // And the reproduced record verifies: the commitment opens. (`sequence: 0`
    // so a lone record is not a sequence gap — the fixture sits at 3.)
    expect(verifyVoteRecordSet([asRecord({ ...reproduced, sequence: 0 })]).ok).toBe(true);
  });

  it('the NONCE is outside the hash: dropping it alone leaves the hash unchanged, and the verifier refuses the half-opening as hash_mismatch', () => {
    // Inverts the test that pinned the rejected fold ("dropping the nonce
    // alone moves the hash"). The nonce is the secret salt, so it travels
    // with the text, not in the hash; what refuses a nonce-less entry that
    // still carries text is the opening rule text ⇔ nonce
    // (`reasoningCommitmentShapeDefect`), reported by `verifyVoteRecordSet`
    // as `hash_mismatch` at the missing key — and the schema refuses the line.
    const record = asRecord(MAXIMAL_1_13);
    const { reasoningNonce: _n, ...withoutNonce } = record.voters[0]!;
    expect(computeVoteRecordHash({ ...MAXIMAL_1_13, voters: [withoutNonce] })).toBe(GOLDEN_1_13);
    const result = verifyVoteRecordSet([{ ...record, voters: [withoutNonce] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.detail).toContain('reasoning without its reasoningNonce');
    }
    expect(VoteRecordSchema.safeParse({ ...record, voters: [withoutNonce] }).success).toBe(false);
  });

  it('dropping the digest alone moves the hash; editing the nonce alone is a hash_mismatch from the re-opening, not the hash', () => {
    const v = MAXIMAL_1_13.voters[0]!;
    const { reasoningDigest: _d, ...withoutDigest } = v;
    expect(computeVoteRecordHash({ ...MAXIMAL_1_13, voters: [withoutDigest] })).not.toBe(
      GOLDEN_1_13
    );
    const record = asRecord(MAXIMAL_1_13);
    const nonceEdited: VoteRecord = {
      ...record,
      voters: [{ ...record.voters[0]!, reasoningNonce: 'e0'.repeat(32) }],
    };
    expect(computeVoteRecordHash(nonceEdited)).toBe(record.hash);
    const result = verifyVoteRecordSet([nonceEdited]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.detail).toContain('reasoningDigest');
    }
  });

  it("reordering a 1.13 voter entry's keys does not change the hash", () => {
    const v = MAXIMAL_1_13.voters[0]!;
    const reordered = {
      reasoningDigest: v.reasoningDigest,
      reasoningNonce: v.reasoningNonce,
      retriedFrom: v.retriedFrom,
      fallback: v.fallback,
      assignedCli: v.assignedCli,
      unverifiable: v.unverifiable,
      model: v.model,
      retried: v.retried,
      reasoningTruncated: v.reasoningTruncated,
      reasoning: v.reasoning,
      confidence: v.confidence,
      decision: v.decision,
      role: v.role,
    };
    expect(computeVoteRecordHash({ ...MAXIMAL_1_13, voters: [reordered] })).toBe(GOLDEN_1_13);
  });

  it('a digest-tier entry that carries reasoning with no nonce, no digest, or a stray nonce is refused by the schema', () => {
    const base = asRecord(MAXIMAL_1_13);
    const v = base.voters[0]!;
    const accepts = (entry: unknown): boolean =>
      VoteRecordSchema.safeParse({ ...base, voters: [entry] }).success;
    const { reasoningNonce: _n, ...noNonce } = v;
    const { reasoningDigest: _d, ...noDigest } = v;
    const { reasoning: _r, ...noText } = v;
    const { reasoning: _r2, reasoningNonce: _n2, ...noOpening } = v;
    expect(accepts(v)).toBe(true);
    // The opening rule: text ⇔ nonce. A text without its salt cannot be
    // re-opened; a salt without its text opens nothing.
    expect(accepts(noNonce)).toBe(false);
    expect(accepts(noText)).toBe(false);
    // The digest is required on 1.13 for any entry that has reasoning.
    expect(accepts(noDigest)).toBe(false);
    // A commitment with no opening at all is refused on THIS tier, for now;
    // step 2 (#6264) admits it under a redaction record naming the entry.
    expect(accepts(noOpening)).toBe(false);
    // Shape: 64 lowercase hex, nothing else.
    expect(accepts({ ...v, reasoningNonce: NONCE.toUpperCase() })).toBe(false);
    expect(accepts({ ...v, reasoningNonce: NONCE.slice(2) })).toBe(false);
    expect(accepts({ ...v, reasoningDigest: 'g'.repeat(64) })).toBe(false);
  });

  it('a 1.12 record carrying the digest keys is refused — they belong to the digest tier, where they are hashed', () => {
    // On an older tier the projection folds the text and ignores the digest
    // keys, so a persisted 1.12 line carrying them would hold two UNHASHED
    // fields. The schema refuses the line before anything reads it.
    const record = asRecord(MAXIMAL_1_12);
    const withKeys = {
      ...record,
      voters: [{ ...record.voters[0]!, reasoningNonce: NONCE, reasoningDigest: DIGEST }],
    };
    expect(VoteRecordSchema.safeParse(withKeys).success).toBe(false);
    const nonceOnly = { ...record, voters: [{ ...record.voters[0]!, reasoningNonce: NONCE }] };
    expect(VoteRecordSchema.safeParse(nonceOnly).success).toBe(false);
  });

  it('a digest-tier entry with no reasoning at all carries no commitment and verifies — absence is not a broken opening', () => {
    const v = MAXIMAL_1_13.voters[0]!;
    const {
      reasoning: _r,
      reasoningTruncated: _t,
      reasoningNonce: _n,
      reasoningDigest: _d,
      ...silent
    } = v;
    const record = asRecord({ ...MAXIMAL_1_13, sequence: 0, voters: [silent] });
    expect(VoteRecordSchema.safeParse(record).success).toBe(true);
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('findReasoningCommitmentDefect names the first broken commitment and is null for a sound record', () => {
    // The single-record seam the caller-commits append script vets a source
    // record with, so a text edited in the operator store is refused before
    // the line is written rather than after.
    const record = asRecord(MAXIMAL_1_13);
    expect(findReasoningCommitmentDefect(record)).toBeNull();
    const v = record.voters[0]!;
    const edited = { ...record, voters: [{ ...v, reasoning: REASONING + '!' }] };
    expect(findReasoningCommitmentDefect(edited)).toContain('reasoningDigest');
    const { reasoningNonce: _n, ...noNonce } = v;
    expect(findReasoningCommitmentDefect({ ...record, voters: [noNonce] })).toContain(
      'reasoningNonce'
    );
    // The opening rule in the other direction: a salt with no text.
    const { reasoning: _r2, ...noText } = v;
    expect(findReasoningCommitmentDefect({ ...record, voters: [noText] })).toContain(
      'reasoningNonce without the reasoning it opens'
    );
    // And a bare commitment: refused for now, admitted by step 2 (#6264).
    const { reasoning: _r3, reasoningNonce: _n3, ...bare } = v;
    expect(findReasoningCommitmentDefect({ ...record, voters: [bare] })).toContain('no opening');
    // An older tier never has a commitment to check.
    expect(findReasoningCommitmentDefect(asRecord(MAXIMAL_1_12))).toBeNull();
  });

  it('the two keys are on the VoterSummary type as optional hex strings — the defineVoterKeys constraint made the projection learn them', () => {
    // Adding the keys to the schema without appending them to
    // `VOTER_SUMMARY_KEYS` is a `tsc` error (#6077), so the "schema-only
    // field" failure mode is closed at build time; this pins the read side.
    expectTypeOf<VoterSummary['reasoningNonce']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<VoterSummary['reasoningDigest']>().toEqualTypeOf<string | undefined>();
  });
});

describe('`signature`: record-level, present-only, OUTSIDE the self-hash (#3927 item 4, phase 1)', () => {
  // The signed message is the record's committed `hash`, so the signature
  // cannot be inside the thing it signs. It is the second hash-excluded field
  // after `previousHash`, and unlike every schema tier it does NOT bump
  // `version`: `version` is hashed, and the signature is applied AFTER the
  // committed hash is final (the append script re-sequences, re-hashes, then
  // signs).
  const SIG = {
    keyId: 'williamzujkowski@nexus-agents',
    namespace: VOTE_RECORD_SIGNATURE_NAMESPACE,
    sig: '-----BEGIN SSH SIGNATURE-----\nU1NIU0lHTEST-NOT-A-REAL-SIGNATURE\n-----END SSH SIGNATURE-----\n',
  } as const;

  it('the fixture is schema-valid, with and without the signature — otherwise every test below passes for the wrong reason', () => {
    const unsigned = makeRecord('vote-sig', 4, { version: '1.11', errorPolicy: 'absolute_quorum' });
    expect(VoteRecordSchema.safeParse(unsigned).success).toBe(true);
    expect(VoteRecordSchema.safeParse({ ...unsigned, signature: SIG }).success).toBe(true);
  });

  it('a record with and without `signature` has the SAME hash — the field is not folded', () => {
    const unsigned = makeRecord('vote-sig', 4, { version: '1.11', errorPolicy: 'absolute_quorum' });
    const { hash: _hash, ...payload } = unsigned;
    expect(computeVoteRecordHash({ ...payload, signature: SIG })).toBe(unsigned.hash);
  });

  it('editing `sig` or `keyId` does not move the hash; the signed record still verifies as a set', () => {
    const unsigned = makeRecord('vote-sig', 0);
    const { hash: _hash, ...payload } = unsigned;
    const a = computeVoteRecordHash({ ...payload, signature: SIG });
    const b = computeVoteRecordHash({ ...payload, signature: { ...SIG, sig: `${SIG.sig}x` } });
    const c = computeVoteRecordHash({ ...payload, signature: { ...SIG, keyId: 'mallory@else' } });
    expect(a).toBe(unsigned.hash);
    expect(b).toBe(unsigned.hash);
    expect(c).toBe(unsigned.hash);
    expect(verifyVoteRecordSet([{ ...unsigned, signature: SIG }])).toEqual({
      ok: true,
      recordCount: 1,
    });
  });

  it('`namespace` is the one literal, `keyId`/`sig` are non-empty, and nothing wider is accepted', () => {
    const base = makeRecord('vote-sig', 0);
    const accepts = (signature: unknown): boolean =>
      VoteRecordSchema.safeParse({ ...base, signature }).success;
    expect(accepts(SIG)).toBe(true);
    expect(accepts({ ...SIG, namespace: 'git' })).toBe(false);
    expect(accepts({ ...SIG, namespace: 'file' })).toBe(false);
    expect(accepts({ ...SIG, keyId: '' })).toBe(false);
    expect(accepts({ ...SIG, sig: '' })).toBe(false);
    expect(accepts({ keyId: SIG.keyId, sig: SIG.sig })).toBe(false); // namespace required
    expect(accepts({ ...SIG, signedAt: '2026-09-14' })).toBe(false); // strict
    expect(accepts('sig')).toBe(false);
    expect(accepts(null)).toBe(false);
  });

  it('the namespace constant is the string ssh-keygen -Y sign/verify are invoked with', () => {
    // Pinned as a literal: the committed allowed_signers restricts the key to
    // this namespace, so a drift here would turn every signature into
    // `bad-signature` (namespace does not match).
    expect(VOTE_RECORD_SIGNATURE_NAMESPACE).toBe('nexus-vote-record');
  });
});
