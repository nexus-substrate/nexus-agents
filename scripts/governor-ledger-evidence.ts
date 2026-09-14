/**
 * The committed vote ledger as ratification evidence (#5130 step 2, #5779).
 *
 * ## What this answers
 *
 * `check-governor-ratification.ts` decides ratification from the PR's labels
 * and approvals. That is the `owner-ratified` label's semantics made
 * checkable, but it cannot see whether a PANEL ratified the change, under
 * which rules, or whether one ran at all (#5779). Step 1 of #5130 gave the
 * ledger a record shape that can say so: `ratifiesPr: { pr, headSha }`
 * inside the self-hash, appended to `governance/vote-records.jsonl` by the
 * caller in the PR it ratifies. This module computes, from that ledger, a
 * typed verdict the gate prints AND EXITS ON (#5131): only `ratified` (and,
 * under the moved-head rule below, `ratified-rebased`) passes; every other
 * kind, and an `unmeasured` report, is a `::error::` and exit 1. The verdict
 * here is pure; reading the workflow environment, building the git probe
 * and rendering the line live in `governor-ledger-report.ts`, the git probe
 * itself in `governor-patch-identity.ts` — all three are governor paths.
 * The label/approval verdict is still required alongside it — both must
 * hold. Warn-first ended on 2026-09-14, when the first bound record reached
 * the committed ledger (PR #6241, `vote-1789376500996-fxkw4uk`); the flip is
 * step 2 of the #5118 decision and was filed as #5131 before the transport
 * existed, so it could not sit in a comment the way #3991 did.
 *
 * ## The verdict names its cases
 *
 * | Kind | Meaning |
 * | --- | --- |
 * | `ratified` | one record binds this PR at an accepted head, is `approved`, and its recorded panel was whole |
 * | `ratified-rebased` | as `ratified`, but the record binds an EARLIER head of this PR (an ancestor of the head, or a head the workflow saw this PR have) whose non-ledger patch is byte-identical to the current head's — see "The head moved" below (#6256, #6301) |
 * | `no-record` | no record carries `ratifiesPr.pr === PR`; an EMPTY ledger is this case with `recordCount: 0`, never `ratified` |
 * | `sha-mismatch` | records bind this PR, but none at an accepted head and none passes the moved-head rule — lists the shas found and, per sha, why the rule did not apply |
 * | `not-approved` | a bound record's `decision` is not `approved` |
 * | `wrong-error-policy` | a bound record RECORDS an `errorPolicy` other than `absolute_quorum` (#6211) |
 * | `wrong-strategy` | a bound record's `strategy` is below the governor bar — not `supermajority` or `unanimous` (#6235) |
 * | `unmeasured-panel` | a bound record has no `panelCoverage`, or one that names no seats — it cannot show the panel ran whole |
 * | `degraded-panel` | a bound record's `panelCoverage.errored > 0` |
 * | `ledger-invalid` | a line does not parse, or `verifyVoteRecordSet` fails (tamper, gap) |
 * | `ledger-rewritten` | the head ledger is not the base ledger plus appended lines — see below |
 * | `duplicate-id` | one id names two DIFFERENT records — refused, see below |
 *
 * The accepted heads are the PR head and, when the head commit touches ONLY
 * the ledger file, its first parent: the caller-commits tip is a ledger-only
 * commit on top of the head the panel saw (#5130 panel Q1). A tip that
 * touches anything else — including a merge from main — is a new head the
 * panel did not see, so only `head` itself is accepted.
 *
 * ## The head moved, the patch did not (#6256, `ratified-rebased`)
 *
 * Every governor PR appends one ledger line, and the ledger must be
 * append-only against the base, so when two governor PRs are in flight the
 * second must pick up the first's line once it merges — a rebase or a merge
 * from main — and that moves its head past the sha its record binds. Measured
 * twice on 2026-09-14: #6252 was ratified 7-0 at `fca64e9ea8`, rebased to
 * `cce938eec2` to pick up #6249's line, and re-paneled; #6282 was ratified
 * at `43cb8bec`, refreshed by a merge from main (`8618d18d`) that resolved
 * a SKILL.md PIPELINE NOTE conflict, and re-paneled. Both non-ledger patches
 * were byte-identical before and after (see the identity below).
 *
 * So a record whose `ratifiesPr.headSha` is neither `head` nor `head^` is
 * still accepted — as the distinct kind `ratified-rebased`, so the log says
 * the head moved and why it still counts — when ALL of (#6256, tightened
 * by the #6301 review):
 *
 * 1. the ratified sha is RELATED to this PR: an ancestor of the head (a
 *    merge from main kept it), or a head this PR had before — as the
 *    workflow measured it (`PR_PRIOR_HEADS`: the `synchronize` event's
 *    `before` and the head shas of the workflow's own runs on the PR branch
 *    since the PR opened), or the first parent of such a head when it
 *    touched only the ledger (the tip a force-push replaces is A1, the
 *    record binds A = A1^). Anything else is `sha-mismatch` naming the
 *    relation: a byte-identical patch on an unrelated branch used to pass
 *    (#6301 item 4). The commit object must be present; a prior head a
 *    rebase orphaned is fetched from `origin` by sha (GitHub serves any
 *    object by sha — measured against the rebased-away heads of #6252),
 *    and NO other sha is fetched, because that fetch reaches the whole
 *    fork network. Still missing ⇒ `sha-mismatch` naming "object not found".
 * 2. the NON-LEDGER PATCH IDENTITY is non-empty and equal for the ratified
 *    sha and the head: `sha256` over `git diff --text -U0 <merge-base(sha,
 *    PR base)> <sha> -- . ':!governance/vote-records.jsonl'` with the
 *    `index` lines and the `@@` hunk headers removed, hashed byte-for-byte.
 *    `--text` (#6301 item 1): without it a binary-detected file — a `.bin`,
 *    a `.ts` holding a NUL byte, any path under a `.gitattributes` `-diff`
 *    rule — diffs as `Binary files … differ` plus the `index` line the
 *    identity strips, so two contents were one patch. `-U0`, not the
 *    default 3 lines of context: #6282's SKILL.md hunk differs at -U3 only
 *    in a trailing context line (main's newer PIPELINE NOTE), and every
 *    workflow PR appends there. Not `git patch-id`: it strips whitespace
 *    before hashing, so a whitespace-only edit inside a string literal
 *    would be "the same patch". The EMPTY identity is refused on either
 *    side (#6301 item 2): a ledger-only PR's head and any commit at or
 *    before its fork point both diff to nothing, and "equal" there binds
 *    the record to no patch — a ledger-only PR binds to `head`/`head^` only.
 * 3. the ORDER-SENSITIVE files are byte-equal at both shas (#6301 item 3):
 *    `CODEOWNERS` and `.rules/*.md` (`ORDER_SENSITIVE_FILES`, with the
 *    reason per entry). The identity is position-insensitive within a
 *    file, and for these files position is the meaning — a CODEOWNERS
 *    entry added inside the governor section and moved below the end
 *    directive is the same `+line` and a different governor set.
 * 4. the ledger at the ratified sha is an ordered subsequence of the head
 *    ledger (the #6218 rule, applied between the two heads) — otherwise
 *    `ledger-rewritten` naming the ratified sha.
 *
 * A patch identity that differs by one byte is `sha-mismatch`, as today.
 * The rule applies only when NO record binds `head` or `head^`; a record
 * that does is judged exactly as before and the probe never runs. Every
 * record bound at the moved sha must still ratify (a dissent there is
 * `not-approved`), and the per-record checks are unchanged.
 *
 * What the identity does NOT catch, disclosed: outside the order-sensitive
 * files, `-U0` and a line-number-free hunk header make the identity
 * position-insensitive WITHIN a file — the same added and removed lines at
 * a different location in the same file are the same patch. A change that
 * moves a ratified hunk to another function is therefore not detected by
 * this rule alone; the head still has to pass the label/approval gate, and
 * the panel's record still names the sha it saw. Anything else — a
 * changed, added or removed byte in any non-ledger file, binary or text, a
 * file added or dropped, a mode change — changes the identity.
 *
 * ## Append-only against the base (#6213)
 *
 * The self-hash makes a record tamper-evident, but a PR can DELETE a line —
 * a recorded dissent, say — or edit one and re-hash it, and the remaining
 * ledger still verifies as a set. So the pre-merge job also reads the ledger
 * at the merge-base (`git show <base>:governance/vote-records.jsonl`, empty
 * when the file did not exist there) and the verdict requires the base's
 * record lines to be an ordered SUBSEQUENCE of the head's: every base line
 * present, byte-identical, in the same relative order; insertions anywhere.
 * Blank lines are not records and are ignored on both sides.
 *
 * Subsequence, not prefix, because the union driver's order depends on
 * which side is "ours". Measured for the #6194 fork (two branches each
 * append one line, A merges first; merge-base is then `base + A1`):
 *
 * | B refreshed by | head ledger | prefix? | subsequence? |
 * | --- | --- | --- | --- |
 * | rebase onto main | `base + A1 + B1` | yes | yes |
 * | un-rebased, merged into main | `base + A1 + B1` | yes | yes |
 * | main merged INTO B ("Update branch") | `base + B1 + A1` | NO | yes |
 *
 * The third row is the standard GitHub refresh, so a prefix rule refused a
 * legitimate merge (found by the #6218 panel). What subsequence still
 * catches, because each deletes or alters a base line: a dropped tail line
 * with the new record re-sequenced into its slot, an edit-and-re-hash, a
 * reorder, a truncation.
 *
 * Precedence puts `ledger-rewritten` right after `ledger-invalid`: a rewrite
 * outranks `duplicate-id` and `no-record` because the ledger it is computed
 * over is not the ledger main will carry. No base supplied (a local run;
 * both workflow jobs supply one since #6218) leaves the check NOT MADE, and
 * the `ratified` line says so (`appendOnlyChecked: false`) rather than
 * reading absence as health.
 *
 * ## The backstop binds to the PR's pre-squash head (#6249)
 *
 * The post-merge job runs on the squash commit, which no panel saw, so it
 * used to key on the PR number alone (`shaChecked: false`). The #6249 panel's
 * contrarian showed what that accepts: a record bound to sha1, a later push
 * of sha2 past the red pre-merge gate, an admin merge — and the backstop,
 * the one signal that cannot be bypassed, exits 0. So the backstop now
 * resolves the merged PR's final head (`pulls/{n}` → `head.sha`), fetches
 * `refs/pull/{n}/head` so that commit's parent and file list resolve, and
 * passes the same `PR_HEAD_SHA` / parent / files the pre-merge job does.
 * A head that cannot be resolved is `unmeasured` (exit 1), never "PR number
 * matched".
 *
 * ## Coverage is required on a bound record (#6213)
 *
 * `degraded-panel` fired only on `panelCoverage.errored > 0`, so a bound
 * record that OMITTED `panelCoverage` cleared the check by absence. The
 * producer omits the field for an unbound whole panel to keep the pre-1.5
 * hash projection, but a bound record is 1.10 by construction and now always
 * carries it (`buildVoteRecord`, #6213). A bound record without coverage, or
 * with coverage naming zero seats, is `unmeasured-panel`: the record cannot
 * show the panel ran whole, and the gate does not say it did.
 *
 * ## `errorPolicy`: read when recorded, inferred when not
 *
 * #5779 asks the gate to require `errorPolicy: 'absolute_quorum'`. Since
 * schema tier 1.11 (#6211) the record carries the EFFECTIVE policy the panel
 * ran under, hash-covered, and `wrong-error-policy` reads it: a bound record
 * that recorded any other policy is refused whether or not a seat errored —
 * this is the case a whole panel under `reduce_denominator` used to hide,
 * because it was byte-for-byte the shape of an `absolute_quorum` one.
 *
 * A record WITHOUT the field (every pre-1.11 record) cannot answer, and the
 * gate falls back to the inference it always made: under `absolute_quorum`
 * an errored seat voids the vote to `no_quorum`, so an `approved` record
 * with `panelCoverage.errored > 0` can only have been produced under a
 * different policy — `degraded-panel` is that trace. The `ratified` line
 * says which of the two it applied: `errorPolicy: absolute_quorum` when the
 * record stated it, `errorPolicy: unrecorded` when the panel-coverage
 * inference stood in.
 *
 * ## `strategy`: the bar the tally was measured against (#6235)
 *
 * `decision: 'approved'` says the tally cleared SOME bar; `strategy` says
 * which. A 4-approve / 3-reject whole panel under `absolute_quorum` is
 * `approved` at `simple_majority` (0.5) and read as `ratified` until the
 * gate looked at the strategy. The governor bar is `supermajority` (0.667,
 * CLAUDE.md "Consensus voting thresholds"); `unanimous` (1.0) exceeds it and
 * is accepted. Every other strategy is refused as `wrong-strategy`:
 * `simple_majority`, `higher_order` (a plain 0.5 tally despite the name,
 * #5315), `opinion_wise` and `proof_of_learning` (weighted aggregations,
 * not bars). `strategy` is a REQUIRED, hash-covered field of every record,
 * so unlike `errorPolicy` there is no unrecorded case to infer around. It
 * is read after `wrong-error-policy` (both are properties of the vote the
 * panel ran, and the policy check landed first) and before the coverage
 * checks (which are properties of how the seats answered).
 *
 * ## Duplicate ids are REFUSED
 *
 * Two branches appending the same `id` merge under `merge=union` as two lines
 * at one sequence (#5130 step 1 disclosed this fork). Each line self-hashes
 * and the set verifies, so the verifier reports a benign `forks` entry — but
 * one id now names two contents, and a resolver keyed on the id cannot say
 * which the panel produced. Accepting either lets an author shadow a
 * legitimate record with a fabricated one under the same id, which is exactly
 * what `buildVoteRecordRatificationResolver` (`vote-record-ratification.ts`)
 * fails closed on for the tier gate. So: two records with one id and
 * different content is `duplicate-id`, scoped to the whole ledger (an
 * ambiguous ledger is not a resolution source for any PR), and the remedy is
 * removing the line that is not the panel's. Byte-identical copies are one
 * record and collapse — the content is unambiguous, so refusing them would
 * measure nothing.
 *
 * ## Every bound record must ratify
 *
 * If two records bind the same head and one is not an approval, the verdict
 * is `not-approved`, not the approving one: the tier resolver's contrarian
 * condition (#3927) — a promoter must not cherry-pick the approving fork by
 * ref — applies here unchanged. The append script refuses non-approved
 * records, so a dissenting record in the committed ledger is itself a
 * finding.
 *
 * ## Report order: the misconfiguration is named before the rejection
 *
 * The verdict `kind` follows the precedence table (`not-approved` first,
 * so a dissent is never outranked). The PRINTED line does not stop at the
 * first check: it lists EVERY failing check over the bound records, and
 * orders the misconfiguration kinds — `wrong-error-policy`,
 * `wrong-strategy`, `unmeasured-panel`, `degraded-panel` — ahead of
 * `not-approved`. The #6219 confirming panel asked for this at flip time: a
 * run that was rejected AND misconfigured is a misconfigured run, and a log
 * that names it as a plain rejection sends the operator to re-run the same
 * misconfiguration. Both are non-ratified either way; only the report
 * changes. The `failures` field on a bound refusal carries that list.
 *
 * ## Residual trust (disclosed)
 *
 * The self-hash makes a record tamper-EVIDENT, not tamper-PROOF. A record
 * fabricated and self-hashed with the exported `computeVoteRecordHash` passes
 * every check here; provenance (a cross-check against the job sidecar or the
 * PR tally comment, or signing — #3927 item 4) is not part of this step, and
 * the `ratified` line must not be read as proving more than it measures.
 *
 * @module scripts/governor-ledger-evidence
 * (Source: Issue #5130, #5779, #5131, #5118, #6256, #6301)
 */

