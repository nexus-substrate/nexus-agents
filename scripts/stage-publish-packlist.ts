/**
 * Cross-check the stage's packlist between npm and pnpm (#6488, item 2).
 *
 * `unpackedBundleMembers` proves the tarball carries every package npm's
 * installer expects from the bundle, but it reads `npm pack`'s file list. The
 * tarball that reaches the registry is packed by pnpm (`changeset publish` →
 * `pnpm publish`, which follows `publishConfig.directory` to the stage). The
 * two packers apply `files`, `.npmignore` and bundle rules with separate code,
 * so a pnpm upgrade could drop files the npm-side guard still sees. This
 * module packs the stage with pnpm the way a publish does and refuses any
 * difference.
 *
 * pnpm 9.15 has no `pack --dry-run`; `pack --json` writes a real tarball and
 * prints its file list, so the tarball goes to a throwaway directory.
 *
 * @module scripts/stage-publish-packlist
 * (Source: Issue #6488)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** How many differing paths each direction's error names. */
const SHOWN_DIFFERENCES = 10;

function describeOnly(side: string, paths: readonly string[]): string {
  const shown = paths.slice(0, SHOWN_DIFFERENCES).join(', ');
  const more = paths.length > SHOWN_DIFFERENCES ? ', …' : '';
  return `${String(paths.length)} file(s) only in ${side}'s packlist: ${shown}${more}`;
}

/**
 * Throw unless npm and pnpm would publish exactly the same file set. An empty
 * list on either side is an error, never a vacuous match: both packers always
 * include `package.json`, so empty means the listing failed.
 */
export function assertSamePacklist(
  npmFiles: readonly string[],
  pnpmFiles: readonly string[]
): void {
  if (npmFiles.length === 0) throw new Error('npm pack listed no files');
  if (pnpmFiles.length === 0) throw new Error('pnpm pack listed no files');
  const npm = new Set(npmFiles);
  const pnpm = new Set(pnpmFiles);
  const onlyNpm = [...npm].filter((path) => !pnpm.has(path)).sort();
  const onlyPnpm = [...pnpm].filter((path) => !npm.has(path)).sort();
  const reasons = [
    ...(onlyNpm.length > 0 ? [describeOnly('npm', onlyNpm)] : []),
    ...(onlyPnpm.length > 0 ? [describeOnly('pnpm', onlyPnpm)] : []),
  ];
  if (reasons.length > 0) {
    throw new Error(
      `npm and pnpm disagree on what the staged tarball contains ` +
        `(npm ${String(npm.size)}, pnpm ${String(pnpm.size)} files). ` +
        `The bundle guard read npm's list; pnpm packs the published tarball.\n  ${reasons.join('\n  ')}`
    );
  }
}

/** The file paths in `pnpm pack --json` output (pnpm 9: one object). */
export function pnpmPackReportFiles(stdout: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`pnpm pack --json printed output that is not JSON: ${stdout.slice(0, 200)}`);
  }
  const files =
    parsed !== null && typeof parsed === 'object'
      ? (parsed as { files?: unknown }).files
      : undefined;
  if (!Array.isArray(files) || files.length === 0) throw new Error('pnpm pack listed no files');
  return files.map((entry) => String((entry as { path?: unknown }).path));
}

/**
 * Pack `packageDir` with pnpm as `changeset publish` does — hoisted linker,
 * `publishConfig.directory` honoured, so the STAGE is what gets packed — and
 * return the tarball's file list. The tarball itself is discarded.
 */
export function pnpmPackedFileList(packageDir: string): string[] {
  const dest = mkdtempSync(join(tmpdir(), 'nexus-pnpm-pack-'));
  try {
    const stdout = execFileSync('pnpm', ['pack', '--json', '--pack-destination', dest], {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, npm_config_node_linker: 'hoisted' },
    });
    return pnpmPackReportFiles(stdout);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}
