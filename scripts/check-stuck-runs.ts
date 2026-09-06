/**
 * Detect deploy runs wedged in the queue (#4521).
 *
 * On 2026-08-09 a `deploy-website` run sat in `queued` for **11 days** with
 * `runner=none`. Its build and link-check jobs had passed; only the
 * `Deploy to GitHub Pages` job never got picked up. Because the workflow uses
 * `concurrency: group: pages` with `cancel-in-progress: false`, that one run
 * held the group and 34 later deploys were cancelled before starting a job.
 * The site served a version a full major behind for two weeks.
 *
 * ## Why the existing timeouts did not catch it
 *
 * Every job in `deploy-website.yml` already has `timeout-minutes` — the deploy
 * job has 5. **`timeout-minutes` bounds execution, not queueing.** It starts
 * counting when a runner picks the job up. A job that never gets a runner is
 * never "running", so it sat 11 days inside a 5-minute limit without
 * contradiction. Queue residency is the one state nothing in the workflow file
 * bounds, and GitHub Actions offers no per-job knob for it.
 *
 * That is why this is an external check rather than a config change. My first
 * proposal on #4521 was to add a `timeout-minutes` that already existed.
 *
 * ## Relationship to the staleness detector
 *
 * #4516 catches the *consequence* — published site behind `main` — within 6
 * hours, and remains the primary alarm because it fires regardless of cause.
 * This catches the *cause* early and points at the specific run to cancel,
 * which took real digging by hand precisely because `queued` does not appear
 * in the obvious "pending runs" query.
 *
 * Reports only. Cancelling a run is destructive and stays a human decision.
 *
 * @module scripts/check-stuck-runs
 * (Source: Issue #4521)
 */

/**
 * A healthy deploy completes end-to-end in about 90 seconds — measured across
 * the five most recent successful runs (79s, 73s, 79s, 95s, 67s). An hour is
 * ~40x that, which leaves ample room for runner-availability delays while
 * still turning an 11-day wedge into a same-day report.
 */
export const STUCK_AFTER_MINUTES = 60;

/** Statuses that occupy the concurrency group without executing. */
const WAITING_STATUSES = new Set(['queued', 'pending', 'waiting', 'requested']);

export interface RunSummary {
  readonly databaseId: number;
  readonly status: string;
  readonly ageMinutes: number;
}

export interface StuckRunVerdict {
  readonly ok: boolean;
  readonly stuck: RunSummary[];
  readonly reason: string;
}

/**
 * Identify runs that have been waiting for a runner longer than the window.
 *
 * `in_progress` is deliberately never flagged however long it has run — that
 * state IS bounded by the job's own `timeout-minutes`.
 */
export function assessStuckRuns(runs: readonly RunSummary[]): StuckRunVerdict {
  const stuck = runs.filter(
    (r) => WAITING_STATUSES.has(r.status) && r.ageMinutes > STUCK_AFTER_MINUTES
  );

  if (stuck.length === 0) {
    return { ok: true, stuck: [], reason: 'No runs waiting past the queue window.' };
  }

  const detail = stuck
    .map((r) => `run ${String(r.databaseId)} (${r.status}, ${String(Math.round(r.ageMinutes))}m)`)
    .join(', ');

  return {
    ok: false,
    stuck,
    reason:
      `${String(stuck.length)} run(s) waiting past ${String(STUCK_AFTER_MINUTES)}m: ${detail}. ` +
      'A run stuck in the queue holds the `pages` concurrency group and silently ' +
      'cancels every later deploy. Cancel it to release the queue.',
  };
}

/* eslint-disable no-console */
/**
 * Parse the `gh run list --json databaseId,status,createdAt` output the
 * workflow passes in `RUNS_JSON`. Returns `undefined` when the input is absent
 * or empty (#5670): the workflow runs `RUNS_JSON=$(gh ...) pnpm exec tsx ...`,
 * so a `gh` failure leaves the variable empty and the step still runs. That
 * used to parse as `[]` and pass as "no runs waiting" — a measured-sounding
 * verdict over nothing. `gh`'s literal `[]` is still a genuinely empty list.
 */
export function readRunsFrom(raw: string | undefined, now: number): RunSummary[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = JSON.parse(raw) as Array<{
    databaseId: number;
    status: string;
    createdAt: string;
  }>;
  return parsed.map((r) => ({
    databaseId: r.databaseId,
    status: r.status,
    ageMinutes: (now - Date.parse(r.createdAt)) / 60_000,
  }));
}

function main(): void {
  const runs = readRunsFrom(process.env['RUNS_JSON'], Date.now());
  if (runs === undefined) {
    const reason =
      'unmeasured: RUNS_JSON was empty — `gh run list` produced no output, so whether a ' +
      'deploy is wedged could not be checked. Not evidence that nothing is waiting.';
    console.log(reason);
    console.log(`::error::${reason}`);
    process.exitCode = 1;
    return;
  }
  const verdict = assessStuckRuns(runs);
  console.log(verdict.reason);
  if (!verdict.ok) {
    console.log(`::error::${verdict.reason}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-stuck-runs.ts') === true) {
  main();
}
