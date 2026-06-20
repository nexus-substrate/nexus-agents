#!/usr/bin/env npx tsx
/**
 * Governor-path pr_review audit gate (#3831, Epic B — governance of the governor).
 *
 * Stage 1: a WARN-FIRST CI gate asserting that a PR touching the GOVERNOR PATHS
 * (the governance-of-the-governor entries in /CODEOWNERS) carries a recorded,
 * SHA-BOUND, tamper-evident `pr_review` audit record before merge. The gate
 * QUERIES the committed ledger (`governance/pr-review-records.jsonl`); it NEVER
 * re-executes pr_review.
 *
 * SPLIT FAIL-MODE (the #3831 ratification's binding conditions):
 *   - CHAIN/SET INTEGRITY is fail-CLOSED (exit 1, condition 2). A broken record
 *     set — a `hash_mismatch` (an edited record) or a `sequence_gap` (a deleted
 *     record) — is TAMPER EVIDENCE; the gate refuses regardless of warn-first.
 *   - RECORD ABSENCE is WARN-FIRST (exit 0 + an actionable message, condition 2).
 *     A governor PR with no matching sha-bound record is WARNED, not blocked, in
 *     this stage. Flipping absence to fail-closed is a tracked FOLLOW-ON.
 *
 * SHA-BINDING (condition 1). A record satisfies the gate only when it matches
 * THIS PR's number AND head sha. A record produced against a STALE head sha does
 * NOT count — that is the negative case the test suite proves, and it is what
 * makes the gate not theater.
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
import { join } from 'node:path';

import { ROOT } from './script-paths.js';
import {
  readPrReviewRecords,
  verifyPrReviewRecordSet,
  type PrReviewRecord,
} from '../packages/nexus-agents/src/audit/index.js';

const CODEOWNERS_FILE = join(ROOT, 'CODEOWNERS');
const PR_REVIEW_RECORDS_FILE = join(ROOT, 'governance/pr-review-records.jsonl');
const GENESIS_FILE = join(ROOT, 'governance/governor-review-genesis.txt');

/**
 * The GOVERNANCE-OF-THE-GOVERNOR section of /CODEOWNERS. Only the path patterns
 * BELOW this marker comment are treated as governor paths; the rest of CODEOWNERS
 * (security, pipeline, mcp, …) carries its own review requirements but is out of
 * scope for THIS gate. The marker is the section heading committed in CODEOWNERS.
 */
const GOVERNOR_SECTION_MARKER = "Governor's own core";

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

/**
 * Extract the governor path PATTERNS from CODEOWNERS text — the patterns in the
 * governance-of-the-governor section only (everything from the
 * {@link GOVERNOR_SECTION_MARKER} heading to end of file). Each owner-rule line's
 * FIRST token is the path pattern; comment/blank lines are skipped. This is the
 * SINGLE SOURCE — the gate never hardcodes a divergent copy.
 */
