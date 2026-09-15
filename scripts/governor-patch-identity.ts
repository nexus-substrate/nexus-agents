/**
 * The checkout half of the moved-head rule (#6256, redesigned by the #6301
 * panel 1 review).
 *
 * `governor-ledger-evidence.ts` decides whether a record bound to an EARLIER
 * head of a PR still ratifies the current head; this module answers the
 * questions that decision needs about one ratified sha `A`, by running
 * `git` in the checkout the gate runs in. (The file keeps its #6256 name;
 * what it measures changed at #6301 — see 3 below — and every consumer is
 * a governor path, so the rename was not worth a second reviewed edit.)
 *
 * 1. How is `A` RELATED to this PR? Accepted relations, and nothing else
 *    (#6301 item 4): `ancestor` — `A` is an ancestor of the head (a merge
 *    from main kept the ratified commit in the history); or `prior-head` —
 *    `A` is an ancestor of any prior head this PR had, as the WORKFLOW
 *    measured it (`PR_PRIOR_HEADS`: the `synchronize` event's `before` sha
 *    and the head shas of this workflow's own runs that GitHub attributes
 *    to THIS PR NUMBER — never a branch name, which a fork PR can share
 *    with the base repo). The prior head itself and its first parent when
 *    it touched only the ledger remain an explicit fast path. Ancestry
 *    also covers a ratified sha below a merge and a ledger-only tip (#6364).
 *    A sha that is neither is `unrelated`: a commit on any other
 *    branch carrying the same content would otherwise pass the tree rule
 *    below, and nothing binds it to THIS PR.
 * 2. Is the commit object present? A merge from main keeps it; a rebase
 *    orphans it. The probe fetches it from `origin` by sha ONLY when it is
 *    a prior head (GitHub serves any object by sha — measured on a fresh
 *    shallow clone against the rebased-away heads of #6252, `fca64e9ea8`
 *    and `cce938eec2`). `git fetch origin <sha>` reaches the whole fork
 *    network, so an unrelated sha is never fetched (#6301 item 4). Still
 *    missing ⇒ `object-missing`, reported as `sha-mismatch` naming it.
 * 3. Does the head's TREE equal the ratified patch replayed onto the head's
 *    own base? Let `B_H = merge-base(H, PR base)` — the newest base-branch
 *    commit the head incorporates (the PR base is `PR_BASE_SHA`: the
 *    pre-merge job's merge-base with the base branch, the backstop's
 *    `main~1`). `T = git merge-tree --write-tree B_H A` is git's own
 *    contextual three-way merge of `A` onto `B_H` (base: `A`'s fork
 *    point). A CONFLICT is `tree.kind === 'conflict'` naming the paths: a
 *    hand-resolved conflict is content the panel never saw — what
 *    happened on #6282 — and is never accepted. Then
 *    `git diff-tree -r T H^{tree} -- . ':!governance/vote-records.jsonl'`
 *    must be EMPTY (`tree.kind === 'equal'`); any path listed is
 *    `differs`, naming it. A clean rebase and a clean merge from main
 *    yield the same tree, so one rule covers both. The comparison is over
 *    blob ids: position-sensitive by construction (the same lines moved to
 *    another function are a different blob — the case that sank the #6301
 *    panel 1 patch identity, which hashed `-U0` hunks and could not see a
 *    move), binary-safe, and blind to `.gitattributes` (`-diff` changes
 *    how a file is SHOWN, not its id), so the `--text` and
 *    `ORDER_SENSITIVE_FILES` special cases of the patch identity are gone
 *    with it. What it does NOT verify: that `B_H` is the true base branch
 *    — `PR_BASE_SHA` is taken as given, and `B_H`'s own content was never
 *    before this panel (it landed through its own PRs). Nor does it look
 *    at the ledger file, which the subsequence rule (5) covers.
 * 4. Does `A` carry any non-ledger change at all? `nonLedgerChanged` is
 *    whether `git diff-tree -r <merge-base(A, PR base)> A` lists a path
 *    other than the ledger. The rule refuses `A` when it does not (#6301
 *    item 2): a ledger-only PR's head replays to its own base, so its
 *    record would "match" any commit at or before the fork point — a
 *    ledger-only PR binds to `head`/`head^` only.
 * 5. What did the ledger hold at `A`? Feeds the append-only comparison
 *    between the two heads.
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

import { VOTE_RECORDS_REL_PATH } from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { isLedgerOnlyTip } from './governor-ledger-evidence.js';

/** How the ratified sha relates to the PR under review; the only two relations the rule accepts. */
export type MovedHeadRelation = 'ancestor' | 'prior-head';

