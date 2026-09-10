/**
 * Governor-path pr_review audit gate (#3831, Epic B — governance of the governor).
 *
 * Stage 1: a WARN-FIRST CI gate asserting that a PR touching the GOVERNOR PATHS
 * (the governance-of-the-governor entries in /CODEOWNERS) carries a recorded,
 * DIFF-BOUND, tamper-evident `pr_review` audit record before merge. The gate
 * QUERIES the committed ledger (`governance/pr-review-records.jsonl`); it NEVER
 * re-executes pr_review.
 *
 * SPLIT FAIL-MODE (the #3831 ratification's binding conditions):
 *   - CHAIN/SET INTEGRITY is fail-CLOSED (exit 1, condition 2). A broken record
 *     set — a `hash_mismatch` (an edited record) or a `sequence_gap` (a deleted
 *     record) — is TAMPER EVIDENCE; the gate refuses regardless of warn-first.
 *   - RECORD ABSENCE is WARN-FIRST (exit 0 + an actionable message, condition 2).
 *     A governor PR with no matching diff-bound record is WARNED, not blocked, in
 *     this stage. Flipping absence to fail-closed is a tracked FOLLOW-ON.
 *
 * DIFF-BINDING (Option-C, #3831). A record satisfies the gate only when it matches
 * THIS PR's number AND `reviewedDiffHash` — the gate recomputes the canonical diff
 * hash from `base..head` (see `audit/reviewed-diff-hash.ts`) and a record produced
 * against a DIFFERENT diff does NOT count. That is the negative case the test suite
 * proves, and it is what makes the gate not theater (a head pointer is mutable; the
 * reviewed bytes are what the voters actually saw).
 *
 * GENESIS EXEMPTION (condition 5). The introducing PR and pre-convention PRs
 * cannot carry a record (the producer does not exist yet), so an explicit,
 * documented allowlist ({@link GENESIS_EXEMPT_PRS} + the committed
 * `governance/governor-review-genesis.txt`) exempts them from the warn. This is a
 * ONE-TIME bootstrap, not a permanent escape hatch.
 *
 * SINGLE-SOURCE PATH FILTER. The governor path set is DERIVED from /CODEOWNERS
 * (the governance-of-the-governor section) — there is no second hardcoded copy to
 * drift. See {@link governorPathsFromCodeowners}.
 *
 * @module scripts/check-governor-review
 * (Source: Issue #3831, Epic B / #3829)
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { governorPathsFromCodeowners, isGovernorPath } from './governor-section.js';

import { ROOT } from './script-paths.js';
import {
  readPrReviewRecords,
  ledgerIntegrityFailure,
  verifyPrReviewRecordSet,
  type PrReviewRecordVerification,
  type PrReviewRecord,
} from '../packages/nexus-agents/src/audit/index.js';
import {
  canonicalGitDiffArgs,
  computeReviewedDiffHash,
  reviewedDiffWasTruncated,
  MAX_REVIEWED_DIFF_BYTES,
} from '../packages/nexus-agents/src/audit/reviewed-diff-hash.js';

const CODEOWNERS_FILE = join(ROOT, 'CODEOWNERS');
const PR_REVIEW_RECORDS_FILE = join(ROOT, 'governance/pr-review-records.jsonl');
const GENESIS_FILE = join(ROOT, 'governance/governor-review-genesis.txt');

/**
 * Genesis allowlist (condition 5): PR numbers that pre-date the pr_review record
 * convention and so legitimately carry no record. Seeded with the introducing PR
 * via the committed {@link GENESIS_FILE}; the embedded fallback is empty. ONE-TIME
 * bootstrap, not a permanent escape hatch — entries should not be added after the
 * producer lands.
 */
export const GENESIS_EXEMPT_PRS: ReadonlySet<number> = readGenesisExemptions(GENESIS_FILE);

/** Parse the genesis allowlist file: one PR number per line, `#` comments allowed. */
export function parseGenesisExemptions(text: string): Set<number> {
  const out = new Set<number>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const n = Number(line);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return out;
}

