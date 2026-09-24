/**
 * Symlink containment fixture for path-guard tests.
 *
 * Builds a scratch directory INSIDE the process cwd holding two symlinks: one
 * that resolves outside the cwd subtree and one that resolves back inside it.
 * A lexical `path.resolve` + `startsWith` guard accepts both; a realpath-aware
 * guard (`security/safe-path.ts`) must reject the first and accept the second.
 *
 * The preconditions are asserted, not assumed: if the scratch dir were not
 * inside cwd, or the outside dir were not outside it, an "is rejected" test
 * would pass for the wrong reason.
 *
 * @module testing/symlink-escape-fixture
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

export interface SymlinkEscapeFixture {
  /** Real directory inside cwd. */
  readonly insideDir: string;
  /** Real directory outside cwd. */
  readonly outsideDir: string;
  /** Directory symlink inside cwd whose target is {@link outsideDir}. */
  readonly linkOut: string;
  /** Directory symlink inside cwd whose target is `insideDir/real`. */
  readonly linkIn: string;
  /** Removes both directories. */
  cleanup(): void;
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Each directory gets `feed.json` (`[]`), `plan.md` and `a.ts`, so a caller
 * can point any file-reading guard at `linkOut/<file>` or `linkIn/<file>`.
 */
export function createSymlinkEscapeFixture(): SymlinkEscapeFixture {
  const cwd = realpathSync(process.cwd());
  const insideDir = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-symlink-in-')));
  const systemTmp = process.env['VITEST_SYSTEM_TMPDIR'] ?? '/tmp';
  const outsideDir = realpathSync(mkdtempSync(join(systemTmp, 'nexus-symlink-out-')));
  if (!isInside(cwd, insideDir) || isInside(cwd, outsideDir)) {
    rmSync(insideDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
    throw new Error(
      `symlink fixture precondition failed: inside=${insideDir} outside=${outsideDir} cwd=${cwd}`
    );
  }
  const realDir = join(insideDir, 'real');
  mkdirSync(realDir);
  for (const dir of [realDir, outsideDir]) {
    writeFileSync(join(dir, 'feed.json'), '[]');
    writeFileSync(join(dir, 'plan.md'), '# plan');
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  }
  const linkOut = join(insideDir, 'escape');
  const linkIn = join(insideDir, 'alias');
  symlinkSync(outsideDir, linkOut, 'dir');
  symlinkSync(realDir, linkIn, 'dir');
  return {
    insideDir,
    outsideDir,
    linkOut,
    linkIn,
    cleanup: () => {
      rmSync(insideDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    },
  };
}