/**
 * The head's tree against the ratified patch replayed onto the head's base
 * (#6301 panel 1 redesign). `equal` is the only passing value; the two
 * refusals each name the paths, so the `sha-mismatch` line can say which
 * file carries content the panel never saw.
 */
export type TreeComparison =
  | { readonly kind: 'equal'; readonly replayedTree: string }
  | {
      /** `git merge-tree` could not merge `A` onto `B_H` cleanly; the head's resolution is unreviewed content. */
      readonly kind: 'conflict';
      readonly replayedTree: string;
      readonly paths: readonly string[];
    }
  | {
      /** The replay merged cleanly, but the head's tree differs from it at these non-ledger paths. */
      readonly kind: 'differs';
      readonly replayedTree: string;
      readonly paths: readonly string[];
    };

/**
 * What the checkout says about one ratified sha. `measured` carries the
 * facts the moved-head rule compares; the other kinds each name why the sha
 * cannot be compared, and the gate prints that reason on the `sha-mismatch`
 * line rather than reading absence as a mismatch of unknown cause.
 */
export type MovedHeadMeasurement =
  | { readonly kind: 'object-missing'; readonly detail: string }
  | { readonly kind: 'unrelated'; readonly detail: string }
  | { readonly kind: 'unmeasured'; readonly detail: string }
  | {
      readonly kind: 'measured';
      /** `ancestor` (a merge from main) or `prior-head` (a head this PR had; a rebase). */
      readonly relation: MovedHeadRelation;
      /**
       * Whether the sha's diff from its merge-base with the PR base touches
       * any path other than the ledger. `false` is a ledger-only PR, which
       * the rule refuses to compare (#6301 item 2).
       */
      readonly nonLedgerChanged: boolean;
      /** The head's tree against the sha's patch replayed onto the head's base (3 above). */
      readonly tree: TreeComparison;
      /** The ledger's bytes at the sha; `''` when the file did not exist there. */
      readonly ledgerText: string;
    };

export type MovedHeadProbe = (sha: string) => MovedHeadMeasurement;

const FULL_SHA = /^[0-9a-f]{40}$/i;

/** A bare 40-hex commit sha — the only shape passed to git. */
export function isFullSha(value: string): boolean {
  return FULL_SHA.test(value);
}

type GitResult =
  | { readonly ok: true; readonly stdout: string; readonly status: number }
  | { readonly ok: false; readonly detail: string; readonly status: number | null };

/**
 * One `git` invocation with a fixed argument array and no shell. Exit
 * codes in `okStatuses` are success (`merge-tree --write-tree` exits 1 for
 * a conflict it still wrote a tree for); anything else is a named failure.
 */
