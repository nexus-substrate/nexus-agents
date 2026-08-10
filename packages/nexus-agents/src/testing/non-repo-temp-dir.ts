/**
 * Temp directories guaranteed to sit outside any git repository (#4412).
 *
 * Several tests assert repo-*detection* behavior: "with no `.git` ancestor,
 * resolution returns null / falls through / refuses". They used to get that
 * property by accident — `mkdtemp(os.tmpdir())` lands in `/tmp`, and `/tmp`
 * merely happens not to be inside a checkout.
 *
 * That accident stopped holding when the suite moved its scratch space into
 * the repo to keep off a shared tmpfs. The failure mode is the bad kind: the
 * fixture silently gains a `.git` ancestor and the assertion inverts, so the
 * test reports a product bug that does not exist.
 *
 * This helper states the requirement instead of inheriting it, and verifies
 * it on every call — a fixture that cannot satisfy "outside any repo" throws
 * loudly here rather than producing a misleading assertion failure later.
 *
 * @module testing/non-repo-temp-dir
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Nearest ancestor containing a `.git` entry, or null. */
function findGitAncestor(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Creates a temp directory with no `.git` ancestor.
 *
 * Prefers the real system temp dir, which the test runner exposes as
 * `VITEST_SYSTEM_TMPDIR` because it redirects `TMPDIR` itself.
 *
 * @throws if no repo-free location is available — better a clear failure here
 *   than a test that quietly asserts the opposite of what it means to.
 */
export function mkdtempOutsideRepo(prefix: string): string {
  const base = process.env['VITEST_SYSTEM_TMPDIR']?.trim();
  const root = base !== undefined && base !== '' ? base : tmpdir();

  const dir = mkdtempSync(join(root, prefix));
  const repo = findGitAncestor(dir);
  if (repo !== null) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `mkdtempOutsideRepo("${prefix}") needs a location outside any git repo, but ` +
        `"${root}" is inside the repo at "${repo}". Set VITEST_SYSTEM_TMPDIR to a ` +
        `directory that is not in a checkout.`
    );
  }
  return dir;
}
