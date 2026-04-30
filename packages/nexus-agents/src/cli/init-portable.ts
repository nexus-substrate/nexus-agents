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
}

/** Result of an init-portable invocation. */
export interface InitPortableResult {
  readonly success: boolean;
  readonly absolutePath: string;
  readonly created: readonly string[];
  readonly alreadyExisted: readonly string[];
  readonly skipped: boolean;
  readonly gitignoreUpdated: boolean;
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
  error?: string | null;
}): InitPortableResult {
  return {
    success: opts.success,
    absolutePath: opts.absolutePath,
    created: opts.created,
    alreadyExisted: opts.alreadyExisted,
    skipped: opts.skipped ?? false,
    gitignoreUpdated: opts.gitignoreUpdated ?? false,
    error: opts.error ?? null,
  };
}

/**
 * Bootstraps a workspace-local nexus-agents data directory.
 *
 * Idempotent: re-running on an already-initialized dir is a no-op success.
 * Refuses to create in a non-empty pre-existing directory unless `force=true`.
 */
export function initPortable(options: InitPortableOptions = {}): InitPortableResult {
  const created: string[] = [];
  const alreadyExisted: string[] = [];
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const target = resolveTargetPath(options.path);

  try {
    const state = inspectTarget(target);

    if (state.isExistingNexusDir && !force) {
      createDataLayout(target, dryRun, created, alreadyExisted);
      return makeResult({
        success: true,
        absolutePath: target,
        created,
        alreadyExisted,
        skipped: true,
      });
    }

    if (state.nonEmpty && !state.isExistingNexusDir && !force) {
      return makeResult({
        success: false,
        absolutePath: target,
        created,
        alreadyExisted,
        error: `target ${target} already exists and is not empty; pass --force to use anyway`,
      });
    }

    createDataLayout(target, dryRun, created, alreadyExisted);

    let gitignoreUpdated = false;
    if (options.gitignore === true) {
      const workspaceDir = resolve(target, '..');
      const portableName = target.slice(workspaceDir.length + 1);
      gitignoreUpdated = maybeUpdateGitignore(workspaceDir, portableName, dryRun);
    }

    return makeResult({
      success: true,
      absolutePath: target,
      created,
      alreadyExisted,
      gitignoreUpdated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return makeResult({
      success: false,
      absolutePath: target,
      created,
      alreadyExisted,
      error: msg,
    });
  }
}

/** Formats the post-install message printed to the user. */
export function formatInitPortableMessage(result: InitPortableResult, dryRun: boolean): string {
  if (!result.success) {
    return `init --portable failed: ${result.error ?? 'unknown error'}\n`;
  }
  const lines: string[] = [];
  if (dryRun) {
    lines.push(`(dry-run) would create ${String(result.created.length)} entries under:`);
    lines.push(`  ${result.absolutePath}`);
    return lines.join('\n') + '\n';
  }
  if (result.skipped) {
    lines.push(`✓ Already initialized: ${result.absolutePath}`);
  } else {
    lines.push(`✓ Created: ${result.absolutePath}`);
  }
  if (result.gitignoreUpdated) {
    lines.push(`✓ Added entry to .gitignore`);
  }
  lines.push('');
  lines.push('Activate by exporting:');
  lines.push(`  export NEXUS_DATA_DIR=${result.absolutePath}`);
  lines.push('');
  lines.push('Or one-off:');
  lines.push(`  NEXUS_DATA_DIR=${result.absolutePath} nexus-agents <cmd>`);
  return lines.join('\n') + '\n';
}
