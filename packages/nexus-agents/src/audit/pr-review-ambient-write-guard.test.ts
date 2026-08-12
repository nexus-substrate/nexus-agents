/**
 * Guard against tests appending to the real pr-review audit chain (#4415).
 *
 * `governance/pr-review-records.jsonl` is tracked, hash-chained, and read by
 * `verify_audit_chain`. During #4412 three fabricated records were appended to
 * it by a test — `prNumber: 4279`, `baseSha: "dddd…"` — and they chained
 * correctly onto each other, so nothing downstream would have flagged them.
 * They were caught only because `git status` showed a tracked file dirty.
 *
 * The mechanism is the cwd fallback: with no explicit target,
 * `resolvePrReviewRecordsPath` detects the repo from `process.cwd()`, and
 * under a test runner that is this checkout. The specific test involved had
 * chdir'd to a temp dir to avoid exactly this, which worked only while temp
 * dirs happened to live outside the checkout.
 *
 * The guard sits on the WRITE and keys on the destination, not on how the path
 * was derived — an explicit `filePath` aimed at the same tracked file is the
 * same harm. Resolution stays unguarded: it is a query, and tests legitimately
 * assert its fall-through behaviour (#4278/#4312) without writing anything.
 * That distinction was not obvious to me until guarding resolution broke two
 * of those tests.
 *
 * @module audit/pr-review-ambient-write-guard.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  persistPrReviewRecord,
  resolvePrReviewRecordsPath,
  PR_REVIEW_RECORDS_PATH_ENV,
  PR_REVIEW_RECORDS_REL_PATH,
} from './pr-review-record-store.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';

/** Minimal valid record input. */
function sampleRecord(): Parameters<typeof persistPrReviewRecord>[0] {
  return {
    prNumber: 1,
    baseSha: 'a'.repeat(40),
    reviewedDiffHash: 'b'.repeat(64),
    verdict: 'approve',
    verified: true,
    voteCounts: { approve: 1, request_changes: 0, abstain: 0, error: 0, total: 1 },
    summary: 'guard fixture — must never reach the tracked chain',
  };
}

/** A real throwaway git repo — the shape a legitimate persistence test uses. */
function makeRepo(): string {
  const root = mkdtempOutsideRepo('pr-review-guard-repo-');
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

describe('ambient-write guard (#4415)', () => {
  const saved = process.env[PR_REVIEW_RECORDS_PATH_ENV];
  const made: string[] = [];

  beforeEach(() => {
    delete process.env['NEXUS_PR_REVIEW_RECORDS_PATH'];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['NEXUS_PR_REVIEW_RECORDS_PATH'];
    else process.env[PR_REVIEW_RECORDS_PATH_ENV] = saved;
    for (const d of made) rmSync(d, { recursive: true, force: true });
    made.length = 0;
  });

  it('refuses to WRITE the ambient repo chain under a test runner', () => {
    // cwd is this checkout, so the fallback resolves to the real tracked
    // chain. Throwing is the point: a silent append is indistinguishable from
    // a genuine review verdict once it is hash-chained.
    expect(() => persistPrReviewRecord(sampleRecord())).toThrow(/#4415/);
  });

  it('names the offending path in the error', () => {
    // A guard that fires without saying what it blocked just moves the
    // confusion somewhere else.
    expect(() => persistPrReviewRecord(sampleRecord())).toThrow(/pr-review-records\.jsonl/);
  });

  it('refuses an explicit filePath aimed at the same tracked file', () => {
    // The guard is on the DESTINATION, not the derivation — otherwise the
    // escape hatches become a way to launder the same write.
    const here = process.cwd();
    const target = join(here.slice(0, here.indexOf('/packages')), PR_REVIEW_RECORDS_REL_PATH);

    expect(() => persistPrReviewRecord({ ...sampleRecord(), filePath: target })).toThrow(/#4415/);
  });

  it('still allows a write into a throwaway repo', () => {
    // The legitimate persistence test must keep working end to end.
    const repo = makeRepo();
    made.push(repo);

    const written = persistPrReviewRecord({ ...sampleRecord(), repoPathOverride: repo });

    expect(written).toBeDefined();
    expect(existsSync(join(repo, PR_REVIEW_RECORDS_REL_PATH))).toBe(true);
  });

  it('allows an explicit repoPathOverride to a throwaway repo', () => {
    // The legitimate shape: a test that means to exercise persistence points
    // at a repo it created. This must keep working.
    const repo = makeRepo();
    made.push(repo);

    expect(resolvePrReviewRecordsPath(repo)).toBe(join(repo, PR_REVIEW_RECORDS_REL_PATH));
  });

  it('allows an explicit env path', () => {
    const dir = mkdtempOutsideRepo('pr-review-guard-env-');
    made.push(dir);
    const target = join(dir, 'records.jsonl');
    process.env[PR_REVIEW_RECORDS_PATH_ENV] = target;

    expect(resolvePrReviewRecordsPath()).toBe(target);
  });

  it('still refuses when an override points into the source checkout', () => {
    // The override escape hatch must not become a way to launder an ambient
    // write: passing this repo's own root is the same destination.
    expect(() =>
      persistPrReviewRecord({ ...sampleRecord(), repoPathOverride: process.cwd() })
    ).toThrow(/#4415/);
  });

  it('does not fire for an override to a nested throwaway repo', () => {
    // A repo created *inside* a temp dir is fine — the check is "is this the
    // source checkout", not "does the path contain governance/".
    const repo = makeRepo();
    made.push(repo);
    const nested = join(repo, 'sub');
    mkdirSync(nested, { recursive: true });

    expect(resolvePrReviewRecordsPath(nested)).toBe(join(repo, PR_REVIEW_RECORDS_REL_PATH));
  });
});
