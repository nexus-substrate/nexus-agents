/**
 * The checkout half of the moved-head rule (#6256, tightened by #6301).
 *
 * `governor-ledger-evidence.ts` decides whether a record bound to an EARLIER
 * head of a PR still ratifies the current head; this module answers the
 * questions that decision needs about one sha, by running `git` in the
 * checkout the gate runs in:
 *
 * 1. How is the sha RELATED to this PR? Accepted relations, and nothing
 *    else (#6301 item 4): `ancestor` — the sha is an ancestor of the head
 *    (a merge from main kept the ratified commit in the history); or
 *    `prior-head` — the sha is a head this PR had before the current one,
 *    as the WORKFLOW measured it (`PR_PRIOR_HEADS`: the `synchronize`
 *    event's `before` sha and the head shas of this workflow's own runs on
 *    the PR's head branch since the PR was opened), or the first parent of
 *    such a head when that head touched only the ledger — the same
 *    `head`/`head^` reading `acceptedHeadShas` gives the current head,
 *    because the tip a force-push replaces is the ledger-only commit A1
 *    and the record binds A = A1^. A sha that is neither is `unrelated`:
 *    a commit on any other branch carrying a byte-identical patch used to
 *    pass as `rewritten-history`, and nothing bound it to THIS PR.
 * 2. Is the commit object present? A merge from main keeps it; a rebase
 *    orphans it. The probe fetches it from `origin` by sha ONLY when it is
 *    a prior head (GitHub serves any object by sha — measured on a fresh
 *    shallow clone against the rebased-away heads of #6252, `fca64e9ea8`
 *    and `cce938eec2`). `git fetch origin <sha>` reaches the whole fork
 *    network, so an unrelated sha is never fetched (#6301 item 4). Still
 *    missing ⇒ `object-missing`, reported as `sha-mismatch` naming it.
 * 3. What is the NON-LEDGER PATCH IDENTITY? `sha256` over
 *    `git diff --text -U0 <merge-base(sha, PR base)> <sha> -- . ':!governance/vote-records.jsonl'`
 *    with the `index` lines removed and each `@@` hunk header reduced to
 *    `@@` (`patchIdentityOf`). `--text` (#6301 item 1): without it a file
 *    git detects as binary — a `.bin`, a `.ts` holding a NUL byte, or any
 *    path a `.gitattributes` `-diff` rule covers — diffs as one `Binary
 *    files … differ` line plus the `index` line this identity strips, so
 *    two different contents were the same patch. `--text` overrides the
 *    detection and the attribute (measured: all three shapes emit `+`/`-`
 *    body lines). The bytes are hashed as bytes (`latin1` in, `latin1`
 *    out), not through a UTF-8 decode that folds every invalid sequence
 *    into U+FFFD. `-U0` and not the default three lines of context:
 *    #6282's SKILL.md hunk, ratified at `43cb8bec` and refreshed by a
 *    merge from main to `8618d18d`, differs at -U3 only in a trailing
 *    context line — main's newer PIPELINE NOTE, which every workflow PR
 *    appends — and is byte-identical at -U0. Not `git patch-id`: it strips
 *    whitespace before hashing, so a whitespace-only edit inside a string
 *    literal would read as the same patch; this identity keeps every byte
 *    of every hunk. The PR base is `PR_BASE_SHA`, the head's merge-base
 *    with the base branch: the merge-base of an earlier head with THAT
 *    commit is the earlier head's own fork point, whether the head was
 *    refreshed by a merge (the fork point precedes the merged-in main
 *    commit) or a rebase.
 * 4. What are the ORDER-SENSITIVE files' blobs at the sha (#6301 item 3)?
 *    The identity is position-insensitive WITHIN a file — `-U0` and a
 *    line-number-free hunk header make the same added and removed lines at
 *    another location the same patch. For most files that is a disclosed
 *    limit; for a file whose meaning is which SECTION a line sits in it is
 *    an exploit: a CODEOWNERS entry added inside the governor section at
 *    the ratified sha and moved below `# @governor-section-end` at the
 *    head is the same `+line` hunk and a different governor set. So for
 *    the files in `ORDER_SENSITIVE_FILES` the probe records the full blob
 *    id at the sha, and the rule requires it byte-equal at the head.
 * 5. What did the ledger hold at the sha? Feeds the append-only comparison
 *    between the two heads.
 *
 * What still changes the identity, disclosed the other way round: a byte
 * in any non-ledger file (binary or text), a file added or dropped, a mode
 * change, and — for the order-sensitive files — a line moved. What does
 * not: the same lines at another position in any other file.
 *
 * Every sha that reaches this module comes from the ledger — untrusted
 * bytes — and is validated as a bare 40-hex sha before it is passed to
 * git, where a leading `-` would read as an option. `git` runs with a fixed
 * argument array and never a shell.
 *
 * @module scripts/governor-patch-identity
 * (Source: Issue #6256, #6252, #6282, #6301)
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { VOTE_RECORDS_REL_PATH } from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { EMPTY_PATCH_IDENTITY, isLedgerOnlyTip } from './governor-ledger-evidence.js';

/** How the ratified sha relates to the PR under review; the only two relations the rule accepts. */
export type MovedHeadRelation = 'ancestor' | 'prior-head';

