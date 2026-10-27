/** Local pre-builder disclosure, with an owned TEST_FAKE ledger and no voters. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../core/index.js';
import {
  PR_REVIEW_RECORDS_PATH_ENV,
  readPrReviewRecords,
} from '../../audit/pr-review-record-store.js';
import { computePrReviewRecordHash } from '../../audit/pr-review-record.js';
import { computeReviewedDiffHash } from '../../audit/reviewed-diff-hash.js';
import {
  persistReviewRecord,
  type LocalDiffReduction,
  type PersistReviewRecordArgs,
} from './pr-review-record-producer.js';

const DIFF = 'diff --git a/TEST_FAKE b/TEST_FAKE\n@@ -1 +1 @@\n-old\n+é😀tail\n';
const PREFIX = DIFF.slice(0, -5);
const REDUCTION: LocalDiffReduction = {
  prefixCodeUnits: PREFIX.length,
  totalCodeUnits: DIFF.length,
  prefixUtf8Bytes: Buffer.byteLength(PREFIX),
  totalUtf8Bytes: Buffer.byteLength(DIFF),
  marker: '\n[...truncated]',
};
function args(localDiffReduction?: LocalDiffReduction): PersistReviewRecordArgs {
  return {
    input: {
      prTitle: 'TEST_FAKE title',
      prDiff: DIFF,
      prNumber: 7604,
      baseSha: 'a'.repeat(40),
      simulate: false,
      errorPolicy: 'standard',
      dispatch: 'sync',
    },
    sanitization: undefined,
    diffSource: 'canonical-git',
    aggregate: { decision: 'approve', verified: true },
    counts: { approveCount: 5, requestChangesCount: 0, abstainCount: 0, errorCount: 0 },
    reviewCount: 5,
    logger: createLogger({ component: 'TEST_FAKE-local-disclosure' }),
    localDiffReduction,
  };
}

describe('local pre-builder disclosure validation', () => {
  let dir: string;
  let ledger: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'TEST_FAKE-reduction-'));
    ledger = join(dir, 'records.jsonl');
    vi.stubEnv(PR_REVIEW_RECORDS_PATH_ENV, ledger);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps legacy absence unspecified and hash parity unchanged', () => {
    expect(persistReviewRecord(args()).persisted).toBe(true);
    const record = readPrReviewRecords(ledger).records[0];
    expect(record?.summary).not.toContain('pre-builder');
    expect(record?.summary).not.toContain('builder sanitization');
    expect(record?.coverage).toBeUndefined();
    expect(record?.bindingBounds).toBeUndefined();
    expect(record?.reviewedDiffHash).toBe(computeReviewedDiffHash(DIFF));
  });

  it('hash-covers an actual prefix disclosure without changing aggregate semantics', () => {
    expect(persistReviewRecord(args(REDUCTION)).persisted).toBe(true);
    const record = readPrReviewRecords(ledger).records[0];
    if (record === undefined) throw new Error('Expected TEST_FAKE record');
    expect(record.summary).toContain('additional inspection UNMEASURED');
    expect(record.verified).toBe(true);
    expect(record.coverage).toBeUndefined();
    expect(record.bindingBounds).toBeUndefined();
    expect(record.reviewedDiffHash).toBe(computeReviewedDiffHash(DIFF));
    expect(computePrReviewRecordHash(record)).toBe(record.hash);
    expect(
      computePrReviewRecordHash({
        ...record,
        summary: record.summary.replace('UNMEASURED', 'TEST_FAKE'),
      })
    ).not.toBe(record.hash);
  });

  it.each([
    { prefixCodeUnits: 0 },
    { prefixCodeUnits: -1 },
    { prefixCodeUnits: NaN },
    { prefixCodeUnits: Infinity },
    { prefixCodeUnits: REDUCTION.totalCodeUnits },
    { totalCodeUnits: REDUCTION.totalCodeUnits + 1 },
    { prefixUtf8Bytes: 1 },
    { totalUtf8Bytes: REDUCTION.totalCodeUnits },
    { marker: '' },
    { marker: 'x'.repeat(65) },
    { unexpected: 'TEST_FAKE' },
  ])(
    'refuses malformed or inconsistent measurements %j rather than inventing defaults',
    (change) => {
      const outcome = persistReviewRecord(args({ ...REDUCTION, ...change }));
      expect(outcome.persisted).toBe(false);
      if (outcome.persisted) throw new Error('Expected refusal');
      expect(outcome.reason).toBe('write-failed');
      expect(readPrReviewRecords(ledger).records).toHaveLength(0);
    }
  );

  it('refuses local measurements on the caller-supplied MCP door', () => {
    const outcome = persistReviewRecord({ ...args(REDUCTION), diffSource: 'caller-supplied' });
    expect(outcome.persisted).toBe(false);
    expect(readPrReviewRecords(ledger).records).toHaveLength(0);
  });

  function withBuilderFacts(facts: unknown): PersistReviewRecordArgs {
    const value = args();
    Reflect.set(value, 'builderSanitization', facts);
    return value;
  }

  it('records measured clean builder facts explicitly without claiming inspection', () => {
    const clean = {
      commentsRemoved: 0,
      tagsRemoved: 0,
      modifiedCount: 0,
      wasModified: false,
      sanitizationIncomplete: false,
    };
    expect(persistReviewRecord(withBuilderFacts(clean)).persisted).toBe(true);
    const record = readPrReviewRecords(ledger).records[0];
    expect(record?.summary).toContain('builder sanitization: 0 comments, 0 tags, 0 changed fields');
    expect(record?.summary).toContain('modified=false; incomplete=false');
    expect(record?.coverage).toBeUndefined();
    expect(record?.bindingBounds).toBeUndefined();
  });

  it('keeps maximum builder counters and supported diff/marker widths before a long title', () => {
    // Actual tool acceptance is 2,000,000 JS units; use the widest UTF-8 BMP text.
    const diff = DIFF + '界'.repeat(2_000_000 - DIFF.length);
    const prefix = diff.slice(0, 50_000);
    const value = {
      ...args(),
      input: { ...args().input, prTitle: '😀'.repeat(600), prDiff: diff },
      localDiffReduction: {
        prefixCodeUnits: prefix.length,
        totalCodeUnits: diff.length,
        prefixUtf8Bytes: Buffer.byteLength(prefix),
        totalUtf8Bytes: Buffer.byteLength(diff),
        marker: '界'.repeat(64),
      },
    };
    const facts = {
      commentsRemoved: Number.MAX_SAFE_INTEGER,
      tagsRemoved: Number.MAX_SAFE_INTEGER,
      modifiedCount: 4,
      wasModified: true,
      sanitizationIncomplete: true,
    };
    expect(persistReviewRecord({ ...value, builderSanitization: facts }).persisted).toBe(true);
    const record = readPrReviewRecords(ledger).records[0];
    if (record === undefined) throw new Error('Expected maximum-width record');
    expect(record.summary.slice(0, 500)).toContain('scope=title/description/diff/context');
    expect(record.summary.slice(0, 500)).toContain('incomplete=true');
    expect(record.summary.slice(0, 500)).toContain('additional inspection UNMEASURED]');
    expect(record.summary).toContain('9007199254740991 comments, 9007199254740991 tags');
    expect(record.coverage).toBeUndefined();
    expect(record.bindingBounds).toBeUndefined();
    expect(computePrReviewRecordHash(record)).toBe(record.hash);
    expect(
      computePrReviewRecordHash({
        ...record,
        summary: record.summary.replace('incomplete=true', 'incomplete=false'),
      })
    ).not.toBe(record.hash);
  });

  it('refuses builder facts combined with MCP source or full-sanitization metadata', () => {
    const facts = {
      commentsRemoved: 0,
      tagsRemoved: 0,
      modifiedCount: 0,
      wasModified: false,
      sanitizationIncomplete: false,
    };
    for (const value of [
      { ...args(), builderSanitization: facts, diffSource: 'caller-supplied' as const },
      {
        ...args(),
        builderSanitization: facts,
        sanitization: {
          rawDiffHash: computeReviewedDiffHash(DIFF),
          rawDiffBytes: Buffer.byteLength(DIFF),
          rawTruncated: false,
          commentsRemoved: 0,
          fieldsModified: 0,
          tagsRemoved: 0,
        },
      },
    ]) {
      expect(persistReviewRecord(value).persisted).toBe(false);
    }
    expect(readPrReviewRecords(ledger).records).toHaveLength(0);
  });

  it('refuses builder facts paired with panel coverage rather than claiming a combined measurement', () => {
    const value: PersistReviewRecordArgs = {
      ...withBuilderFacts({
        commentsRemoved: 0,
        tagsRemoved: 0,
        modifiedCount: 0,
        wasModified: false,
        sanitizationIncomplete: false,
      }),
      coverage: {
        reviewedFiles: 1,
        totalFiles: 1,
        droppedFiles: [],
        partial: false,
        panelRead: 'full',
        binding: 'full',
        bindingSource: 'input',
        reviewedBytes: Buffer.byteLength(DIFF),
        boundBytes: Buffer.byteLength(DIFF),
        totalBytes: Buffer.byteLength(DIFF),
        budgetSource: 'binding-cap-fallback',
        budgetDetail: 'TEST_FAKE',
      },
    };
    const outcome = persistReviewRecord(value);
    expect(outcome.persisted).toBe(false);
    if (outcome.persisted) throw new Error('Expected coverage combination refusal');
    expect(outcome.reason).toBe('write-failed');
    expect(readPrReviewRecords(ledger).records).toHaveLength(0);
  });

  it.each([
    null,
    {},
    { commentsRemoved: -1 },
    { tagsRemoved: NaN },
    { commentsRemoved: Infinity },
    { commentsRemoved: Number.MAX_SAFE_INTEGER + 1 },
    { modifiedCount: 5 },
    { wasModified: true },
    { commentsRemoved: 1 },
    { unexpected: 'TEST_FAKE' },
  ])('refuses supplied invalid builder facts %j instead of inventing zero', (change) => {
    const clean = {
      commentsRemoved: 0,
      tagsRemoved: 0,
      modifiedCount: 0,
      wasModified: false,
      sanitizationIncomplete: false,
    };
    const facts =
      change === null || Object.keys(change).length === 0 ? change : { ...clean, ...change };
    const outcome = persistReviewRecord(withBuilderFacts(facts));
    expect(outcome.persisted).toBe(false);
    if (outcome.persisted) throw new Error('Expected invalid builder facts refusal');
    expect(outcome.reason).toBe('write-failed');
    expect(readPrReviewRecords(ledger).records).toHaveLength(0);
  });
});
