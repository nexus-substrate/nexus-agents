/**
 * The checkout half of the moved-head rule (#6256).
 *
 * `governor-ledger-evidence.ts` decides whether a record bound to an EARLIER
 * head of a PR still ratifies the current head; this module answers the
 * three questions that decision needs about one sha, by running `git` in
 * the checkout the gate runs in:
 *
 * 1. Is the commit object present? A merge from main keeps the ratified
 *    commit as an ancestor; a rebase orphans it, so a missing commit is
 *    fetched from `origin` by sha once. GitHub serves any object by sha —
 *    measured on a fresh shallow clone against the rebased-away heads of
 *    #6252 (`fca64e9ea8`, `cce938eec2`), each `git fetch origin <sha>`
 *    exit 0 and not an ancestor of main. Still missing ⇒ `object-missing`,
 *    which the gate reports as `sha-mismatch` naming it.
 * 2. What is the NON-LEDGER PATCH IDENTITY? `sha256` over
 *    `git diff -U0 <merge-base(sha, PR base)> <sha> -- . ':!governance/vote-records.jsonl'`
 *    with the `index` lines removed and each `@@` hunk header reduced to
 *    `@@` (`patchIdentityOf`). `-U0` and not the default three lines of
 *    context: #6282's SKILL.md hunk, ratified at `43cb8bec` and refreshed by
 *    a merge from main to `8618d18d`, differs at -U3 only in a trailing
 *    context line — main's newer PIPELINE NOTE, which every workflow PR
 *    appends — and is byte-identical at -U0. Not `git patch-id`: it strips
 *    whitespace before hashing, so a whitespace-only edit inside a string
 *    literal would read as the same patch; this identity keeps every byte of
 *    every hunk. The PR base is `PR_BASE_SHA`, the head's merge-base with
 *    the base branch: the merge-base of an earlier head with THAT commit is
 *    the earlier head's own fork point, whether the head was refreshed by a
 *    merge (the fork point precedes the merged-in main commit) or a rebase.
 * 3. What did the ledger hold at that sha, and is the sha an ancestor of
 *    the head? The first feeds the append-only comparison between the two
 *    heads; the second only labels the notice (`ancestor` for a merge from
 *    main, `rewritten-history` for a rebase).
 *
 * Disclosed limit of the identity: with `-U0` and no line numbers it is
 * position-insensitive WITHIN a file — the same added and removed lines at
 * another location in the same file hash the same. Every other change (a
 * byte in any non-ledger file, a file added or dropped, a mode change)
 * changes it.
 *
 * Every sha that reaches this module comes from the ledger — untrusted
 * bytes — and is validated as a bare 40-hex sha before it is passed to
 * git, where a leading `-` would read as an option. `git` runs with a fixed
 * argument array and never a shell.
 *
 * @module scripts/governor-patch-identity
 * (Source: Issue #6256, #6252, #6282)
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { VOTE_RECORDS_REL_PATH } from '../packages/nexus-agents/src/audit/vote-record-store.js';

/**
 * What the checkout says about one sha. `measured` carries the three facts
 * the moved-head rule compares; the other two kinds each name why the sha
 * cannot be compared, and the gate prints that reason on the `sha-mismatch`
 * line rather than reading absence as a mismatch of unknown cause.
 */
export type PatchIdentity =
  | { readonly kind: 'object-missing'; readonly detail: string }
  | { readonly kind: 'unmeasured'; readonly detail: string }
  | {
      readonly kind: 'measured';
      /**
       * `sha256:<hex>` over the normalized `-U0` non-ledger diff from the
       * sha's merge-base with the PR base — or `EMPTY_PATCH_IDENTITY` when
       * nothing but the ledger differs from that base (a ledger-only PR).
       */
      readonly patchIdentity: string;
      /** The ledger's bytes at the sha; `''` when the file did not exist there. */
      readonly ledgerText: string;
      /** True when the sha is an ancestor of the head (a merge from main); false after a rebase. */
      readonly ancestorOfHead: boolean;
    };

export type PatchIdentityProbe = (sha: string) => PatchIdentity;

/** The identity of a diff that touches nothing outside the ledger — named, not the hash of `''`. */
export const EMPTY_PATCH_IDENTITY = 'empty (no non-ledger change)';

const FULL_SHA = /^[0-9a-f]{40}$/i;

/** A bare 40-hex commit sha — the only shape passed to git. */
export function isFullSha(value: string): boolean {
  return FULL_SHA.test(value);
}

type GitResult =
  { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly detail: string };

