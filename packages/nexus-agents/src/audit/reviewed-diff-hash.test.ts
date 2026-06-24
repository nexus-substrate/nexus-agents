/**
 * Tests for the canonical reviewed-diff hash (#3831 Option-C binding).
 *
 * The load-bearing test (panel condition A): the canonical `git diff` invocation
 * must produce BYTE-IDENTICAL output regardless of the host's local gitconfig, so
 * the producer's `reviewedDiffHash` and the gate's recomputation cannot drift.
 * This exercises a REAL git repo with HOSTILE config (not a shared in-process
 * helper) — per the Contrarian's "a same-helper test is theater".
 *
 * @module audit/reviewed-diff-hash.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeReviewedDiffHash,
  reviewedDiffWasTruncated,
  canonicalGitDiffArgs,
  MAX_REVIEWED_DIFF_BYTES,
} from './reviewed-diff-hash.js';

describe('computeReviewedDiffHash', () => {
  it('is deterministic for the same bytes', () => {
    const diff = 'diff --git a/x b/x\n+hello\n';
    expect(computeReviewedDiffHash(diff)).toBe(computeReviewedDiffHash(diff));
    expect(computeReviewedDiffHash(diff)).toHaveLength(64);
  });

  it('binds only the first MAX_REVIEWED_DIFF_BYTES (content past the cap is unbound)', () => {
    const head = 'A'.repeat(MAX_REVIEWED_DIFF_BYTES);
    // Two diffs that share the first 50k bytes but differ after → same hash.
    expect(computeReviewedDiffHash(head + 'tailX')).toBe(computeReviewedDiffHash(head + 'tailY'));
    // A change WITHIN the cap flips the hash.
    expect(computeReviewedDiffHash(head)).not.toBe(computeReviewedDiffHash('B' + head.slice(1)));
  });

  it('truncates on a byte boundary (multibyte-safe, no throw)', () => {
    const multibyte = '€'.repeat(MAX_REVIEWED_DIFF_BYTES); // 3 bytes each → well over cap
    expect(() => computeReviewedDiffHash(multibyte)).not.toThrow();
    expect(computeReviewedDiffHash(multibyte)).toHaveLength(64);
  });

  it('reviewedDiffWasTruncated flags over-cap diffs by byte length', () => {
    expect(reviewedDiffWasTruncated('a'.repeat(MAX_REVIEWED_DIFF_BYTES))).toBe(false);
    expect(reviewedDiffWasTruncated('a'.repeat(MAX_REVIEWED_DIFF_BYTES + 1))).toBe(true);
    // 2-byte chars: 25_001 of them = 50_002 bytes > cap.
    expect(reviewedDiffWasTruncated('é'.repeat(MAX_REVIEWED_DIFF_BYTES / 2 + 1))).toBe(true);
  });
});

describe('canonical git diff is config-invariant (panel condition A — cross-env)', () => {
  let repo: string;

  function git(args: string[]): string {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'reviewed-diff-git-'));
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    writeFileSync(join(repo, 'f.txt'), 'line1\nline2\nline3\nline4\nline5\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'base']);
    writeFileSync(join(repo, 'f.txt'), 'line1\nline2\nCHANGED\nline4\nline5\nline6\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'head']);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('produces an identical hash under hostile, differing local gitconfig', () => {
    const base = git(['rev-parse', 'HEAD~1']).trim();
    const head = git(['rev-parse', 'HEAD']).trim();

    // Config set A — non-default context, patience algorithm, mnemonic prefixes.
    git(['config', 'diff.context', '9']);
    git(['config', 'diff.algorithm', 'patience']);
    git(['config', 'diff.mnemonicPrefix', 'true']);
    git(['config', 'core.autocrlf', 'true']);
    const diffA = git(canonicalGitDiffArgs(base, head));
    const hashA = computeReviewedDiffHash(diffA);

    // Config set B — different hostile values. The pinned `-c` overrides + flags
    // in canonicalGitDiffArgs must neutralize BOTH.
    git(['config', 'diff.context', '1']);
    git(['config', 'diff.algorithm', 'histogram']);
    git(['config', 'diff.noprefix', 'true']);
    const diffB = git(canonicalGitDiffArgs(base, head));
    const hashB = computeReviewedDiffHash(diffB);

    expect(diffA).toBe(diffB); // byte-identical output
    expect(hashA).toBe(hashB); // therefore identical hash
    expect(hashA).toHaveLength(64);
  });

  it('producer-side and gate-side compute the SAME hash for the reviewed diff', () => {
    const base = git(['rev-parse', 'HEAD~1']).trim();
    const head = git(['rev-parse', 'HEAD']).trim();
    // "Producer side": the diff text handed to the pr_review tool (produced via the
    // canonical invocation, per the binding contract).
    const reviewedDiff = git(canonicalGitDiffArgs(base, head));
    const producerHash = computeReviewedDiffHash(reviewedDiff);
    // "Gate side": recompute from raw SHAs in CI via the same canonical invocation.
    const gateHash = computeReviewedDiffHash(git(canonicalGitDiffArgs(base, head)));
    expect(producerHash).toBe(gateHash);
  });
});
