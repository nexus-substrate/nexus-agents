/**
 * Stage the publishable `nexus-agents` package with its install-script
 * dependencies BUNDLED (#6481).
 *
 * Four packages in the published dependency graph declare an install hook:
 * `@ast-grep/lang-go`, `@ast-grep/lang-python` (verify a prebuilt `.so` that
 * already ships in their tarball), `@google/genai` (`echo`) and `protobufjs`
 * (transitive through genai). A package cannot pre-approve its dependencies'
 * scripts, so a consent-gated package manager asks the USER — and pnpm 12 in a
 * terminal stops at an interactive "Choose which packages to build" prompt
 * with nothing installed, while npm 12 under `strict-allow-scripts` exits 1.
 *
 * A dependency listed in `bundleDependencies` arrives inside our tarball
 * instead of being fetched and installed, so neither manager treats it as an
 * install: measured in containers, npm 12 (default and strict) and pnpm 12
 * (TTY and not) install with no prompt, no warning and no script executed, and
 * the grammar `.so` still loads. npm 10/11 run bundled scripts exactly as they
 * run every other script today.
 *
 * pnpm refuses to pack `bundleDependencies` under `node-linker=isolated`, and
 * the workspace must stay isolated. So the bundle is built HERE, in a staging
 * directory populated by npm, and `publishConfig.directory` points `pnpm
 * publish` (via `changeset publish`) at it. The source manifest never carries
 * `bundleDependencies`, which keeps the workspace install untouched.
 *
 * Usage:
 *   pnpm exec tsx scripts/stage-publish.ts                 # stage only
 *   pnpm exec tsx scripts/stage-publish.ts --pack <dir>    # stage, then npm pack into <dir>
 *
 * Requires a built `packages/nexus-agents/dist`.
 *
 * @module scripts/stage-publish
 * (Source: Issue #6481)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROOT } from './script-paths.js';

const PACKAGE_DIR = join(ROOT, 'packages/nexus-agents');

/** Must equal `publishConfig.directory` in the package manifest. */
export const STAGE_DIRNAME = '.publish-stage';

/**
 * Direct dependencies shipped inside the tarball. The first three carry, or
 * pull in, an install hook (`protobufjs` rides in with `@google/genai`).
 *
 * `@modelcontextprotocol/sdk` has no hook. It is here because `@google/genai`
 * declares it as an optional PEER, and npm's installer counts a bundled
 * package's installed peers (and their whole closure: zod, express, ajv…) as
 * part of the bundle while `npm pack` leaves peers out. Without it, a consumer
 * install gets EMPTY directories for ~90 packages and the CLI cannot start —
 * measured. {@link unpackedBundleMembers} is the check that catches that.
 *
 * Shrink this when upstream drops the hooks (#5457).
 */
export const BUNDLED_DEPENDENCIES: readonly string[] = [
  '@ast-grep/lang-go',
  '@ast-grep/lang-python',
  '@google/genai',
  '@modelcontextprotocol/sdk',
];

type Manifest = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  publishConfig?: Record<string, unknown>;
};

/**
 * Turn the source manifest into the one that ships.
 *
 * - `bundleDependencies` is added; every entry must be a real runtime dependency,
 *   or npm would silently bundle nothing for it.
 * - `devDependencies` is dropped: npm cannot resolve its `workspace:` specs, and
 *   a consumer never installs them.
 * - `prepublishOnly` is dropped: it rebuilds `dist/` in the SOURCE directory,
 *   which the stage already copied; running it here would build nothing.
 * - `publishConfig.directory` / `linkDirectory` are dropped: they describe the
 *   source layout, not the published one.
 */
export function stageManifest(source: Manifest, bundled: readonly string[]): Manifest {
  const deps = source.dependencies ?? {};
  const missing = bundled.filter((name) => deps[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `bundleDependencies names packages that are not runtime dependencies: ${missing.join(', ')}`
    );
  }
  const { devDependencies: _dev, ...rest } = source;
  const scripts = { ...(source.scripts ?? {}) };
  delete scripts['prepublishOnly'];
  const publishConfig = { ...(source.publishConfig ?? {}) };
  delete publishConfig['directory'];
  delete publishConfig['linkDirectory'];
  return { ...rest, scripts, publishConfig, bundleDependencies: [...bundled] };
}

/** A bundled package that did not land in the stage's `node_modules`. */
export function missingFromStage(stageDir: string, bundled: readonly string[]): string[] {
  return bundled.filter(
    (name) => !existsSync(join(stageDir, 'node_modules', name, 'package.json'))
  );
}

