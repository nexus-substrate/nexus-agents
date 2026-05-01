/**
 * Portable nexus-agents installer (#3a, child of #2301).
 *
 * `installPortable()` runs `npm install nexus-agents@<version>` into the
 * workspace-local `.nexus-agents/cli/` directory and writes a bin shim at
 * `.nexus-agents/bin/nexus-agents` pointing at the installed dist entry.
 *
 * Version pin: defaults to the CURRENTLY RUNNING nexus-agents version
 * (read from `VERSION` baked at build time), NOT npm `latest`. Pinning to
 * the running version avoids the silent-upgrade footgun the contrarian
 * flagged in the #3a vote (#2311). To track latest, use the separate
 * `--update` flag (Child #3b — deferred).
 *
 * `uninstallPortable()` removes `.nexus-agents/cli/` and
 * `.nexus-agents/bin/`. Preserves the data subdirs (memory, audit, voting,
 * sessions, …) — uninstall is the inverse of install only, never of init.
 *
 * Subprocess: uses `execFile` with a literal package name and the resolved
 * version as separate args — never shell-interpolated. No user-controlled
 * input reaches the npm command line.
 *
 * @module cli/portable-installer
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { VERSION } from '../version.js';
import { writeBinShim, type WriteBinShimResult } from './bin-shim.js';

const execFileAsync = promisify(execFile);

/** Subdirectory under the data dir that holds the npm-installed CLI. */
export const CLI_SUBDIR = 'cli';
/** Subdirectory under the data dir that holds the executable shim. */
export const BIN_SUBDIR = 'bin';
/** Path inside the install where the CLI entry lives. */
const CLI_ENTRY_RELATIVE = 'node_modules/nexus-agents/dist/cli.js';

/** Hard cap on subprocess time. ~390MB install over slow link can be slow. */
const NPM_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/** Options accepted by {@link installPortable}. */
export interface InstallPortableOptions {
  /** The `.nexus-agents/` data directory (already created). */
  readonly dataDir: string;
  /** Allow re-installing into an already-populated cli/ dir. Default false. */
  readonly force?: boolean;
  /** Version specifier to install. Defaults to the running CLI's VERSION. */
  readonly version?: string;
  /** Report what would be done without writing or spawning npm. Default false. */
  readonly dryRun?: boolean;
}

/** Options accepted by {@link uninstallPortable}. */
export interface UninstallPortableOptions {
  /** The `.nexus-agents/` data directory whose cli/ + bin/ subdirs are removed. */
  readonly dataDir: string;
  /** Report what would be removed without touching disk. Default false. */
  readonly dryRun?: boolean;
}

/** Outcome of an install. */
export interface InstallPortableResult {
  readonly success: boolean;
  readonly version: string;
  readonly cliDir: string;
  readonly binDir: string;
  readonly shim?: WriteBinShimResult;
  readonly skipped: boolean;
  readonly error: string | null;
}

/** Outcome of an uninstall. */
export interface UninstallPortableResult {
  readonly success: boolean;
  readonly removed: readonly string[];
  readonly notPresent: readonly string[];
  readonly error: string | null;
}

/**
 * Returns the version string to install. Refuses to install dev builds —
 * the running CLI must have a published npm version to pin to.
 */
function resolveInstallVersion(
  override: string | undefined
): { ok: true; value: string } | { ok: false; error: string } {
  const v = override ?? VERSION;
  if (v === 'dev' || v === '' || v.includes(' ')) {
    return {
      ok: false,
      error:
        `cannot resolve install version: got '${v}'. ` +
        `Portable install requires a published nexus-agents version (build the CLI from a release).`,
    };
  }
  return { ok: true, value: v };
}

/**
 * Writes a minimal package.json at the install root so `npm install` knows
 * what to do. The package itself isn't published — it's just a dependency
 * holder for the npm-resolved nexus-agents.
 */