import type {
  VoteRecord,
  VoteRecordPanelCoverage,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import { verifyVoteRecordSet } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  VOTE_RECORDS_REL_PATH,
  parseVoteRecordsText,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import type {
  MovedHeadRelation,
  PatchIdentity,
  PatchIdentityProbe,
} from './governor-patch-identity.js';

/**
 * The head the record must bind to. The pre-merge job passes the PR head; the
 * post-merge backstop passes the merged PR's FINAL pre-squash head
 * (`pulls/{n}` → `head.sha`), fetched via `refs/pull/{n}/head` so its parent
 * and file list resolve (#6249 panel). The squash commit itself is never a
 * binding target — no panel saw it.
 */
export interface HeadBinding {
  readonly sha: string;
  /** `head^`. Absent when it could not be resolved; then only `sha` is accepted. */
  readonly parentSha?: string | undefined;
  /** Files the head commit alone touches (`head^..head`). */
  readonly commitFiles: readonly string[];
}

export interface LedgerEvidenceInputs {
  /** The committed ledger's bytes; `''` for a missing or empty file. */
  readonly ledgerText: string;
  /** The PR under review. */
  readonly pr: number;
  /**
   * The head to bind against. The workflow ALWAYS supplies one (#6249): the
   * backstop used to key on the PR number alone, which accepted a record
   * bound to sha1 for a PR whose final head was sha2 — a later push past a
   * red pre-merge gate, admin-merged, exited 0. `ledgerEvidenceFromEnv`
   * reports `unmeasured` when it is absent. A caller of this pure function
   * that omits it gets `shaChecked: false` on the ratified line, named.
   */
  readonly head?: HeadBinding | undefined;
  /**
   * The ledger's bytes at the merge-base; `''` when the file did not exist
   * there. Omitted when the caller has no base (post-merge backstop, local
   * run): then append-only is NOT checked and `ratified` reports
   * `appendOnlyChecked: false` (#6213).
   */
  readonly baseLedgerText?: string | undefined;
  /**
   * #6256: answers, for one sha, whether its commit is present and what its
   * non-ledger patch identity, ledger and relation to the head are. Consulted
   * ONLY when no record binds `head` or `head^`. Omitted (a caller with no
   * checkout or no PR base) ⇒ a moved head is `sha-mismatch`, and each
   * `moved` entry says the identity was not measured — fail-closed.
   */
  readonly patchIdentity?: PatchIdentityProbe | undefined;
}

/** Why one recorded sha was not accepted under the moved-head rule (#6256). */
export interface MovedHeadRefusal {
  readonly sha: string;
  readonly reason: string;
}

/**
 * One failing per-record check — the `BOUND_RECORD_CHECKS` kinds, each naming
 * the bound record it was computed over.
 */
export type BoundRecordFailure =
  | { readonly kind: 'not-approved'; readonly record: VoteRecord }
  | {
      readonly kind: 'wrong-error-policy';
      readonly record: VoteRecord;
      /** The policy the record states; never `absolute_quorum` here. */
      readonly errorPolicy: NonNullable<VoteRecord['errorPolicy']>;
    }
  | {
      readonly kind: 'wrong-strategy';
      readonly record: VoteRecord;
      /** The strategy the record states; never one of `GOVERNOR_STRATEGIES` here. */
      readonly strategy: VoteRecord['strategy'];
    }
  | { readonly kind: 'unmeasured-panel'; readonly record: VoteRecord; readonly reason: string }
  | {
      readonly kind: 'degraded-panel';
      readonly record: VoteRecord;
      readonly coverage: VoteRecordPanelCoverage;
    };

/**
 * A refusal over the bound records: the precedence-first failure, plus EVERY
 * failing check in report order (#6219 panel note) — the misconfiguration
 * kinds before `not-approved`, so the printed line names a misconfigured run
 * as such. Never empty: the first entry in precedence order is the refusal's
 * own `kind`.
 */
export type BoundRecordRefusal = BoundRecordFailure & {
  readonly failures: readonly BoundRecordFailure[];
};

/** The verdict. See the module header for what each kind means. */
export type LedgerEvidence =
  | {
      readonly kind: 'ratified';
      readonly record: VoteRecord;
      /**
       * False only when the caller passed no head: the PR number matched and
       * the sha was not compared. Neither workflow job takes that path since
       * #6249 — `ledgerEvidenceFromEnv` refuses to run without `PR_HEAD_SHA`.
       */
      readonly shaChecked: boolean;
      /** False when no base ledger was supplied: append-only was not compared (#6213). */
      readonly appendOnlyChecked: boolean;
    }
  | {
      /** #6256: ratified at an earlier head of this PR whose non-ledger patch equals the current head's. */
      readonly kind: 'ratified-rebased';
      readonly record: VoteRecord;
      /** The sha the record binds — the head the panel saw. */
      readonly ratifiedSha: string;
      /** The current head, which no record binds. */
      readonly headSha: string;
      /**
       * `ancestor`: a merge from main kept the ratified commit in the head's
       * history; `prior-head`: a rebase did not, and the sha is a head this
       * PR had as the workflow measured it (`PR_PRIOR_HEADS`, #6301 item 4).
       */
      readonly relation: MovedHeadRelation;
      /** The identity both shas share. */
      readonly patchIdentity: string;
      /** As on `ratified`; the sha binding was checked by construction. */
      readonly appendOnlyChecked: boolean;
    }
  | { readonly kind: 'no-record'; readonly recordCount: number }
  | {
      readonly kind: 'sha-mismatch';
      readonly accepted: readonly string[];
      readonly found: readonly string[];
      /** #6256: per found sha, why the moved-head rule did not accept it. One entry per `found` sha. */
      readonly moved: readonly MovedHeadRefusal[];
    }
  | BoundRecordRefusal
  | { readonly kind: 'ledger-invalid'; readonly detail: string }
  | {
      readonly kind: 'ledger-rewritten';
      /** Record lines at the base and at the head. */
      readonly baseLineCount: number;
      readonly headLineCount: number;
      /** 1-based index of the first base line not found at the head in order (missing, changed or moved). */
      readonly divergesAt: number;
      /**
       * #6256: set when the comparison was against the ledger AT THE RATIFIED
       * SHA (condition 3 of the moved-head rule) rather than at the base;
       * `baseLineCount` then counts that ledger's lines.
       */
      readonly againstRatifiedSha?: string;
    }
  | { readonly kind: 'duplicate-id'; readonly ids: readonly string[] };

/**
 * The identity of a diff that touches nothing outside the ledger — named,
 * not the hash of `''`, so a ledger-only PR reads as such in the log. The
 * moved-head rule REFUSES it on either side (#6301 item 2): it equals
 * itself, and says nothing about what the panel saw.
 */
export const EMPTY_PATCH_IDENTITY = 'empty (no non-ledger change)';

/** The kinds that pass the gate (#5131): `ratified`, and `ratified-rebased` under the #6256 rule. */
export function isRatifiedKind(kind: LedgerEvidence['kind']): boolean {
  return kind === 'ratified' || kind === 'ratified-rebased';
}

/** A ledger-only tip: the head commit touches exactly the ledger file. Empty ⇒ false. */
export function isLedgerOnlyTip(commitFiles: readonly string[]): boolean {
  return commitFiles.length === 1 && commitFiles[0] === VOTE_RECORDS_REL_PATH;
}

/** `head`, plus `head^` only for a ledger-only tip whose parent is known. Lowercased. */
export function acceptedHeadShas(head: HeadBinding): string[] {
  const shas = [head.sha.toLowerCase()];
  if (head.parentSha !== undefined && isLedgerOnlyTip(head.commitFiles)) {
    shas.push(head.parentSha.toLowerCase());
  }
  return shas;
}

type Loaded = { ok: true; records: VoteRecord[] } | { ok: false; verdict: LedgerEvidence };

/** Parse and verify the ledger; collapse byte-identical duplicates; refuse ambiguous ids. */
function loadLedger(text: string): Loaded {
  const { records, invalidLines } = parseVoteRecordsText(text);
  if (invalidLines.length > 0) {
    return {
      ok: false,
      verdict: {
        kind: 'ledger-invalid',
        detail: `line(s) ${invalidLines.join(', ')} do not parse or fail the record schema`,
      },
    };
  }
  const verification = verifyVoteRecordSet(records);
  if (!verification.ok) {
    return {
      ok: false,
      verdict: {
        kind: 'ledger-invalid',
        detail: `${verification.reason} at record '${verification.recordId}': ${verification.detail}`,
      },
    };
  }
  const byId = new Map<string, VoteRecord>();
  const ambiguous = new Set<string>();
  for (const record of records) {
    const seen = byId.get(record.id);
    if (seen === undefined) byId.set(record.id, record);
    else if (seen.hash !== record.hash) ambiguous.add(record.id);
  }
  if (ambiguous.size > 0) {
    return { ok: false, verdict: { kind: 'duplicate-id', ids: [...ambiguous].sort() } };
  }
  return { ok: true, records: [...byId.values()] };
}

/** The ledger's record lines: every non-blank line, bytes untouched. */
function recordLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Append-only against the base (#6213): the base's record lines must be an
 * ordered subsequence of the head's — a single forward scan, each base line
 * matched byte-for-byte to the next unconsumed head line. Returns the
 * verdict on the first base line that cannot be matched in order (missing,
 * changed, or moved before an earlier base line); `undefined` when every
 * base line is found (an empty base is a subsequence of everything).
 */
function appendOnlyVerdict(
  headText: string,
  baseText: string
): Extract<LedgerEvidence, { kind: 'ledger-rewritten' }> | undefined {
  const base = recordLines(baseText);
  const head = recordLines(headText);
  let cursor = 0;
  for (let i = 0; i < base.length; i++) {
    const at = head.indexOf(base[i] ?? '', cursor);
    if (at === -1) {
      return {
        kind: 'ledger-rewritten',
        baseLineCount: base.length,
        headLineCount: head.length,
        divergesAt: i + 1,
      };
    }
    cursor = at + 1;
  }
  return undefined;
}

/**
 * Why a bound record cannot show its panel ran whole, or `undefined` when it
 * can. Absence is the case #6213 names; a coverage naming zero seats is the
 * empty panel, named rather than passed.
 */
function panelUnmeasuredReason(record: VoteRecord): string | undefined {
  if (record.panelCoverage === undefined) return 'no panelCoverage on the record';
  if (record.panelCoverage.requested === 0) return 'panelCoverage names 0 requested seats';
  return undefined;
}

/** The policy a governor ratification must have run under (#5779). */
export const REQUIRED_ERROR_POLICY: NonNullable<VoteRecord['errorPolicy']> = 'absolute_quorum';

/**
 * The strategies whose bar meets or exceeds the governor's `supermajority`
 * (0.667; CLAUDE.md "Consensus voting thresholds", #6235). `higher_order`
 * is a 0.5 tally (#5315), `simple_majority` is 0.5, and `opinion_wise` /
 * `proof_of_learning` are weighted aggregations rather than bars.
 */
export const GOVERNOR_STRATEGIES: ReadonlySet<VoteRecord['strategy']> = new Set<
  VoteRecord['strategy']
>(['supermajority', 'unanimous']);

/** `unmeasured-panel` / `degraded-panel` from the record's coverage; `undefined` for a whole panel. */
function panelVerdict(record: VoteRecord): BoundRecordFailure | undefined {
  const reason = panelUnmeasuredReason(record);
  if (reason !== undefined) return { kind: 'unmeasured-panel', record, reason };
  // Narrowed above: `reason` is undefined only when coverage is present.
  const coverage = record.panelCoverage;
  if (coverage !== undefined && coverage.errored > 0) {
    return { kind: 'degraded-panel', record, coverage };
  }
  return undefined;
}

/**
 * The per-record checks in precedence order, each over the WHOLE bound set
 * before the next: every bound record must pass a check before any is
 * judged on the following one, so a dissent beside an approval is
 * `not-approved` whatever else the approval says.
 */
const BOUND_RECORD_CHECKS: readonly ((record: VoteRecord) => BoundRecordFailure | undefined)[] = [
  (record) => (record.decision === 'approved' ? undefined : { kind: 'not-approved', record }),
  // #6211: a RECORDED policy is read before the panel-coverage inference —
  // the policy is the cause, the errored seat only its symptom. An absent
  // field is a pre-1.11 record and falls through to the inference.
  (record) =>
    record.errorPolicy !== undefined && record.errorPolicy !== REQUIRED_ERROR_POLICY
      ? { kind: 'wrong-error-policy', record, errorPolicy: record.errorPolicy }
      : undefined,
  // #6235: `approved` only says the tally cleared the strategy's bar; the
  // strategy says which bar. Required on every record, so no absent case.
  (record) =>
    GOVERNOR_STRATEGIES.has(record.strategy)
      ? undefined
      : { kind: 'wrong-strategy', record, strategy: record.strategy },
  panelVerdict,
];

/**
 * Report order (#6219 panel note): the misconfiguration kinds first, in
 * precedence order among themselves, then `not-approved`. A stable partition
 * of the precedence-ordered list, so the first entry is the first
 * misconfiguration when there is one.
 */
function inReportOrder(failures: readonly BoundRecordFailure[]): BoundRecordFailure[] {
  const rejections = failures.filter((f) => f.kind === 'not-approved');
  const misconfigurations = failures.filter((f) => f.kind !== 'not-approved');
  return [...misconfigurations, ...rejections];
}

/**
 * The bound records' verdict: every one must be approved and whole; the
 * latest is reported. A refusal's `kind` is the first failure in PRECEDENCE
 * order (every check over the whole bound set before the next), and its
 * `failures` list carries every failing check in REPORT order, so the
 * annotation can name all of them rather than the first.
 */
function verdictOverBound(
  bound: readonly VoteRecord[],
  checked: { readonly shaChecked: boolean; readonly appendOnlyChecked: boolean }
): LedgerEvidence {
  const failures: BoundRecordFailure[] = [];
  for (const check of BOUND_RECORD_CHECKS) {
    for (const record of bound) {
      const failure = check(record);
      if (failure !== undefined) failures.push(failure);
    }
  }
  const first = failures[0];
  if (first !== undefined) return { ...first, failures: inReportOrder(failures) };
  // `bound` is non-empty by the caller's construction; the reduce needs no seed.
  const latest = bound.reduce((a, b) => (b.sequence > a.sequence ? b : a));
  return { kind: 'ratified', record: latest, ...checked };
}

/**
 * Compute the ledger verdict for a PR. Pure — the ledger bytes, the base
 * ledger bytes, the head and (optionally) the patch-identity probe are
 * passed in; the probe is the one input that reads the checkout, and it is
 * consulted only on the moved-head path. Precedence: `ledger-invalid` →
 * `ledger-rewritten` → `duplicate-id` → `no-record` → `sha-mismatch` →
 * `not-approved` → `wrong-error-policy` → `wrong-strategy` →
 * `unmeasured-panel` → `degraded-panel` → `ratified` / `ratified-rebased`
 * (the latter only via the moved-head rule, #6256, which can also yield
 * `ledger-rewritten` against the ratified sha).
 */
export function evaluateLedgerEvidence(inputs: LedgerEvidenceInputs): LedgerEvidence {
  const loaded = loadLedger(inputs.ledgerText);
  if (!loaded.ok && loaded.verdict.kind === 'ledger-invalid') return loaded.verdict;

  const appendOnlyChecked = inputs.baseLedgerText !== undefined;
  if (inputs.baseLedgerText !== undefined) {
    const rewritten = appendOnlyVerdict(inputs.ledgerText, inputs.baseLedgerText);
    if (rewritten !== undefined) return rewritten;
  }
  if (!loaded.ok) return loaded.verdict;

  const forPr = loaded.records.filter((r) => r.ratifiesPr?.pr === inputs.pr);
  if (forPr.length === 0) return { kind: 'no-record', recordCount: loaded.records.length };

  if (inputs.head === undefined) {
    return verdictOverBound(forPr, { shaChecked: false, appendOnlyChecked });
  }

  const accepted = acceptedHeadShas(inputs.head);
  const bound = forPr.filter((r) => accepted.includes(r.ratifiesPr?.headSha ?? ''));
  if (bound.length === 0) {
    return movedHeadVerdict(forPr, accepted, inputs, appendOnlyChecked);
  }
  return verdictOverBound(bound, { shaChecked: true, appendOnlyChecked });
}

type MeasuredIdentity = Extract<PatchIdentity, { kind: 'measured' }>;

/** One recorded sha under conditions 1–3: refused with a reason, a ledger rewrite, or passing. */
type ShaOutcome =
  | { readonly kind: 'refused'; readonly refusal: MovedHeadRefusal }
  | { readonly kind: 'rewritten'; readonly verdict: LedgerEvidence }
  | { readonly kind: 'passing'; readonly identity: MeasuredIdentity };

/** The three conditions for one recorded sha, against a head whose identity is measured. */
function judgeMovedSha(
  sha: string,
  probe: PatchIdentityProbe,
  head: MeasuredIdentity,
  headLedgerText: string
): ShaOutcome {
  const identity = probe(sha);
  if (identity.kind !== 'measured') {
    return { kind: 'refused', refusal: { sha, reason: identity.detail } };
  }
  const refuse = (reason: string): ShaOutcome => ({ kind: 'refused', refusal: { sha, reason } });
  // #6301 item 2: the empty identity equals itself. A ledger-only PR's head
  // and ANY commit at or before its fork point both diff to nothing, so
  // "equal" would bind the record to no patch at all.
  if (
    identity.patchIdentity === EMPTY_PATCH_IDENTITY &&
    head.patchIdentity === EMPTY_PATCH_IDENTITY
  ) {
    return refuse(
      'empty non-ledger patch on both sides — a ledger-only PR binds to head/head^ only; ' +
        'an empty identity says nothing about what the panel saw'
    );
  }
  if (
    identity.patchIdentity === EMPTY_PATCH_IDENTITY ||
    head.patchIdentity === EMPTY_PATCH_IDENTITY
  ) {
    const where = identity.patchIdentity === EMPTY_PATCH_IDENTITY ? 'the ratified sha' : 'the head';
    return refuse(
      `the non-ledger patch is empty at ${where} and not at the other — an empty identity is ` +
        'never compared; a ledger-only PR binds to head/head^ only'
    );
  }
  if (identity.patchIdentity !== head.patchIdentity) {
    return refuse(
      `its non-ledger patch differs from the head's (${identity.patchIdentity} at the ` +
        `ratified sha, ${head.patchIdentity} at the head) — the panel saw a different diff`
    );
  }
  // #6301 item 3: for a file whose meaning is which section a line sits in,
  // the position-insensitive identity is not enough — the full blob must
  // be byte-equal at both shas.
  const moved = orderSensitiveDifference(identity.orderSensitiveBlobs, head.orderSensitiveBlobs);
  if (moved !== undefined) {
    return refuse(
      `${moved.path} differs between the ratified sha (${moved.atRatified}) and the head ` +
        `(${moved.atHead}) although the patch identity is equal — its meaning is section-bounded ` +
        '(the same lines at another position are a different file), so the full content must match'
    );
  }
  // Condition 3: what the panel's ledger held must still be in the head's,
  // in order. A dropped or altered line between the two heads is a rewrite
  // of the ledger the panel saw, whatever the base comparison found.
  const rewritten = appendOnlyVerdict(headLedgerText, identity.ledgerText);
  if (rewritten !== undefined) {
    return { kind: 'rewritten', verdict: { ...rewritten, againstRatifiedSha: sha } };
  }
  return { kind: 'passing', identity };
}

/**
 * The first order-sensitive file whose blob differs between the two shas —
 * present on one side only, or a different object — or `undefined` when
 * every path matches on both (#6301 item 3).
 */
function orderSensitiveDifference(
  atRatified: Readonly<Record<string, string>>,
  atHead: Readonly<Record<string, string>>
): { readonly path: string; readonly atRatified: string; readonly atHead: string } | undefined {
  const label = (blob: string | undefined): string =>
    blob === undefined ? 'absent' : `blob ${blob}`;
  const paths = [...new Set([...Object.keys(atRatified), ...Object.keys(atHead)])].sort();
  for (const path of paths) {
    const a = atRatified[path];
    const b = atHead[path];
    if (a !== b) return { path, atRatified: label(a), atHead: label(b) };
  }
  return undefined;
}

/** The head's own identity, or why the rule cannot run at all (no probe, no head, head unmeasurable). */
function measuredHead(inputs: LedgerEvidenceInputs):
  | {
      readonly ok: true;
      readonly sha: string;
      readonly probe: PatchIdentityProbe;
      readonly identity: MeasuredIdentity;
    }
  | { readonly ok: false; readonly reason: string } {
  const probe = inputs.patchIdentity;
  const sha = inputs.head?.sha;
  if (probe === undefined || sha === undefined) {
    return {
      ok: false,
      reason: 'the non-ledger patch identity was not measured (no checkout or no PR base supplied)',
    };
  }
  const identity = probe(sha);
  if (identity.kind !== 'measured') {
    return {
      ok: false,
      reason: `the head's own patch identity could not be measured: ${identity.detail}`,
    };
  }
  return { ok: true, sha, probe, identity };
}

/**
 * The verdict over the records bound at the passing shas: the same per-record
 * checks as a head-bound set, with `ratified` reported as `ratified-rebased`.
 */
function rebasedVerdict(
  forPr: readonly VoteRecord[],
  passing: ReadonlyMap<string, MeasuredIdentity>,
  headSha: string,
  appendOnlyChecked: boolean
): LedgerEvidence {
  const rebasedBound = forPr.filter((r) => passing.has(r.ratifiesPr?.headSha ?? ''));
  const verdict = verdictOverBound(rebasedBound, { shaChecked: true, appendOnlyChecked });
  if (verdict.kind !== 'ratified') return verdict;
  const ratifiedSha = verdict.record.ratifiesPr?.headSha ?? '';
  // `verdict.record` is one of `rebasedBound`, whose shas are exactly the map's keys.
  const identity = passing.get(ratifiedSha);
  if (identity === undefined)
    throw new Error(`no measured identity for passing sha ${ratifiedSha}`);
  return {
    kind: 'ratified-rebased',
    record: verdict.record,
    ratifiedSha,
    headSha,
    relation: identity.relation,
    patchIdentity: identity.patchIdentity,
    appendOnlyChecked,
  };
}

/**
 * The moved-head rule (#6256, #6301), reached only when no record binds an
 * accepted head. Each recorded sha is probed once; a sha passes when it is
 * an ancestor of the head or a prior head of this PR, its commit is present,
 * its non-ledger patch identity is non-empty and equals the head's, the
 * order-sensitive files are byte-equal at both, and its ledger is an ordered
 * subsequence of the head ledger. The records bound at passing shas go
 * through the same per-record checks as a head-bound set, and a `ratified`
 * result over them is reported as `ratified-rebased`. No passing sha ⇒
 * `sha-mismatch`, with one named reason per recorded sha.
 */
function movedHeadVerdict(
  forPr: readonly VoteRecord[],
  accepted: readonly string[],
  inputs: LedgerEvidenceInputs,
  appendOnlyChecked: boolean
): LedgerEvidence {
  const found = [...new Set(forPr.map((r) => r.ratifiesPr?.headSha ?? ''))];
  const mismatch = (reasonFor: (sha: string) => string): LedgerEvidence => ({
    kind: 'sha-mismatch',
    accepted,
    found,
    moved: found.map((sha) => ({ sha, reason: reasonFor(sha) })),
  });
  const head = measuredHead(inputs);
  if (!head.ok) return mismatch(() => head.reason);

  const refused = new Map<string, string>();
  const passing = new Map<string, MeasuredIdentity>();
  for (const sha of found) {
    const outcome = judgeMovedSha(sha, head.probe, head.identity, inputs.ledgerText);
    if (outcome.kind === 'rewritten') return outcome.verdict;
    if (outcome.kind === 'refused') refused.set(sha, outcome.refusal.reason);
    else passing.set(sha, outcome.identity);
  }
  if (passing.size === 0) return mismatch((sha) => refused.get(sha) ?? 'not judged');
  return rebasedVerdict(forPr, passing, head.sha, appendOnlyChecked);
}
