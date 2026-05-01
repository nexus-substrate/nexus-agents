/**
 * `nexus-agents init --portable` command (#2305, child of #2301).
 *
 * Bootstraps a workspace-local nexus-agents data directory so the runtime
 * state (memory, learning, audit, voting, sessions, …) lives under the
 * workspace instead of `~/.nexus-agents`. Pairs with `NEXUS_DATA_DIR`
 * (#2302): users `init --portable` to scaffold the dir, then export the
 * env var to activate it.
 *
 * Explicitly does NOT auto-detect or auto-load configs from CWD ancestors —
 * walk-up discovery is deferred to a separate child of #2301 with a
 * security design pass per CVE-2022-24765.
 *
 * @module cli/init-portable
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  appendFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { DATA_SUBDIRECTORIES } from './doctor.js';
import { emitMcpConfig, type EmitMcpConfigResult } from './mcp-config-emitter.js';
import {
  installPortable,
  uninstallPortable,
  findBinShim,
  type InstallPortableResult,
  type UninstallPortableResult,
} from './portable-installer.js';

/** Default folder name created when the user passes no path. */
export const DEFAULT_PORTABLE_DIRNAME = '.nexus-agents';

/** Subdirs requiring restrictive 0o700 perms — same set as setup-data-dir. */
const RESTRICTED_SUBDIRS = new Set(['auth']);

/** Options accepted by `nexus-agents init --portable`. */
export interface InitPortableOptions {
  /** Target directory. If relative, resolved against `process.cwd()`. Defaults to `./.nexus-agents`. */
  readonly path?: string;
  /** Force creation in a non-empty existing directory. Default false. */
  readonly force?: boolean;
  /** Report what would be created without writing. Default false. */
  readonly dryRun?: boolean;
  /** Append the data dir to a sibling `.gitignore` (only if `.git` exists). Default false. */
  readonly gitignore?: boolean;
  /** Also emit a workspace-local `.mcp.json` pointing at this data dir (#2308). Default false. */
  readonly mcpConfig?: boolean;
  /** Install nexus-agents into `<dataDir>/cli/` and emit a bin shim (#2311). Default false. */
  readonly install?: boolean;
  /** Remove `<dataDir>/cli/` and `<dataDir>/bin/` (#2311). Default false. Mutually exclusive with --install. */
  readonly uninstall?: boolean;
}

/** Result of an init-portable invocation. */
export interface InitPortableResult {
  readonly success: boolean;
  readonly absolutePath: string;
  readonly created: readonly string[];
  readonly alreadyExisted: readonly string[];
  readonly skipped: boolean;
  readonly gitignoreUpdated: boolean;
  /** Set when `--mcp-config` was passed; describes the .mcp.json emission. */
  readonly mcpConfig?: EmitMcpConfigResult;
  /** Set when `--install` was passed; describes the npm install + bin shim. */
  readonly install?: InstallPortableResult;
  /** Set when `--uninstall` was passed; describes the cleanup. */
  readonly uninstall?: UninstallPortableResult;
  readonly error: string | null;
}

/** Resolves the target absolute path. */
function resolveTargetPath(rawPath: string | undefined): string {
  if (rawPath === undefined || rawPath === '') {
    return resolve(process.cwd(), DEFAULT_PORTABLE_DIRNAME);
  }
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

/** Returns true if `dir` exists and contains any entries. */
function isNonEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  const stat = statSync(dir);
  if (!stat.isDirectory()) return true; // a file at the path is "non-empty" for our purposes
  return readdirSync(dir).length > 0;
}

/** Creates one directory (or records it as already-existing). */
function ensureDir(
  path: string,
  dryRun: boolean,
  created: string[],
  alreadyExisted: string[],
  mode?: number
): void {
  if (existsSync(path)) {
    alreadyExisted.push(path);
    return;
  }
  if (!dryRun) {
    mkdirSync(path, { recursive: true, ...(mode !== undefined ? { mode } : {}) });
  }
  created.push(path);
}

