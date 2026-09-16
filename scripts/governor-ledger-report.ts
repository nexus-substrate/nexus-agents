/**
 * The gate-facing half of the committed-ledger evidence (#5130 step 2, #5131).
 *
 * `governor-ledger-evidence.ts` is the pure verdict: ledger bytes, base
 * bytes, head and probe in, a typed `LedgerEvidence` out. This module is
 * everything around it that touches the process — reading the workflow's
 * environment into those inputs (`ledgerEvidenceFromEnv`, with the
 * `RATIFICATION_*` overrides), building the git probe over the checkout,
 * rendering the verdict as the one line the gate prints — `::notice::` for
 * the two ratifying kinds, `::error::` for every other kind and for
 * `unmeasured` — and folding it into the gate's exit answer
 * (`reportLedgerEvidence`, the only export `check-governor-ratification.ts`
 * consumes). Split out when the moved-head rule (#6256) pushed the evidence
 * module past the 400-line limit; both files are governor paths. The
 * wording rules it carries are the ones the evidence header states:
 *
 * - every non-ratified kind is an error that names the record id or the
 *   reason, and says what the refusal costs (#5131);
 * - a bound refusal lists EVERY failing check in report order, the
 *   misconfiguration kinds before `not-approved` (#6219);
 * - `ratified-rebased` says where the record binds, where the head moved
 *   to, whether that was a merge from main or a rebase, and why it still
 *   counts (#6256);
 * - `sha-mismatch` lists, per recorded sha, why the moved-head rule did not
 *   accept it — "object not found", "not an ancestor … not a head this PR
 *   had", "no non-ledger change", "conflict resolving <path>", the head's
 *   tree "differs … at <path>", or "not measured" — so a rebase that
 *   changed the content is distinguishable from a checkout that could not
 *   see the ratified commit;
 * - every line over bound records — the two ratifying kinds and every bound
 *   refusal — ends with the per-record signature code (#3927 item 4:
 *   `signed:agent by <principal>` / `signed:owner by <principal>` (#6257),
 *   `unsigned-record`, `unknown-signer`, `bad-signature`,
 *   `signature-not-measured`), rendered by
 *   `governor-ledger-signature.ts`; `ledgerEvidenceFromEnv` supplies the
 *   verifier over the `allowed_signers` beside the ledger. Informational
 *   this phase — the exit answer never reads it.
 *
 * @module scripts/governor-ledger-report
 * (Source: Issue #5131, #6219, #6256, #3927)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  BoundRecordFailure,
  HeadBinding,
  LedgerEvidence,
  LedgerEvidenceInputs,
} from './governor-ledger-evidence.js';
import {
  GOVERNOR_STRATEGIES,
  REQUIRED_ERROR_POLICY,
  SIGNATURE_CUTOVER_SEQUENCE,
  evaluateLedgerEvidence,
  isRatifiedKind,
} from './governor-ledger-evidence.js';
import { formatSignatures, signatureVerifierFromEnv } from './governor-ledger-signature.js';
import { gitMovedHeadProbe, isFullSha, type MovedHeadProbe } from './governor-patch-identity.js';

/** The checkout this gate runs from — where policy files (allowed_signers) are read. */
const POLICY_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** Overrides the committed ledger path; for tests that drive the real gate over a temp ledger. */
export const LEDGER_PATH_ENV = 'RATIFICATION_LEDGER_PATH';

/**
 * Path to the ledger AS OF THE MERGE-BASE, written by the workflow's evidence
 * step (`git show <base>:governance/vote-records.jsonl`, or an empty file when
 * the path did not exist at base). Absent ⇒ append-only is not checked, and
 * the verdict says so; present but unreadable ⇒ `unmeasured` (#6213).
 */
export const BASE_LEDGER_PATH_ENV = 'RATIFICATION_BASE_LEDGER_PATH';