/**
 * Packages npm's installer will treat as supplied by the bundle but that the
 * tarball does not contain. npm marks them `inBundle` in the stage's hidden
 * lockfile; `packedFiles` is `npm pack --dry-run --json`'s file list. Any entry
 * here becomes an empty directory on a consumer's machine.
 */
export function unpackedBundleMembers(
  hiddenLockfile: { packages?: Record<string, { inBundle?: boolean }> },
  packedFiles: readonly string[]
): string[] {
  const packed = new Set(packedFiles);
  return Object.entries(hiddenLockfile.packages ?? {})
    .filter(([, meta]) => meta.inBundle === true)
    .map(([path]) => path)
    .filter((path) => !packed.has(`${path}/package.json`))
    .sort();
}

type PackReport = { files?: Array<{ path: string }> };

/**
 * The first package report from `npm pack --dry-run --json`: an array through
 * npm 11, an object keyed by package name from npm 12.
 */
export function firstPackReport(parsed: unknown): PackReport | undefined {
  if (Array.isArray(parsed)) return parsed[0] as PackReport | undefined;
  if (parsed !== null && typeof parsed === 'object') {
    return Object.values(parsed as Record<string, PackReport>)[0];
  }
  return undefined;
}

function packedFileList(stageDir: string): string[] {
  const parsed: unknown = JSON.parse(
    run('npm', ['pack', '--dry-run', '--json', '--silent'], stageDir)
  );
  const files = firstPackReport(parsed)?.files;
  if (files === undefined || files.length === 0)
    throw new Error('npm pack --dry-run listed no files');
  return files.map((f) => f.path);
}

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

/** Build the stage directory and return its path. */
export function stage(): string {
  if (!existsSync(join(PACKAGE_DIR, 'dist'))) {
    throw new Error('packages/nexus-agents/dist is missing — build before staging');
  }
  const stageDir = join(PACKAGE_DIR, STAGE_DIRNAME);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir);

  // `npm pack` applies the manifest's `files` list exactly as a publish would.
  // It is npm, not pnpm, on purpose: npm ignores `publishConfig.directory`, so
  // this packs the SOURCE rather than the (empty) stage.
  const packDir = mkdtempSync(join(tmpdir(), 'nexus-stage-'));
  try {
    const tarball = run('npm', ['pack', '--pack-destination', packDir, '--silent'], PACKAGE_DIR)
      .trim()
      .split('\n')
      .pop();
    if (tarball === undefined || tarball === '')
      throw new Error('npm pack printed no tarball name');
    run('tar', ['-xzf', join(packDir, tarball), '-C', stageDir, '--strip-components=1'], ROOT);
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }

  const manifestPath = join(stageDir, 'package.json');
  const source = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  writeFileSync(
    manifestPath,
    `${JSON.stringify(stageManifest(source, BUNDLED_DEPENDENCIES), null, 2)}\n`
  );

  // --ignore-scripts: staging must not execute the hooks it exists to keep off
  // users' machines. The lockfile npm writes is never packed.
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stageDir);
  const missing = missingFromStage(stageDir, BUNDLED_DEPENDENCIES);
  if (missing.length > 0) {
    throw new Error(
      `bundled dependencies absent from the stage after install: ${missing.join(', ')}`
    );
  }
  const lock = JSON.parse(
    readFileSync(join(stageDir, 'node_modules', '.package-lock.json'), 'utf8')
  ) as {
    packages?: Record<string, { inBundle?: boolean }>;
  };
  const unpacked = unpackedBundleMembers(lock, packedFileList(stageDir));
  if (unpacked.length > 0) {
    throw new Error(
      `npm will expect ${String(unpacked.length)} package(s) from the bundle that the tarball does not contain ` +
        `(a bundled dependency's peer?): ${unpacked.slice(0, 10).join(', ')}`
    );
  }
  return stageDir;
}

function main(argv: readonly string[]): void {
  const packIndex = argv.indexOf('--pack');
  const packDest = packIndex === -1 ? undefined : argv[packIndex + 1];
  if (packIndex !== -1 && (packDest === undefined || packDest.startsWith('--'))) {
    throw new Error('--pack requires a destination directory');
  }
  const stageDir = stage();
  console.log(`staged ${String(BUNDLED_DEPENDENCIES.length)} bundled dependencies in ${stageDir}`);
  if (packDest !== undefined) {
    mkdirSync(packDest, { recursive: true });
    const name = run('npm', ['pack', '--pack-destination', packDest, '--silent'], stageDir).trim();
    console.log(join(packDest, name.split('\n').pop() ?? name));
  }
}

if (process.argv[1]?.endsWith('stage-publish.ts') === true) {
  main(process.argv.slice(2));
}
