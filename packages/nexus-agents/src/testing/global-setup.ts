/**
 * Vitest global setup: reap stale test scratch before the run (#4413).
 *
 * Runs once in the main process before any worker spawns, which is the only
 * window where an age-based sweep cannot race an in-flight test — nothing holds
 * scratch yet. The age limit is a second, independent guard for the case that
 * matters anyway: a developer running two suites at once.
 *
 * ## Why a net is needed at all
 *
 * The dominant producer is not this repo's code. Every spawned `opencode`
 * process unpacks an 8.2 MB `libopentui.so` into `$TMPDIR` and never removes it
 * (Bun standalone-binary behaviour), and `cli-adapters/subprocess-env.ts`
 * forwards `TMPDIR` to spawned CLIs by design. One file per spawn, thousands
 * over weeks. Tests that leak their own `mkdtemp` dirs add to it. Neither is
 * fixable from inside a single test file, which is what makes a run-level sweep
 * the right shape.
 *
 * The sweep logs what it removed. That is deliberate: a net that quietly
 * absorbs a growing leak converts a visible disk-full failure into an
 * invisible one, so a rising reap count each run is the leak detector.
 *
 * @module testing/global-setup
 */

import { formatReapReport, reapScratchRoot } from './reap-scratch.js';
import { ensureTestScratchRoot } from './test-scratch-root.js';

/**
 * Entries older than this are removed.
 *
 * Generous on purpose. A full suite run is well under an hour, so a day's
 * margin cannot reach a concurrent run, and bounding growth to roughly one
 * day's scratch is the whole requirement — the reaper is a floor under the
 * leak, not a substitute for fixing its producers.
 */
const MAX_SCRATCH_AGE_MS = 24 * 60 * 60 * 1000;

export function setup(): void {
  const report = reapScratchRoot(ensureTestScratchRoot(), {
    maxAgeMs: MAX_SCRATCH_AGE_MS,
    now: Date.now(),
  });

  // Silent on a clean, empty root; audible whenever it actually did something
  // or could not. An always-on line would train everyone to ignore it, and a
  // silent one would let a growing leak pass unremarked — which is how this
  // root reached 9.7 GB. `warn` is the sanctioned console channel here.
  if (report.reaped > 0 || report.failed.length > 0 || !report.rootExisted) {
    console.warn(formatReapReport(report));
  }
}
