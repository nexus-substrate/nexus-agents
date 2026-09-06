/**
 * meta-shadow-soak.ts — the gh-fetch + live-execution TRIGGER for the
 * MetaOrchestrator shadow-training soak (#4310, feeder for #3552).
 *
 * The shadow-training MECHANISM already works: with `NEXUS_META_SHADOW_TRAIN=1`,
 * `executeGoal` (packages/nexus-agents/src/mcp/tools/run-tool.ts) feeds every
 * live `run` dispatch outcome into the MetaOrchestrator shadow selector and
 * appends a sanitized record — feature values + success only, never task text
 * (#3593) — to `<NEXUS_DATA_DIR>/learning/meta-outcomes.jsonl`. Nothing ever
 * TRIGGERED it, though: training only fires on a live `run {execute:true}`
 * call, and no CI/cron/CLI ever made one, so the evidence #3552's shadow→route
 * flip decision needs could not accumulate. This script is that trigger,
 * mirroring the #4224 remediation-audit-soak precedent.
 *
 * It sources REAL backlog issues via `gh` (ratified decision for #4310 —
 * synthetic goals would not resemble the goal distribution `run` actually sees
 * in production) and drives each through `executeGoal` with shadow training
 * enabled. Goal selection/formatting is PURE and unit-tested in
 * meta-shadow-soak-core.ts; this file is the thin, untested-by-unit I/O edge
 * (like curate-pr-review-harvest.ts / mine-pr-review-candidates-core.ts, #3847)
 * — the `gh` shelling-out AND the live `executeGoal` dispatch (which needs real
 * model-gateway credentials this script does not provide) both live here.
 *
 * SAFETY (feeder only, never wired to routing):
 *   - This ONLY ever sets `NEXUS_META_SHADOW_TRAIN=1`. That env var feeds the
 *     SHADOW selector and the offline eval surface — it never alters which
 *     strategy `run` actually dispatches (see `isShadowTrainEnabled` /
 *     `buildShadowTrainObserver` in run-tool.ts). The #3552 shadow→route flip
 *     stays a separate, human-gated change; this script cannot enable it.
 *   - No `simulateVotes` / mock outcomes — every goal is dispatched through the
 *     REAL `executeGoal` path, so accrued shadow-training evidence reflects
 *     genuine dispatch outcomes, not synthetic ones.
 *
 * Usage (local, on-demand — see docs/getting-started/CONFIGURATION.md):
 *   NEXUS_META_SHADOW_TRAIN=1 pnpm exec tsx scripts/meta-shadow-soak.ts [--count N] [--repo OWNER/NAME]
 *
 * Requires: `gh` authenticated against the target repo, and model-gateway
 * credentials for whichever strategies the router selects (dev-pipeline /
 * pipeline / research / consensus are wired executors; others fail closed and
 * still accrue a FAILURE shadow-training record — see meta-dispatcher.ts,
 * which records an outcome even for a `no_executor` dispatch).
 *
 * @module scripts/meta-shadow-soak
 * (Source: Issue #4310, feeder for #3552; precedent #4224)
 */

/* eslint-disable no-console -- CLI script that prints progress */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync, readFileSync } from 'node:fs';
import {
  DEFAULT_SOAK_GOAL_COUNT,
  selectSoakGoals,
  type BacklogIssue,
  type SoakGoal,
} from './meta-shadow-soak-core.js';
import {
  executeGoal,
  isShadowTrainEnabled,
} from '../packages/nexus-agents/src/mcp/tools/run-tool.js';
import { getMetaOutcomesFile } from '../packages/nexus-agents/src/config/learning-persistence.js';
import { getErrorMessage } from '../packages/nexus-agents/src/core/index.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../packages/nexus-agents/src/config/timeouts.js';

const execFileP = promisify(execFile);

const DEFAULT_REPO = 'nexus-substrate/nexus-agents';
/** Fetch a wider page than the selection count so a stable sort has real headroom. */
const FETCH_MULTIPLIER = 3;

// ============================================================================
// gh fetch (the only I/O besides executeGoal)
// ============================================================================

/** Raw shape of one `gh issue list --json number,title,body` entry. */
interface RawIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
}