/** Appends the portable dir name to .gitignore when a git repo is detected. */
function maybeUpdateGitignore(
  workspaceDir: string,
  portableDirName: string,
  dryRun: boolean
): boolean {
  const gitDir = join(workspaceDir, '.git');
  if (!existsSync(gitDir)) return false;
  const gitignorePath = join(workspaceDir, '.gitignore');
  const entry = `${portableDirName}/`;
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, 'utf-8');
    if (existing.split('\n').some((l) => l.trim() === entry || l.trim() === portableDirName)) {
      return false;
    }
  }
  if (!dryRun) {
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    appendFileSync(gitignorePath, `${sep}${entry}\n`, 'utf-8');
  }
  return true;
}

/** Inspects target path and classifies its current state. */
interface TargetState {
  exists: boolean;
  nonEmpty: boolean;
  isExistingNexusDir: boolean;
}

function inspectTarget(target: string): TargetState {
  const exists = existsSync(target);
  if (!exists) return { exists: false, nonEmpty: false, isExistingNexusDir: false };
  const nonEmpty = isNonEmpty(target);
  const stat = statSync(target);
  const isExistingNexusDir = stat.isDirectory() && existsSync(join(target, 'audit'));
  return { exists, nonEmpty, isExistingNexusDir };
}

/** Creates the data dir and all subdirs, recording results in `created`/`alreadyExisted`. */
function createDataLayout(
  target: string,
  dryRun: boolean,
  created: string[],
  alreadyExisted: string[]
): void {
  ensureDir(target, dryRun, created, alreadyExisted);
  for (const subdir of DATA_SUBDIRECTORIES) {
    const mode = RESTRICTED_SUBDIRS.has(subdir) ? 0o700 : undefined;
    ensureDir(join(target, subdir), dryRun, created, alreadyExisted, mode);
  }
}

/** Builds the result record from accumulated state. */
function makeResult(opts: {
  success: boolean;
  absolutePath: string;
  created: readonly string[];
  alreadyExisted: readonly string[];
  skipped?: boolean;
  gitignoreUpdated?: boolean;
  mcpConfig?: EmitMcpConfigResult;
  install?: InstallPortableResult;
  uninstall?: UninstallPortableResult;
  error?: string | null;
}): InitPortableResult {
  return {
    success: opts.success,
    absolutePath: opts.absolutePath,
    created: opts.created,
    alreadyExisted: opts.alreadyExisted,
    skipped: opts.skipped ?? false,
    gitignoreUpdated: opts.gitignoreUpdated ?? false,
    ...(opts.mcpConfig !== undefined ? { mcpConfig: opts.mcpConfig } : {}),
    ...(opts.install !== undefined ? { install: opts.install } : {}),
    ...(opts.uninstall !== undefined ? { uninstall: opts.uninstall } : {}),
    error: opts.error ?? null,
  };
}

/** Optionally appends to .gitignore when the option + a sibling .git dir are present. */
function applyGitignoreOption(
  target: string,
  options: InitPortableOptions,
  dryRun: boolean
): boolean {
  if (options.gitignore !== true) return false;
  const workspaceDir = resolve(target, '..');
  const portableName = target.slice(workspaceDir.length + 1);
  return maybeUpdateGitignore(workspaceDir, portableName, dryRun);
}

/** Optionally emits a workspace-local `.mcp.json` (#2308 + #2311 commandPath wiring). */
function applyMcpConfigOption(
  target: string,
  options: InitPortableOptions,
  dryRun: boolean
): EmitMcpConfigResult | undefined {
  if (options.mcpConfig !== true) return undefined;
  const workspaceDir = resolve(target, '..');
  const shimPath = findBinShim(target);
  return emitMcpConfig({
    workspaceDir,
    dataDir: target,
    ...(shimPath !== undefined && { commandPath: shimPath }),
    force: options.force === true,
    dryRun,
  });
}