/** Read the committed genesis allowlist file (empty set when absent). */
function readGenesisExemptions(filePath: string): Set<number> {
  if (!existsSync(filePath)) return new Set();
  return parseGenesisExemptions(readFileSync(filePath, 'utf-8'));
}

/** The subset of changed files that touch a governor path. */
export function governorFilesTouched(
  changedFiles: readonly string[],
  patterns: readonly string[]
): string[] {
  return changedFiles.filter((f) => isGovernorPath(f, patterns));
}

/** The outcome the pure gate analysis resolves to. */
export type GovernorReviewOutcome =
  | { kind: 'pass'; reason: string }
  | { kind: 'warn'; message: string }
  | { kind: 'fail'; message: string };

/** Inputs for the pure gate analysis (no disk/process I/O). */
export interface GovernorReviewInputs {
  readonly prNumber: number;
  /**
   * sha256 of the PR's CANONICAL reviewed diff (Option-C, #3831), recomputed by
   * the impure caller from `git <canonicalGitDiffArgs(baseSha, headSha)>` via
   * {@link computeReviewedDiffHash}. A record matches only if its `reviewedDiffHash`
   * equals this — i.e. it reviewed the byte-identical diff. Replaces the rejected
   * headSha binding.
   */
  readonly reviewedDiffHash: string;
  /**
   * The PR's ACTUAL base commit sha (the trusted `base..head` range the CI gate
   * recomputed {@link reviewedDiffHash} from). A matching record's caller-asserted
   * `baseSha` is verified against THIS (#4058): a record that reviewed the right
   * diff bytes but claims a different base has inaccurate provenance.
   */
  readonly baseSha: string;
  /**
   * Whether the canonical diff the hash was computed over exceeded
   * {@link MAX_REVIEWED_DIFF_BYTES} and was truncated.
   *
   * The truncation is part of the canonical form, so content past the cap is
   * UNBOUND on both the producer and the gate side: two diffs identical in
   * their first 50 KB hash the same however they differ after it. `git diff`
   * orders by path, so a new file sorting last lands entirely past the cap. The
   * gate had this string in hand, computed the hash, and dropped it —
   * `reviewedDiffWasTruncated` exists in the same module and had exactly one
   * caller, which logs at review time where no consumer of the ledger can read
   * it (#5818).
   */
  readonly reviewedDiffTruncated: boolean;
  readonly changedFiles: readonly string[];
  readonly governorPatterns: readonly string[];
  readonly records: readonly PrReviewRecord[];
  readonly genesisExemptPrs: ReadonlySet<number>;
}

/**
 * The pure gate decision (no I/O) so it is unit-testable with injected inputs.
 * Order of checks is load-bearing:
 *  1. Chain/set integrity → FAIL-CLOSED (tamper evidence, condition 2). Checked
 *     FIRST and unconditionally: a tampered ledger is refused even on a
 *     non-governor PR, because the artifact's integrity is itself governance.
 *  2. No governor path touched → PASS (nothing to assert).
 *  3. Genesis-exempt PR → PASS (condition 5; pre-convention PRs carry no record).
 *  4. A record matching THIS prNumber AND reviewedDiffHash exists → PASS (diff-binding,
 *     condition 1). A stale-sha record does NOT match.
 *  5. Otherwise → WARN (warn-first, condition 2): actionable, non-blocking.
 */
/**
 * Outcome for a record that matched on prNumber + reviewedDiffHash (#4058).
 *
 * PROVENANCE HYGIENE, not a new integrity gain: the matched `reviewedDiffHash` is
 * already recomputed by CI from `git diff <trusted PR base>..<head>`, so a matching
 * record provably reviewed byte-identical CONTENT to the real PR range — the
 * record's stored `baseSha` is a label, and a wrong label CANNOT make a record
 * falsely satisfy the gate (satisfaction is bound to the trusted-base hash, not the
 * record's base). What this catches is a producer MISCONFIGURATION — a record that
 * reviewed the right bytes but recorded a base inconsistent with the PR's actual
 * base. Surfaced warn-first; a future enforce flip (#3831) can decide whether to
 * harden it to a fail.
 *
 * Fail-OPEN on a non-comparable CI base (abbreviated / non-40-hex): the canonical
 * CI path passes a full lowercase 40-hex `pull_request.base.sha`, but we only flag
 * a mismatch when the base is directly comparable to the record's pinned
 * `^[0-9a-f]{40}$` format — otherwise we PASS rather than risk a spurious warn.
 */
