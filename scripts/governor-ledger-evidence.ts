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
 * | `ratified-rebased` | as `ratified`, but the record binds an EARLIER head of this PR (an ancestor of the head, or a head the workflow saw this PR have) and the head's tree equals that head's patch replayed onto the head's base — see "The head moved" below (#6256, #6301) |
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
 * ## The head moved, the content did not (#6256, `ratified-rebased`)
 *
 * Every governor PR appends one ledger line, and the ledger must be
 * append-only against the base, so when two governor PRs are in flight the
 * second must pick up the first's line once it merges — a rebase or a merge
 * from main — and that moves its head past the sha its record binds. Measured
 * twice on 2026-09-14: #6252 was ratified 7-0 at `fca64e9ea8`, rebased to
 * `cce938eec2` to pick up #6249's line, and re-paneled; #6282 was ratified
 * at `43cb8bec`, refreshed by a merge from main (`8618d18d`) that resolved
 * a SKILL.md PIPELINE NOTE conflict BY HAND, and re-paneled — under the rule
 * below the first would pass and the second would not, correctly: a
 * hand-resolved conflict is content the panel never saw.
 *
 * So a record whose `ratifiesPr.headSha` is neither `head` nor `head^` is
 * still accepted — as the distinct kind `ratified-rebased`, so the log says
 * the head moved and why it still counts — when ALL of (#6256; redesigned by
 * the #6301 panel 1 review, which rejected the earlier patch-identity hash
 * because it was position-insensitive within a file):
 *
 * 1. the ratified sha `A` is RELATED to this PR: an ancestor of the head (a
 *    merge from main kept it), or a head this PR had before — as the
 *    workflow measured it (`PR_PRIOR_HEADS`: the `synchronize` event's
 *    `before` and the head shas of the workflow's own runs that GitHub
 *    attributes to THIS PR NUMBER, in the PR's own head repository — never
 *    a branch name, which a fork PR can share with the base repo), or the
 *    first parent of such a head when it touched only the ledger (the tip a
 *    force-push replaces is A1, the record binds A = A1^). Anything else is
 *    `sha-mismatch` naming the relation: the same content on an unrelated
 *    branch would pass condition 3 (#6301 item 4). The commit object must be
 *    present; a prior head a rebase orphaned is fetched from `origin` by
 *    sha (GitHub serves any object by sha — measured against the
 *    rebased-away heads of #6252), and NO other sha is fetched, because that
 *    fetch reaches the whole fork network. Still missing ⇒ `sha-mismatch`
 *    naming "object not found".
 * 2. `A` carries a NON-LEDGER change: `git diff-tree -r <merge-base(A, PR
 *    base)> A -- . ':!governance/vote-records.jsonl'` lists at least one
 *    path. A ledger-only PR is refused here by name (#6301 item 2): its
 *    head replays to its own base, so its record would "match" any commit
 *    at or before the fork point — a ledger-only PR binds to `head`/`head^`
 *    only.
 * 3. the head's TREE equals `A` replayed onto the head's base: with
 *    `B_H = merge-base(H, PR base)`, `T = git merge-tree --write-tree B_H A`
 *    (git's own contextual merge; a CONFLICT is `sha-mismatch` naming the
 *    conflicting paths — "content the panel never saw" — and is never
 *    accepted), and `git diff-tree -r T H^{tree} -- .
 *    ':!governance/vote-records.jsonl'` is EMPTY; a path listed is
 *    `sha-mismatch` naming it. A clean rebase and a clean merge from main
 *    produce the same tree, so one rule covers both. Blob ids, not a
 *    rendered diff: position-sensitive by construction (the same lines
 *    moved to another function are another blob), binary-safe, and blind
 *    to `.gitattributes` — the `--text` and order-sensitive-file special
 *    cases the patch identity needed do not exist here.
 * 4. the ledger at `A` is an ordered subsequence of the head ledger (the
 *    #6218 rule, applied between the two heads) — otherwise
 *    `ledger-rewritten` naming the ratified sha.
 *
 * The rule applies only when NO record binds `head` or `head^`; a record
 * that does is judged exactly as before and the probe never runs. Every
 * record bound at the moved sha must still ratify (a dissent there is
 * `not-approved`), and the per-record checks are unchanged.
 *
 * What the tree rule does NOT catch, disclosed: nothing position-wise — a
 * byte, a line moved, a mode, a binary, a file added or dropped all change a
 * blob or tree id. What it takes as given: that `B_H` is the true base
 * branch. `PR_BASE_SHA` comes from the workflow (the pre-merge job's
 * `merge-base origin/<base> <head>`, the backstop's `main~1`), and `B_H`'s
 * own content — everything main gained between `A`'s fork point and `B_H`
 * — was never before THIS panel; it landed through its own PRs and their
 * own gates. The rule proves `H ≡ B_H ⊕ patch(A)`, not that `B_H` is sound.
 * The ledger file is excluded from the tree comparison and covered by
 * condition 4 alone.
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
 * ## Signature: reported per bound record, not yet enforced (#3927 item 4)
 *
 * Since phase 1 a record may carry a `signature` — an `ssh-keygen -Y sign`
 * signature over its committed hash, outside the self-hash — and the gate
 * verifies it against the committed `governance/allowed_signers` (beside
 * the ledger; `RATIFICATION_ALLOWED_SIGNERS_PATH` overrides it for tests;
 * the verifier and the rendering live in `governor-ledger-signature.ts`,
 * and `governor-ledger-report.ts` supplies the verifier from the
 * environment and prints the codes). The verifier's code for EVERY bound
 * record goes on the evidence line — under `ratified` and `ratified-rebased`
 * alike, and on every bound refusal: `signed by <keyId>`,
 * `unsigned-record`, `unknown-signer`, `bad-signature`,
 * `signature-not-measured` — distinct, never collapsed, with ssh-keygen's
 * reason where there is one. An unreadable allowed_signers is
 * `signature-not-measured` naming the path, on the line, not a crash.
 *
 * THIS PHASE THE EXIT CODE DOES NOT DEPEND ON IT. The two records committed
 * before phase 2 are unsigned and the append script signs only when a key is
 * configured; enforcing now would refuse every governor PR. Phase 3 lands a
 * COMMITTED cutover constant (`SIGNATURE_CUTOVER_SEQUENCE`, not an env knob)
 * once the count of unsigned records is measured: a bound record at or past
 * it that is not `signed` becomes a refusal, and the grandfathered range is
 * named. A caller of the pure function that supplies no `signatureVerifier`
 * gets no `signatures` field and a line that says `unmeasured (no verifier
 * supplied)` — absence is not reported as `unsigned-record`.
 *
 * ## Residual trust (disclosed)
 *
 * The self-hash makes a record tamper-EVIDENT, not tamper-PROOF. A record
 * fabricated and self-hashed with the exported `computeVoteRecordHash` passes
 * every check here; provenance (a cross-check against the job sidecar or the
 * PR tally comment) is not part of this step, and the `ratified` line must
 * not be read as proving more than it measures. A `signed` signature proves
 * access to a listed private key from the environment that ran the append —
 * not that a human ratified anything (#6257; the threat model has the
 * measured example).
 *
 * @module scripts/governor-ledger-evidence
 * (Source: Issue #5130, #5779, #5131, #5118, #6256, #6301, #3927)
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
import type { RecordSignatureReport, SignatureVerifier } from './governor-ledger-signature.js';
import type {
  MovedHeadMeasurement,
  MovedHeadProbe,
  MovedHeadRelation,
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
   * #6256: answers, for one ratified sha, whether its commit is present, how
   * it relates to the head, whether it carries a non-ledger change, whether
   * the head's tree equals it replayed onto the head's base, and what its
   * ledger held. Consulted ONLY when no record binds `head` or `head^`.
   * Omitted (a caller with no checkout or no PR base) ⇒ a moved head is
   * `sha-mismatch`, and each `moved` entry says the tree was not measured —
   * fail-closed.
   */
  readonly movedHead?: MovedHeadProbe | undefined;
  /**
   * The signature verifier for a bound record (#3927 item 4) — the workflow
   * supplies `verifyVoteRecordSignature` over the committed allowed_signers.
   * Omitted ⇒ no `signatures` on the verdict, and the line says the check
   * was not made. Informational this phase: it never changes `kind`.
   */
  readonly signatureVerifier?: SignatureVerifier | undefined;
}

/**
 * The per-bound-record signature verdicts, present only when the caller
 * supplied a verifier. Carried by `ratified`, `ratified-rebased` and by
 * every bound refusal.
 */
interface WithSignatures {
  readonly signatures?: readonly RecordSignatureReport[];
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
export type BoundRecordRefusal = BoundRecordFailure &
  WithSignatures & {
    readonly failures: readonly BoundRecordFailure[];
  };

/** The verdict. See the module header for what each kind means. */
export type LedgerEvidence =
  | ({
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
    } & WithSignatures)
  | ({
      /** #6256: ratified at an earlier head of this PR; the current head's tree is that head's patch replayed onto its base. */
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
      /**
       * The tree `git merge-tree --write-tree <merge-base(head, PR base)> <ratifiedSha>`
       * wrote — the head's own tree, ledger aside. Reproducible from the checkout.
       */
      readonly replayedTree: string;
      /** As on `ratified`; the sha binding was checked by construction. */
      readonly appendOnlyChecked: boolean;
    } & WithSignatures)
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
       * SHA (condition 4 of the moved-head rule) rather than at the base;
       * `baseLineCount` then counts that ledger's lines.
       */
      readonly againstRatifiedSha?: string;
    }
  | { readonly kind: 'duplicate-id'; readonly ids: readonly string[] };

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
  checked: { readonly shaChecked: boolean; readonly appendOnlyChecked: boolean },
  signatureVerifier: LedgerEvidenceInputs['signatureVerifier']
): LedgerEvidence {
  const failures: BoundRecordFailure[] = [];
  for (const check of BOUND_RECORD_CHECKS) {
    for (const record of bound) {
      const failure = check(record);
      if (failure !== undefined) failures.push(failure);
    }
  }
  // #3927 item 4: computed over every bound record, attached to whichever
  // verdict follows, never consulted for `kind` this phase.
  const signatures: WithSignatures =
    signatureVerifier !== undefined
      ? { signatures: bound.map((r) => ({ recordId: r.id, verdict: signatureVerifier(r) })) }
      : {};
  const first = failures[0];
  if (first !== undefined) return { ...first, failures: inReportOrder(failures), ...signatures };
  // `bound` is non-empty by the caller's construction; the reduce needs no seed.
  const latest = bound.reduce((a, b) => (b.sequence > a.sequence ? b : a));
  return { kind: 'ratified', record: latest, ...checked, ...signatures };
}

/**
 * Compute the ledger verdict for a PR. Pure — the ledger bytes, the base
 * ledger bytes, the head and (optionally) the moved-head probe are passed
 * in; the probe is the one input that reads the checkout, and it is
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
    return verdictOverBound(
      forPr,
      { shaChecked: false, appendOnlyChecked },
      inputs.signatureVerifier
    );
  }

  const accepted = acceptedHeadShas(inputs.head);
  const bound = forPr.filter((r) => accepted.includes(r.ratifiesPr?.headSha ?? ''));
  if (bound.length === 0) {
    return movedHeadVerdict(forPr, accepted, inputs, appendOnlyChecked);
  }
  return verdictOverBound(bound, { shaChecked: true, appendOnlyChecked }, inputs.signatureVerifier);
}

type Measured = Extract<MovedHeadMeasurement, { kind: 'measured' }>;

/** One recorded sha under conditions 1–4: refused with a reason, a ledger rewrite, or passing. */
type ShaOutcome =
  | { readonly kind: 'refused'; readonly refusal: MovedHeadRefusal }
  | { readonly kind: 'rewritten'; readonly verdict: LedgerEvidence }
  | { readonly kind: 'passing'; readonly measured: Measured };

/** The four conditions for one recorded sha. */
function judgeMovedSha(sha: string, probe: MovedHeadProbe, headLedgerText: string): ShaOutcome {
  const measured = probe(sha);
  if (measured.kind !== 'measured') {
    return { kind: 'refused', refusal: { sha, reason: measured.detail } };
  }
  const refuse = (reason: string): ShaOutcome => ({ kind: 'refused', refusal: { sha, reason } });
  // Condition 2 (#6301 item 2): a ledger-only PR's head replays to its own
  // base, so its record would match any commit at or before the fork point.
  if (!measured.nonLedgerChanged) {
    return refuse(
      'no non-ledger change at the ratified sha — a ledger-only PR binds to head/head^ only; ' +
        'a commit that changes nothing but the ledger says nothing about what the panel saw'
    );
  }
  // Condition 3: the head's tree must be the ratified patch replayed onto
  // the head's base. A conflict is content the panel never saw (#6282); a
  // differing path is a change made after the panel voted, wherever in the
  // file it sits.
  if (measured.tree.kind === 'conflict') {
    return refuse(
      `replaying it onto the head's base conflicts — conflict resolving ` +
        `${measured.tree.paths.join(', ')} — content the panel never saw; a hand-resolved ` +
        'conflict needs a fresh panel'
    );
  }
  if (measured.tree.kind === 'differs') {
    return refuse(
      `the head's tree differs from the ratified patch replayed onto the head's base at ` +
        `${measured.tree.paths.join(', ')} (replayed tree ${measured.tree.replayedTree}) ` +
        '— the panel saw different content'
    );
  }
  // Condition 4: what the panel's ledger held must still be in the head's,
  // in order. A dropped or altered line between the two heads is a rewrite
  // of the ledger the panel saw, whatever the base comparison found.
  const rewritten = appendOnlyVerdict(headLedgerText, measured.ledgerText);
  if (rewritten !== undefined) {
    return { kind: 'rewritten', verdict: { ...rewritten, againstRatifiedSha: sha } };
  }
  return { kind: 'passing', measured };
}

/**
 * The verdict over the records bound at the passing shas: the same per-record
 * checks as a head-bound set, with `ratified` reported as `ratified-rebased`.
 */
function rebasedVerdict(
  forPr: readonly VoteRecord[],
  passing: ReadonlyMap<string, Measured>,
  headSha: string,
  appendOnlyChecked: boolean,
  signatureVerifier: LedgerEvidenceInputs['signatureVerifier']
): LedgerEvidence {
  const rebasedBound = forPr.filter((r) => passing.has(r.ratifiesPr?.headSha ?? ''));
  const verdict = verdictOverBound(
    rebasedBound,
    { shaChecked: true, appendOnlyChecked },
    signatureVerifier
  );
  if (verdict.kind !== 'ratified') return verdict;
  const ratifiedSha = verdict.record.ratifiesPr?.headSha ?? '';
  // `verdict.record` is one of `rebasedBound`, whose shas are exactly the map's keys.
  const measured = passing.get(ratifiedSha);
  if (measured === undefined) throw new Error(`no measurement for passing sha ${ratifiedSha}`);
  return {
    kind: 'ratified-rebased',
    record: verdict.record,
    ratifiedSha,
    headSha,
    relation: measured.relation,
    replayedTree: measured.tree.replayedTree,
    appendOnlyChecked,
    // #3927 item 4: the rebased record is a bound record; its signature code travels with it.
    ...(verdict.signatures !== undefined ? { signatures: verdict.signatures } : {}),
  };
}

/**
 * The moved-head rule (#6256, #6301), reached only when no record binds an
 * accepted head. Each recorded sha is probed once; a sha passes when it is
 * an ancestor of the head or a prior head of this PR, its commit is present,
 * it carries a non-ledger change, the head's tree equals it replayed onto
 * the head's base, and its ledger is an ordered subsequence of the head
 * ledger. The records bound at passing shas go through the same per-record
 * checks as a head-bound set, and a `ratified` result over them is reported
 * as `ratified-rebased`. No passing sha ⇒ `sha-mismatch`, with one named
 * reason per recorded sha; no probe ⇒ every reason says "not measured".
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
  const probe = inputs.movedHead;
  const headSha = inputs.head?.sha;
  if (probe === undefined || headSha === undefined) {
    return mismatch(
      () => 'the head tree was not measured against it (no checkout or no PR base supplied)'
    );
  }

  const refused = new Map<string, string>();
  const passing = new Map<string, Measured>();
  for (const sha of found) {
    const outcome = judgeMovedSha(sha, probe, inputs.ledgerText);
    if (outcome.kind === 'rewritten') return outcome.verdict;
    if (outcome.kind === 'refused') refused.set(sha, outcome.refusal.reason);
    else passing.set(sha, outcome.measured);
  }
  if (passing.size === 0) return mismatch((sha) => refused.get(sha) ?? 'not judged');
  return rebasedVerdict(forPr, passing, headSha, appendOnlyChecked, inputs.signatureVerifier);
}