export function governorPathsFromCodeowners(codeownersText: string): string[] {
  const lines = codeownersText.split('\n');
  const patterns: string[] = [];
  let inSection = false;
  for (const raw of lines) {
    if (raw.includes(GOVERNOR_SECTION_MARKER)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const pattern = line.split(/\s+/)[0];
    if (pattern !== undefined && pattern !== '') patterns.push(pattern);
  }
  return patterns;
}

/**
 * Match a repo-relative changed file against a single CODEOWNERS path pattern.
 * Supports the subset CODEOWNERS uses in this repo:
 *  - a leading `/` anchors the pattern at the repo root (all our patterns do);
 *  - a trailing `/` matches that directory and everything under it (recursive);
 *  - `*` matches any run of characters within a path segment;
 *  - an exact file path matches that file.
 * The file path is normalized to forward slashes with no leading `./`.
 */
export function matchesCodeownersPattern(file: string, pattern: string): boolean {
  const f = file.replace(/\\/g, '/').replace(/^\.\//, '');
  // Anchor: CODEOWNERS patterns here are all root-anchored ('/...'). Strip the
  // leading slash for comparison against the (root-relative) changed file.
  const pat = pattern.startsWith('/') ? pattern.slice(1) : pattern;

  // Directory pattern: 'foo/bar/' matches 'foo/bar/anything/under/here'.
  if (pat.endsWith('/')) {
    return f === pat.slice(0, -1) || f.startsWith(pat);
  }

  // Glob with '*': translate to a regex anchored over the whole path.
  if (pat.includes('*')) {
    const re = new RegExp(
      '^' +
        pat
          .split('*')
          .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*') +
        '$'
    );
    return re.test(f);
  }

  // Exact file match.
  return f === pat;
}

/** True when `file` is under any governor path pattern. */
export function isGovernorPath(file: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesCodeownersPattern(file, p));
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
  readonly headSha: string;
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
 *  4. A record matching THIS prNumber AND headSha exists → PASS (sha-binding,
 *     condition 1). A stale-sha record does NOT match.
 *  5. Otherwise → WARN (warn-first, condition 2): actionable, non-blocking.
 */
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

  // (2) Does the PR touch any governor path?
  const touched = governorFilesTouched(inputs.changedFiles, inputs.governorPatterns);
  if (touched.length === 0) {
    return { kind: 'pass', reason: 'no governor paths touched — nothing to assert' };
  }

  // (3) Genesis exemption (condition 5).
  if (inputs.genesisExemptPrs.has(inputs.prNumber)) {
    return {
      kind: 'pass',
      reason: `PR #${String(inputs.prNumber)} is genesis-exempt (governance/governor-review-genesis.txt) — one-time bootstrap`,
    };
  }

  // (4) Sha-bound record present? (condition 1 — number AND head sha must match.)
  const match = inputs.records.find(
    (r) => r.prNumber === inputs.prNumber && r.headSha === inputs.headSha
  );
  if (match !== undefined) {
    return {
      kind: 'pass',
      reason: `sha-bound pr_review record found for PR #${String(inputs.prNumber)} @ ${inputs.headSha} (verdict=${match.verdict})`,
    };
  }

  // (5) Absence → WARN-FIRST (condition 2): actionable, non-blocking this stage.
  const staleForPr = inputs.records.filter((r) => r.prNumber === inputs.prNumber);
  const staleNote =
    staleForPr.length > 0
      ? ` A record EXISTS for this PR but against a STALE head sha ` +
        `(${staleForPr.map((r) => r.headSha).join(', ')}) — re-run pr_review at the current head.`
      : '';
  return {
    kind: 'warn',
    message:
      `PR #${String(inputs.prNumber)} touches governor paths ` +
      `(${touched.join(', ')}) but has NO sha-bound pr_review record for head ${inputs.headSha}.` +
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

/** Resolve PR number + head sha from CLI args (`--pr`, `--sha`) or CI env. */
export function resolvePrContext(argv: readonly string[]): {
  prNumber: number | undefined;
  headSha: string | undefined;
} {
  const prRaw = readFlag(argv, '--pr') ?? process.env['PR_NUMBER'] ?? process.env['GITHUB_PR_NUMBER'];
  const shaRaw =
    readFlag(argv, '--sha') ?? process.env['PR_HEAD_SHA'] ?? process.env['GITHUB_HEAD_SHA'];
  return { prNumber: parsePrNumber(prRaw), headSha: parseSha(shaRaw) };
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
export function runGovernorReviewGate(argv: readonly string[]): number {
  const codeownersText = existsSync(CODEOWNERS_FILE)
    ? readFileSync(CODEOWNERS_FILE, 'utf-8')
    : '';
  const governorPatterns = governorPathsFromCodeowners(codeownersText);
  const { records } = readPrReviewRecords(PR_REVIEW_RECORDS_FILE);
  const { prNumber, headSha } = resolvePrContext(argv);
  const changedFiles = resolveChangedFiles(argv);

  // Even without a PR context we still run the integrity check (it never
  // depends on PR number/sha) so a tampered ledger fails CI on any run.
  if (prNumber === undefined || headSha === undefined) {
    const verification = verifyPrReviewRecordSet(records);
    if (!verification.ok) {
      console.error(
        `[governor-review] FAIL (integrity): governance/pr-review-records.jsonl is tampered ` +
          `(${verification.reason}): ${verification.detail}`
      );
      return 1;
    }
    console.error(
      '[governor-review] PASS: no PR context (PR_NUMBER/PR_HEAD_SHA) provided and the ' +
        'pr-review ledger verifies. Nothing to assert for a non-PR run.'
    );
    return 0;
  }

  const outcome = analyzeGovernorReview({
    prNumber,
    headSha,
    changedFiles,
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
