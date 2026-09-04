#!/usr/bin/env -S pnpm exec tsx
/**
 * Ratchet: what runs on a user's machine at install time (#5427).
 *
 * #5388 removed `better-sqlite3` because its install script broke end users
 * where scripts are blocked — `npm install --ignore-scripts` exited 0 and the
 * CLI then died at runtime. Its merge commit recorded the outcome as
 * "the nexus-agents runtime dependency graph now contains ZERO packages with
 * install scripts". That was already false when measured: four production
 * packages declare one. Nothing was watching, so the claim drifted.
 *
 * This is the thing that watches. It walks a REAL `npm install` of the packed
 * tarball and compares every `preinstall`/`install`/`postinstall` it finds
 * against `install-script-allowlist.json`, in both directions:
 *
 * - a script that is not allowlisted fails (a new one arrived);
 * - an allowlisted package that is gone fails (the allowlist may only shrink,
 *   never quietly authorize more than exists);
 * - an allowlisted package whose script BODY changed fails (the name alone
 *   does not pin what the script does).
 *
 * **It must not be pointed at this repo's `node_modules`.** `pnpm.overrides`
 * is repo-local and unpublished, and pnpm resolves differently from npm: the
 * workspace tree carries `protobufjs@8.8.0`, which has no `postinstall`, while
 * a user gets `protobufjs@7.6.6`, which has one. Measuring the workspace would
 * report three scripts where a user runs four, and would be structurally blind
 * to the fourth.
 *
 * `prepare` is excluded on purpose: npm runs a dependency's `prepare` only for
 * git and directory installs, never for a registry tarball. Counting it would
 * fail permanently against ~15 innocent packages.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-install-scripts.ts <path/to/node_modules>
 *
 * @module scripts/check-install-scripts
 * (Source: Issue #5427)
 */
/* eslint-disable no-console -- this is a CLI gate; its report IS stdout. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The hooks npm actually executes when installing a dependency from the
 * registry. `prepare` is not one of them — see the module note.
 */
export const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall'] as const;
export type InstallHook = (typeof INSTALL_HOOKS)[number];

/** One package in the scanned tree that declares at least one install hook. */
export interface InstallScriptEntry {
  readonly name: string;
  readonly version: string;
  readonly hooks: Readonly<Record<string, string>>;
}

/** One permitted package, with the exact script bodies it is permitted to run. */
export interface AllowlistEntry {
  readonly name: string;
  readonly hooks: Readonly<Record<string, string>>;
  readonly why: string;
}

export interface Allowlist {
  readonly minimumPackagesScanned: number;
  readonly allowed: readonly AllowlistEntry[];
}

/** What a scan of an installed tree found. */
export interface ScanResult {
  /** Every `package.json` read, whether or not it declared a hook. The floor
   * is checked against this: an empty or near-empty scan means the path was
   * wrong, and a diff over nothing would otherwise pass. */
  readonly scanned: number;
  readonly entries: readonly InstallScriptEntry[];
}

interface RawManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly scripts?: unknown;
}

function readManifest(path: string): RawManifest | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function installHooksOf(manifest: RawManifest): Record<string, string> {
  const scripts = manifest.scripts;
  if (typeof scripts !== 'object' || scripts === null) return {};
  const bag = scripts as Record<string, unknown>;
  const hooks: Record<string, string> = {};
  for (const hook of INSTALL_HOOKS) {
    const body = bag[hook];
    if (typeof body === 'string') hooks[hook] = body;
  }
  return hooks;
}

/**
 * Walk an installed `node_modules` tree, collecting every package that
 * declares an install hook.
 *
 * Recurses through scoped directories and nested `node_modules`, which npm
 * creates whenever a version conflict defeats hoisting — a nested copy runs
 * its install script exactly like a hoisted one.
 */
export function scanInstalledTree(nodeModulesDir: string): ScanResult {
  const entries: InstallScriptEntry[] = [];
  const seen = new Set<string>();
  let scanned = 0;

  const visitPackageDir = (dir: string): void => {
    const manifest = readManifest(join(dir, 'package.json'));
    if (manifest !== null && typeof manifest.name === 'string') {
      scanned += 1;
      const hooks = installHooksOf(manifest);
      const version = typeof manifest.version === 'string' ? manifest.version : 'unknown';
      const key = `${manifest.name}@${version}`;
      if (Object.keys(hooks).length > 0 && !seen.has(key)) {
        seen.add(key);
        entries.push({ name: manifest.name, version, hooks });
      }
    }
    const nested = join(dir, 'node_modules');
    if (isDirectory(nested)) walk(nested);
  };

  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === '.bin' || name === '.package-lock.json') continue;
      const full = join(dir, name);
      if (!isDirectory(full)) continue;
      if (name.startsWith('@')) {
        // A scope directory holds packages, not a package.
        for (const scoped of safeReaddir(full)) {
          const scopedDir = join(full, scoped);
          if (isDirectory(scopedDir)) visitPackageDir(scopedDir);
        }
        continue;
      }
      visitPackageDir(full);
    }
  };

  walk(nodeModulesDir);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { scanned, entries };
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function describeHooks(hooks: Readonly<Record<string, string>>): string {
  return Object.entries(hooks)
    .map(([hook, body]) => `${hook}: ${body}`)
    .join(' | ');
}