/**
 * Zero parsed patterns means the CODEOWNERS governor section could not be read —
 * a missing or renamed START marker, or an empty section (#5576). Without this,
 * "no governor paths touched" is a default dressed as a measurement, and a
 * one-line edit to a governor-owned file disarms this gate for every later PR.
 */
function unreadableCodeownersSection(
  patterns: readonly string[]
): GovernorReviewOutcome | undefined {
  if (patterns.length > 0) return undefined;
  return {
    kind: 'fail',
    message:
      'no governor path patterns could be parsed from CODEOWNERS — the ' +
      'governance-of-the-governor section is missing, renamed or empty, so this gate ' +
      'cannot assert anything. Restore the section markers in CODEOWNERS (#5576).',
  };
}

/**
 * Verdict of a set of diff-bound records, aggregated (#4058 follow-up).
 *
 * `request_changes` wins over `approve`. The gate used to take
 * `records.find(...)` — the FIRST match in an append-only ledger — so the
 * EARLIEST review for a diff decided the outcome and every later one was
 * ignored: an early approve shadowed a subsequent refusal on the identical
 * diff. Aggregating removes ledger position from the decision.
 *
 * A refusal does not block forever: the record is bound to
 * `reviewedDiffHash`, so pushing a fix changes the hash, the old record stops
 * matching, and the gate falls back to warn-on-absence until a new review
 * lands.
 */
function aggregateVerdict(
  matches: readonly PrReviewRecord[]
): 'approve' | 'request_changes' | 'abstain' {
  if (matches.some((r) => r.verdict === 'request_changes')) return 'request_changes';
  if (matches.some((r) => r.verdict === 'approve')) return 'approve';
  return 'abstain';
}

/**
 * WARN when the record's recorded base disagrees with the PR's actual base,
 * even though the reviewed-diff hash matched. Extracted so
 * `matchedRecordOutcome` stays inside the line cap.
 */
function baseShaMismatchOutcome(
  match: PrReviewRecord,
  inputs: GovernorReviewInputs,
  ciBase: string,
  comparable: boolean
): GovernorReviewOutcome | undefined {
  if (!comparable || match.baseSha.toLowerCase() === ciBase) return undefined;
  return {
    kind: 'warn',
    message:
      `PR #${String(inputs.prNumber)} has a diff-bound pr_review record whose baseSha ` +
      `(${match.baseSha.slice(0, 12)}…) does NOT match the PR's actual base ` +
      `(${ciBase.slice(0, 12)}…). The reviewed diff content matches (hash verified), but the ` +
      `record's recorded base is inconsistent with the PR — likely a producer ` +
      `misconfiguration. Re-run pr_review with the PR's base and commit the record. ` +
      `(Warn-first: not blocking this stage; provenance hygiene for a future enforce flip, #4058.)`,
  };
}

function matchedRecordOutcome(
  matches: readonly PrReviewRecord[],
  match: PrReviewRecord,
  inputs: GovernorReviewInputs,
  verification: PrReviewRecordVerification
): GovernorReviewOutcome {
  // A review that HAPPENED is not a review that APPROVED. This returned pass
  // on record existence alone, and interpolated the verdict into the pass
  // reason — so it could emit "pass ... verdict=request_changes" (#4058).
  const verdict = aggregateVerdict(matches);
  if (verdict === 'request_changes') {
    return {
      kind: 'fail',
      message:
        `PR #${String(inputs.prNumber)} touches governor paths and its diff-bound ` +
        `pr_review verdict is request_changes — the review ran and REFUSED. ` +
        `This is fail-closed regardless of warn-first: warn-first covers a review ` +
        `that has not happened yet, not one that happened and said no. ` +
        `Address the review and re-run pr_review at the current head.`,
    };
  }
  if (verdict === 'abstain') {
    return {
      kind: 'warn',
      message:
        `PR #${String(inputs.prNumber)} touches governor paths and its diff-bound ` +
        `pr_review verdict is abstain — nothing was affirmed and nothing refused. ` +
        `An abstention is not an approval; it is treated as absence, which is ` +
        `warn-first pending the enforce flip (#4058). Re-run pr_review for a verdict.`,
    };
  }
  const ciBase = inputs.baseSha.toLowerCase();
  const comparable = /^[0-9a-f]{40}$/.test(ciBase);
  const baseMismatch = baseShaMismatchOutcome(match, inputs, ciBase, comparable);
  if (baseMismatch !== undefined) return baseMismatch;
  return {
    kind: 'pass',
    reason:
      `diff-bound pr_review record found for PR #${String(inputs.prNumber)} ` +
      `(reviewedDiffHash=${inputs.reviewedDiffHash.slice(0, 12)}…${comparable ? ', baseSha consistent' : ''}, ` +
      `verdict=${match.verdict})${truncationCaveat(inputs.reviewedDiffTruncated)}` +
      sanitizationCaveat(match) +
      ledgerCoverage(verification),
  };
}

