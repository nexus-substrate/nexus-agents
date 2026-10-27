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
});