/**
 * Legacy override name retained for callers; the explicit targetDir now
 * determines the checkout. Environment overrides cannot redirect git away
 * from the head being evaluated (#6369).
 */
export const REPO_DIR_ENV = 'RATIFICATION_REPO_DIR';

const TAG = '[governor-ledger]';
/** What a refusal costs, on every failing line: the flip (#5131) is stated where it bites. */
const FAIL_NOTE =
  'A governor-path PR fails without a ratifying record in the committed ledger (#5131).';

type RatifiedEvidence = Extract<LedgerEvidence, { kind: 'ratified' | 'ratified-rebased' }>;

/** The head clause of the notice: where the record binds, and for a moved head, why it still counts (#6256). */
function ratifiedHeadClause(evidence: RatifiedEvidence): string {
  const recordedHead = evidence.record.ratifiesPr?.headSha ?? '(unbound)';
  if (evidence.kind === 'ratified-rebased') {
    const how =
      evidence.relation === 'ancestor'
        ? 'a merge from main; the ratified commit is an ancestor of the head'
        : 'a rebase; the ratified commit is not in the head’s history but is a head this PR had (PR_PRIOR_HEADS)';
    return (
      `at ${evidence.ratifiedSha}; the head moved to ${evidence.headSha} (${how}) and still counts ` +
      `because the head's tree equals the ratified patch replayed onto the head's base ` +
      `(git merge-tree --write-tree, tree ${evidence.replayedTree}, ledger excluded) and the ` +
      'ledger at the ratified sha is a subsequence of the head ledger'
    );
  }
  return evidence.shaChecked
    ? `at ${recordedHead}`
    : `— sha NOT checked (the caller supplied no head; recorded head ${recordedHead})`;
}

function formatRatified(evidence: RatifiedEvidence): string {
  const b = evidence.record.ratifiesPr;
  const sha = ratifiedHeadClause(evidence);
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
  // #6264: a redacted record ratifies (its tally is hash-covered), and the
  // line says so, naming the roles and the redaction record(s), so a
  // spot-checker who goes looking for the reasoning knows it was removed on
  // record rather than lost.
  const redacted =
    evidence.redacted === undefined
      ? ''
      : ` REDACTED: reasoning of ${evidence.redacted.voterRoles.join(', ')} removed under ` +
        `redaction record(s) ${evidence.redacted.redactionIds.map((id) => `'${id}'`).join(', ')} ` +
        '(hash unchanged; the tally is verified).';
  return (
    `::notice::${TAG} ${evidence.kind}: record '${evidence.record.id}' ratifies PR #${String(b?.pr)} ` +
    `${sha}, decision ${evidence.record.decision}, strategy: ${evidence.record.strategy}, ` +
    `${panel}, ${policy}, ${appendOnly}, ${formatSignatures(evidence.signatures)} — enforced from sequence ` +
    `${String(SIGNATURE_CUTOVER_SEQUENCE)} (0–${String(SIGNATURE_CUTOVER_SEQUENCE - 1)} grandfathered).${redacted}`
  );
}

/** `no-record`: an empty ledger is named as such, distinct from "none of N". */
function noRecordBody(recordCount: number): string {
  return recordCount === 0
    ? 'the committed ledger is empty — no panel record ratifies this PR'
    : `none of the ${String(recordCount)} record(s) in the committed ledger ratifies this PR`;
}

