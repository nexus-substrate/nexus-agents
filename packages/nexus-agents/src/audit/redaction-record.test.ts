/**
 * Tests for the REDACTION record and the verifier's third per-record answer,
 * `redacted` (#6264, #5748 step 2; design corrected by the #6274 panel).
 *
 * The shape under test: a 1.13 voter entry whose hash-covered
 * `reasoningDigest` is present and whose OPENING (`reasoning` +
 * `reasoningNonce`) is absent is `redacted` only when a self-hashed redaction
 * record in the set names that record id and that role. The empty case is
 * named: the opening absent with NO redaction record is `hash_mismatch`. The
 * target's own hash — and anything signed over it — is unchanged.
 *
 * @module audit/redaction-record.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ConsensusResult } from '../consensus/types.js';
import type { VoteRecord, VoterSummary } from './vote-record.js';
import { computeReasoningDigest, findReasoningCommitmentDefect } from './reasoning-commitment.js';
import type { RedactionRecord } from './redaction-record.js';
import {
  RedactionRecordSchema,
  buildRedactionRecord,
  computeRedactionRecordHash,
  redactVoterOpenings,
} from './redaction-record.js';
import { VoteRecordSchema, computeVoteRecordHash, verifyVoteRecordSet } from './vote-record.js';
import { parseVoteRecordsText, persistVoteRecord } from './vote-record-store.js';

const NONCE = '0f'.repeat(32);
const REASONING = 'UNVERIFIABLE: could not read the artifact';
const DIGEST = computeReasoningDigest(NONCE, REASONING);

/** A 1.13 record whose `catfish` entry carries a full commitment and `architect` no reasoning at all. */
function makeDigestRecord(id: string, sequence: number, voters?: VoterSummary[]): VoteRecord {
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.13',
    id,
    sequence,
    recordedAt: '2026-09-15T00:00:00.000Z',
    proposalHash: 'a'.repeat(64),
    proposal: 'Ratify PR #6264',
    strategy: 'supermajority',
    decision: 'approved',
    approvalPercentage: 100,
    voteCounts: { approve: 2, reject: 0, abstain: 0, total: 2 },
    voters: voters ?? [
      { role: 'architect', decision: 'approve', confidence: 0.9 },
      {
        role: 'catfish',
        decision: 'approve',
        confidence: 0.7,
        reasoning: REASONING,
        reasoningNonce: NONCE,
        reasoningDigest: DIGEST,
      },
    ],
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

/** The record with the named roles' openings dropped and the STORED hash carried over untouched. */
function redacted(record: VoteRecord, roles: readonly string[]): VoteRecord {
  return { ...record, voters: redactVoterOpenings(record.voters, new Set(roles)) };
}

function redaction(
  id: string,
  sequence: number,
  targetId: string,
  roles: readonly string[]
): RedactionRecord {
  return buildRedactionRecord({
    id,
    sequence,
    targetId,
    targetVoterRoles: roles,
    at: '2026-09-15T01:00:00.000Z',
    by: 'williamzujkowski',
    reason: 'voter reasoning quoted a private document',
  });
}

describe('the redaction record (#6264)', () => {
  it('builds a self-hashed record the schema accepts, and the hash covers every field', () => {
    const r = redaction('red-1', 1, 'vote-1', ['catfish']);
    expect(RedactionRecordSchema.safeParse(r).success).toBe(true);
    expect(r.kind).toBe('redaction');
    expect(computeRedactionRecordHash(r)).toBe(r.hash);
    // Every field moves the hash: kind is a literal, so the other seven.
    const { hash: _h, ...payload } = r;
    const edits: Partial<typeof payload>[] = [
      { id: 'red-2' },
      { sequence: 2 },
      { targetId: 'vote-2' },
      { targetVoterRoles: ['architect'] },
      { at: '2026-09-15T02:00:00.000Z' },
      { by: 'someone-else' },
      { reason: 'another reason' },
    ];
    for (const edit of edits) {
      expect(computeRedactionRecordHash({ ...payload, ...edit })).not.toBe(r.hash);
    }
  });

  it('the schema refuses a redaction that names NO voter role — the empty redaction is named, not accepted', () => {
    const r = redaction('red-1', 1, 'vote-1', ['catfish']);
    expect(RedactionRecordSchema.safeParse({ ...r, targetVoterRoles: [] }).success).toBe(false);
    expect(RedactionRecordSchema.safeParse({ ...r, extra: 1 }).success).toBe(false);
    expect(RedactionRecordSchema.safeParse({ ...r, kind: 'vote' }).success).toBe(false);
    expect(RedactionRecordSchema.safeParse({ ...r, reason: '' }).success).toBe(false);
  });

  it('redactVoterOpenings drops text AND nonce for the named roles only, and keeps the digest and the clip marker', () => {
    const record = makeDigestRecord('vote-1', 0, [
      { role: 'architect', decision: 'approve', confidence: 0.9 },
      {
        role: 'catfish',
        decision: 'approve',
        confidence: 0.7,
        reasoning: REASONING,
        reasoningTruncated: true,
        reasoningNonce: NONCE,
        reasoningDigest: DIGEST,
      },
      {
        role: 'security',
        decision: 'approve',
        confidence: 0.8,
        reasoning: 'kept',
        reasoningNonce: 'ab'.repeat(32),
        reasoningDigest: computeReasoningDigest('ab'.repeat(32), 'kept'),
      },
    ]);
    const out = redactVoterOpenings(record.voters, new Set(['catfish']));
    expect(out[0]).toEqual(record.voters[0]);
    expect(out[1]).toEqual({
      role: 'catfish',
      decision: 'approve',
      confidence: 0.7,
      reasoningTruncated: true,
      reasoningDigest: DIGEST,
    });
    expect(out[2]).toEqual(record.voters[2]);
  });
});

describe('verifyVoteRecordSet: the third per-record answer, `redacted` (#6264)', () => {
  it('a digest-tier entry with its opening ABSENT and a redaction record naming its record id and role is `redacted` — reported per record, and ok', () => {
    const original = makeDigestRecord('vote-1', 0);
    const result = verifyVoteRecordSet(
      [redacted(original, ['catfish'])],
      [redaction('red-1', 1, 'vote-1', ['catfish'])]
    );
    expect(result).toEqual({
      ok: true,
      recordCount: 2,
      redacted: [{ recordId: 'vote-1', voterRoles: ['catfish'], redactionIds: ['red-1'] }],
    });
  });

  it('EMPTY CASE: the opening absent with NO redaction record is hash_mismatch, naming the voter and the missing record', () => {
    const original = makeDigestRecord('vote-1', 0);
    const result = verifyVoteRecordSet([redacted(original, ['catfish'])], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.recordId).toBe('vote-1');
      expect(result.detail).toContain('catfish');
      expect(result.detail).toContain('no redaction record');
    }
  });

  it('a redaction record naming a role the redaction did NOT reach does not cover another role', () => {
    // Two commitments, one redaction naming only `security`: the `catfish`
    // entry with its opening gone is still the empty case.
    const original = makeDigestRecord('vote-1', 0, [
      {
        role: 'catfish',
        decision: 'approve',
        confidence: 0.7,
        reasoning: REASONING,
        reasoningNonce: NONCE,
        reasoningDigest: DIGEST,
      },
      {
        role: 'security',
        decision: 'approve',
        confidence: 0.8,
        reasoning: 'kept',
        reasoningNonce: 'ab'.repeat(32),
        reasoningDigest: computeReasoningDigest('ab'.repeat(32), 'kept'),
      },
    ]);
    const both = redacted(original, ['catfish', 'security']);
    const result = verifyVoteRecordSet([both], [redaction('red-1', 1, 'vote-1', ['security'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.detail).toContain('catfish');
      expect(result.detail).toContain('no redaction record');
    }
  });

  it('a redaction record whose targetId matches no record is a verifier error (redaction_unbound), never ok', () => {
    const original = makeDigestRecord('vote-1', 0);
    const result = verifyVoteRecordSet([original], [redaction('red-1', 1, 'vote-9', ['catfish'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('redaction_unbound');
      expect(result.recordId).toBe('red-1');
      expect(result.detail).toContain('vote-9');
    }
  });

  it('a redaction record naming a role that is not a commitment on the target — absent, or with no digest — is redaction_unbound', () => {
    const original = makeDigestRecord('vote-1', 0);
    const noSuchRole = verifyVoteRecordSet([original], [redaction('red-1', 1, 'vote-1', ['pm'])]);
    expect(noSuchRole.ok).toBe(false);
    if (!noSuchRole.ok) {
      expect(noSuchRole.reason).toBe('redaction_unbound');
      expect(noSuchRole.detail).toContain('pm');
    }
    // `architect` exists but never carried reasoning: nothing to redact.
    const noDigest = verifyVoteRecordSet(
      [original],
      [redaction('red-1', 1, 'vote-1', ['architect'])]
    );
    expect(noDigest.ok).toBe(false);
    if (!noDigest.ok) {
      expect(noDigest.reason).toBe('redaction_unbound');
      expect(noDigest.detail).toContain('architect');
    }
  });

  it('a redaction record naming an entry whose opening is STILL PRESENT is redaction_unbound — recorded but not applied', () => {
    // The record would otherwise claim a removal that never happened, which is
    // exactly the misreport the ledger exists to make impossible.
    const original = makeDigestRecord('vote-1', 0);
    const result = verifyVoteRecordSet([original], [redaction('red-1', 1, 'vote-1', ['catfish'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('redaction_unbound');
      expect(result.detail).toContain('still present');
    }
  });

  it('HASH UNCHANGED: the redacted record recomputes to the ORIGINAL stored hash — asserted as value equality — so a signature over it verifies unchanged', () => {
    const original = makeDigestRecord('vote-1', 0);
    const after = redacted(original, ['catfish']);
    expect(after.voters[1]!.reasoning).toBeUndefined();
    expect(after.voters[1]!.reasoningNonce).toBeUndefined();
    expect(after.voters[1]!.reasoningDigest).toBe(DIGEST);
    // The stored hash was carried over untouched, and it is what the payload
    // recomputes to. A #3927 signature signs this value; it needs no re-signing.
    expect(after.hash).toBe(original.hash);
    expect(computeVoteRecordHash(after)).toBe(original.hash);
    expect(computeVoteRecordHash(after)).toBe(computeVoteRecordHash(original));
    const result = verifyVoteRecordSet([after], [redaction('red-1', 1, 'vote-1', ['catfish'])]);
    expect(result.ok).toBe(true);
  });

  it('DOUBLE REDACTION of the same target and role is IDEMPOTENT: both records verify and both ids are reported', () => {
    // Two branches can each append a redaction for the same record and merge
    // under `merge=union` — the same benign fork the sequence model already
    // admits. Refusing would make a merged ledger invalid for doing the right
    // thing twice.
    const original = makeDigestRecord('vote-1', 0);
    const result = verifyVoteRecordSet(
      [redacted(original, ['catfish'])],
      [redaction('red-1', 1, 'vote-1', ['catfish']), redaction('red-2', 2, 'vote-1', ['catfish'])]
    );
    expect(result).toEqual({
      ok: true,
      recordCount: 3,
      redacted: [{ recordId: 'vote-1', voterRoles: ['catfish'], redactionIds: ['red-1', 'red-2'] }],
    });
  });

  it('a redaction record whose content was edited after hashing is hash_mismatch; one with an empty hash is missing_hash', () => {
    const original = makeDigestRecord('vote-1', 0);
    const r = redaction('red-1', 1, 'vote-1', ['catfish']);
    const edited = verifyVoteRecordSet(
      [redacted(original, ['catfish'])],
      [{ ...r, reason: 'a nicer reason' }]
    );
    expect(edited.ok).toBe(false);
    if (!edited.ok) {
      expect(edited.reason).toBe('hash_mismatch');
      expect(edited.recordId).toBe('red-1');
    }
    const noHash = verifyVoteRecordSet([redacted(original, ['catfish'])], [{ ...r, hash: '' }]);
    expect(noHash.ok).toBe(false);
    if (!noHash.ok) expect(noHash.reason).toBe('missing_hash');
  });

  it('a redaction record occupies a sequence: the census counts it, so a hole before it is a gap and a shared sequence is a fork', () => {
    const original = makeDigestRecord('vote-1', 0);
    const gap = verifyVoteRecordSet(
      [redacted(original, ['catfish'])],
      [redaction('red-1', 2, 'vote-1', ['catfish'])]
    );
    expect(gap.ok).toBe(false);
    if (!gap.ok) {
      expect(gap.reason).toBe('sequence_gap');
      expect(gap.detail).toContain('missing sequence 1');
    }
    const fork = verifyVoteRecordSet(
      [redacted(original, ['catfish']), makeDigestRecord('vote-2', 1)],
      [redaction('red-1', 1, 'vote-1', ['catfish'])]
    );
    expect(fork).toEqual({
      ok: true,
      recordCount: 3,
      forks: [1],
      redacted: [{ recordId: 'vote-1', voterRoles: ['catfish'], redactionIds: ['red-1'] }],
    });
  });

  it('a set of redaction records alone is not an empty set: nothing to redact is redaction_unbound, not notVerified', () => {
    const result = verifyVoteRecordSet([], [redaction('red-1', 0, 'vote-1', ['catfish'])]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('redaction_unbound');
  });

  it('findReasoningCommitmentDefect takes the redacted roles: named ⇒ sound, unnamed ⇒ the empty-case defect', () => {
    const after = redacted(makeDigestRecord('vote-1', 0), ['catfish']);
    expect(findReasoningCommitmentDefect(after, new Set(['catfish']))).toBeNull();
    expect(findReasoningCommitmentDefect(after, new Set())).toContain('no redaction record');
  });
});

describe('the schema admits the redacted shape on the digest tier (#6264)', () => {
  it('a 1.13 entry with the digest present and the opening absent parses; the opening rule text ⇔ nonce still holds', () => {
    const original = makeDigestRecord('vote-1', 0);
    expect(VoteRecordSchema.safeParse(redacted(original, ['catfish'])).success).toBe(true);
    const v = original.voters[1]!;
    const { reasoningNonce: _n, ...noNonce } = v;
    const { reasoning: _r, ...noText } = v;
    expect(VoteRecordSchema.safeParse({ ...original, voters: [noNonce] }).success).toBe(false);
    expect(VoteRecordSchema.safeParse({ ...original, voters: [noText] }).success).toBe(false);
  });

  it('a 1.12 record still refuses the digest keys — redaction has no meaning where the text is hashed', () => {
    const original = makeDigestRecord('vote-1', 0);
    const old = { ...original, version: '1.12' as const };
    expect(VoteRecordSchema.safeParse({ ...old, hash: computeVoteRecordHash(old) }).success).toBe(
      false
    );
  });
});

describe('the ledger parser and the store see redaction lines (#6264)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'redaction-record-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('parseVoteRecordsText splits vote and redaction lines; a malformed redaction line is invalid', () => {
    const original = makeDigestRecord('vote-1', 0);
    const r = redaction('red-1', 1, 'vote-1', ['catfish']);
    const text = [
      JSON.stringify(redacted(original, ['catfish'])),
      JSON.stringify(r),
      JSON.stringify({ ...r, targetVoterRoles: [] }),
    ].join('\n');
    const parsed = parseVoteRecordsText(text);
    expect(parsed.records.map((x) => x.id)).toEqual(['vote-1']);
    expect(parsed.redactions).toEqual([r]);
    expect(parsed.invalidLines).toEqual([3]);
    expect(verifyVoteRecordSet(parsed.records, parsed.redactions).ok).toBe(true);
  });

  it('the store assigns the next sequence PAST a redaction record at the tip', () => {
    const filePath = join(dir, 'vote-records.jsonl');
    const original = makeDigestRecord('vote-1', 0);
    const r = redaction('red-1', 1, 'vote-1', ['catfish']);
    writeFileSync(
      filePath,
      JSON.stringify(redacted(original, ['catfish'])) + '\n' + JSON.stringify(r) + '\n',
      'utf-8'
    );
    const now = '2026-09-15T00:00:00.000Z';
    const result: ConsensusResult = {
      proposalId: 'p',
      proposal: { title: 'T', description: 'D', algorithm: 'supermajority' },
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
      approvalPercentage: 100,
      quorumReached: true,
      startedAt: now,
      closedAt: now,
      durationMs: 1,
    };
    const written = persistVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: 'approved',
      id: 'vote-2',
      proposal: 'p',
      strategy: 'supermajority',
      result,
      votes: [
        {
          role: 'architect',
          vote: { decision: 'approve', confidence: 0.9, reasoning: 'fine' },
          processingTimeMs: 1,
          source: 'llm',
        },
      ],
      filePath,
    });
    expect(written?.sequence).toBe(2);
    expect(written?.previousHash).toBe(r.hash);
    const parsed = parseVoteRecordsText(readFileSync(filePath, 'utf-8'));
    expect(verifyVoteRecordSet(parsed.records, parsed.redactions)).toEqual({
      ok: true,
      recordCount: 3,
      redacted: [{ recordId: 'vote-1', voterRoles: ['catfish'], redactionIds: ['red-1'] }],
    });
  });
});
