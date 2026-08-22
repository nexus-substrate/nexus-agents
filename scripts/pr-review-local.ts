#!/usr/bin/env npx tsx
/**
 * Local pr_review runner — uses your local Claude CLI subscription auth
 * instead of API keys (which would violate Anthropic's subscription ToS
 * when used in automated CI).
 *
 * Usage:
 *   npx tsx scripts/pr-review-local.ts <pr-number>           # one-shot
 *   npx tsx scripts/pr-review-local.ts --watch               # poll loop
 *   npx tsx scripts/pr-review-local.ts --watch --interval 600 # custom poll
 *   npx tsx scripts/pr-review-local.ts <pr-number> --no-post # dry run
 *
 * What it does (one-shot): fetch the PR's canonical `base..head` diff (ledger-
 * excluded, #4229), run the same live 5-voter pr_review panel, post a single review
 * comment (`gh pr comment`), add the `pr-reviewed` label, and feed the governance
 * ledger with a diff-bound record the governor gate can MATCH (see
 * `pr-review-local-ledger.ts`). Watch mode polls open, unlabelled, non-draft PRs on
 * an interval and reviews each.
 *
 * Safety: `pr-reviewed` avoids double review; `skip-pr-review` opts out; drafts
 * skipped unless `--include-drafts`; comment carries a [bot] suffix. Cost: ~5 voter
 * LLM calls (~2 min) per PR.
 *
 * @module scripts/pr-review-local
 */

/* eslint-disable no-console -- this is a CLI script that prints progress */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectRealVotes } from '../packages/nexus-agents/src/cli/voter-agents.js';
import {
  PR_REVIEW_ROLES,
  buildPrReviewProposal,
  mapVoteDecisionToPrDecision,
  aggregatePrDecisions,
  MAX_DIFF_LENGTH,
  type PrReviewAggregate,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-tool.js';
import {
  isFindingVerified,
  type Finding,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-findings.js';
import type { VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import {
  ensurePrCommitsLocal,
  generateCanonicalReviewDiff,
  feedLedgerRecord,
  fetchPrMeta,
  fetchGhDiff,
  type PrMeta,
} from './pr-review-local-ledger.js';

const execFileP = promisify(execFile);

const REVIEWED_LABEL = 'pr-reviewed';
const SKIP_LABEL = 'skip-pr-review';

// ============================================================================
// CLI args
// ============================================================================

interface Args {
  readonly mode: 'one-shot' | 'watch';
  readonly prNumber: number | undefined;
  readonly intervalSec: number;
  readonly post: boolean;
  readonly includeDrafts: boolean;
}

function parseInterval(raw: string | undefined, current: number): number {
  if (raw === undefined) return current;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 60 ? v : current;
}

function parseArgs(argv: readonly string[]): Args {
  const flags = new Set<string>();
  let prNumber: number | undefined;
  let intervalSec = 300;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--watch' || a === '--no-post' || a === '--include-drafts') {
      flags.add(a);
    } else if (a === '--interval') {
      intervalSec = parseInterval(argv[i + 1], intervalSec);
      i++;
    } else if (/^\d+$/.test(a)) {
      prNumber = Number(a);
    }
  }

  return {
    mode: flags.has('--watch') ? 'watch' : 'one-shot',
    prNumber,
    intervalSec,
    post: !flags.has('--no-post'),
    includeDrafts: flags.has('--include-drafts'),
  };
}

// ============================================================================
// gh CLI wrappers
// ============================================================================

interface OpenPr {
  readonly number: number;
  readonly title: string;
  readonly isDraft: boolean;
  readonly labels: readonly string[];
}

async function listOpenPrs(): Promise<readonly OpenPr[]> {
  const { stdout } = await execFileP('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,isDraft,labels',
    '--limit',
    '100',
  ]);
  const parsed = JSON.parse(stdout) as Array<{
    number: number;
    title: string;
    isDraft: boolean;
    labels: Array<{ name: string }>;
  }>;
  return parsed.map((p) => ({
    number: p.number,
    title: p.title,
    isDraft: p.isDraft,
    labels: p.labels.map((l) => l.name),
  }));
}

