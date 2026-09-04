/**
 * Dropped-push-event detector (#4648).
 *
 * ## The failure
 *
 * On 2026-08-23 a merge to `main` (`e7caa41835`) produced **no push-triggered
 * workflow runs at all** — no CI, no Release, no CodeQL — while the commits on
 * either side got 7–9 each. The only runs carrying that SHA came from `issues`
 * events. Nothing in the repo's configuration explains it: `release.yml` has no
 * `paths:` filter, so it fires on every push to `main`. It looks like a dropped
 * event on GitHub's side, and it recovered on the next merge.
 *
 * ## Why it needs a detector at all
 *
 * The release half self-heals and is already covered: `check-release-stuck.ts`
 * (#4500) keys on changesets present with no version PR, which catches "no run
 * at all" even though its author only enumerated "run went green without a PR"
 * and "run went red".
 *
 * The CI half is not covered. The commit is not marked failing — it is
 * **unmarked**. Branch protection gates pull requests, so a squash-merge whose
 * post-merge CI never runs leaves `main` in a state nobody verified and nothing
 * reports. The next person sees no red X and reasonably concludes it is green.
 * Absence of a result reading as a passing result is the same defect this repo
 * treats as a p1 on the governor path (#4580), one level up from verdicts.
 *
 * ## Why "zero push runs" is the predicate
 *
 * Measured across the 12 most recent `main` commits before this was written:
 * every one had 7–9 push-event runs except the dropped commit, which had 0.
 * The signature is unambiguous, and it needs no model of which workflows *should*
 * have fired — parsing every `paths:` filter against the commit's diff would be
 * an elaborate way to reach the same answer with more ways to be wrong.
 *
 * @module scripts/check-missing-push-runs
 */

import { execFileSync } from 'node:child_process';

/**
 * How old a commit must be before zero runs counts as evidence.
 *
 * A push seconds old legitimately has no registered runs yet. Fifteen minutes
 * is far beyond GitHub's normal dispatch latency and far below this check's
 * six-hour cadence, so it costs no detection time.
 */
export const MIN_COMMIT_AGE_MS = 15 * 60 * 1000;

/** What the detector concluded. */
export type PushRunVerdict =
  | { kind: 'ok'; sha: string; pushRunCount: number }
  | { kind: 'too-recent'; sha: string; ageMinutes: number }
  | { kind: 'missing'; sha: string; ageMinutes: number };

/** Everything the verdict is computed from. */
export interface PushRunInputs {
  readonly sha: string;
  readonly committedAtMs: number;
  readonly pushRunCount: number;
  readonly now: number;
}

/**
 * Decides whether `main`'s head is missing its push-triggered runs.
 *
 * `too-recent` is deliberately distinct from `ok`. A fresh commit with no runs
 * has not been measured, and reporting that as healthy would be the same
 * absence-as-success error the detector exists to catch.
 */
export function assessPushRuns(inputs: PushRunInputs): PushRunVerdict {
  const ageMs = inputs.now - inputs.committedAtMs;
  const ageMinutes = Math.round(ageMs / 60_000);

  if (inputs.pushRunCount > 0) {
    return { kind: 'ok', sha: inputs.sha, pushRunCount: inputs.pushRunCount };
  }
  // Retain on the tie — a false alarm on a commit that was about to register
  // its runs would train everyone to ignore this.
  if (ageMs <= MIN_COMMIT_AGE_MS) {
    return { kind: 'too-recent', sha: inputs.sha, ageMinutes };
  }
  return { kind: 'missing', sha: inputs.sha, ageMinutes };
}

/** Renders a verdict for the run log, keeping the three outcomes distinct. */
export function formatPushRunVerdict(verdict: PushRunVerdict): string {
  switch (verdict.kind) {
    case 'ok':
      return `main@${verdict.sha} has ${String(verdict.pushRunCount)} push-triggered run(s).`;
    case 'too-recent':
      return `main@${verdict.sha} is ${String(verdict.ageMinutes)}m old with no runs yet — too recent to judge.`;
    case 'missing':
      return (
        `::error::main@${verdict.sha} is ${String(verdict.ageMinutes)}m old and has ZERO ` +
        `push-triggered workflow runs. No CI evaluated this commit and no Release ran. ` +
        `The commit is not marked failing — it is unmarked, so main looks green. ` +
        `Recovery: re-dispatch the workflows for this SHA (\`gh workflow run release.yml --ref main\` ` +
        `for the release path), or land another commit, which re-triggers everything.`
      );
  }
}

function sh(command: string, args: readonly string[]): string {
  return execFileSync(command, [...args], { encoding: 'utf-8' }).trim();
}

if (process.argv[1]?.endsWith('check-missing-push-runs.ts') === true) {
  const sha = sh('git', ['rev-parse', 'HEAD']);
  const committedAtMs = Number(sh('git', ['log', '-1', '--format=%ct', sha])) * 1000;
  const pushRunCount = Number(
    sh('gh', [
      'api',
      `repos/${process.env['GITHUB_REPOSITORY'] ?? 'nexus-substrate/nexus-agents'}/actions/runs?head_sha=${sha}&per_page=100`,
      '-q',
      '[.workflow_runs[] | select(.event=="push")] | length',
    ])
  );

  const verdict = assessPushRuns({ sha, committedAtMs, pushRunCount, now: Date.now() });
  console.error(formatPushRunVerdict(verdict));
  process.exit(verdict.kind === 'missing' ? 1 : 0);
}