/**
 * What the checkout says about one sha. `measured` carries the facts the
 * moved-head rule compares; the other kinds each name why the sha cannot be
 * compared, and the gate prints that reason on the `sha-mismatch` line
 * rather than reading absence as a mismatch of unknown cause.
 */
export type PatchIdentity =
  | { readonly kind: 'object-missing'; readonly detail: string }
  | { readonly kind: 'unrelated'; readonly detail: string }
  | { readonly kind: 'unmeasured'; readonly detail: string }
  | {
      readonly kind: 'measured';
      /**
       * `sha256:<hex>` over the normalized `--text -U0` non-ledger diff from
       * the sha's merge-base with the PR base — or `EMPTY_PATCH_IDENTITY`
       * when nothing but the ledger differs from that base (a ledger-only
       * PR), which the rule refuses to compare (#6301 item 2).
       */
      readonly patchIdentity: string;
      /**
       * Blob id at the sha of every `ORDER_SENSITIVE_FILES` path present
       * there, keyed by path; a path absent at the sha has no entry.
       */
      readonly orderSensitiveBlobs: Readonly<Record<string, string>>;
      /** The ledger's bytes at the sha; `''` when the file did not exist there. */
      readonly ledgerText: string;
      /** `ancestor` (a merge from main) or `prior-head` (a head this PR had; a rebase). */
      readonly relation: MovedHeadRelation;
    };

export type PatchIdentityProbe = (sha: string) => PatchIdentity;

/**
 * Files whose meaning is the SECTION a line sits in, so the position-
 * insensitive patch identity is not enough and the rule compares the full
 * blob at the ratified sha and the head (#6301 item 3). Considered and left
 * out, with why: `governance/allowed_signers` (does not exist in this repo;
 * if it did, each line is an independent `principal key` record and moving
 * one changes nothing); `CLAUDE.md` / `AGENTS.md` (their generated block is
 * re-derived and diffed by `governance:check`, so a line moved across the
 * block boundary fails that gate on its own). The cost of an entry: a
 * change to that file merged in FROM MAIN between the ratified sha and the
 * head also differs and sends the PR back to the panel.
 */
export const ORDER_SENSITIVE_FILES: readonly {
  readonly pattern: string;
  readonly matches: (path: string) => boolean;
  readonly why: string;
}[] = [
  {
    pattern: 'CODEOWNERS',
    matches: (path) => path === 'CODEOWNERS',
    why:
      'the governor path set is the lines between `# @governor-section-start` and ' +
      '`# @governor-section-end`; the same entry outside the section is an ordinary review-request',
  },
  {
    pattern: '.rules/*.md',
    matches: (path) => /^\.rules\/[^/]+\.md$/.test(path),
    why:
      'the `paths:` globs the injector reads live in the `---` frontmatter; the same line ' +
      'below the closing `---` is prose the injector never sees',
  },
];

const FULL_SHA = /^[0-9a-f]{40}$/i;

/** A bare 40-hex commit sha — the only shape passed to git. */
export function isFullSha(value: string): boolean {
  return FULL_SHA.test(value);
}

type GitResult =
  { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly detail: string };

/**
 * One `git` invocation with a fixed argument array and no shell. `latin1`
 * maps every output byte to one code unit, so a diff body that is not
 * valid UTF-8 survives to the hash unchanged; callers reading text pass
 * `utf-8`.
 */