async function postPrComment(prNumber: number, body: string): Promise<void> {
  // Use stdin to avoid shell-escape headaches on the markdown body.
  const child = execFile('gh', ['pr', 'comment', String(prNumber), '--body-file', '-']);
  child.stdin?.write(body);
  child.stdin?.end();
  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gh pr comment exited ${String(code ?? -1)}`));
    });
    child.on('error', reject);
  });
}

async function applyLabel(prNumber: number, label: string): Promise<void> {
  try {
    await execFileP('gh', ['pr', 'edit', String(prNumber), '--add-label', label]);
  } catch (e) {
    // Don't fail the run if labeling fails (label may not exist yet).
    console.warn(`  label '${label}' not applied: ${(e as Error).message.slice(0, 100)}`);
  }
}

// ============================================================================
// Voter run
// ============================================================================

/**
 * Local mirror of `PrReviewVote`, narrowed to `VoterRole` (#4558).
 *
 * It declared `role: string`, which is wider than `PrReviewVote['role']` and
 * therefore not assignable to `aggregatePrDecisions`. Nothing reported it
 * because no gate typechecked `scripts/`.
 */
interface VoterResult {
  readonly role: VoterRole;
  /**
   * Required by `PrReviewVote` and previously absent here (#4558) — the local
   * mirror drifted from the type it feeds. `collectRealVotes` already returns
   * it, so it was available all along and simply not carried through.
   */
  readonly processingTimeMs: number;
  readonly decision: 'approve' | 'request_changes' | 'abstain';
  readonly confidence: number;
  readonly reasoning: string;
  readonly findings: readonly Finding[];
  readonly source: 'llm' | 'simulation' | 'error';
  readonly cli?: string | undefined;
}

interface ReviewResult {
  readonly summary: string;
  readonly verified: boolean;
  readonly reviews: VoterResult[];
  readonly aggregate: PrReviewAggregate;
  readonly title: string;
  readonly description: string;
  readonly baseSha: string;
  readonly headSha: string;
  /**
   * The full canonical (ledger-excluded) `base..head` diff the voters reviewed and
   * that gets hashed for the ledger record — undefined when the local clone could
   * not produce it (fell back to the gh v3.diff for the review; no ledger record).
   */
  readonly canonicalDiff: string | undefined;
}

/**
 * Produce the diff the voters review. Prefers the CANONICAL, ledger-excluded
 * `git diff base..head` (so its hash matches the gate recompute and the review can
 * feed the ledger); falls back to the GitHub `v3.diff` when the base/head commits
 * are not fetchable locally (review still runs, but no record — the fallback diff
 * is not hash-parity with the gate).
 */
async function resolveReviewDiff(
  prNumber: number,
  meta: PrMeta
): Promise<{ reviewDiff: string; canonicalDiff: string | undefined }> {
  if (meta.baseSha !== '' && meta.headSha !== '') {
    await ensurePrCommitsLocal(prNumber, meta.baseSha);
    try {
      const full = await generateCanonicalReviewDiff(meta.baseSha, meta.headSha);
      const reviewDiff =
        full.length > MAX_DIFF_LENGTH ? `${full.slice(0, MAX_DIFF_LENGTH)}\n[...truncated]` : full;
      return { reviewDiff, canonicalDiff: full };
    } catch (e) {
      console.warn(
        `  canonical git diff unavailable (${(e as Error).message.slice(0, 120)}); ` +
          `falling back to gh diff (review only, no ledger record).`
      );
    }
  }
  const { diff } = await fetchGhDiff(prNumber);
  return { reviewDiff: diff, canonicalDiff: undefined };
}

/** Normalize the raw voter results into the local {@link VoterResult} shape. */
function mapVoterResults(voteResults: Awaited<ReturnType<typeof collectRealVotes>>): VoterResult[] {
  return voteResults.map((r) => {
    const raw = r.vote.findings;
    const findings: Finding[] =
      raw !== undefined && raw.length > 0
        ? raw.map((f) => ({
            summary: f.summary,
            location: f.location,
            severity: f.severity,
            gate: f.gate,
            claim: f.claim,
            verified: isFindingVerified(f.gate),
          }))
        : [];
    return {
      role: r.role,
      processingTimeMs: r.processingTimeMs,
      decision: mapVoteDecisionToPrDecision(r.vote.decision),
      confidence: r.vote.confidence,
      reasoning: r.vote.reasoning,
      findings,
      source: r.source,
      cli: r.cli,
    };
  });
}

async function runReview(prNumber: number): Promise<ReviewResult> {
  console.log(`\n[#${String(prNumber)}] fetching diff…`);
  const meta = await fetchPrMeta(prNumber);
  const { reviewDiff, canonicalDiff } = await resolveReviewDiff(prNumber, meta);
  console.log(`  ${meta.title}`);
  console.log(
    `  diff size: ${String(reviewDiff.length)} chars${canonicalDiff !== undefined ? ' (canonical, ledger-excluded)' : ' (gh fallback)'}`
  );

  const proposal = buildPrReviewProposal({
    prTitle: meta.title,
    prDescription: meta.body,
    prDiff: reviewDiff,
    ...(meta.baseRef !== '' && { baseRef: meta.baseRef }),
    ...(meta.headRef !== '' && { headRef: meta.headRef }),
  });

  console.log(`  running ${String(PR_REVIEW_ROLES.length)} voters via local CLI auth…`);
  const voteResults = await collectRealVotes({
    roles: PR_REVIEW_ROLES,
    proposal,
    simulate: false,
  });

  const reviews = mapVoterResults(voteResults);
  const aggregate = aggregatePrDecisions(reviews);
  return {
    summary: aggregate.decision,
    verified: aggregate.verified,
    reviews,
    aggregate,
    title: meta.title,
    description: meta.body,
    baseSha: meta.baseSha,
    headSha: meta.headSha,
    canonicalDiff,
  };
}

// ============================================================================
// Comment formatting
// ============================================================================

function formatHeader(summary: string, verified: boolean): { icon: string; tag: string } {
  const isSoftBlock = summary === 'request_changes' && !verified;
  if (isSoftBlock) return { icon: '⚠️', tag: 'REQUEST CHANGES (UNVERIFIED — majority dissent)' };
  const icons: Record<string, string> = { approve: '✅', request_changes: '❌', abstain: '➖' };
  return { icon: icons[summary] ?? '❓', tag: summary.toUpperCase() };
}

function formatVoterTable(reviews: readonly VoterResult[]): string[] {
  const rows: string[] = [
    '| Voter | Decision | Confidence | CLI | Findings |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of reviews) {
    const verifiedN = r.findings.filter((f) => f.verified).length;
    const total = r.findings.length;
    const findingsCol = total === 0 ? '—' : `${String(verifiedN)}/${String(total)} verified`;
    rows.push(
      `| ${r.role} | ${r.decision} | ${(r.confidence * 100).toFixed(0)}% | ${r.cli ?? '—'} | ${findingsCol} |`
    );
  }
  return rows;
}

function formatVerifiedFindings(reviews: readonly VoterResult[]): string[] {
  const verified = reviews.flatMap((r) => r.findings.filter((f) => f.verified));
  if (verified.length === 0) return [];
  const lines: string[] = ['', '### Verified findings'];
  for (const f of verified) {
    lines.push('', `- **${f.summary}** (\`${f.location}\`, ${f.severity})`, `  - ${f.claim}`);
  }
  return lines;
}

function formatReasoningDetails(reviews: readonly VoterResult[]): string[] {
  const lines: string[] = ['', '<details><summary>Reasoning per voter</summary>', ''];
  for (const r of reviews) {
    lines.push(`### ${r.role} — ${r.decision}`, '', r.reasoning, '');
  }
  lines.push('</details>');
  return lines;
}

function formatComment(result: {
  summary: string;
  verified: boolean;
  reviews: VoterResult[];
}): string {
  const { icon, tag } = formatHeader(result.summary, result.verified);
  const isSoftBlock = result.summary === 'request_changes' && !result.verified;
  const softNote = isSoftBlock
    ? [
        '',
        '> ⚠️ Majority of voters requested changes but none produced a verified finding. Apply the verification gate (`.rules/discovered-issues.md`) before acting on these concerns — they may be false positives.',
      ]
    : [];
  return [
    `## ${icon} Multi-voter PR Review [bot]`,
    '',
    `**Overall:** ${tag}`,
    ...softNote,
    '',
    ...formatVoterTable(result.reviews),
    ...formatVerifiedFindings(result.reviews),
    ...formatReasoningDetails(result.reviews),
    '',
    '---',
    `_Run locally via \`scripts/pr-review-local.ts\` — uses subscription quota (~5 LLM calls). To opt out, add the \`${SKIP_LABEL}\` label._`,
  ].join('\n');
}

// ============================================================================
// One-shot + watch
// ============================================================================

async function runOnce(prNumber: number, post: boolean): Promise<void> {
  const result = await runReview(prNumber);
  const counts = result.reviews.reduce(
    (acc, r) => {
      if (r.source === 'error') acc.err++;
      else if (r.decision === 'approve') acc.approve++;
      else if (r.decision === 'request_changes') acc.rc++;
      else acc.abstain++;
      return acc;
    },
    { approve: 0, rc: 0, abstain: 0, err: 0 }
  );
  console.log(
    `  → ${result.summary.toUpperCase()}${result.verified ? '' : ' (unverified)'} ` +
      `(approve=${String(counts.approve)}, rc=${String(counts.rc)}, abstain=${String(counts.abstain)}, err=${String(counts.err)})`
  );

  if (counts.err === result.reviews.length) {
    console.error(`  all voters errored — likely auth or transport issue. Skipping comment.`);
    return;
  }

  if (!post) {
    console.log(`  --no-post: skipping PR comment.`);
    return;
  }

  const body = formatComment(result);
  await postPrComment(prNumber, body);
  await applyLabel(prNumber, REVIEWED_LABEL);
  console.log(`  posted comment + applied '${REVIEWED_LABEL}' label.`);

  // Feed the governance ledger (#4229): persist an authentic, diff-bound record so
  // the governor-review gate can MATCH this PR's review.
  await feedLedgerRecord({
    prNumber,
    baseSha: result.baseSha,
    headSha: result.headSha,
    title: result.title,
    description: result.description,
    aggregate: result.aggregate,
    canonicalDiff: result.canonicalDiff,
    counts: {
      approveCount: counts.approve,
      requestChangesCount: counts.rc,
      abstainCount: counts.abstain,
      errorCount: counts.err,
    },
    reviewCount: result.reviews.length,
  });
}

async function runWatch(args: Args): Promise<void> {
  console.log(`Watch mode (interval ${String(args.intervalSec)}s). Ctrl+C to stop.\n`);
  for (;;) {
    try {
      const prs = await listOpenPrs();
      const eligible = prs.filter((p) => {
        if (p.labels.includes(REVIEWED_LABEL)) return false;
        if (p.labels.includes(SKIP_LABEL)) return false;
        if (!args.includeDrafts && p.isDraft) return false;
        return true;
      });
      console.log(
        `[${new Date().toISOString()}] ${String(prs.length)} open PRs, ${String(eligible.length)} eligible.`
      );
      for (const pr of eligible) {
        await runOnce(pr.number, args.post);
      }
    } catch (e) {
      console.error(`watch poll failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, args.intervalSec * 1000));
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'watch') {
    await runWatch(args);
    return;
  }

  if (args.prNumber === undefined) {
    console.error('Usage: pr-review-local.ts <pr-number> [--no-post]');
    console.error('   or: pr-review-local.ts --watch [--interval 300] [--include-drafts]');
    process.exit(1);
  }

  await runOnce(args.prNumber, args.post);
}

// Run only when invoked directly (not when imported by the test suite), mirroring
// scripts/check-governor-review.ts — so the exported ledger-feeder seams are unit
// testable without executing the watcher.
const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  await main();
}