/**
 * Names the portion of the diff the hash actually bound.
 *
 * A pass over a truncated diff is a PARTIAL verification honestly labelled; the
 * same pass unlabelled is a partial verification recorded as complete, which is
 * the failure CLAUDE.md names on the governor path.
 */
function truncationCaveat(truncated: boolean): string {
  if (!truncated) return '';
  return (
    ` — PARTIAL: the canonical diff exceeded ${String(MAX_REVIEWED_DIFF_BYTES)} bytes, so the ` +
    'hash binds only the first that many bytes; content past the cap is unattested'
  );
}

/**
 * Names the gap between the bytes this gate just bound and the text the voters
 * actually read (#5385).
 *
 * The hash match above proves the record is bound to THIS PR's canonical diff.
 * It does not prove the panel read that diff: the MCP middleware strips HTML
 * comments and XML-like tags from tool input before the handler sees it, and
 * this repo's own governance PRs carry `<!-- GENERATED:… -->` markers. A pass
 * that does not say so is a partial verification recorded as complete — the
 * failure CLAUDE.md names on the governor path, and the same shape
 * {@link truncationCaveat} exists to prevent.
 *
 * Four distinguishable states, deliberately: no disclosure at all (the producer
 * had no sanitizer in its path); a matching hash with BOTH counters zero (a
 * sanitizer ran and was a genuine no-op); a matching hash with either counter
 * non-zero (it removed something, but nothing inside the bytes this hash binds
 * — a sibling field, or a span past the truncation cap); and a DIFFERING hash
 * (the voters read a stripped rendering of the bound bytes).
 *
 * The two counters are BOTH consulted because they measure different removals:
 * `commentsRemoved` is HTML comments (#5258), while an XML-like injection tag
 * goes through `fieldsModified`. Reading only the first made a tag strip
 * indistinguishable from a no-op (#5385, found by adversarial review).
 */
function sanitizationCaveat(match: PrReviewRecord): string {
  const disclosure = match.sanitization;
  if (disclosure === undefined) return '';

  // The TAG clause is unconditional on comments. The first version rendered a
  // single string that reported comments whenever `commentsRemoved > 0`, so a
  // record carrying BOTH read "sanitizer removed 1 comment(s)" and never
  // mentioned the tag. Six ratification seats executed that (#5385): an attacker
  // masks a stripped injection tag behind any HTML comment, and GitHub's default
  // PR template supplies one, so the masked case was the DEFAULT shape.
  const clauses: string[] = [];
  if (disclosure.tagsRemoved > 0) {
    clauses.push(
      `${String(disclosure.tagsRemoved)} conversation-structure tag(s) — POSSIBLE PROMPT INJECTION`
    );
  }
  if (disclosure.commentsRemoved > 0) {
    clauses.push(`${String(disclosure.commentsRemoved)} HTML comment(s)`);
  }
  if (clauses.length === 0 && disclosure.fieldsModified > 0) {
    clauses.push(`${String(disclosure.fieldsModified)} field(s), cause unattributed`);
  }

  if (disclosure.sanitizedDiffHash === match.reviewedDiffHash) {
    // Equal hashes mean the BOUND BYTES are untouched — not that the sanitizer
    // was a no-op. The counters span the whole args object while the hash covers
    // only the truncated `prDiff`, so a strip from a sibling field, or one past
    // MAX_REVIEWED_DIFF_BYTES, leaves the hashes equal with non-zero counters.
    // Only ALL counters zero licenses "removed nothing".
    if (clauses.length === 0) return ' — sanitizer ran and removed nothing';
    return ` — sanitizer removed ${clauses.join(' and ')}, none inside the bytes this hash binds`;
  }
  return (
    ' — PARTIAL: the voters read a SANITIZED rendering of these bytes ' +
    `(sanitizedDiffHash=${disclosure.sanitizedDiffHash.slice(0, 12)}…, ` +
    `${clauses.join(' and ')} stripped before dispatch); ` +
    'the hash binds the raw diff, so content the sanitizer removed was bound but unread'
  );
}