/** Fetches open issues from `repo` via `gh`. Throws on `gh` failure. */
async function fetchBacklogIssues(repo: string, limit: number): Promise<BacklogIssue[]> {
  const { stdout } = await execFileP(
    'gh',
    [
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--limit',
      String(limit),
      '--json',
      'number,title,body',
    ],
    { timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs, maxBuffer: 16 * 1024 * 1024 }
  );
  const raw = JSON.parse(stdout) as readonly RawIssue[];
  return raw.map((i) => ({ number: i.number, title: i.title, body: i.body ?? '' }));
}

// ============================================================================
// Soak run
// ============================================================================

interface GoalRunResult {
  readonly issueNumber: number;
  readonly ok: boolean;
  readonly strategy?: string;
  readonly error?: string;
}

/** Line count of a JSONL file, or 0 when it does not exist yet. */
function jsonlLineCount(path: string): number {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf-8');
  return text.split('\n').filter((l) => l.trim().length > 0).length;
}

/** Byte size of a file, or 0 when it does not exist. */
function fileSize(path: string): number {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

/**
 * Drives one {@link SoakGoal} through the REAL `executeGoal` path. Never
 * throws — a dispatch failure (including `no_executor` for an unwired
 * strategy) still accrues a shadow-training record via the dispatcher's
 * outcome observer (see meta-dispatcher.ts `recordOutcome`), so it is reported
 * as a completed (if failed) goal run, not aborted.
 */
async function runOneGoal(goal: SoakGoal): Promise<GoalRunResult> {
  try {
    const result = await executeGoal({ goal: goal.goal, execute: true });
    return { issueNumber: goal.issueNumber, ok: true, strategy: result.strategy };
  } catch (err) {
    return { issueNumber: goal.issueNumber, ok: false, error: getErrorMessage(err) };
  }
}

interface SoakOptions {
  readonly repo: string;
  readonly count: number;
}

function parseArgs(argv: readonly string[]): SoakOptions {
  let repo = DEFAULT_REPO;
  let count = DEFAULT_SOAK_GOAL_COUNT;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--repo' && value !== undefined) {
      repo = value;
      i++;
    } else if (flag === '--count' && value !== undefined) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) count = parsed;
      i++;
    }
  }
  return { repo, count };
}

async function runSoak(options: SoakOptions): Promise<void> {
  if (!isShadowTrainEnabled()) {
    console.error(
      '::error::NEXUS_META_SHADOW_TRAIN=1 is not set (or learning persistence is disabled). ' +
        'This soak is a no-op without it — see docs/getting-started/CONFIGURATION.md.'
    );
    process.exitCode = 1;
    return;
  }

  const outcomesFile = getMetaOutcomesFile();
  const before = jsonlLineCount(outcomesFile);

  console.log(`Fetching backlog issues from ${options.repo} …`);
  const issues = await fetchBacklogIssues(options.repo, options.count * FETCH_MULTIPLIER);
  const goals = selectSoakGoals(issues, options.count);
  console.log(
    `Selected ${String(goals.length)} real backlog goals (of ${String(issues.length)} fetched).`
  );

  const results: GoalRunResult[] = [];
  for (const goal of goals) {
    console.log(`  → #${String(goal.issueNumber)}: ${goal.title}`);
    // Serial (not Promise.all): shadow-training records accrue in a stable,
    // reviewable order and per-goal model-gateway load stays bounded.
    const result = await runOneGoal(goal);
    results.push(result);
    console.log(
      result.ok
        ? `    ok — strategy=${String(result.strategy)}`
        : `    failed (still records a shadow-training outcome) — ${String(result.error)}`
    );
  }

  const after = jsonlLineCount(outcomesFile);
  const succeeded = results.filter((r) => r.ok).length;

  console.log('');
  console.log('=== meta-shadow-soak summary (#4310) ===');
  console.log(
    `Goals run:        ${String(results.length)} (${String(succeeded)} succeeded, ${String(results.length - succeeded)} failed/no-executor)`
  );
  console.log(
    `Shadow records:   ${String(before)} -> ${String(after)} (+${String(after - before)})`
  );
  console.log(
    `meta-outcomes.jsonl size: ${String(fileSize(outcomesFile))} bytes (${outcomesFile})`
  );
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  await runSoak(parseArgs(process.argv.slice(2)));
}

export { fetchBacklogIssues, runOneGoal, runSoak, parseArgs, jsonlLineCount, fileSize };