/** Optionally installs nexus-agents into `<dataDir>/cli/` (#2311). */
async function applyInstallOption(
  target: string,
  options: InitPortableOptions,
  dryRun: boolean
): Promise<InstallPortableResult | undefined> {
  if (options.install !== true) return undefined;
  return installPortable({ dataDir: target, force: options.force === true, dryRun });
}

/** Builds the success-path result with optional install + mcp-config + gitignore outcomes. */
function buildSuccessResult(
  base: { absolutePath: string; created: readonly string[]; alreadyExisted: readonly string[] },
  flags: { skipped?: boolean; gitignoreUpdated?: boolean },
  extras: { install?: InstallPortableResult; mcpConfig?: EmitMcpConfigResult }
): InitPortableResult {
  const installFailed = extras.install !== undefined && !extras.install.success;
  const mcpFailed = extras.mcpConfig !== undefined && !extras.mcpConfig.success;
  if (installFailed) {
    return makeResult({
      ...base,
      ...flags,
      success: false,
      ...extras,
      error: extras.install?.error ?? 'install failed',
    });
  }
  if (mcpFailed) {
    return makeResult({
      ...base,
      ...flags,
      success: false,
      ...extras,
      error: extras.mcpConfig?.error ?? 'mcp-config emission failed',
    });
  }
  return makeResult({ ...base, ...flags, success: true, ...extras });
}

/** Collects optional install + mcp-config side effects, omitting unset keys. */
async function collectExtras(
  target: string,
  options: InitPortableOptions,
  dryRun: boolean
): Promise<{ install?: InstallPortableResult; mcpConfig?: EmitMcpConfigResult }> {
  const extras: { install?: InstallPortableResult; mcpConfig?: EmitMcpConfigResult } = {};
  const install = await applyInstallOption(target, options, dryRun);
  if (install !== undefined) extras.install = install;
  const mcpConfig = applyMcpConfigOption(target, options, dryRun);
  if (mcpConfig !== undefined) extras.mcpConfig = mcpConfig;
  return extras;
}

/** Handles the --uninstall path: removes cli/ and bin/, preserves data subdirs. */
function handleUninstall(
  target: string,
  base: { absolutePath: string; created: readonly string[]; alreadyExisted: readonly string[] },
  dryRun: boolean
): InitPortableResult {
  const uninstall = uninstallPortable({ dataDir: target, dryRun });
  return makeResult({
    ...base,
    success: uninstall.success,
    uninstall,
    error: uninstall.error,
  });
}

/**
 * Bootstraps a workspace-local nexus-agents data directory.
 *
 * Idempotent: re-running on an already-initialized dir is a no-op success.
 * Refuses to create in a non-empty pre-existing directory unless `force=true`.
 *
 * Async because `--install` spawns `npm install` (#2311). When neither
 * `--install` nor `--uninstall` is set, no subprocess is spawned and the
 * function resolves immediately.
 */
export async function initPortable(options: InitPortableOptions = {}): Promise<InitPortableResult> {
  const created: string[] = [];
  const alreadyExisted: string[] = [];
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const target = resolveTargetPath(options.path);
  const base = { absolutePath: target, created, alreadyExisted };

  try {
    if (options.uninstall === true) return handleUninstall(target, base, dryRun);

    const state = inspectTarget(target);

    if (state.isExistingNexusDir && !force) {
      createDataLayout(target, dryRun, created, alreadyExisted);
      const extras = await collectExtras(target, options, dryRun);
      return buildSuccessResult(base, { skipped: true }, extras);
    }
    if (state.nonEmpty && !state.isExistingNexusDir && !force) {
      const error = `target ${target} already exists and is not empty; pass --force to use anyway`;
      return makeResult({ ...base, success: false, error });
    }

    createDataLayout(target, dryRun, created, alreadyExisted);
    const gitignoreUpdated = applyGitignoreOption(target, options, dryRun);
    const extras = await collectExtras(target, options, dryRun);
    return buildSuccessResult(base, { gitignoreUpdated }, extras);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return makeResult({ ...base, success: false, error: msg });
  }
}