function runGit(
  repoDir: string,
  args: readonly string[],
  okStatuses: readonly number[] = [0]
): GitResult {
  const result = spawnSync('git', [...args], {
    cwd: repoDir,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return {
      ok: false,
      detail: `git ${args[0] ?? ''} could not run: ${result.error.message}`,
      status: null,
    };
  }
  if (result.status === null || !okStatuses.includes(result.status)) {
    const stderr = result.stderr.trim().split('\n')[0] ?? '';
    return {
      ok: false,
      detail: `git ${args.join(' ')} exited ${String(result.status)}: ${stderr}`,
      status: result.status,
    };
  }
  return { ok: true, stdout: result.stdout, status: result.status };
}

/** NUL-separated `git … -z` output as a list of non-empty entries. */
function nulSeparated(stdout: string): string[] {
  return stdout.split('\0').filter((entry) => entry !== '');
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
): MovedHeadMeasurement | undefined {
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

/** `merge-base(a, b)`, or why there is none. */
function mergeBase(repoDir: string, a: string, b: string): GitResult {
  const result = runGit(repoDir, ['merge-base', a, b]);
  return result.ok
    ? { ...result, stdout: result.stdout.trim() }
    : { ...result, detail: `no merge-base of ${a} and ${b}: ${result.detail}` };
}

/**
 * The non-ledger paths `git diff-tree -r` lists between two tree-ish
 * arguments, sorted. Tree-level: blob ids and modes, never a rendered diff,
 * so binary content and `.gitattributes` `-diff` rules cannot hide a change.
 */
function nonLedgerPathsBetween(
  repoDir: string,
  from: string,
  to: string
):
  | { readonly ok: true; readonly paths: string[] }
  | { readonly ok: false; readonly detail: string } {
  const listed = runGit(repoDir, [
    'diff-tree',
    '-r',
    '-z',
    '--name-only',
    '--no-color',
    from,
    to,
    '--',
    '.',
    `:!${VOTE_RECORDS_REL_PATH}`,
  ]);
  if (!listed.ok) {
    return {
      ok: false,
      detail: `the trees ${from} and ${to} could not be compared: ${listed.detail}`,
    };
  }
  return { ok: true, paths: nulSeparated(listed.stdout).sort() };
}

/** Whether the sha's diff from its merge-base with the PR base touches any path but the ledger (4 above). */
function nonLedgerChangedAt(
  repoDir: string,
  sha: string,
  baseSha: string
):
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly detail: string } {
  const forkPoint = mergeBase(repoDir, sha, baseSha);
  if (!forkPoint.ok) return forkPoint;
  const paths = nonLedgerPathsBetween(repoDir, forkPoint.stdout, sha);
  if (!paths.ok) {
    return {
      ok: false,
      detail: `the non-ledger diff of ${sha} could not be computed: ${paths.detail}`,
    };
  }
  return { ok: true, changed: paths.paths.length > 0 };
}

/**
 * Step 3 of the probe: replay the ratified sha onto the head's base with
 * git's own merge and compare the head's tree to the result, ledger
 * excluded. `merge-tree --write-tree` exits 0 clean and 1 for a conflict
 * it still wrote a tree for — its stdout then leads with the tree oid, and
 * under `--name-only -z` the conflicted paths follow; any other exit, or an
 * exit 1 whose stdout is not a tree oid (unrelated histories, a missing
 * object), is `unmeasured` naming git's first stderr line.
 */
function replayOntoHeadBase(
  repoDir: string,
  sha: string,
  headSha: string,
  baseSha: string
):
  | { readonly ok: true; readonly tree: TreeComparison }
  | { readonly ok: false; readonly detail: string } {
  const headBase = mergeBase(repoDir, headSha, baseSha);
  if (!headBase.ok) return headBase;
  const merged = runGit(
    repoDir,
    ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', headBase.stdout, sha],
    [0, 1]
  );
  if (!merged.ok) {
    return {
      ok: false,
      detail: `${sha} could not be replayed onto ${headBase.stdout}: ${merged.detail}`,
    };
  }
  const [replayedTree, ...conflicted] = nulSeparated(merged.stdout);
  if (replayedTree === undefined || !isFullSha(replayedTree)) {
    return {
      ok: false,
      detail:
        `git merge-tree --write-tree ${headBase.stdout} ${sha} exited ${String(merged.status)} ` +
        'without writing a tree',
    };
  }
  if (merged.status === 1) {
    return { ok: true, tree: { kind: 'conflict', replayedTree, paths: [...conflicted].sort() } };
  }
  const differing = nonLedgerPathsBetween(repoDir, replayedTree, `${headSha}^{tree}`);
  if (!differing.ok) return differing;
  if (differing.paths.length > 0) {
    return { ok: true, tree: { kind: 'differs', replayedTree, paths: differing.paths } };
  }
  return { ok: true, tree: { kind: 'equal', replayedTree } };
}

/** The ledger's bytes at the sha; `''` when the file did not exist there. */
function ledgerAt(repoDir: string, sha: string): GitResult {
  const path = `${sha}:${VOTE_RECORDS_REL_PATH}`;
  if (!runGit(repoDir, ['cat-file', '-e', path]).ok) return { ok: true, stdout: '', status: 0 };
  const shown = runGit(repoDir, ['show', path]);
  return shown.ok
    ? shown
    : { ...shown, detail: `the ledger at ${sha} could not be read: ${shown.detail}` };
}

/** `git merge-base --is-ancestor`: exit 0 yes, 1 no, anything else unmeasured. */
function isAncestor(
  repoDir: string,
  sha: string,
  headSha: string
):
  | { readonly ok: true; readonly ancestor: boolean }
  | { readonly ok: false; readonly detail: string } {
  const r = runGit(repoDir, ['merge-base', '--is-ancestor', sha, headSha], [0, 1]);
  if (r.ok) return { ok: true, ancestor: r.status === 0 };
  return { ok: false, detail: r.detail };
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
): MovedHeadRelation | MovedHeadMeasurement {
  const missing = ensurePresent(repoDir, sha, prior);
  if (missing !== undefined) return missing;
  const ancestry = isAncestor(repoDir, sha, headSha);
  if (!ancestry.ok) return { kind: 'unmeasured', detail: ancestry.detail };
  if (ancestry.ancestor) return 'ancestor';
  if (prior) return 'prior-head';
  // Empty prior heads establish no relation: fall through to unrelated.
  for (const priorHead of priorHeads) {
    if (ensurePresent(repoDir, priorHead, true) !== undefined) continue;
    const priorAncestry = isAncestor(repoDir, sha, priorHead);
    if (!priorAncestry.ok) return { kind: 'unmeasured', detail: priorAncestry.detail };
    if (priorAncestry.ancestor) return 'prior-head';
  }
  return {
    kind: 'unrelated',
    detail:
      `commit ${sha} is present but is not an ancestor of the head ${headSha} or of any prior ` +
      `head of this PR (PR_PRIOR_HEADS: ${priorHeads.length === 0 ? 'none' : priorHeads.join(', ')}) ` +
      '— the same content on another branch is not a head the panel saw for this PR',
  };
}

/**
 * Build the probe over a checkout. `baseSha` is the PR's base (`PR_BASE_SHA`,
 * which both workflow jobs supply); `headSha` the head under review;
 * `priorHeadShas` the heads this PR had before the current one, as the
 * workflow measured them (`PR_PRIOR_HEADS`; empty when none is known, and
 * then only an ancestor of the head is related). Results are cached per
 * sha, lowercased; the prior-head set is derived once.
 */
export function gitMovedHeadProbe(opts: {
  readonly repoDir: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly priorHeadShas: readonly string[];
}): MovedHeadProbe {
  const { repoDir, baseSha, headSha } = opts;
  const priorHeads = opts.priorHeadShas.map((s) => s.toLowerCase()).filter(isFullSha);
  const cache = new Map<string, MovedHeadMeasurement>();
  let acceptedByPrior: Set<string> | undefined;
  const unmeasured = (detail: string): MovedHeadMeasurement => ({ kind: 'unmeasured', detail });

  const isPriorHead = (sha: string): boolean => {
    acceptedByPrior ??= shasAcceptedByPriorHeads(repoDir, priorHeads);
    return acceptedByPrior.has(sha);
  };

  const probe = (sha: string): MovedHeadMeasurement => {
    if (!isFullSha(sha))
      return { kind: 'object-missing', detail: `'${sha}' is not a 40-hex commit sha` };
    if (!isFullSha(baseSha))
      return unmeasured(`the PR base '${baseSha}' is not a 40-hex commit sha`);
    if (!isFullSha(headSha))
      return unmeasured(`the PR head '${headSha}' is not a 40-hex commit sha`);
    const relation = relationOf(repoDir, sha, headSha, isPriorHead(sha), priorHeads);
    if (typeof relation !== 'string') return relation;
    const changed = nonLedgerChangedAt(repoDir, sha, baseSha);
    if (!changed.ok) return unmeasured(changed.detail);
    const replay = replayOntoHeadBase(repoDir, sha, headSha, baseSha);
    if (!replay.ok) return unmeasured(replay.detail);
    const ledger = ledgerAt(repoDir, sha);
    if (!ledger.ok) return unmeasured(ledger.detail);
    return {
      kind: 'measured',
      relation,
      nonLedgerChanged: changed.changed,
      tree: replay.tree,
      ledgerText: ledger.stdout,
    };
  };

  return (sha: string): MovedHeadMeasurement => {
    const key = sha.toLowerCase();
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const computed = probe(key);
    cache.set(key, computed);
    return computed;
  };
}