/** The reason text for one failing per-record check — the `BOUND_RECORD_CHECKS` kinds. */
function boundRecordBody(evidence: BoundRecordFailure): string {
  const id = `record '${evidence.record.id}'`;
  switch (evidence.kind) {
    case 'not-approved':
      return `${id} binds this PR with decision '${evidence.record.decision}'`;
    case 'wrong-error-policy':
      return (
        `${id} was approved under errorPolicy '${evidence.errorPolicy}' ` +
        `— a governor ratification must run under '${REQUIRED_ERROR_POLICY}'`
      );
    case 'wrong-strategy':
      return (
        `${id} was approved at strategy '${evidence.strategy}', below the governor bar ` +
        `— a governor ratification must run at one of ` +
        `${[...GOVERNOR_STRATEGIES].map((s) => `'${s}'`).join(', ')} (supermajority, 0.667)`
      );
    case 'unmeasured-panel':
      return (
        `${id} binds this PR but ${evidence.reason} — the record cannot ` +
        'show the panel ran whole, and absence is not measured as whole'
      );
    case 'degraded-panel':
      return (
        `${id} was approved with ${String(evidence.coverage.errored)} of ` +
        `${String(evidence.coverage.requested)} seat(s) errored (${evidence.coverage.erroredRoles.join(', ')}) ` +
        '— a governor ratification must run whole under absolute_quorum'
      );
    case 'signature-required':
      // Phase 3 (#6279): the verdict's own code and ssh-keygen's reason, so an
      // unlisted key reads differently from a signature that does not hold.
      // By hash, so the text says so: a forged record stamped with a
      // grandfathered sequence is refused for not BEING one of them, and the
      // line must not claim it is past the cutover (#6384 panel 2).
      return (
        `${id} (sequence ${String(evidence.record.sequence)}) is not one of the ` +
        `${String(SIGNATURE_CUTOVER_SEQUENCE)} grandfathered records (matched by hash, not by the ` +
        `sequence it claims) and its signature verdict is '${evidence.verdict.code}'` +
        `${'reason' in evidence.verdict ? ` (${evidence.verdict.reason})` : ''} — every other governor ` +
        "ratification record must be 'signed' by a key the gate checkout's allowed_signers lists"
      );
  }
}

/**
 * `<kind>: <reason>` for every non-ratified kind; the caller adds the
 * annotation prefix and the fail note. A bound refusal renders EVERY failing
 * check in report order — the misconfiguration before the rejection (#6219
 * panel note) — joined with `; `, so the line leads with the kind that names
 * the cause even when the verdict's own `kind` is `not-approved`.
 */
function refusalBody(evidence: Exclude<LedgerEvidence, RatifiedEvidence>): string {
  switch (evidence.kind) {
    case 'no-record':
      return `${evidence.kind}: ${noRecordBody(evidence.recordCount)}`;
    case 'sha-mismatch':
      // #6256: per recorded sha, why the moved-head rule did not accept it —
      // "object not found", "not an ancestor … not a head this PR had",
      // "no non-ledger change", "conflict resolving <path>", the tree
      // "differs … at <path>", or "not measured" — so the operator can tell
      // a rebase that changed the content from a checkout that could not
      // see the ratified commit.
      return (
        `${evidence.kind}: record(s) ratify this PR at ${evidence.found.join(', ')}, not at the ` +
        `accepted head(s) ${evidence.accepted.join(', ')} — the panel saw different content; ` +
        `moved-head rule (#6256) not met: ${evidence.moved.map((m) => `${m.sha}: ${m.reason}`).join('; ')}`
      );
    case 'ledger-invalid':
      return `${evidence.kind}: ${evidence.detail}`;
    case 'ledger-rewritten': {
      const against =
        evidence.againstRatifiedSha === undefined
          ? 'the base ledger'
          : `the ledger at the ratified sha ${evidence.againstRatifiedSha} (#6256)`;
      return (
        `${evidence.kind}: the ledger at head is not ${against} plus appended lines: base line ` +
        `${String(evidence.divergesAt)} of ${String(evidence.baseLineCount)} is missing, changed or moved ` +
        `(head has ${String(evidence.headLineCount)} record line(s)) — the ledger is append-only; ` +
        'restore the base lines verbatim, in their order'
      );
    }
    case 'duplicate-id':
      return (
        `${evidence.kind}: ${evidence.ids.map((id) => `'${id}'`).join(', ')} name(s) more than one ` +
        "record with different content; the ledger is ambiguous until the line that is not the panel's is removed"
      );
    default:
      // Narrowed to the bound refusals: every `BOUND_RECORD_CHECKS` kind carries `failures`.
      return (
        evidence.failures.map((f) => `${f.kind}: ${boundRecordBody(f)}`).join('; ') +
        `; ${formatSignatures(evidence.signatures)}`
      );
  }
}

