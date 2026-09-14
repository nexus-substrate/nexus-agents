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
 * | `ratified` | one record binds this PR at an accepted head, is `approved`, and the panel was whole |
 * | `no-record` | no record carries `ratifiesPr.pr === PR`; an EMPTY ledger is this case with `recordCount: 0`, never `ratified` |
 * | `sha-mismatch` | records bind this PR, but none at an accepted head — lists the shas found |
 * | `not-approved` | a bound record's `decision` is not `approved` |
 * | `degraded-panel` | a bound record's `panelCoverage.errored > 0` |
 * | `ledger-invalid` | a line does not parse, or `verifyVoteRecordSet` fails (tamper, gap) |
 * | `duplicate-id` | one id names two DIFFERENT records — refused, see below |
 *
 * The accepted heads are the PR head and, when the head commit touches ONLY
 * the ledger file, its first parent: the caller-commits tip is a ledger-only
 * commit on top of the head the panel saw (#5130 panel Q1). A tip that
 * touches anything else — including a merge from main — is a new head the
 * panel did not see, so only `head` itself is accepted.
 *
 * ## `errorPolicy` is not on the record — what `degraded-panel` proves instead
 *
 * #5779 asks the gate to require `errorPolicy: 'absolute_quorum'`. The
 * record does not carry the policy: `VoteRecordSchema` has no such field, and
 * `consensus_vote` stamps it on the RESPONSE only (`vote-record-store.ts`,
 * `outcomeToDecision`). Under `absolute_quorum` an errored seat voids the vote
 * to `no_quorum`, so an `approved` record with `panelCoverage.errored > 0` can
 * only have been produced under a different policy — `degraded-panel` is the
 * one ledger-observable trace of a wrong policy, and a whole panel makes the
 * policy irrelevant to the verdict. A separate `wrong-error-policy` kind
 * would be a check that cannot fire; it is deliberately absent. Recording the
 * policy on the record (a schema tier, `src/audit/`) is its own governor-path
 * change and is not made here.
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
}

/** The verdict. See the module header for what each kind means. */
export type LedgerEvidence =
  | {
      readonly kind: 'ratified';
      readonly record: VoteRecord;
      /** False on the post-merge backstop: the PR number matched, the sha was not compared. */
      readonly shaChecked: boolean;
    }
  | { readonly kind: 'no-record'; readonly recordCount: number }
  | {
      readonly kind: 'sha-mismatch';
      readonly accepted: readonly string[];
      readonly found: readonly string[];
    }
  | { readonly kind: 'not-approved'; readonly record: VoteRecord }
  | {
      readonly kind: 'degraded-panel';
      readonly record: VoteRecord;
      readonly coverage: VoteRecordPanelCoverage;
    }
  | { readonly kind: 'ledger-invalid'; readonly detail: string }
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

/** The bound records' verdict: every one must be approved and whole; the latest is reported. */
function verdictOverBound(bound: readonly VoteRecord[], shaChecked: boolean): LedgerEvidence {
  for (const record of bound) {
    if (record.decision !== 'approved') return { kind: 'not-approved', record };
  }
  for (const record of bound) {
    if (record.panelCoverage !== undefined && record.panelCoverage.errored > 0) {
      return { kind: 'degraded-panel', record, coverage: record.panelCoverage };
    }
  }
  // `bound` is non-empty by the caller's construction; the reduce needs no seed.
  const latest = bound.reduce((a, b) => (b.sequence > a.sequence ? b : a));
  return { kind: 'ratified', record: latest, shaChecked };
}

/**
 * Compute the ledger verdict for a PR. Pure — the ledger bytes and the head
 * are passed in. Precedence: `ledger-invalid` → `duplicate-id` → `no-record`
 * → `sha-mismatch` → `not-approved` → `degraded-panel` → `ratified`.
 */