function writeInstallManifest(cliDir: string, version: string): void {
  const manifest = {
    name: 'nexus-agents-portable-shim',
    private: true,
    version: '0.0.0',
    description: 'Local install root for portable nexus-agents (generated; do not commit)',
    dependencies: { 'nexus-agents': version },
  };
  writeFileSync(join(cliDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/** Checks whether the cli/ dir already has node_modules from a prior install. */
function isAlreadyInstalled(cliDir: string): boolean {
  return existsSync(join(cliDir, 'node_modules', 'nexus-agents', 'package.json'));
}

/** Spawns `npm install` in the cli dir. Throws on non-zero exit. */
async function spawnNpmInstall(cliDir: string): Promise<void> {
  await execFileAsync('npm', ['install', '--no-audit', '--no-fund', '--silent'], {
    cwd: cliDir,
    timeout: NPM_INSTALL_TIMEOUT_MS,
  });
}

/** Best-effort cleanup after an install failure. */
function cleanupOnFailure(cliDir: string): void {
  try {
    rmSync(cliDir, { recursive: true, force: true });
  } catch {
    // Ignore — primary error already surfaced to caller.
  }
}

/** Installs nexus-agents into `<dataDir>/cli/` and writes the bin shim. */
export async function installPortable(
  options: InstallPortableOptions
): Promise<InstallPortableResult> {
  const cliDir = join(options.dataDir, CLI_SUBDIR);
  const binDir = join(options.dataDir, BIN_SUBDIR);
  const versionResolution = resolveInstallVersion(options.version);
  if (!versionResolution.ok) {
    return {
      success: false,
      version: '',
      cliDir,
      binDir,
      skipped: false,
      error: versionResolution.error,
    };
  }
  const version = versionResolution.value;

  if (isAlreadyInstalled(cliDir) && options.force !== true) {
    return { success: true, version, cliDir, binDir, skipped: true, error: null };
  }

  if (options.dryRun === true) {
    return { success: true, version, cliDir, binDir, skipped: false, error: null };
  }

  try {
    if (!existsSync(cliDir)) mkdirSync(cliDir, { recursive: true });
    writeInstallManifest(cliDir, version);
    await spawnNpmInstall(cliDir);
  } catch (error: unknown) {
    cleanupOnFailure(cliDir);
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      version,
      cliDir,
      binDir,
      skipped: false,
      error: `npm install failed: ${msg}`,
    };
  }

  const shim = writeBinShim({
    binDir,
    cliEntryPath: join(cliDir, CLI_ENTRY_RELATIVE),
  });
  if (!shim.success) {
    cleanupOnFailure(cliDir);
    return {
      success: false,
      version,
      cliDir,
      binDir,
      shim,
      skipped: false,
      error: `bin shim emission failed: ${shim.error ?? 'unknown'}`,
    };
  }

  return { success: true, version, cliDir, binDir, shim, skipped: false, error: null };
}

/** Removes `<dataDir>/cli/` and `<dataDir>/bin/`. Preserves data subdirs. */
export function uninstallPortable(options: UninstallPortableOptions): UninstallPortableResult {
  const cliDir = join(options.dataDir, CLI_SUBDIR);
  const binDir = join(options.dataDir, BIN_SUBDIR);
  const removed: string[] = [];
  const notPresent: string[] = [];
  const dryRun = options.dryRun === true;

  try {
    for (const dir of [cliDir, binDir]) {
      if (!existsSync(dir)) {
        notPresent.push(dir);
        continue;
      }
      if (!dryRun) rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    }
    return { success: true, removed, notPresent, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, removed, notPresent, error: msg };
  }
}

/** Returns the absolute path of the bin shim, or undefined if not present. */
export function findBinShim(dataDir: string): string | undefined {
  const shimPath = join(dataDir, BIN_SUBDIR, 'nexus-agents');
  return existsSync(shimPath) ? shimPath : undefined;
}