/**
 * Render the verdict as a GitHub annotation: `::notice::` for `ratified`,
 * `::error::` for everything else (#5131 — every other kind fails the gate).
 * Names the record id or the reason so the line stands on its own in the
 * job log.
 */
export function formatLedgerEvidence(evidence: LedgerEvidence): string {
  if (evidence.kind === 'ratified' || evidence.kind === 'ratified-rebased') {
    return formatRatified(evidence);
  }
  return `::error::${TAG} ${refusalBody(evidence)}. ${FAIL_NOTE}`;
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
 * EISDIR or EACCES here used to crash the gate with a stack trace; now it is
 * the `unmeasured` report, which the gate fails on by name (#5131) — the
 * exit code is the same 1, but the log says what could not be read.
 * `missingIsEmpty` is the head ledger's rule: a file that does not exist is
 * the empty ledger, a measurement (`no-record`, which also fails); the base
 * ledger is written by the workflow unconditionally, so its absence is an
 * error.
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
 * `PR_HEAD_SHA` absent is `unmeasured` too (#6249): without a head the
 * binding cannot be checked, and the backstop that once ran that way
 * accepted a record for sha1 on a PR whose final head was sha2. Both jobs
 * supply it — the pre-merge job the PR head, the backstop the merged PR's
 * pre-squash head. `RATIFICATION_BASE_LEDGER_PATH` names the ledger at the
 * merge-base; absent, append-only is not checked and the verdict says so.
 * `PR_BASE_SHA` (the merge-base both jobs already pass for the stamp
 * exemption) enables the moved-head probe over the checkout (#6256); absent
 * or malformed, a moved head is `sha-mismatch` with the reason "not measured".
 * `PR_PRIOR_HEADS` names the heads this PR had (#6301 item 4); absent, a
 * ratified sha that is not an ancestor of the head is `sha-mismatch` naming
 * the relation. `RATIFICATION_ALLOWED_SIGNERS_PATH` overrides the
 * `allowed_signers` the signature verifier reads (#3927 item 4; default:
 * beside the ledger); an unreadable file is `signature-not-measured` on the
 * line, not `unmeasured`.
 */
/** The report when the workflow supplied no head to bind a record to. */
const NO_HEAD_SUPPLIED: LedgerEvidenceReport = {
  kind: 'unmeasured',
  reason:
    'PR_HEAD_SHA is not set; a record cannot be bound to a head that was not supplied ' +
    "(the backstop must resolve the merged PR's pre-squash head, #6249)",
};

export function ledgerEvidenceFromEnv(
  env: NodeJS.ProcessEnv,
  defaultLedgerPath: string,
  targetDir: string,
  policyDir: string = POLICY_DIR
): LedgerEvidenceReport {
  const pr = prNumberFromEnv(env);
  if (typeof pr !== 'number') return pr;

  const ledgerPath = resolve(targetDir, (env[LEDGER_PATH_ENV] ?? '').trim() || defaultLedgerPath);
  const ledger = readLedgerFile(ledgerPath, 'committed ledger', true);
  if (!ledger.ok) return { kind: 'unmeasured', reason: ledger.reason };

  const base = baseLedgerFromEnv(env, targetDir);
  if (base !== undefined && !base.ok) return { kind: 'unmeasured', reason: base.reason };

  const head = headFromEnv(env);
  if (head === undefined) return NO_HEAD_SUPPLIED;
  return evaluateLedgerEvidence({
    ledgerText: ledger.text,
    pr,
    head,
    ...optionalInputs(env, head.sha, targetDir, base),
    // allowed_signers is policy: from this gate's own checkout, not the target.
    signatureVerifier: signatureVerifierFromEnv(env, ledgerPath, policyDir),
  });
}

/** The base-ledger text and the moved-head probe, each present only when the workflow supplied it. */
function optionalInputs(
  env: NodeJS.ProcessEnv,
  headSha: string,
  targetDir: string,
  base: { readonly ok: true; readonly text: string } | undefined
): Pick<LedgerEvidenceInputs, 'baseLedgerText' | 'movedHead'> {
  const probe = movedHeadProbeFromEnv(env, headSha, targetDir);
  return {
    ...(base !== undefined ? { baseLedgerText: base.text } : {}),
    ...(probe !== undefined ? { movedHead: probe } : {}),
  };
}

/**
 * The heads this PR had before the current one, as the workflow measured
 * them (#6301 item 4): `PR_PRIOR_HEADS`, whitespace-separated 40-hex shas —
 * the `synchronize` event's `github.event.before` and the head shas of this
 * workflow's own runs that GitHub attributes to this PR NUMBER in the PR's
 * head repository (never a branch name — the #6301 panel 1 contrarian's fork
 * hole: a fork PR named like a base-repo branch inherited that branch's heads).
 * Absent or empty ⇒ no prior head is known, and only an ancestor of the
 * head is related. A token that is not a 40-hex sha is dropped, not
 * passed to git.
 */
export const PRIOR_HEADS_ENV = 'PR_PRIOR_HEADS';

function priorHeadsFromEnv(env: NodeJS.ProcessEnv): string[] {
  return (env[PRIOR_HEADS_ENV] ?? '')
    .split(/\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => isFullSha(s));
}

/**
 * The moved-head probe (#6256) over the explicit target checkout,
 * with `PR_BASE_SHA` as the PR base and `PR_PRIOR_HEADS`
 * as the heads this PR had; `undefined` when the base is absent or not a
 * 40-hex sha, which the verdict names.
 */
function movedHeadProbeFromEnv(
  env: NodeJS.ProcessEnv,
  headSha: string,
  targetDir: string
): MovedHeadProbe | undefined {
  const baseSha = (env['PR_BASE_SHA'] ?? '').trim();
  if (!isFullSha(baseSha)) return undefined;
  return gitMovedHeadProbe({
    repoDir: targetDir,
    baseSha,
    headSha,
    priorHeadShas: priorHeadsFromEnv(env),
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
function baseLedgerFromEnv(env: NodeJS.ProcessEnv, targetDir: string): ReadResult | undefined {
  const basePath = (env[BASE_LEDGER_PATH_ENV] ?? '').trim();
  if (basePath === '') return undefined;
  return readLedgerFile(resolve(targetDir, basePath), 'base ledger', false);
}

/**
 * Print the report to stderr, next to the label/approval verdict, and say
 * whether the ledger RATIFIED the PR (#5131). The caller folds the answer
 * into its exit code: `true` only for `ratified` and `ratified-rebased`
 * (`isRatifiedKind`, #6256). `unmeasured` — an
 * unreadable ledger, no PR number — is `false` and a `::error::`: a gate
 * that cannot read its evidence has not found a ratification, and reporting
 * absence of measurement as a pass is the shape #5131 removes.
 */
export function reportLedgerEvidence(
  env: NodeJS.ProcessEnv,
  defaultLedgerPath: string,
  targetDir: string,
  policyDir: string = POLICY_DIR
): boolean {
  const report = ledgerEvidenceFromEnv(env, defaultLedgerPath, targetDir, policyDir);
  if (report.kind === 'unmeasured') {
    console.error(
      `::error::${TAG} unmeasured: ${report.reason} — the gate fails closed on evidence it cannot read. ${FAIL_NOTE}`
    );
    return false;
  }
  console.error(formatLedgerEvidence(report));
  return isRatifiedKind(report.kind);
}
