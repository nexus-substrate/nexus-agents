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
  LEDGER_EXCLUDE_PATHSPEC,
  MAX_REVIEWED_DIFF_BYTES,
} from './reviewed-diff-hash.js';
import { PR_REVIEW_RECORDS_REL_PATH } from './pr-review-record-store.js';

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

describe('canonicalGitDiffArgs ledger-exclusion argv (#4229)', () => {
  it('appends the exclude pathspec AFTER the range, separated by `--`', () => {
    const args = canonicalGitDiffArgs('BASE', 'HEAD');
    // The last three argv elements are the range, the `--` separator, then the
    // single exclude pathspec — no earlier reordering of the pinned config flags.
    expect(args.slice(-3)).toEqual(['BASE..HEAD', '--', LEDGER_EXCLUDE_PATHSPEC]);
  });

  it('excludes ONLY the exact ledger path via git pathspec magic (no glob, no dir)', () => {
    // Pin the exact pathspec so a future edit cannot silently widen it to a glob
    // or a directory (which could hide reviewable code from the canonical diff).
    expect(LEDGER_EXCLUDE_PATHSPEC).toBe(':(exclude)governance/pr-review-records.jsonl');
  });

  it('targets exactly the store ledger path (drift guard against the canonical const)', () => {
    // The excluded path MUST be the same literal the store appends records to;
    // if the store path ever moves, this test fails so the exclusion follows it.
    expect(LEDGER_EXCLUDE_PATHSPEC).toBe(`:(exclude)${PR_REVIEW_RECORDS_REL_PATH}`);
  });
});

describe('ledger exclusion is authenticity-safe (#4229 — real git)', () => {
  let repo: string;

  function git(args: string[]): string {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  function commitAll(msg: string): string {
    git(['add', '-A']);
    git(['commit', '-q', '-m', msg]);
    return git(['rev-parse', 'HEAD']).trim();
  }

  const LEDGER = 'governance/pr-review-records.jsonl';

  let baseSha: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'reviewed-diff-exclude-'));
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    // Base tree: a reviewable code file + an existing ledger + similarly-named
    // decoys that MUST NOT be swept up by the exclusion.
    writeFileSync(join(repo, 'code.ts'), 'export const x = 1;\n');
    execFileSync('mkdir', ['-p', join(repo, 'governance')]);
    writeFileSync(join(repo, LEDGER), '{"seq":0}\n');
    writeFileSync(join(repo, 'governance/other.jsonl'), 'other-a\n');
    writeFileSync(join(repo, `${LEDGER}.bak`), 'bak-a\n');
    baseSha = commitAll('base');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('exclusion works: committing a record to head does NOT change the canonical hash (self-invalidation fix)', () => {
    // Head A — only the code file changes (the diff a record's producer hashed).
    writeFileSync(join(repo, 'code.ts'), 'export const x = 2;\n');
    const headCodeOnly = commitAll('code only');
    const hashCodeOnly = computeReviewedDiffHash(git(canonicalGitDiffArgs(baseSha, headCodeOnly)));

    // Head B — the SAME code change PLUS an appended ledger record (committing the
    // pr_review record to the PR head, which is what would otherwise advance head
    // and self-invalidate the record). Branch fresh from base so only these two
    // files differ.
    git(['checkout', '-q', baseSha]);
    writeFileSync(join(repo, 'code.ts'), 'export const x = 2;\n');
    writeFileSync(join(repo, LEDGER), '{"seq":0}\n{"seq":1,"prNumber":4229}\n');
    const headCodeAndLedger = commitAll('code + ledger record');
    const hashCodeAndLedger = computeReviewedDiffHash(
      git(canonicalGitDiffArgs(baseSha, headCodeAndLedger))
    );

    // The ledger append is invisible to the canonical reviewed diff → same hash.
    expect(hashCodeAndLedger).toBe(hashCodeOnly);
  });

  it('a code-only diff is unaffected by the exclusion (the code change is still reviewed)', () => {
    writeFileSync(join(repo, 'code.ts'), 'export const x = 99;\n');
    const head = commitAll('code only');
    const diff = git(canonicalGitDiffArgs(baseSha, head));
    // The code change is present in the canonical diff (exclusion drops only the ledger).
    expect(diff).toContain('code.ts');
    expect(diff).toContain('export const x = 99;');
    // ...and it differs from the no-op base→base hash (the change is bound).
    const noopHash = computeReviewedDiffHash(git(canonicalGitDiffArgs(baseSha, baseSha)));
    expect(computeReviewedDiffHash(diff)).not.toBe(noopHash);
  });

  it('does NOT drop similarly-named files (governance/other.jsonl, ledger.bak)', () => {
    // Change ONLY the decoys — a too-broad glob/dir exclusion would make this diff
    // empty (and hash equal to a no-op), hiding real content from review.
    writeFileSync(join(repo, 'governance/other.jsonl'), 'other-b\n');
    writeFileSync(join(repo, `${LEDGER}.bak`), 'bak-b\n');
    const head = commitAll('decoys');
    const diff = git(canonicalGitDiffArgs(baseSha, head));
    expect(diff).toContain('governance/other.jsonl');
    expect(diff).toContain('governance/pr-review-records.jsonl.bak');
    const noopHash = computeReviewedDiffHash(git(canonicalGitDiffArgs(baseSha, baseSha)));
    expect(computeReviewedDiffHash(diff)).not.toBe(noopHash);
  });

  it('cannot smuggle non-ledger changes: a ledger+code diff still binds the code', () => {
    // A hostile head that edits BOTH the ledger and a code file: the exclusion
    // hides ONLY the ledger, never the code — so the hash still reflects the code
    // change (identical to the code-only diff, and different from a pure no-op).
    writeFileSync(join(repo, 'code.ts'), 'export const x = 7;\n');
    writeFileSync(join(repo, LEDGER), '{"seq":0}\n{"smuggle":true}\n');
    const head = commitAll('ledger + code');
    const excluded = git(canonicalGitDiffArgs(baseSha, head));
    // Code IS in the excluded diff.
    expect(excluded).toContain('export const x = 7;');
    // The ledger line is NOT.
    expect(excluded).not.toContain('smuggle');

    // Same code change without the ledger edit → identical canonical hash.
    git(['checkout', '-q', baseSha]);
    writeFileSync(join(repo, 'code.ts'), 'export const x = 7;\n');
    const headCodeOnly = commitAll('code only');
    expect(computeReviewedDiffHash(excluded)).toBe(
      computeReviewedDiffHash(git(canonicalGitDiffArgs(baseSha, headCodeOnly)))
    );
    // ...and still different from a no-op (the code change is bound, not hidden).
    expect(computeReviewedDiffHash(excluded)).not.toBe(
      computeReviewedDiffHash(git(canonicalGitDiffArgs(baseSha, baseSha)))
    );
  });
});