/** Renders the MCP-config section of the post-install message. */
function renderMcpConfigLines(mcpConfig: EmitMcpConfigResult): readonly string[] {
  const lines: string[] = [];
  if (mcpConfig.alreadyMatched) {
    lines.push(`✓ .mcp.json already up to date: ${mcpConfig.mcpConfigPath}`);
  } else if (mcpConfig.written) {
    lines.push(`✓ Wrote MCP config: ${mcpConfig.mcpConfigPath}`);
  }
  if (mcpConfig.gitignoreUpdated) {
    lines.push(`✓ Added .mcp.json to .gitignore (per-machine; do not commit)`);
  }
  return lines;
}

/** Renders the trailing "Note: .mcp.json is per-machine" caveat when the file was written. */
function renderMcpConfigCaveat(mcpConfig: EmitMcpConfigResult | undefined): readonly string[] {
  if (mcpConfig?.written !== true) return [];
  return [
    '',
    'Note: .mcp.json contains an absolute path to your local data dir.',
    'It is per-machine and should NOT be committed — collaborators should',
    'run `nexus-agents init --portable --mcp-config` themselves.',
  ];
}

/** Renders the install section of the post-install message. */
function renderInstallLines(install: InstallPortableResult): readonly string[] {
  if (install.skipped) return [`✓ Portable install already present (${install.version})`];
  return [
    `✓ Installed nexus-agents@${install.version} → ${install.cliDir}`,
    `✓ Wrote bin shim → ${install.shim?.shimPath ?? install.binDir + '/nexus-agents'}`,
  ];
}

/** Renders the uninstall section of the message. */
function renderUninstallLines(uninstall: UninstallPortableResult): readonly string[] {
  const lines: string[] = [];
  if (uninstall.removed.length === 0 && uninstall.notPresent.length > 0) {
    lines.push('Nothing to uninstall — cli/ and bin/ were not present.');
  }
  for (const r of uninstall.removed) lines.push(`✓ Removed: ${r}`);
  if (uninstall.removed.length > 0) {
    lines.push('');
    lines.push('Note: data subdirs (memory, audit, voting, sessions, …) preserved.');
    lines.push('To purge data too, remove the parent dir manually.');
  }
  return lines;
}

/** Formats the post-install message printed to the user. */
export function formatInitPortableMessage(result: InitPortableResult, dryRun: boolean): string {
  if (!result.success) {
    return `init --portable failed: ${result.error ?? 'unknown error'}\n`;
  }
  if (result.uninstall !== undefined) {
    return renderUninstallLines(result.uninstall).join('\n') + '\n';
  }
  if (dryRun) {
    const lines = [
      `(dry-run) would create ${String(result.created.length)} entries under:`,
      `  ${result.absolutePath}`,
    ];
    return lines.join('\n') + '\n';
  }
  const lines: string[] = [];
  lines.push(
    result.skipped
      ? `✓ Already initialized: ${result.absolutePath}`
      : `✓ Created: ${result.absolutePath}`
  );
  if (result.gitignoreUpdated) lines.push(`✓ Added entry to .gitignore`);
  if (result.install !== undefined) lines.push(...renderInstallLines(result.install));
  if (result.mcpConfig !== undefined) lines.push(...renderMcpConfigLines(result.mcpConfig));
  lines.push('');
  lines.push('Activate by exporting:');
  lines.push(`  export NEXUS_DATA_DIR=${result.absolutePath}`);
  lines.push('');
  lines.push('Or one-off:');
  lines.push(`  NEXUS_DATA_DIR=${result.absolutePath} nexus-agents <cmd>`);
  lines.push(...renderMcpConfigCaveat(result.mcpConfig));
  return lines.join('\n') + '\n';
}