/** One `git` invocation with a fixed argument array and no shell. */
function runGit(repoDir: string, args: readonly string[]): GitResult {
  const result = spawnSync('git', [...args], {
    cwd: repoDir,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return { ok: false, detail: `git ${args[0] ?? ''} could not run: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const stderr = result.stderr.trim().split('\n')[0] ?? '';
    return {
      ok: false,
      detail: `git ${args.join(' ')} exited ${String(result.status)}: ${stderr}`,
    };
  }
  return { ok: true, stdout: result.stdout };
}

/**
 * The patch identity of a unified diff: `sha256` over its bytes with the
 * `index <blob>..<blob>` lines removed (the pre-image blob differs whenever
 * the base moved) and each `@@ … @@` hunk header reduced to `@@` (its line
 * numbers and function context differ whenever earlier lines moved). Both
 * are header lines by the diff format — a body line always begins with
 * `+`, `-`, ` ` or `\` — so nothing inside a hunk is touched, whitespace
 * included. The empty diff is `EMPTY_PATCH_IDENTITY`, named rather than
 * hashed, so a ledger-only PR reads as such in the log.
 */
export function patchIdentityOf(diff: string): string {
  if (diff.trim() === '') return EMPTY_PATCH_IDENTITY;
  const normalized = diff
    .split('\n')
    .filter((line) => !line.startsWith('index '))
    .map((line) => (line.startsWith('@@ ') ? '@@' : line))
    .join('\n');
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`;
}

function isCommit(repoDir: string, sha: string): boolean {
  return runGit(repoDir, ['cat-file', '-e', `${sha}^{commit}`]).ok;
}

/**
 * Present, or fetched from `origin` by sha once — the rebased-away case. A
 * failed fetch is not an error here: the object simply stays missing, and
 * the returned reason says both halves.
 */
function ensurePresent(repoDir: string, sha: string): PatchIdentity | undefined {
  if (isCommit(repoDir, sha)) return undefined;
  runGit(repoDir, ['fetch', '--quiet', 'origin', sha]);
  if (isCommit(repoDir, sha)) return undefined;
  return {
    kind: 'object-missing',
    detail:
      `commit ${sha} object not found in the checkout and could not be fetched from origin ` +
      '— a head the panel saw must be present to compare (fail-closed)',
  };
}

/** The `-U0` diff of everything but the ledger, from the sha's merge-base with the PR base. */
function nonLedgerDiff(repoDir: string, sha: string, baseSha: string): GitResult {
  const mergeBase = runGit(repoDir, ['merge-base', sha, baseSha]);
  if (!mergeBase.ok) {
    return { ok: false, detail: `no merge-base of ${sha} and ${baseSha}: ${mergeBase.detail}` };
  }
  const diff = runGit(repoDir, [
    'diff',
    '-U0',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    mergeBase.stdout.trim(),
    sha,
    '--',
    '.',
    `:!${VOTE_RECORDS_REL_PATH}`,
  ]);
  if (!diff.ok) {
    return {
      ok: false,
      detail: `the non-ledger diff of ${sha} could not be computed: ${diff.detail}`,
    };
  }
  return diff;
}

/** The ledger's bytes at the sha; `''` when the file did not exist there. */
function ledgerAt(repoDir: string, sha: string): GitResult {
  const path = `${sha}:${VOTE_RECORDS_REL_PATH}`;
  if (!runGit(repoDir, ['cat-file', '-e', path]).ok) return { ok: true, stdout: '' };
  const shown = runGit(repoDir, ['show', path]);
  return shown.ok
    ? shown
    : { ok: false, detail: `the ledger at ${sha} could not be read: ${shown.detail}` };
}

/** `git merge-base --is-ancestor`: exit 0 yes, 1 no, anything else unmeasured. */
function isAncestor(
  repoDir: string,
  sha: string,
  headSha: string
):
  | { readonly ok: true; readonly ancestor: boolean }
  | { readonly ok: false; readonly detail: string } {
  const r = spawnSync('git', ['merge-base', '--is-ancestor', sha, headSha], {
    cwd: repoDir,
    encoding: 'utf-8',
  });
  if (r.status === 0 || r.status === 1) return { ok: true, ancestor: r.status === 0 };
  return {
    ok: false,
    detail: `git merge-base --is-ancestor ${sha} ${headSha} exited ${String(r.status)}: ${r.stderr.trim()}`,
  };
}

/**
 * Build the probe over a checkout. `baseSha` is the PR's merge-base with its
 * base branch (`PR_BASE_SHA`, which both workflow jobs supply); `headSha`
 * the head under review. Results are cached per sha, lowercased.
 */
export function gitPatchIdentityProbe(opts: {
  readonly repoDir: string;
  readonly baseSha: string;
  readonly headSha: string;
}): PatchIdentityProbe {
  const { repoDir, baseSha, headSha } = opts;
  const cache = new Map<string, PatchIdentity>();
  const unmeasured = (detail: string): PatchIdentity => ({ kind: 'unmeasured', detail });

  const probe = (sha: string): PatchIdentity => {
    if (!isFullSha(sha))
      return { kind: 'object-missing', detail: `'${sha}' is not a 40-hex commit sha` };
    if (!isFullSha(baseSha))
      return unmeasured(`the PR base '${baseSha}' is not a 40-hex commit sha`);
    if (!isFullSha(headSha))
      return unmeasured(`the PR head '${headSha}' is not a 40-hex commit sha`);
    const missing = ensurePresent(repoDir, sha);
    if (missing !== undefined) return missing;
    const diff = nonLedgerDiff(repoDir, sha, baseSha);
    if (!diff.ok) return unmeasured(diff.detail);
    const ledger = ledgerAt(repoDir, sha);
    if (!ledger.ok) return unmeasured(ledger.detail);
    const ancestry = isAncestor(repoDir, sha, headSha);
    if (!ancestry.ok) return unmeasured(ancestry.detail);
    return {
      kind: 'measured',
      patchIdentity: patchIdentityOf(diff.stdout),
      ledgerText: ledger.stdout,
      ancestorOfHead: ancestry.ancestor,
    };
  };

  return (sha: string): PatchIdentity => {
    const key = sha.toLowerCase();
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const computed = probe(key);
    cache.set(key, computed);
    return computed;
  };
}