export function evaluateLedgerEvidence(inputs: LedgerEvidenceInputs): LedgerEvidence {
  const loaded = loadLedger(inputs.ledgerText);
  if (!loaded.ok) return loaded.verdict;

  const forPr = loaded.records.filter((r) => r.ratifiesPr?.pr === inputs.pr);
  if (forPr.length === 0) return { kind: 'no-record', recordCount: loaded.records.length };

  if (inputs.head === undefined) return verdictOverBound(forPr, false);

  const accepted = acceptedHeadShas(inputs.head);
  const bound = forPr.filter((r) => accepted.includes(r.ratifiesPr?.headSha ?? ''));
  if (bound.length === 0) {
    const found = [...new Set(forPr.map((r) => r.ratifiesPr?.headSha ?? ''))];
    return { kind: 'sha-mismatch', accepted, found };
  }
  return verdictOverBound(bound, true);
}

const FLIP_NOTE = '(warn-first; #5131 flips this to a failure)';
const TAG = '[governor-ledger]';

function formatRatified(evidence: Extract<LedgerEvidence, { kind: 'ratified' }>): string {
  const b = evidence.record.ratifiesPr;
  const recordedHead = b?.headSha ?? '(unbound)';
  const sha = evidence.shaChecked
    ? `at ${recordedHead}`
    : `— sha not checked (post-merge: the squash commit is not the head the panel saw; recorded head ${recordedHead})`;
  return (
    `::notice::${TAG} ratified: record '${evidence.record.id}' ratifies PR #${String(b?.pr)} ` +
    `${sha}, decision ${evidence.record.decision}, panel whole.`
  );
}

/** The reason text for every non-ratified kind; the caller adds the annotation prefix and the flip note. */
function warningBody(evidence: Exclude<LedgerEvidence, { kind: 'ratified' }>): string {
  switch (evidence.kind) {
    case 'no-record':
      return evidence.recordCount === 0
        ? 'the committed ledger is empty — no panel record ratifies this PR'
        : `none of the ${String(evidence.recordCount)} record(s) in the committed ledger ratifies this PR`;
    case 'sha-mismatch':
      return (
        `record(s) ratify this PR at ${evidence.found.join(', ')}, not at the accepted head(s) ` +
        `${evidence.accepted.join(', ')} — the panel saw a different diff`
      );
    case 'not-approved':
      return `record '${evidence.record.id}' binds this PR with decision '${evidence.record.decision}'`;
    case 'degraded-panel':
      return (
        `record '${evidence.record.id}' was approved with ${String(evidence.coverage.errored)} of ` +
        `${String(evidence.coverage.requested)} seat(s) errored (${evidence.coverage.erroredRoles.join(', ')}) ` +
        '— a governor ratification must run whole under absolute_quorum'
      );
    case 'ledger-invalid':
      return evidence.detail;
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

/**
 * Read the inputs from the workflow's environment and compute the verdict.
 *
 * `PR_NUMBER` absent or malformed is `unmeasured`, not `no-record`: a local
 * run has no PR, and "nothing was measured" must not print as "no panel
 * ratified this". A missing ledger FILE is the empty ledger (`no-record`,
 * count 0) — that is a measurement. `PR_HEAD_SHA` absent is the post-merge
 * shape (PR number only).
 */
export function ledgerEvidenceFromEnv(
  env: NodeJS.ProcessEnv,
  defaultLedgerPath: string
): LedgerEvidenceReport {
  const prText = (env['PR_NUMBER'] ?? '').trim();
  const pr = /^[1-9]\d*$/.test(prText) ? Number(prText) : undefined;
  if (pr === undefined) {
    return {
      kind: 'unmeasured',
      reason: `PR_NUMBER is ${prText === '' ? 'not set' : `'${prText}', not a positive integer`}; the committed ledger was not consulted`,
    };
  }
  const ledgerPath = (env[LEDGER_PATH_ENV] ?? '').trim() || defaultLedgerPath;
  const ledgerText = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf-8') : '';
  const head = headFromEnv(env);
  return evaluateLedgerEvidence({ ledgerText, pr, ...(head !== undefined ? { head } : {}) });
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