function runGit(
  repoDir: string,
  args: readonly string[],
  encoding: 'utf-8' | 'latin1' = 'utf-8'
): GitResult {
  const result = spawnSync('git', [...args], {
    cwd: repoDir,
    encoding,
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
 * The patch identity of a unified diff, given as a `latin1` string (one
 * code unit per byte): `sha256` over its bytes with the `index
 * <blob>..<blob>` lines removed (the pre-image blob differs whenever the
 * base moved) and each `@@ … @@` hunk header reduced to `@@` (its line
 * numbers and function context differ whenever earlier lines moved). Both
 * are header lines by the diff format — a body line always begins with
 * `+`, `-`, ` ` or `\`, under `--text` for binary content too — so nothing
 * inside a hunk is touched, whitespace and NUL bytes included. The empty
 * diff is `EMPTY_PATCH_IDENTITY`, named rather than hashed, so a
 * ledger-only PR reads as such in the log.
 */
export function patchIdentityOf(diff: string): string {
  if (diff.trim() === '') return EMPTY_PATCH_IDENTITY;
  const normalized = diff
    .split('\n')
    .filter((line) => !line.startsWith('index '))
    .map((line) => (line.startsWith('@@ ') ? '@@' : line))
    .join('\n');
  return `sha256:${createHash('sha256').update(normalized, 'latin1').digest('hex')}`;
}

function isCommit(repoDir: string, sha: string): boolean {
  return runGit(repoDir, ['cat-file', '-e', `${sha}^{commit}`]).ok;
}

/**
 * Present, or — for a prior head only — fetched from `origin` by sha once
 * (the rebased-away case). A failed fetch is not an error here: the object
 * simply stays missing, and the returned reason says both halves. An
 * unrelated sha is never fetched: `git fetch origin <sha>` serves the fork
 * network's objects too (#6301 item 4).
 */
function ensurePresent(
  repoDir: string,
  sha: string,
  fetchAllowed: boolean
): PatchIdentity | undefined {
  if (isCommit(repoDir, sha)) return undefined;
  if (!fetchAllowed) {
    return {
      kind: 'unrelated',
      detail:
        `commit ${sha} is not in the checkout, so it is not an ancestor of the head, and it is ` +
        'not a head this PR had (PR_PRIOR_HEADS) — not fetched: `git fetch origin <sha>` serves ' +
        'the whole fork network, and nothing binds this sha to this PR',
    };
  }
  runGit(repoDir, ['fetch', '--quiet', 'origin', sha]);
  if (isCommit(repoDir, sha)) return undefined;
  return {
    kind: 'object-missing',
    detail:
      `commit ${sha} object not found in the checkout and could not be fetched from origin ` +
      '— a head the panel saw must be present to compare (fail-closed)',
  };
}

/** The `--text -U0` diff of everything but the ledger, from the sha's merge-base with the PR base. */
function nonLedgerDiff(repoDir: string, sha: string, baseSha: string): GitResult {
  const mergeBase = runGit(repoDir, ['merge-base', sha, baseSha]);
  if (!mergeBase.ok) {
    return { ok: false, detail: `no merge-base of ${sha} and ${baseSha}: ${mergeBase.detail}` };
  }
  const diff = runGit(
    repoDir,
    [
      'diff',
      '--text',
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
    ],
    'latin1'
  );
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

/**
 * Blob ids at the sha of every order-sensitive file present there, from
 * one `git ls-tree -r` over the whole tree filtered by the constant's own
 * matchers (#6301 item 3).
 */
function orderSensitiveBlobsAt(
  repoDir: string,
  sha: string
):
  | { readonly ok: true; readonly blobs: Record<string, string> }
  | { readonly ok: false; readonly detail: string } {
  const listed = runGit(repoDir, ['ls-tree', '-r', '--full-tree', '-z', sha]);
  if (!listed.ok) {
    return { ok: false, detail: `the tree at ${sha} could not be listed: ${listed.detail}` };
  }
  const blobs: Record<string, string> = {};
  for (const entry of listed.stdout.split('\0')) {
    if (entry === '') continue;
    // `<mode> <type> <object>\t<path>`
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const path = entry.slice(tab + 1);
    const [, type, object] = entry.slice(0, tab).split(' ');
    if (type !== 'blob' || object === undefined) continue;
    if (ORDER_SENSITIVE_FILES.some((f) => f.matches(path))) blobs[path] = object;
  }
  return { ok: true, blobs };
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
 * The shas a prior head accepts: itself, and its first parent when the
 * prior head touched only the ledger — `acceptedHeadShas` for a head that
 * is no longer the head (#6301 item 4). A prior head absent from the
 * checkout is fetched from origin by sha (it IS a head this PR had); one
 * that stays absent accepts only itself, so its parent cannot be read as
 * a prior head on the strength of a sha the checkout cannot see.
 */
function shasAcceptedByPriorHeads(repoDir: string, priorHeads: readonly string[]): Set<string> {
  const accepted = new Set<string>();
  for (const prior of priorHeads) {
    accepted.add(prior);
    if (ensurePresent(repoDir, prior, true) !== undefined) continue;
    const parent = runGit(repoDir, ['rev-parse', '--verify', '--quiet', `${prior}^`]);
    if (!parent.ok) continue;
    const files = runGit(repoDir, ['diff', '--name-only', `${prior}^`, prior]);
    if (!files.ok) continue;
    const commitFiles = files.stdout.split('\n').filter((f) => f !== '');
    if (isLedgerOnlyTip(commitFiles)) accepted.add(parent.stdout.trim().toLowerCase());
  }
  return accepted;
}

/**
 * Step 1 of the probe: the sha's relation to the PR, or why there is none.
 * The present-or-fetched question is folded in because whether the fetch
 * is allowed IS the relation (#6301 item 4).
 */
function relationOf(
  repoDir: string,
  sha: string,
  headSha: string,
  prior: boolean,
  priorHeads: readonly string[]
): MovedHeadRelation | PatchIdentity {
  const missing = ensurePresent(repoDir, sha, prior);
  if (missing !== undefined) return missing;
  const ancestry = isAncestor(repoDir, sha, headSha);
  if (!ancestry.ok) return { kind: 'unmeasured', detail: ancestry.detail };
  if (ancestry.ancestor) return 'ancestor';
  if (prior) return 'prior-head';
  return {
    kind: 'unrelated',
    detail:
      `commit ${sha} is present but is not an ancestor of the head ${headSha} and is not a ` +
      `head this PR had (PR_PRIOR_HEADS: ${priorHeads.length === 0 ? 'none' : priorHeads.join(', ')}) ` +
      '— a byte-identical patch on another branch is not a head the panel saw for this PR',
  };
}

/**
 * Build the probe over a checkout. `baseSha` is the PR's merge-base with its
 * base branch (`PR_BASE_SHA`, which both workflow jobs supply); `headSha`
 * the head under review; `priorHeadShas` the heads this PR had before the
 * current one, as the workflow measured them (`PR_PRIOR_HEADS`; empty when
 * none is known, and then only an ancestor of the head is related). Results
 * are cached per sha, lowercased; the prior-head set is derived once.
 */
export function gitPatchIdentityProbe(opts: {
  readonly repoDir: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly priorHeadShas: readonly string[];
}): PatchIdentityProbe {
  const { repoDir, baseSha, headSha } = opts;
  const priorHeads = opts.priorHeadShas.map((s) => s.toLowerCase()).filter(isFullSha);
  const cache = new Map<string, PatchIdentity>();
  let acceptedByPrior: Set<string> | undefined;
  const unmeasured = (detail: string): PatchIdentity => ({ kind: 'unmeasured', detail });

  const isPriorHead = (sha: string): boolean => {
    acceptedByPrior ??= shasAcceptedByPriorHeads(repoDir, priorHeads);
    return acceptedByPrior.has(sha);
  };

  const probe = (sha: string): PatchIdentity => {
    if (!isFullSha(sha))
      return { kind: 'object-missing', detail: `'${sha}' is not a 40-hex commit sha` };
    if (!isFullSha(baseSha))
      return unmeasured(`the PR base '${baseSha}' is not a 40-hex commit sha`);
    if (!isFullSha(headSha))
      return unmeasured(`the PR head '${headSha}' is not a 40-hex commit sha`);
    const relation = relationOf(repoDir, sha, headSha, isPriorHead(sha), priorHeads);
    if (typeof relation !== 'string') return relation;
    const diff = nonLedgerDiff(repoDir, sha, baseSha);
    if (!diff.ok) return unmeasured(diff.detail);
    const ledger = ledgerAt(repoDir, sha);
    if (!ledger.ok) return unmeasured(ledger.detail);
    const blobs = orderSensitiveBlobsAt(repoDir, sha);
    if (!blobs.ok) return unmeasured(blobs.detail);
    return {
      kind: 'measured',
      patchIdentity: patchIdentityOf(diff.stdout),
      orderSensitiveBlobs: blobs.blobs,
      ledgerText: ledger.stdout,
      relation,
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