/**
 * What the ledger's integrity check actually covered (#5818).
 *
 * `verifyPrReviewRecordSet` returns `ok: true` for an EMPTY set — correctly, an
 * empty ledger is absence, not tamper evidence — so a bare pass line could not
 * distinguish "verified 40 records, all hashes held" from "verified nothing".
 * `governance/pr-review-records.jsonl` is 0 bytes today with no CI producer, so
 * the second case is the ONLY one that occurs.
 */
function ledgerCoverage(verification: PrReviewRecordVerification): string {
  if (!verification.ok) return '';
  if (verification.notVerified === 'empty') {
    return ' Ledger integrity: VERIFIED NOTHING — governance/pr-review-records.jsonl is empty, so the integrity check had no records to check.';
  }
  return ` Ledger integrity: verified ${String(verification.recordCount)} record(s).`;
}

export function analyzeGovernorReview(inputs: GovernorReviewInputs): GovernorReviewOutcome {
  // (1) Integrity FIRST — fail-closed on tamper evidence (condition 2).
  const verification = verifyPrReviewRecordSet(inputs.records);
  if (!verification.ok) {
    return {
      kind: 'fail',
      message:
        `governance/pr-review-records.jsonl FAILS tamper-evident verification ` +
        `(${verification.reason}) at record index ${String(verification.recordIndex)} ` +
        `(prNumber=${String(verification.prNumber)}): ${verification.detail}. ` +
        `A broken record set is TAMPER EVIDENCE — the ledger has been edited, ` +
        `reordered into a gap, or forged. This is fail-closed regardless of warn-first.`,
    };
  }

  // (2) Did we parse ANY governor pattern? (#5576)
  const unreadable = unreadableCodeownersSection(inputs.governorPatterns);
  if (unreadable !== undefined) return unreadable;

  // (3) Does the PR touch any governor path?
  const touched = governorFilesTouched(inputs.changedFiles, inputs.governorPatterns);
  if (touched.length === 0) {
    return { kind: 'pass', reason: 'no governor paths touched — nothing to assert' };
  }

  // (4) Genesis exemption (condition 5).
  if (inputs.genesisExemptPrs.has(inputs.prNumber)) {
    return {
      kind: 'pass',
      reason: `PR #${String(inputs.prNumber)} is genesis-exempt (governance/governor-review-genesis.txt) — one-time bootstrap`,
    };
  }

  // (4) Diff-bound record present? (Option-C — number AND reviewedDiffHash match.)
  const matches = inputs.records.filter(
    (r) => r.prNumber === inputs.prNumber && r.reviewedDiffHash === inputs.reviewedDiffHash
  );
  const match = matches[0];
  if (match !== undefined) {
    return matchedRecordOutcome(matches, match, inputs, verification);
  }

  // (5) Absence → WARN-FIRST (condition 2): actionable, non-blocking this stage.
  const staleForPr = inputs.records.filter((r) => r.prNumber === inputs.prNumber);
  const staleNote =
    staleForPr.length > 0
      ? ` A record EXISTS for this PR but against a DIFFERENT reviewed diff ` +
        `(${staleForPr.map((r) => `${r.reviewedDiffHash.slice(0, 12)}…`).join(', ')}) — the diff changed since review; re-run pr_review at the current head.`
      : '';
  return {
    kind: 'warn',
    message:
      `PR #${String(inputs.prNumber)} touches governor paths ` +
      `(${touched.join(', ')}) but has NO diff-bound pr_review record for its current diff.` +
      ledgerCoverage(verification) +
      staleNote +
      ` Run pr_review on this PR and commit the resulting record into ` +
      `governance/pr-review-records.jsonl. (Warn-first: not blocking merge in this stage, #3831.)`,
  };
}

