/**
 * Tests for the pr-review-local ledger feeder (#4229, epic #4226 child B).
 *
 * The load-bearing invariant (Part 2): a completed local review persists a
 * governance record whose `reviewedDiffHash` is BYTE-IDENTICAL to what the
 * governor gate recomputes from the same `base..head` — i.e. the record the gate
 * would MATCH. The feeder guarantees this by hashing the SAME canonical,
 * ledger-excluded diff (`canonicalGitDiffArgs` → `computeReviewedDiffHash`) that
 * `scripts/check-governor-review.ts` recomputes. This test drives a REAL git repo
 * (not a shared in-process helper) so the parity is proven against actual git
 * output, and it appends a ledger line to head to prove the exclusion makes
 * committing the record hash-safe.
 *
 * @module scripts/pr-review-local.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fetchPrMeta,
  generateCanonicalReviewDiff,
  feedLedgerFromReview,
  type GhGitExec,
} from './pr-review-local-ledger.js';
import {
  canonicalGitDiffArgs,
  computeReviewedDiffHash,
} from '../packages/nexus-agents/src/audit/reviewed-diff-hash.js';
import {
  readPrReviewRecords,
  PR_REVIEW_RECORDS_PATH_ENV,
} from '../packages/nexus-agents/src/audit/index.js';

describe('fetchPrMeta (base/head SHA fetch, #4229 Part 2)', () => {
  it('requests the pulls endpoint and returns base.sha / head.sha', async () => {
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];
    const exec: GhGitExec = (cmd, args) => {
      calls.push({ cmd, args });
      return Promise.resolve({
        stdout: JSON.stringify({
          title: 'T',
          body: 'B',
          baseRef: 'main',
          headRef: 'feat/x',
          baseSha: 'a'.repeat(40),
          headSha: 'b'.repeat(40),
        }),
        stderr: '',
      });
    };
    const meta = await fetchPrMeta(4229, exec);
    expect(meta.baseSha).toBe('a'.repeat(40));
    expect(meta.headSha).toBe('b'.repeat(40));
    expect(meta.title).toBe('T');
    // The jq must pull the SHAs (.base.sha/.head.sha), not just the ref names.
    const gh = calls.find((c) => c.cmd === 'gh');
    expect(gh).toBeDefined();
    const jq = gh?.args.join(' ') ?? '';
    expect(jq).toContain('.base.sha');
    expect(jq).toContain('.head.sha');
  });

  it('resolves baseSha to the merge-base, not the API base.sha (#5692)', async () => {
    // The governor gate recomputes the reviewed-diff hash from
    // `git merge-base origin/<base_ref> <head>` since #5476. The API's
    // `.base.sha` is the branch tip at PR-open time, so on a branch whose base
    // has advanced the record hashed a diff containing other people's commits
    // and could never match the gate.
    const mergeBase = 'c'.repeat(40);
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];
    const exec: GhGitExec = (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === 'git' && args[0] === 'merge-base') {
        return Promise.resolve({ stdout: `${mergeBase}\n`, stderr: '' });
      }
      return Promise.resolve({
        stdout: JSON.stringify({
          title: 'T',
          body: 'B',
          baseRef: 'main',
          headRef: 'feat/x',
          baseSha: 'a'.repeat(40),
          headSha: 'b'.repeat(40),
        }),
        stderr: '',
      });
    };

    const meta = await fetchPrMeta(5692, exec);

    expect(meta.baseSha).toBe(mergeBase);
    expect(meta.apiBaseSha).toBe('a'.repeat(40));
    const mb = calls.find((c) => c.cmd === 'git' && c.args[0] === 'merge-base');
    expect(mb?.args).toEqual(['merge-base', 'origin/main', 'b'.repeat(40)]);
  });

  it('falls back to the API base.sha when the merge-base cannot be computed (#5692)', async () => {
    // A shallow clone or an unfetched base ref must not yield an empty baseSha:
    // the old value is still the honest best effort, and the record carries
    // apiBaseSha so a reader can tell which one was used.
    const exec: GhGitExec = (cmd, args) => {
      if (cmd === 'git' && args[0] === 'merge-base') return Promise.reject(new Error('no ref'));
      if (cmd === 'git') return Promise.resolve({ stdout: '', stderr: '' });
      return Promise.resolve({
        stdout: JSON.stringify({
          title: 'T',
          body: 'B',
          baseRef: 'main',
          headRef: 'feat/x',
          baseSha: 'a'.repeat(40),
          headSha: 'b'.repeat(40),
        }),
        stderr: '',
      });
    };

    const meta = await fetchPrMeta(5692, exec);

    expect(meta.baseSha).toBe('a'.repeat(40));
    expect(meta.apiBaseSha).toBe('a'.repeat(40));
  });
});

describe('pr-review-local ledger feeder (#4229 Part 2 — real git)', () => {
  let repo: string;
  let ledgerPath: string;

  function git(args: string[]): string {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  }

  const LEDGER = 'governance/pr-review-records.jsonl';

  let baseSha: string;
  let headSha: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'pr-review-local-repo-'));
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    writeFileSync(join(repo, 'code.ts'), 'export const x = 1;\n');
    mkdirSync(join(repo, 'governance'), { recursive: true });
    writeFileSync(join(repo, LEDGER), '{"seq":0}\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    baseSha = git(['rev-parse', 'HEAD']).trim();
    // Head advances BOTH a reviewable code file AND the ledger (as if the record
    // were already committed to head) — the exclusion must keep the hash stable.
    writeFileSync(join(repo, 'code.ts'), 'export const x = 2;\n');
    writeFileSync(join(repo, LEDGER), '{"seq":0}\n{"seq":1,"prNumber":4229}\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'head']);
    headSha = git(['rev-parse', 'HEAD']).trim();

    // Redirect the ledger the producer writes to at a temp file we can inspect.
    ledgerPath = join(
      mkdtempSync(join(tmpdir(), 'pr-review-local-ledger-')),
      'pr-review-records.jsonl'
    );
    vi.stubEnv(PR_REVIEW_RECORDS_PATH_ENV, ledgerPath);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(repo, { recursive: true, force: true });
  });

  it('generateCanonicalReviewDiff excludes the ledger from the reviewed diff', async () => {
    const diff = await generateCanonicalReviewDiff(baseSha, headSha, execAsyncGit(repo), repo);
    expect(diff).toContain('code.ts');
    expect(diff).not.toContain('"prNumber":4229'); // the ledger append is excluded
  });

  it('persists a record whose reviewedDiffHash EQUALS the gate recompute (the record the gate MATCHES)', async () => {
    // What the CI governor gate would recompute for this PR's base..head.
    const gateHash = computeReviewedDiffHash(
      execFileSync('git', canonicalGitDiffArgs(baseSha, headSha), {
        cwd: repo,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      })
    );

    const outcome = await feedLedgerFromReview({
      prNumber: 4229,
      baseSha,
      headSha,
      title: 'feed the ledger',
      aggregate: { decision: 'approve', verified: true },
      counts: { approveCount: 5, requestChangesCount: 0, abstainCount: 0, errorCount: 0 },
      reviewCount: 5,
      exec: execAsyncGit(repo),
      cwd: repo,
    });

    expect(outcome.persisted).toBe(true);
    if (!outcome.persisted) throw new Error('expected persisted record');
    // THE INVARIANT: the persisted hash matches what the gate recomputes.
    expect(outcome.reviewedDiffHash).toBe(gateHash);
    expect(outcome.baseSha).toBe(baseSha);

    // And the on-disk record (what the gate reads) matches too.
    const { records } = readPrReviewRecords(ledgerPath);
    expect(records).toHaveLength(1);
    expect(records[0]?.reviewedDiffHash).toBe(gateHash);
    expect(records[0]?.prNumber).toBe(4229);
    expect(records[0]?.baseSha).toBe(baseSha);
    // #4459: the feeder's diff is ALWAYS the canonical git diff, and this
    // fixture is a real git diff, so both provenance signals are pinned here.
    expect(records[0]?.diffProvenance).toEqual({
      source: 'canonical-git',
      fileBoundaries: true,
    });
  });

  it('does NOT bypass the producer live-review guard (all-errored panel → no record)', async () => {
    const outcome = await feedLedgerFromReview({
      prNumber: 4229,
      baseSha,
      headSha,
      title: 'all voters errored',
      aggregate: { decision: 'abstain', verified: false },
      counts: { approveCount: 0, requestChangesCount: 0, abstainCount: 0, errorCount: 5 },
      reviewCount: 5,
      exec: execAsyncGit(repo),
      cwd: repo,
    });
    expect(outcome.persisted).toBe(false);
    if (outcome.persisted) throw new Error('expected skip');
    expect(outcome.reason).toBe('no-live-votes');
    const { records } = readPrReviewRecords(ledgerPath);
    expect(records).toHaveLength(0);
  });
});

/** A GhGitExec that runs `git` for real (in `cwd`) and rejects any non-git command. */
function execAsyncGit(cwd: string): GhGitExec {
  // eslint-disable-next-line @typescript-eslint/require-await -- async so a throw becomes a rejection
  return async (cmd, args, options) => {
    if (cmd !== 'git') throw new Error(`unexpected command in test: ${cmd}`);
    const stdout = execFileSync('git', [...args], {
      cwd: options?.cwd ?? cwd,
      encoding: 'utf-8',
      maxBuffer: options?.maxBuffer ?? 16 * 1024 * 1024,
    });
    return { stdout, stderr: '' };
  };
}
