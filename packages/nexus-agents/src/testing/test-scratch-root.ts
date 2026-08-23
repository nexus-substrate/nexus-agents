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