/** Parse a raw PR-number string to a positive integer, or undefined. */
function parsePrNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Trim a raw sha string, or undefined when empty/absent. */
function parseSha(raw: string | undefined): string | undefined {
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : undefined;
}

/** Resolve PR number + base/head sha from CLI args (`--pr`, `--base`, `--sha`) or CI env. */
export function resolvePrContext(argv: readonly string[]): {
  prNumber: number | undefined;
  baseSha: string | undefined;
  headSha: string | undefined;
} {
  const prRaw =
    readFlag(argv, '--pr') ?? process.env['PR_NUMBER'] ?? process.env['GITHUB_PR_NUMBER'];
  const baseRaw =
    readFlag(argv, '--base') ?? process.env['PR_BASE_SHA'] ?? process.env['GITHUB_BASE_SHA'];
  const shaRaw =
    readFlag(argv, '--sha') ?? process.env['PR_HEAD_SHA'] ?? process.env['GITHUB_HEAD_SHA'];
  return { prNumber: parsePrNumber(prRaw), baseSha: parseSha(baseRaw), headSha: parseSha(shaRaw) };
}

/**
 * Recompute the canonical {@link computeReviewedDiffHash} of the PR's diff from
 * raw SHAs (Option-C, #3831) — the gate side of the diff-binding. Runs the pinned
 * {@link canonicalGitDiffArgs} so the bytes match what the producer hashed.
 * Returns undefined when git cannot produce the diff (e.g. the base/head commits
 * are not present in a shallow CI checkout) — the caller treats that as
 * "cannot verify" → WARN, never a false PASS.
 */
/**
 * Recompute the canonical diff hash AND report whether the bytes it binds are
 * the whole diff.
 *
 * The truncation is part of the canonical form, so this function had the string
 * in hand, computed the hash, and dropped it — leaving the gate unable to say
 * which portion it verified (#5818).
 */
