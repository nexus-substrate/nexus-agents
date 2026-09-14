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
 * caller in the PR it ratifies. This module reads that ledger and returns a
 * typed verdict the gate prints — WARN-FIRST. The exit code is still the
 * label/approval verdict's; **#5131 flips this verdict to a failure** once
 * records are flowing, and `governor-ledger-evidence.test.ts` carries the
 * `todo` for that flip.
 *
 * ## The verdict names its cases
 *
 * | Kind | Meaning |
 * | --- | --- |
 * | `ratified` | one record binds this PR at an accepted head, is `approved`, and its recorded panel was whole |
 * | `no-record` | no record carries `ratifiesPr.pr === PR`; an EMPTY ledger is this case with `recordCount: 0`, never `ratified` |
 * | `sha-mismatch` | records bind this PR, but none at an accepted head — lists the shas found |
 * | `not-approved` | a bound record's `decision` is not `approved` |
 * | `wrong-error-policy` | a bound record RECORDS an `errorPolicy` other than `absolute_quorum` (#6211) |
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
 * over is not the ledger main will carry. No base supplied (the post-merge
 * backstop, a local run) leaves the check NOT MADE, and the `ratified` line
 * says so (`appendOnlyChecked: false`) rather than reading absence as health.
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
 * ## Residual trust (disclosed)
 *
 * The self-hash makes a record tamper-EVIDENT, not tamper-PROOF. A record
 * fabricated and self-hashed with the exported `computeVoteRecordHash` passes
 * every check here; provenance (a cross-check against the job sidecar or the
 * PR tally comment, or signing — #3927 item 4) is not part of this step, and
 * the `ratified` line must not be read as proving more than it measures.
 *
 * @module scripts/governor-ledger-evidence
 * (Source: Issue #5130, #5779, #5131, #5118)
 */

import { existsSync, readFileSync } from 'node:fs';

import type {
  VoteRecord,
  VoteRecordPanelCoverage,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import { verifyVoteRecordSet } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  VOTE_RECORDS_REL_PATH,
  parseVoteRecordsText,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';

/** Overrides the committed ledger path; for tests that drive the real gate over a temp ledger. */
export const LEDGER_PATH_ENV = 'RATIFICATION_LEDGER_PATH';

/**
 * Path to the ledger AS OF THE MERGE-BASE, written by the workflow's evidence
 * step (`git show <base>:governance/vote-records.jsonl`, or an empty file when
 * the path did not exist at base). Absent ⇒ append-only is not checked, and
 * the verdict says so; present but unreadable ⇒ `unmeasured` (#6213).
 */
export const BASE_LEDGER_PATH_ENV = 'RATIFICATION_BASE_LEDGER_PATH';

/** The PR head as the pre-merge job sees it. Absent on the post-merge backstop. */
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
   * The head to bind against. Omitted by the post-merge backstop, which runs
   * on the squash commit — a sha the panel never saw — and so keys on the PR
   * number alone; the verdict then says the sha was not checked.
   */
  readonly head?: HeadBinding | undefined;
  /**
   * The ledger's bytes at the merge-base; `''` when the file did not exist
   * there. Omitted when the caller has no base (post-merge backstop, local
   * run): then append-only is NOT checked and `ratified` reports
   * `appendOnlyChecked: false` (#6213).
   */
  readonly baseLedgerText?: string | undefined;
}

/** The verdict. See the module header for what each kind means. */
export type LedgerEvidence =
  | {
      readonly kind: 'ratified';
      readonly record: VoteRecord;
      /** False on the post-merge backstop: the PR number matched, the sha was not compared. */
      readonly shaChecked: boolean;
      /** False when no base ledger was supplied: append-only was not compared (#6213). */
      readonly appendOnlyChecked: boolean;
    }
  | { readonly kind: 'no-record'; readonly recordCount: number }
  | {
      readonly kind: 'sha-mismatch';
      readonly accepted: readonly string[];
      readonly found: readonly string[];
    }
  | { readonly kind: 'not-approved'; readonly record: VoteRecord }
  | {
      readonly kind: 'wrong-error-policy';
      readonly record: VoteRecord;
      /** The policy the record states; never `absolute_quorum` here. */
      readonly errorPolicy: NonNullable<VoteRecord['errorPolicy']>;
    }
  | { readonly kind: 'unmeasured-panel'; readonly record: VoteRecord; readonly reason: string }
  | {
      readonly kind: 'degraded-panel';
      readonly record: VoteRecord;
      readonly coverage: VoteRecordPanelCoverage;
    }
  | { readonly kind: 'ledger-invalid'; readonly detail: string }
  | {
      readonly kind: 'ledger-rewritten';
      /** Record lines at the base and at the head. */
      readonly baseLineCount: number;
      readonly headLineCount: number;
      /** 1-based index of the first base line not found at the head in order (missing, changed or moved). */
      readonly divergesAt: number;
    }
  | { readonly kind: 'duplicate-id'; readonly ids: readonly string[] };

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
const REQUIRED_ERROR_POLICY: NonNullable<VoteRecord['errorPolicy']> = 'absolute_quorum';

/** The bound records' verdict: every one must be approved and whole; the latest is reported. */
function verdictOverBound(
  bound: readonly VoteRecord[],
  checked: { readonly shaChecked: boolean; readonly appendOnlyChecked: boolean }
): LedgerEvidence {
  for (const record of bound) {
    if (record.decision !== 'approved') return { kind: 'not-approved', record };
  }
  // #6211: a RECORDED policy is read before the panel-coverage inference —
  // the policy is the cause, the errored seat only its symptom. An absent
  // field is a pre-1.11 record and falls through to the inference.
  for (const record of bound) {
    if (record.errorPolicy !== undefined && record.errorPolicy !== REQUIRED_ERROR_POLICY) {
      return { kind: 'wrong-error-policy', record, errorPolicy: record.errorPolicy };
    }
  }
  for (const record of bound) {
    const reason = panelUnmeasuredReason(record);
    if (reason !== undefined) return { kind: 'unmeasured-panel', record, reason };
    // Narrowed above: `reason` is undefined only when coverage is present.
    const coverage = record.panelCoverage;
    if (coverage !== undefined && coverage.errored > 0) {
      return { kind: 'degraded-panel', record, coverage };
    }
  }
  // `bound` is non-empty by the caller's construction; the reduce needs no seed.
  const latest = bound.reduce((a, b) => (b.sequence > a.sequence ? b : a));
  return { kind: 'ratified', record: latest, ...checked };
}

/**
 * Compute the ledger verdict for a PR. Pure — the ledger bytes, the base
 * ledger bytes and the head are passed in. Precedence: `ledger-invalid` →
 * `ledger-rewritten` → `duplicate-id` → `no-record` → `sha-mismatch` →
 * `not-approved` → `wrong-error-policy` → `unmeasured-panel` →
 * `degraded-panel` → `ratified`.
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
    const found = [...new Set(forPr.map((r) => r.ratifiesPr?.headSha ?? ''))];
    return { kind: 'sha-mismatch', accepted, found };
  }
  return verdictOverBound(bound, { shaChecked: true, appendOnlyChecked });
}

const FLIP_NOTE = '(warn-first; #5131 flips this to a failure)';
const TAG = '[governor-ledger]';

function formatRatified(evidence: Extract<LedgerEvidence, { kind: 'ratified' }>): string {
  const b = evidence.record.ratifiesPr;
  const recordedHead = b?.headSha ?? '(unbound)';
  const sha = evidence.shaChecked
    ? `at ${recordedHead}`
    : `— sha not checked (post-merge: the squash commit is not the head the panel saw; recorded head ${recordedHead})`;
  const coverage = evidence.record.panelCoverage;
  const panel =
    coverage === undefined
      ? 'panel whole'
      : `panel whole (${String(coverage.responded)} of ${String(coverage.requested)} seats responded)`;
  // #6211: name which check stood behind "panel whole" — the recorded policy,
  // or the pre-1.11 inference from panel coverage.
  const policy =
    evidence.record.errorPolicy !== undefined
      ? `errorPolicy: ${evidence.record.errorPolicy}`
      : 'errorPolicy: unrecorded (pre-1.11 record; inferred from panel coverage)';
  const appendOnly = evidence.appendOnlyChecked
    ? 'ledger append-only against base'
    : 'base ledger not supplied — append-only not checked';
  return (
    `::notice::${TAG} ratified: record '${evidence.record.id}' ratifies PR #${String(b?.pr)} ` +
    `${sha}, decision ${evidence.record.decision}, ${panel}, ${policy}, ${appendOnly}.`
  );
}

/** `no-record`: an empty ledger is named as such, distinct from "none of N". */
function noRecordBody(recordCount: number): string {
  return recordCount === 0
    ? 'the committed ledger is empty — no panel record ratifies this PR'
    : `none of the ${String(recordCount)} record(s) in the committed ledger ratifies this PR`;
}

/** The reason text for every non-ratified kind; the caller adds the annotation prefix and the flip note. */
function warningBody(evidence: Exclude<LedgerEvidence, { kind: 'ratified' }>): string {
  switch (evidence.kind) {
    case 'no-record':
      return noRecordBody(evidence.recordCount);
    case 'sha-mismatch':
      return (
        `record(s) ratify this PR at ${evidence.found.join(', ')}, not at the accepted head(s) ` +
        `${evidence.accepted.join(', ')} — the panel saw a different diff`
      );
    case 'not-approved':
      return `record '${evidence.record.id}' binds this PR with decision '${evidence.record.decision}'`;
    case 'wrong-error-policy':
      return (
        `record '${evidence.record.id}' was approved under errorPolicy '${evidence.errorPolicy}' ` +
        `— a governor ratification must run under '${REQUIRED_ERROR_POLICY}'`
      );
    case 'unmeasured-panel':
      return (
        `record '${evidence.record.id}' binds this PR but ${evidence.reason} — the record cannot ` +
        'show the panel ran whole, and absence is not measured as whole'
      );
    case 'degraded-panel':
      return (
        `record '${evidence.record.id}' was approved with ${String(evidence.coverage.errored)} of ` +
        `${String(evidence.coverage.requested)} seat(s) errored (${evidence.coverage.erroredRoles.join(', ')}) ` +
        '— a governor ratification must run whole under absolute_quorum'
      );
    case 'ledger-invalid':
      return evidence.detail;
    case 'ledger-rewritten':
      return (
        `the ledger at head is not the base ledger plus appended lines: base line ${String(evidence.divergesAt)} ` +
        `of ${String(evidence.baseLineCount)} is missing, changed or moved (head has ${String(evidence.headLineCount)} ` +
        'record line(s)) — the ledger is append-only; restore the base lines verbatim, in their order'
      );
    case 'duplicate-id':
      return (
        `${evidence.ids.map((id) => `'${id}'`).join(', ')} name(s) more than one record with different ` +
        "content; the ledger is ambiguous until the line that is not the panel's is removed"
      );
  }
}

/**
 * Render the verdict as a GitHub annotation: `::notice::` for `ratified`,
 * `::warning::` for everything else. Names the record id or the reason so the
 * line stands on its own in the job log.
 */
export function formatLedgerEvidence(evidence: LedgerEvidence): string {
  if (evidence.kind === 'ratified') return formatRatified(evidence);
  return `::warning::${TAG} ${evidence.kind}: ${warningBody(evidence)} ${FLIP_NOTE}`;
}

/** The ledger verdict, or an explicit "not measured" when the inputs to compute it are absent. */
export type LedgerEvidenceReport =
  LedgerEvidence | { readonly kind: 'unmeasured'; readonly reason: string };

function headFromEnv(env: NodeJS.ProcessEnv): HeadBinding | undefined {
  const sha = (env['PR_HEAD_SHA'] ?? '').trim();
  if (sha === '') return undefined;
  const parent = (env['PR_HEAD_PARENT_SHA'] ?? '').trim();
  const commitFiles = (env['HEAD_COMMIT_FILES'] ?? '')
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f !== '');
  return { sha, ...(parent !== '' ? { parentSha: parent } : {}), commitFiles };
}

type ReadResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Read a ledger file, naming the failure instead of throwing (#6213). An
 * EISDIR or EACCES here used to crash the gate, which turned a would-be
 * exit 0 into a non-zero exit — a change to the exit code the warn-first
 * contract forbids. `missingIsEmpty` is the head ledger's rule: a file that
 * does not exist is the empty ledger, a measurement; the base ledger is
 * written by the workflow unconditionally, so its absence is an error.
 */
function readLedgerFile(path: string, what: string, missingIsEmpty: boolean): ReadResult {
  if (missingIsEmpty && !existsSync(path)) return { ok: true, text: '' };
  try {
    return { ok: true, text: readFileSync(path, 'utf-8') };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `the ${what} at ${path} could not be read (${message})` };
  }
}

/**
 * Read the inputs from the workflow's environment and compute the verdict.
 *
 * `PR_NUMBER` absent or malformed is `unmeasured`, not `no-record`: a local
 * run has no PR, and "nothing was measured" must not print as "no panel
 * ratified this". A missing ledger FILE is the empty ledger (`no-record`,
 * count 0) — that is a measurement; an UNREADABLE one (a directory at the
 * path, a permissions error) is `unmeasured` naming the error (#6213).
 * `PR_HEAD_SHA` absent is the post-merge shape (PR number only).
 * `RATIFICATION_BASE_LEDGER_PATH` names the ledger at the merge-base; absent,
 * append-only is not checked and the verdict says so.
 */
export function ledgerEvidenceFromEnv(
  env: NodeJS.ProcessEnv,
  defaultLedgerPath: string
): LedgerEvidenceReport {
  const pr = prNumberFromEnv(env);
  if (typeof pr !== 'number') return pr;

  const ledgerPath = (env[LEDGER_PATH_ENV] ?? '').trim() || defaultLedgerPath;
  const ledger = readLedgerFile(ledgerPath, 'committed ledger', true);
  if (!ledger.ok) return { kind: 'unmeasured', reason: ledger.reason };

  const base = baseLedgerFromEnv(env);
  if (base !== undefined && !base.ok) return { kind: 'unmeasured', reason: base.reason };

  const head = headFromEnv(env);
  return evaluateLedgerEvidence({
    ledgerText: ledger.text,
    pr,
    ...(head !== undefined ? { head } : {}),
    ...(base !== undefined ? { baseLedgerText: base.text } : {}),
  });
}

/** `PR_NUMBER` as a positive integer, or the `unmeasured` report that says why it is not one. */
function prNumberFromEnv(
  env: NodeJS.ProcessEnv
): number | Extract<LedgerEvidenceReport, { kind: 'unmeasured' }> {
  const prText = (env['PR_NUMBER'] ?? '').trim();
  if (/^[1-9]\d*$/.test(prText)) return Number(prText);
  const what = prText === '' ? 'not set' : `'${prText}', not a positive integer`;
  return {
    kind: 'unmeasured',
    reason: `PR_NUMBER is ${what}; the committed ledger was not consulted`,
  };
}

/** The base ledger named by `RATIFICATION_BASE_LEDGER_PATH`; `undefined` when the variable is unset. */
function baseLedgerFromEnv(env: NodeJS.ProcessEnv): ReadResult | undefined {
  const basePath = (env[BASE_LEDGER_PATH_ENV] ?? '').trim();
  if (basePath === '') return undefined;
  return readLedgerFile(basePath, 'base ledger', false);
}

/** Print the report to stderr, next to the label/approval verdict. Never changes the exit code (#5131). */
export function reportLedgerEvidence(env: NodeJS.ProcessEnv, defaultLedgerPath: string): void {
  const report = ledgerEvidenceFromEnv(env, defaultLedgerPath);
  if (report.kind === 'unmeasured') {
    console.error(`[governor-ledger] unmeasured: ${report.reason}.`);
    return;
  }
  console.error(formatLedgerEvidence(report));
}
