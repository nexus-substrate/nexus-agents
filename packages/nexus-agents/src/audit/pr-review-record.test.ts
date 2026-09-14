/**
 * Tests for the pr-review TAMPER-EVIDENT, DIFF-BOUND RECORD SET (#3831, Epic B,
 * Option-C binding). Mirrors the vote-record tests (#3927). Core properties:
 *  - the self-hash covers the full payload INCLUDING prNumber + baseSha +
 *    reviewedDiffHash + verdict (the diff-binding), so editing any is a `hash_mismatch`;
 *  - the ledger is a SET, not a chain: order does not matter, concurrent forks
 *    (duplicate sequences) are benign, omission shows up as a `sequence_gap`;
 *  - `buildPrReviewRecord` produces a record that verifies.
 *
 * @module audit/pr-review-record.test
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';

import type {
  PrReviewBindingBounds,
  PrReviewDiffProvenance,
  PrReviewPanelCoverage,
  PrReviewRecord,
} from './pr-review-record.js';
import {
  PrReviewRecordSchema,
  computePrReviewRecordHash,
  verifyPrReviewRecordSet,
} from './pr-review-record.js';
import { buildPrReviewRecord } from './pr-review-record-store.js';

/** sha256 hex of a canonical string — the projection's own final step. */
function sha256Hex(canonical: string): string {
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const DIFF_HASH_A = 'c'.repeat(64);
const DIFF_HASH_B = 'd'.repeat(64);

/**
 * Build a self-hashed record at `sequence`. `previousHash` is advisory (NOT
 * covered by the hash) — set it to prove verification ignores it.
 */
function makeRecord(
  prNumber: number,
  sequence: number,
  overrides: Partial<Omit<PrReviewRecord, 'hash'>> = {}
): PrReviewRecord {
  const payload: Omit<PrReviewRecord, 'hash'> = {
    version: '1.3',
    sequence,
    prNumber,
    baseSha: SHA_A,
    reviewedDiffHash: DIFF_HASH_A,
    recordedAt: '2026-06-15T00:00:00.000Z',
    verdict: 'approve',
    verified: false,
    voteCounts: { approve: 3, request_changes: 0, abstain: 0, error: 0, total: 3 },
    summary: 'looks good',
    ...overrides,
  };
  return { ...payload, hash: computePrReviewRecordHash(payload) };
}

describe('verifyPrReviewRecordSet (#3831)', () => {
  it('verifies a clean set and is order-independent', () => {
    const a = makeRecord(100, 0);
    const b = makeRecord(101, 1);
    expect(verifyPrReviewRecordSet([a, b]).ok).toBe(true);
    // Reversed order still verifies (set, not chain).
    expect(verifyPrReviewRecordSet([b, a]).ok).toBe(true);
  });

  it('verifies an empty set trivially', () => {
    // #5818: `ok: true` alone could not distinguish a verified set from an
    // absent one. `notVerified` says which, matching `verifyChain`.
    expect(verifyPrReviewRecordSet([])).toEqual({ ok: true, recordCount: 0, notVerified: 'empty' });
  });

  it('ignores the advisory previousHash in the hash', () => {
    const withPrev = makeRecord(100, 0, { previousHash: 'f'.repeat(64) });
    expect(verifyPrReviewRecordSet([withPrev]).ok).toBe(true);
  });

  it('DETECTS a flipped verdict as hash_mismatch (tamper evidence)', () => {
    const rec = makeRecord(100, 0);
    const tampered: PrReviewRecord = { ...rec, verdict: 'request_changes' };
    const result = verifyPrReviewRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an edited reviewedDiffHash as hash_mismatch (diff-binding)', () => {
    const rec = makeRecord(100, 0);
    // Swap the reviewed-diff hash without recomputing the self-hash → tamper.
    const tampered: PrReviewRecord = { ...rec, reviewedDiffHash: DIFF_HASH_B };
    const result = verifyPrReviewRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an edited baseSha as hash_mismatch (diff-binding)', () => {
    const rec = makeRecord(100, 0);
    const tampered: PrReviewRecord = { ...rec, baseSha: SHA_B };
    const result = verifyPrReviewRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS a missing hash', () => {
    const rec = makeRecord(100, 0);
    const result = verifyPrReviewRecordSet([{ ...rec, hash: '' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_hash');
  });

  it('DETECTS a sequence gap (omission)', () => {
    const a = makeRecord(100, 0);
    const c = makeRecord(102, 2); // 1 is missing
    const result = verifyPrReviewRecordSet([a, c]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('sequence_gap');
  });

  it('treats duplicate sequences (concurrent forks) as benign', () => {
    const a = makeRecord(100, 0);
    const b = makeRecord(101, 1);
    const bFork = makeRecord(202, 1); // same sequence, different PR
    const result = verifyPrReviewRecordSet([a, b, bFork]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.forks).toEqual([1]);
  });
});

describe('buildPrReviewRecord (#3831)', () => {
  it('produces a record that verifies and binds the reviewed diff', () => {
    const rec = buildPrReviewRecord({
      prNumber: 4242,
      baseSha: SHA_B,
      reviewedDiffHash: DIFF_HASH_B,
      verdict: 'request_changes',
      verified: true,
      voteCounts: { approve: 1, request_changes: 3, abstain: 1, error: 0, total: 5 },
      summary: 'needs work',
      sequence: 0,
      recordedAt: '2026-06-15T00:00:00.000Z',
    });
    expect(rec.baseSha).toBe(SHA_B);
    expect(rec.reviewedDiffHash).toBe(DIFF_HASH_B);
    expect(rec.verdict).toBe('request_changes');
    expect(verifyPrReviewRecordSet([rec]).ok).toBe(true);
  });

  it('truncates an over-long summary', () => {
    const long = 'x'.repeat(2000);
    const rec = buildPrReviewRecord({
      prNumber: 1,
      baseSha: SHA_A,
      reviewedDiffHash: DIFF_HASH_A,
      verdict: 'approve',
      verified: false,
      voteCounts: { approve: 1, request_changes: 0, abstain: 0, error: 0, total: 1 },
      summary: long,
    });
    expect(rec.summary.length).toBeLessThan(long.length);
    expect(rec.summary.endsWith('...')).toBe(true);
    expect(verifyPrReviewRecordSet([rec]).ok).toBe(true);
  });
});

describe('diffProvenance (#4459)', () => {
  const CALLER_SUPPLIED: PrReviewDiffProvenance = {
    source: 'caller-supplied',
    fileBoundaries: true,
  };

  /**
   * THE load-bearing test. `computePrReviewRecordHash` builds its canonical form
   * from an explicit field ALLOWLIST, not `JSON.stringify(record)` — so a field
   * present in the schema but absent from the projection sits OUTSIDE
   * tamper-evidence. If this passes with the projection unchanged, `source` could
   * be edited from `caller-supplied` to `canonical-git` — upgrading a record's
   * apparent provenance — with no `hash_mismatch`.
   */
  it('folds diffProvenance.source into the self-hash: flipping it is a hash_mismatch', () => {
    const authentic = makeRecord(4459, 0, { diffProvenance: CALLER_SUPPLIED });
    const forged: PrReviewRecord = {
      ...authentic,
      diffProvenance: { source: 'canonical-git', fileBoundaries: true },
    };
    expect(computePrReviewRecordHash(forged)).not.toBe(authentic.hash);
    const verification = verifyPrReviewRecordSet([forged]);
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.reason).toBe('hash_mismatch');
  });

  it('folds diffProvenance.fileBoundaries into the self-hash', () => {
    const authentic = makeRecord(4459, 0, { diffProvenance: CALLER_SUPPLIED });
    const forged: PrReviewRecord = {
      ...authentic,
      diffProvenance: { source: 'caller-supplied', fileBoundaries: false },
    };
    expect(computePrReviewRecordHash(forged)).not.toBe(authentic.hash);
    expect(verifyPrReviewRecordSet([forged]).ok).toBe(false);
  });

  it('DETECTS deletion of the whole diffProvenance field as a hash_mismatch', () => {
    const authentic = makeRecord(4459, 0, { diffProvenance: CALLER_SUPPLIED });
    const stripped = { ...authentic };
    Reflect.deleteProperty(stripped, 'diffProvenance');
    expect(verifyPrReviewRecordSet([stripped]).ok).toBe(false);
  });

  /**
   * The invariant an absent optional must satisfy: the projection OMITS the key
   * rather than emitting `null`. `JSON.stringify` drops `undefined` values, so a
   * record written before the field existed produces a canonical string
   * byte-identical to one written after — which is what keeps every previously
   * written record from flipping to `hash_mismatch` on the next verification.
   *
   * Stated as a COMPARISON, not a golden hex. The hex form claimed to be
   * "the pre-#4459 hash, which must never change", but `version` is inside the
   * projection, so the golden necessarily moves on every version bump — and it
   * did, silently, at '1.2'→'1.3' (#5385). A pin that must be edited whenever an
   * unrelated field changes does not pin the property it names.
   */
  function noProvenancePayload(): Omit<PrReviewRecord, 'hash'> {
    return {
      version: '1.3',
      sequence: 7,
      prNumber: 4459,
      baseSha: SHA_A,
      reviewedDiffHash: DIFF_HASH_A,
      recordedAt: '2026-06-15T00:00:00.000Z',
      verdict: 'approve',
      verified: true,
      voteCounts: { approve: 5, request_changes: 0, abstain: 0, error: 0, total: 5 },
      summary: 'looks good',
    };
  }

  it('omits an absent diffProvenance from the canonical string rather than emitting null', () => {
    // The two renderings a projection could choose. Omission is the one that
    // preserves pre-field hashes; `null` would move every one of them. Building
    // the expected string here rather than pinning a digest keeps the assertion
    // true across version bumps, which is the property that actually matters.
    const payload = noProvenancePayload();
    const omitted = JSON.stringify({
      version: payload.version,
      sequence: payload.sequence,
      prNumber: payload.prNumber,
      baseSha: payload.baseSha,
      reviewedDiffHash: payload.reviewedDiffHash,
      recordedAt: payload.recordedAt,
      verdict: payload.verdict,
      verified: payload.verified,
      voteCounts: payload.voteCounts,
      summary: payload.summary,
      correlationId: null,
    });
    const asNull = JSON.stringify({ ...JSON.parse(omitted), diffProvenance: null });

    expect(computePrReviewRecordHash(payload)).toBe(sha256Hex(omitted));
    expect(computePrReviewRecordHash(payload)).not.toBe(sha256Hex(asNull));
  });

  it('a present diffProvenance hashes differently from an absent one', () => {
    // Guards the row above: if the projection dropped the field entirely, the
    // omission assertion would still hold while provenance left tamper-evidence.
    const payload = noProvenancePayload();
    expect(computePrReviewRecordHash(payload)).not.toBe(
      computePrReviewRecordHash({ ...payload, diffProvenance: CALLER_SUPPLIED })
    );
  });

  it('is OPTIONAL: a record without it still parses under the .strict() schema', () => {
    const rec = makeRecord(4459, 0);
    expect(PrReviewRecordSchema.safeParse(rec).success).toBe(true);
  });

  it('parses a record that carries it', () => {
    const parsed = PrReviewRecordSchema.safeParse(
      makeRecord(4459, 0, { diffProvenance: { source: 'canonical-git', fileBoundaries: false } })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.diffProvenance?.source).toBe('canonical-git');
  });

  it('rejects an unreachable source value (gh-api was measured to be unreachable)', () => {
    const bad = {
      ...makeRecord(4459, 0),
      diffProvenance: { source: 'gh-api', fileBoundaries: true },
    };
    expect(PrReviewRecordSchema.safeParse(bad).success).toBe(false);
  });
});

describe('record version (#4459, #5385, #6190)', () => {
  it('the builder writes 1.4 — the boundary at which records carry coverage/bindingBounds fields', () => {
    expect(buildPrReviewRecord(BUILD_MINIMAL).version).toBe('1.4');
  });

  it('still accepts a 1.3 record — the first tier kept rather than clean-broken (#6190)', () => {
    expect(PrReviewRecordSchema.safeParse(makeRecord(1, 0)).success).toBe(true);
  });

  it('rejects the pre-1.3 tiers whose hashes may bind sanitized bytes', () => {
    for (const version of ['1.0', '1.1', '1.2']) {
      const stale = { ...makeRecord(1, 0), version };
      expect(PrReviewRecordSchema.safeParse(stale).success).toBe(false);
    }
  });
});

const BUILD_MINIMAL = {
  prNumber: 1,
  baseSha: SHA_A,
  reviewedDiffHash: DIFF_HASH_A,
  verdict: 'approve' as const,
  verified: false,
  voteCounts: { approve: 1, request_changes: 0, abstain: 0, error: 0, total: 1 },
  summary: 'ok',
  sequence: 0,
  recordedAt: '2026-06-15T00:00:00.000Z',
};

describe('coverage and bindingBounds as structured, hash-covered fields (#6190)', () => {
  /** Forty dropped paths: the count the 500-char summary cap demonstrably loses. */
  const DROPPED_40 = Array.from({ length: 40 }, (_, i) => `src/dropped/file-${String(i)}.ts`);

  const COVERAGE: PrReviewPanelCoverage = {
    panelRead: 'partial',
    reviewedFiles: 2,
    totalFiles: 42,
    droppedFiles: DROPPED_40,
    reviewedBytes: 40_000,
    totalBytes: 161_204,
    budgetSource: 'registry',
    budgetDetail: 'min window 1,000,000 tok (claude-fable-5) − 16,000 × 3.5 B/tok = 3,444,000 B',
  };
  const BINDING: PrReviewBindingBounds = { kind: 'prefix', boundBytes: 50_000 };

  /**
   * Every field a 1.3 record can carry. The golden was captured by running
   * `computePrReviewRecordHash` on this exact fixture against the pre-#6190
   * projection (origin/main at 7b8bcff841), then pinned: it is the hash an
   * already-written ledger line carries, and the property under test is that
   * the new projection reproduces it byte-for-byte.
   */
  const MAXIMAL_1_3: Omit<PrReviewRecord, 'hash'> = {
    version: '1.3',
    sequence: 0,
    prNumber: 6190,
    baseSha: SHA_A,
    reviewedDiffHash: DIFF_HASH_A,
    recordedAt: '2026-09-14T00:00:00.000Z',
    verdict: 'approve',
    verified: false,
    voteCounts: { approve: 4, request_changes: 0, abstain: 1, error: 0, total: 5 },
    summary:
      'approve (4 approve / 0 request_changes / 1 abstain) [partial coverage: 2/5 files reviewed, dropped: src/a.ts, src/b.ts, src/c.ts] [panel read 40,000/61,204 bytes; binding covers first 50,000 bytes; budget: registry (min window 1,000,000 tok (claude-fable-5) − 16,000 × 3.5 B/tok = 3,444,000 B)] — maximal',
    correlationId: 'pr-review-6190',
    diffProvenance: { source: 'caller-supplied', fileBoundaries: true },
    sanitization: {
      sanitizedDiffHash: DIFF_HASH_B,
      commentsRemoved: 1,
      fieldsModified: 2,
      tagsRemoved: 1,
    },
    previousHash: '9'.repeat(64),
  };
  const GOLDEN_1_3 = '86db26a631a9e75e2f54ed7bc5e66b5bea0af238fe2a5ae017fec83bd2123a0f';

  const MAXIMAL_1_4: Omit<PrReviewRecord, 'hash'> = {
    ...MAXIMAL_1_3,
    version: '1.4',
    coverage: COVERAGE,
    bindingBounds: BINDING,
  };

  it('the 1.3 fixture is schema-valid — otherwise the golden below pins the wrong thing', () => {
    const parsed = PrReviewRecordSchema.safeParse({
      ...MAXIMAL_1_3,
      hash: computePrReviewRecordHash(MAXIMAL_1_3),
    });
    expect(parsed.success).toBe(true);
  });

  it('an old 1.3 record without the fields hashes to the pre-#6190 golden (unchanged)', () => {
    expect(computePrReviewRecordHash(MAXIMAL_1_3)).toBe(GOLDEN_1_3);
    expect(verifyPrReviewRecordSet([{ ...MAXIMAL_1_3, hash: GOLDEN_1_3 }]).ok).toBe(true);
  });

  it('a 1.3 record with coverage/bindingBounds explicitly undefined still hashes to the 1.3 golden', () => {
    expect(
      computePrReviewRecordHash({ ...MAXIMAL_1_3, coverage: undefined, bindingBounds: undefined })
    ).toBe(GOLDEN_1_3);
  });

  it('pins the MAXIMAL 1.4 record to a golden captured by execution', () => {
    // Captured by running `computePrReviewRecordHash` on this exact fixture once
    // the projection carried `coverage` and `bindingBounds`, then pinned, and
    // cross-checked against a hand-assembled canonical string sha256'd with
    // node:crypto alone (#6221). If it moves, the canonical order or the
    // present-only rule changed.
    expect(computePrReviewRecordHash(MAXIMAL_1_4)).toBe(
      '3b7a22acb52d01fc59a58e4e4154231c3c1f6ce8bba989a42ae955d8d912ae0a'
    );
  });

  it('the 1.4 fixture is schema-valid and verifies', () => {
    const rec = { ...MAXIMAL_1_4, hash: computePrReviewRecordHash(MAXIMAL_1_4) };
    expect(PrReviewRecordSchema.safeParse(rec).success).toBe(true);
    expect(verifyPrReviewRecordSet([rec]).ok).toBe(true);
  });

  it('a present coverage hashes differently from an absent one', () => {
    expect(computePrReviewRecordHash({ ...MAXIMAL_1_4, coverage: undefined })).not.toBe(
      computePrReviewRecordHash(MAXIMAL_1_4)
    );
  });

  it('every dropped path is hash-covered: removing ONE of forty is a hash_mismatch', () => {
    const authentic = { ...MAXIMAL_1_4, hash: computePrReviewRecordHash(MAXIMAL_1_4) };
    const forged: PrReviewRecord = {
      ...authentic,
      coverage: { ...COVERAGE, droppedFiles: DROPPED_40.slice(0, 39) },
    };
    const result = verifyPrReviewRecordSet([forged]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('folds every coverage and bindingBounds field: flipping any one is a hash_mismatch', () => {
    const authentic = { ...MAXIMAL_1_4, hash: computePrReviewRecordHash(MAXIMAL_1_4) };
    const forgeries: PrReviewRecord[] = [
      { ...authentic, coverage: { ...COVERAGE, panelRead: 'full' } },
      { ...authentic, coverage: { ...COVERAGE, reviewedFiles: 42 } },
      { ...authentic, coverage: { ...COVERAGE, totalFiles: 2 } },
      { ...authentic, coverage: { ...COVERAGE, reviewedBytes: 161_204 } },
      { ...authentic, coverage: { ...COVERAGE, totalBytes: 40_000 } },
      { ...authentic, coverage: { ...COVERAGE, budgetSource: 'binding-cap-fallback' } },
      { ...authentic, coverage: { ...COVERAGE, budgetDetail: 'edited' } },
      { ...authentic, bindingBounds: { kind: 'full', boundBytes: 50_000 } },
      { ...authentic, bindingBounds: { kind: 'prefix', boundBytes: 161_204 } },
    ];
    for (const forged of forgeries) {
      expect(verifyPrReviewRecordSet([forged]).ok).toBe(false);
    }
  });

  it('DETECTS deletion of the whole coverage or bindingBounds field as a hash_mismatch', () => {
    const authentic = { ...MAXIMAL_1_4, hash: computePrReviewRecordHash(MAXIMAL_1_4) };
    for (const field of ['coverage', 'bindingBounds'] as const) {
      const stripped = { ...authentic };
      Reflect.deleteProperty(stripped, field);
      expect(verifyPrReviewRecordSet([stripped]).ok).toBe(false);
    }
  });

  it('is independent of key order at every level (#3962 applied to the nested fields)', () => {
    const reordered = JSON.parse(
      JSON.stringify({
        ...MAXIMAL_1_4,
        coverage: {
          budgetDetail: COVERAGE.budgetDetail,
          droppedFiles: COVERAGE.droppedFiles,
          totalBytes: COVERAGE.totalBytes,
          panelRead: COVERAGE.panelRead,
          budgetSource: COVERAGE.budgetSource,
          reviewedBytes: COVERAGE.reviewedBytes,
          totalFiles: COVERAGE.totalFiles,
          reviewedFiles: COVERAGE.reviewedFiles,
        },
        bindingBounds: { boundBytes: BINDING.boundBytes, kind: BINDING.kind },
      })
    ) as Omit<PrReviewRecord, 'hash'>;
    expect(computePrReviewRecordHash(reordered)).toBe(computePrReviewRecordHash(MAXIMAL_1_4));
  });

  it('the schemas are strict: an unknown key inside coverage or bindingBounds is rejected — a sha256 in particular', () => {
    const rec = { ...MAXIMAL_1_4, hash: computePrReviewRecordHash(MAXIMAL_1_4) };
    expect(
      PrReviewRecordSchema.safeParse({ ...rec, coverage: { ...COVERAGE, extra: 1 } }).success
    ).toBe(false);
    expect(
      PrReviewRecordSchema.safeParse({ ...rec, bindingBounds: { ...BINDING, sha256: 'x' } }).success
    ).toBe(false);
    expect(
      PrReviewRecordSchema.safeParse({ ...rec, bindingBounds: { kind: 'partial', boundBytes: 1 } })
        .success
    ).toBe(false);
  });

  it('the builder passes both fields through and the record verifies', () => {
    const rec = buildPrReviewRecord({
      ...BUILD_MINIMAL,
      coverage: COVERAGE,
      bindingBounds: BINDING,
    });
    expect(rec.coverage?.droppedFiles).toEqual(DROPPED_40);
    expect(rec.bindingBounds).toEqual(BINDING);
    expect(verifyPrReviewRecordSet([rec]).ok).toBe(true);
  });
});
