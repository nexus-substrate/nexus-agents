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

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `<package>/.nexus-agents/tmp` — gitignored via `.nexus-agents/`.
 *
 * Module-local: callers take the path from {@link ensureTestScratchRoot}, so the
 * directory always exists by the time anyone holds its path.
 */
const IN_REPO_SCRATCH_ROOT = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  '.nexus-agents',
  'tmp'
);

/**
 * Longest usable Unix socket path on Linux: `sun_path` is 108 bytes including
 * the terminating NUL.
 */
export const MAX_UNIX_SOCKET_PATH_BYTES = 107;

/**
 * Conservative pid for sizing: Linux `pid_max` tops out at 4194304 (7 digits).
 * Sizing against the widest pid keeps the verdict independent of which pid a
 * child happens to draw.
 */
const WIDEST_PID = '9999999';

/**
 * Whether tsx's IPC socket, `<root>/tsx-<uid>/<pid>.pipe`, fits in `sun_path`
 * for every pid (#6615). libuv truncates an overlong path instead of rejecting
 * it, so an overflow shows up as `listen EADDRINUSE` in the spawned child, not
 * as a path error.
 */
export function tsxPipePathFits(root: string, uid: number): boolean {
  const pipePath = join(root, `tsx-${String(uid)}`, `${WIDEST_PID}.pipe`);
  return Buffer.byteLength(pipePath, 'utf8') <= MAX_UNIX_SOCKET_PATH_BYTES;
}

/**
 * The scratch root to use: the in-repo `preferred` root whenever tsx's socket
 * path fits under it (#4412), otherwise a short directory under `systemTmp`.
 *
 * The fallback is derived from `preferred` rather than drawn at random, so the
 * two callers that each resolve the root — the vitest config and the reaper in
 * global-setup — land on the same directory, and two checkouts do not share
 * one. Per-run isolation still comes from {@link ensureTestDataDir} and from
 * tests' own `mkdtemp` calls beneath it.
 */
export function resolveTestScratchRoot(preferred: string, systemTmp: string, uid: number): string {
  if (tsxPipePathFits(preferred, uid)) return preferred;
  const checkoutId = createHash('sha256').update(preferred).digest('hex').slice(0, 12);
  return join(systemTmp, `nexus-agents-test-${checkoutId}`);
}

/**
 * The real system temp dir. The runner exports it as `VITEST_SYSTEM_TMPDIR`
 * because it redirects `TMPDIR` for test processes.
 */
function systemTmpDir(): string {
  const exported = process.env['VITEST_SYSTEM_TMPDIR']?.trim();
  return exported !== undefined && exported !== '' ? exported : tmpdir();
}

/** `process.getuid` is absent on Windows, where tsx uses a named pipe and no `sun_path` limit applies. */
const CURRENT_UID = process.getuid?.();

const TEST_SCRATCH_ROOT =
  CURRENT_UID === undefined
    ? IN_REPO_SCRATCH_ROOT
    : resolveTestScratchRoot(IN_REPO_SCRATCH_ROOT, systemTmpDir(), CURRENT_UID);

/**
 * Creates the scratch root if absent and returns it. Safe to call repeatedly.
 *
 * In a deep checkout (a vote scratch checkout, for one) this is a short
 * directory under the system temp dir instead of the in-repo root — see
 * {@link resolveTestScratchRoot} (#6615).
 */
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
