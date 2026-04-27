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
 * What it does (one-shot):
 *   1. Fetches PR diff via `gh api`
 *   2. Runs the same 5-voter pipeline pr_review uses (voters route
 *      through CLI subprocesses → use your local subscription auth)
 *   3. Posts a single review comment back via `gh pr comment`
 *   4. Adds the `pr-reviewed` label so --watch mode skips on next pass
 *
 * What it does (watch mode):
 *   Polls open PRs without the `pr-reviewed` label, runs review on each,
 *   sleeps for --interval seconds (default 300), repeats.
 *
 * Safety:
 *   - Adds `pr-reviewed` label so the same PR isn't reviewed twice
 *   - Skips PRs with `skip-pr-review` label (matches the workflow's opt-out)
 *   - Skips draft PRs by default (use --include-drafts to override)
 *   - Adds [bot] suffix to comment body so it's clearly automated
 *
 * Cost: ~5 voter LLM calls per PR (5 messages of subscription quota at
 * typical PR size, ~2 minutes wall-clock per PR).
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
} from '../packages/nexus-agents/src/mcp/tools/pr-review-tool.js';
import {
  isFindingVerified,
  type Finding,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-findings.js';

const execFileP = promisify(execFile);

const REPO_OWNER = 'williamzujkowski';
const REPO_NAME = 'nexus-agents';
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

async function fetchPrDiff(
  prNumber: number
): Promise<{
  diff: string;
  truncated: boolean;
  baseRef: string;
  headRef: string;
  title: string;
  body: string;
}> {
  const [{ stdout: meta }, { stdout: diffOut }] = await Promise.all([
    execFileP('gh', [
      'api',
      `repos/${REPO_OWNER}/${REPO_NAME}/pulls/${String(prNumber)}`,
      '--jq',
      '{title, body, head: .head.ref, base: .base.ref}',
    ]),
    execFileP(
      'gh',
      [
        'api',
        `repos/${REPO_OWNER}/${REPO_NAME}/pulls/${String(prNumber)}`,
        '-H',
        'Accept: application/vnd.github.v3.diff',
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    ),
  ]);
  const m = JSON.parse(meta) as { title?: string; body?: string; head?: string; base?: string };
  const truncated = diffOut.length > MAX_DIFF_LENGTH;
  const diff = truncated ? `${diffOut.slice(0, MAX_DIFF_LENGTH)}\n[...truncated]` : diffOut;
  return {
    diff,
    truncated,
    title: m.title ?? '',
    body: m.body ?? '',
    headRef: m.head ?? '',
    baseRef: m.base ?? '',
  };
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

interface VoterResult {
  readonly role: string;
  readonly decision: 'approve' | 'request_changes' | 'abstain';
  readonly confidence: number;
  readonly reasoning: string;
  readonly findings: readonly Finding[];
  readonly source: 'llm' | 'simulation' | 'error';
  readonly cli?: string | undefined;
}

async function runReview(
  prNumber: number
): Promise<{ summary: string; verified: boolean; reviews: VoterResult[] }> {
  console.log(`\n[#${String(prNumber)}] fetching diff…`);
  const { diff, title, body, baseRef, headRef } = await fetchPrDiff(prNumber);
  console.log(`  ${title}`);
  console.log(`  diff size: ${String(diff.length)} chars`);

  const proposal = buildPrReviewProposal({
    prTitle: title,
    prDescription: body,
    prDiff: diff,
    ...(baseRef !== '' && { baseRef }),
    ...(headRef !== '' && { headRef }),
    simulate: false,
  });

  console.log(`  running ${String(PR_REVIEW_ROLES.length)} voters via local CLI auth…`);
  const voteResults = await collectRealVotes({
    roles: PR_REVIEW_ROLES,
    proposal,
    simulate: false,
  });

  const reviews: VoterResult[] = voteResults.map((r) => {
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
      decision: mapVoteDecisionToPrDecision(r.vote.decision),
      confidence: r.vote.confidence,
      reasoning: r.vote.reasoning,
      findings,
      source: r.source,
      cli: r.cli,
    };
  });

  const aggregate = aggregatePrDecisions(reviews);
  return { summary: aggregate.decision, verified: aggregate.verified, reviews };
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

await main();
