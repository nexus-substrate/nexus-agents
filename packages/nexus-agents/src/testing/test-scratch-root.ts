/**
 * The one definition of the test suite's scratch root (#4412, #4413).
 *
 * Both `vitest.config.ts` (which exports it to every test process as `TMPDIR`)
 * and `testing/global-setup.ts` (which reaps it) need this path. Deriving it
 * twice is how a reaper ends up pointed at a directory nothing writes to — the
 * failure that let this root reach 9.7 GB unobserved.
 *
 * @module testing/test-scratch-root
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `<package>/.nexus-agents/tmp` — gitignored via `.nexus-agents/`.
 *
 * Module-local: callers take the path from {@link ensureTestScratchRoot}, so the
 * directory always exists by the time anyone holds its path.
 */
const TEST_SCRATCH_ROOT = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  '.nexus-agents',
  'tmp'
);

/** Creates the scratch root if absent and returns it. Safe to call repeatedly. */
export function ensureTestScratchRoot(): string {
  mkdirSync(TEST_SCRATCH_ROOT, { recursive: true });
  return TEST_SCRATCH_ROOT;
}

/**
 * A per-run `NEXUS_DATA_DIR` for the suite (#4722).
 *
 * Without it the suite writes to `~/.nexus-agents/` — the real, homedir-scoped,
 * cross-repo store holding capability gaps, memory and learning outcomes. Test
 * runs put synthetic tool names and fabricated gaps into the same data the
 * routing and improvement loops read, silently, outside the repo where
 * `git status` never shows it.
 *
 * Per run rather than a fixed path, so state cannot leak between runs — a
 * shared directory would be the same hazard as the homedir, only narrower.
 * Lives under the scratch root so the existing reaper (#4413) collects it.
 */
export function ensureTestDataDir(): string {
  const dir = join(TEST_SCRATCH_ROOT, 'data', `run-${String(process.pid)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