/**
 * Compare a scan against the allowlist. Returns one human-readable problem per
 * violation, empty when the tree matches exactly.
 *
 * The scanned-count floor is a real check, not decoration: point this at a
 * path that does not exist and the walk yields zero entries, the diff finds
 * nothing to complain about, and a broken gate reports success. Naming the
 * empty case is the difference between a check and a formality.
 */
export function diffAgainstAllowlist(scan: ScanResult, allowlist: Allowlist): string[] {
  const problems: string[] = [];

  if (scan.scanned < allowlist.minimumPackagesScanned) {
    problems.push(
      `scanned only ${String(scan.scanned)} packages (floor ${String(allowlist.minimumPackagesScanned)}) — ` +
        'the tree is missing or the path is wrong, so this run proves nothing'
    );
    return problems;
  }

  const allowed = new Map(allowlist.allowed.map((entry) => [entry.name, entry]));
  const found = new Map(scan.entries.map((entry) => [entry.name, entry]));

  for (const entry of scan.entries) {
    const permitted = allowed.get(entry.name);
    if (permitted === undefined) {
      problems.push(
        `NEW install script: ${entry.name}@${entry.version} runs [${describeHooks(entry.hooks)}]. ` +
          'Verify the CLI still works when it is blocked, then allowlist it with a reason.'
      );
      continue;
    }
    if (describeHooks(entry.hooks) !== describeHooks(permitted.hooks)) {
      problems.push(
        `CHANGED install script: ${entry.name}@${entry.version} now runs [${describeHooks(entry.hooks)}], ` +
          `allowlisted as [${describeHooks(permitted.hooks)}]. Re-verify before updating the allowlist.`
      );
    }
  }

  for (const entry of allowlist.allowed) {
    if (!found.has(entry.name)) {
      problems.push(
        `STALE allowlist entry: ${entry.name} no longer declares an install script (or is gone). ` +
          'Remove it — the allowlist may only shrink on its own.'
      );
    }
  }

  return problems;
}

/** Load and validate the allowlist file. Throws rather than defaulting: a
 * malformed allowlist that fell back to `{ allowed: [] }` would turn every
 * benign script into a failure, and one that fell back to "allow all" would
 * turn the gate off. Neither default is safe, so there is none. */
export function parseAllowlist(json: string): Allowlist {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('allowlist must be a JSON object');
  }
  const raw = parsed as { minimumPackagesScanned?: unknown; allowed?: unknown };
  if (typeof raw.minimumPackagesScanned !== 'number' || raw.minimumPackagesScanned <= 0) {
    throw new Error('allowlist needs a positive `minimumPackagesScanned`');
  }
  if (!Array.isArray(raw.allowed)) {
    throw new Error('allowlist needs an `allowed` array');
  }
  const allowed = raw.allowed.map((item: unknown, index: number): AllowlistEntry => {
    const entry = item as { name?: unknown; hooks?: unknown; why?: unknown };
    if (typeof entry.name !== 'string' || entry.name === '') {
      throw new Error(`allowed[${String(index)}] needs a name`);
    }
    if (typeof entry.why !== 'string' || entry.why === '') {
      throw new Error(`allowed[${String(index)}] (${entry.name}) needs a non-empty \`why\``);
    }
    if (typeof entry.hooks !== 'object' || entry.hooks === null) {
      throw new Error(`allowed[${String(index)}] (${entry.name}) needs a \`hooks\` object`);
    }
    const hooks: Record<string, string> = {};
    for (const [hook, body] of Object.entries(entry.hooks as Record<string, unknown>)) {
      if (typeof body !== 'string') {
        throw new Error(`${entry.name}.hooks.${hook} must be a string`);
      }
      hooks[hook] = body;
    }
    if (Object.keys(hooks).length === 0) {
      throw new Error(`${entry.name} is allowlisted with no hooks — it does not belong here`);
    }
    return { name: entry.name, hooks, why: entry.why };
  });
  return { minimumPackagesScanned: raw.minimumPackagesScanned, allowed };
}

export const ALLOWLIST_PATH = fileURLToPath(
  new URL('./install-script-allowlist.json', import.meta.url)
);

function main(): void {
  const target = process.argv[2];
  if (target === undefined || target === '') {
    console.error('usage: check-install-scripts.ts <path/to/node_modules>');
    console.error('       (an npm install of the PACKED TARBALL, never this workspace)');
    process.exit(2);
  }

  const allowlist = parseAllowlist(readFileSync(ALLOWLIST_PATH, 'utf-8'));
  const scan = scanInstalledTree(target);
  const problems = diffAgainstAllowlist(scan, allowlist);

  console.log(`Scanned ${String(scan.scanned)} installed packages under ${target}`);
  for (const entry of scan.entries) {
    console.log(`  ${entry.name}@${entry.version}  [${describeHooks(entry.hooks)}]`);
  }

  if (problems.length > 0) {
    console.error(`\n${String(problems.length)} install-script problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nAllowlist: scripts/install-script-allowlist.json (#5427)');
    process.exit(1);
  }

  console.log(
    `\nOK — ${String(scan.entries.length)} install script(s), all allowlisted with unchanged bodies.`
  );
}

// Guard the CLI so the test file can import the pure helpers without a run.
if (process.argv[1]?.endsWith('check-install-scripts.ts') === true) {
  main();
}