function recomputeReviewedDiff(
  baseSha: string,
  headSha: string
): { hash: string; truncated: boolean } | undefined {
  try {
    const diff = execFileSync('git', canonicalGitDiffArgs(baseSha, headSha), {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { hash: computeReviewedDiffHash(diff), truncated: reviewedDiffWasTruncated(diff) };
  } catch {
    return undefined;
  }
}

/** Read a `--flag value` pair from argv. */
function readFlag(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return undefined;
}

/** Resolve the changed-file list from `--changed-files` (newline/comma) or env. */
export function resolveChangedFiles(argv: readonly string[]): string[] {
  const arg = readFlag(argv, '--changed-files');
  const raw = arg ?? process.env['CHANGED_FILES'] ?? '';
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * The CI gate entry point. Reads CODEOWNERS, the pr-review ledger, and the
 * genesis allowlist from disk; resolves the PR context from args/env; runs the
 * pure analysis; prints a structured result. Exit code: 0 for pass/WARN
 * (warn-first), 1 for a fail-closed integrity break.
 */
/**
 * Run the fail-closed integrity check. Returns 1 (after logging) when the ledger
 * is tampered, else null — so callers fail-close on tamper even when no PR context
 * or no recomputable diff is available.
 */
function tamperExitCode(records: readonly PrReviewRecord[]): number | null {
  const verification = verifyPrReviewRecordSet(records);
  if (!verification.ok) {
    console.error(
      `[governor-review] FAIL (integrity): governance/pr-review-records.jsonl is tampered ` +
        `(${verification.reason}): ${verification.detail}`
    );
    return 1;
  }
  return null;
}

/**
 * Resolve the PR context + recompute the canonical reviewed-diff hash, handling
 * the two early-exit cases (no PR context; git cannot produce the diff) — both of
 * which still fail-close on a tampered ledger. Returns the resolved gate inputs,
 * or `{ exit }` when the gate should terminate early.
 */
function resolveGateContext(
  argv: readonly string[],
  records: readonly PrReviewRecord[]
):
  | {
      prNumber: number;
      reviewedDiffHash: string;
      reviewedDiffTruncated: boolean;
      baseSha: string;
      changedFiles: string[];
    }
  | { exit: number } {
  const { prNumber, baseSha, headSha } = resolvePrContext(argv);
  const changedFiles = resolveChangedFiles(argv);

  if (prNumber === undefined || baseSha === undefined || headSha === undefined) {
    const code = tamperExitCode(records);
    if (code !== null) return { exit: code };
    console.error(
      '[governor-review] PASS: no PR context (PR_NUMBER/PR_BASE_SHA/PR_HEAD_SHA) provided and the ' +
        'pr-review ledger verifies. Nothing to assert for a non-PR run.'
    );
    return { exit: 0 };
  }

  // Option-C (#3831): recompute the canonical reviewed-diff hash from base..head.
  const reviewedDiff = recomputeReviewedDiff(baseSha, headSha);
  if (reviewedDiff === undefined) {
    const code = tamperExitCode(records); // fail-closed even when git can't diff
    if (code !== null) return { exit: code };
    const msg =
      `could not recompute the canonical reviewed diff for ${baseSha.slice(0, 12)}..${headSha.slice(0, 12)} ` +
      `(are both commits fetched? a shallow CI checkout may lack the base). Cannot verify a diff-bound ` +
      `pr_review record. (Warn-first, #3831.)`;
    console.error(`::warning title=Governor review unverifiable::${msg}`);
    console.error(`[governor-review] WARN: ${msg}`);
    return { exit: 0 };
  }

  return {
    prNumber,
    reviewedDiffHash: reviewedDiff.hash,
    reviewedDiffTruncated: reviewedDiff.truncated,
    baseSha,
    changedFiles,
  };
}

export function runGovernorReviewGate(
  argv: readonly string[],
  // A parameter, not an env var: the ledger path must not be steerable by the
  // environment of a gate whose whole job is tamper-evidence. Tests supply a
  // fixture; production takes the default and never passes this.
  ledgerFile: string = PR_REVIEW_RECORDS_FILE
): number {
  const codeownersText = existsSync(CODEOWNERS_FILE) ? readFileSync(CODEOWNERS_FILE, 'utf-8') : '';
  const governorPatterns = governorPathsFromCodeowners(codeownersText);
  const { records, invalidLines } = readPrReviewRecords(ledgerFile);

  // A dropped line is evidence that vanished, not evidence that passed. The
  // sibling ledger gate already fails closed on this signal
  // (`vote-record-ratification.ts`): a malformed ledger is a repair job.
  const ledgerFailure = ledgerIntegrityFailure(invalidLines, ledgerFile);
  if (ledgerFailure !== null) {
    console.error(`[governor-review] FAIL (integrity, fail-closed): ${ledgerFailure}`);
    return 1;
  }

  const ctx = resolveGateContext(argv, records);
  if ('exit' in ctx) return ctx.exit;

  const outcome = analyzeGovernorReview({
    prNumber: ctx.prNumber,
    reviewedDiffHash: ctx.reviewedDiffHash,
    reviewedDiffTruncated: ctx.reviewedDiffTruncated,
    baseSha: ctx.baseSha,
    changedFiles: ctx.changedFiles,
    governorPatterns,
    records,
    genesisExemptPrs: GENESIS_EXEMPT_PRS,
  });

  switch (outcome.kind) {
    case 'fail':
      console.error(`[governor-review] FAIL (integrity, fail-closed): ${outcome.message}`);
      return 1;
    case 'warn':
      // Warn-first: surface as a GitHub Actions annotation but exit 0. The
      // annotation directive is recognized on stderr too.
      console.error(`::warning title=Governor review missing::${outcome.message}`);
      console.error(`[governor-review] WARN: ${outcome.message}`);
      return 0;
    case 'pass':
      console.error(`[governor-review] PASS: ${outcome.reason}`);
      return 0;
  }
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(runGovernorReviewGate(process.argv.slice(2)));
}
