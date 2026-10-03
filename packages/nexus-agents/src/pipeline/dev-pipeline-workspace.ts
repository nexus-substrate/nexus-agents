/** Per-run implementation checkout and operator-owned patch handoff (#6794). */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createScratchCheckout, type ScratchCheckout } from '../cli/vote-scratch-checkout.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import { execFileTree } from '../cli-adapters/exec-file-tree.js';
import { WORKFLOW_TIMEOUTS } from '../config/timeouts.js';
import { getNexusTmpDir } from '../config/nexus-tmp-dir.js';
import { createLogger } from '../core/index.js';
import type {
  DevPipelineDependencies,
  DevPipelineResult,
  DevPipelineStages,
} from './dev-pipeline.js';

const GIT_TIMEOUT_MS = 30_000;
const DIFF_MAX_BYTES = 16 * 1024 * 1024;
const logger = createLogger({ component: 'dev-pipeline-workspace' });
// Installed dependencies are runtime inputs, excluded even when not ignored.
const PATCH_PATHS = ['.', ':(exclude,glob)**/node_modules', ':(exclude,glob)**/node_modules/**'];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    env: { ...hermeticGitEnv(), GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: DIFF_MAX_BYTES,
    stdio: 'pipe',
  });
}

/** Process seam for fixture installs without a warm offline cache. */
type DependencyInstaller = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; env: NodeJS.ProcessEnv }
) => Promise<unknown>;

/** Provision only the pinned checkout before implementation can edit its lockfile. */
/** The config file every worktree of `repoRoot` shares, located ONCE before the run. */
interface SharedGitConfig {
  readonly path: string;
  readonly bytes: string | undefined;
}

function readSharedGitConfig(repoRoot: string): SharedGitConfig {
  const commonDir = git(repoRoot, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]).trim();
  const path = join(commonDir, 'config');
  return { path, bytes: existsSync(path) ? readFileSync(path, 'utf8') : undefined };
}

/**
 * A scratch worktree writes `git config` into the SOURCE repository's shared
 * config, and nothing in the returned patch shows it. Reported, not reverted:
 * restoring could clobber an operator's concurrent change.
 *
 * Total by construction (#6794 panel, round 5): it runs inside `finally`, so a
 * throw here would replace the run's own error. It re-reads the path resolved
 * before the run as raw bytes and never asks git, which fails (exit 128) on the
 * malformed config an install script may have left behind.
 */
function sharedConfigWarning(before: SharedGitConfig): string | undefined {
  let after: string | undefined;
  try {
    after = existsSync(before.path) ? readFileSync(before.path, 'utf8') : undefined;
  } catch (error: unknown) {
    return `Could not re-read the source repository's shared git config at ${before.path} after the run (${String(error)}); a change made by the run would not be reported. Review it with: git config --list --show-origin`;
  }
  if (after === before.bytes) return undefined;
  return `The run changed the source repository's shared git config at ${before.path}; this is not part of the returned patch. Review it with: git config --list --show-origin`;
}

/** Drop inherited directory redirects before pinning scratch-local install paths. */
function dependencyInstallEnv(scratchPath: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(hermeticGitEnv()).filter(
      ([name]) =>
        !/^npm_config_(?:virtual_store_dir|modules_dir|lockfile_dir|dir|global_dir|prefix)$/i.test(
          name
        )
    )
  );
  // Shared cache imports must be copies, never hardlinks into source dependencies.
  env['npm_config_package_import_method'] = 'copy';
  env['npm_config_enable_global_virtual_store'] = 'false';
  env['npm_config_modules_dir'] = 'node_modules';
  env['npm_config_virtual_store_dir'] = join(scratchPath, 'node_modules/.pnpm');
  // Husky would otherwise change the git config shared with the source repository.
  env['HUSKY'] = '0';
  return env;
}

async function provisionDependencies(
  scratchPath: string,
  install: DependencyInstaller
): Promise<DevPipelineDependencies> {
  if (!existsSync(join(scratchPath, 'package.json'))) return { status: 'none' };
  const lockfiles = [
    ['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']],
    ['package-lock.json', 'npm', ['ci', '--prefer-offline']],
    ['yarn.lock', 'yarn', ['install', '--frozen-lockfile', '--prefer-offline']],
  ] as const;
  const selected = lockfiles.find(([lockfile]) => existsSync(join(scratchPath, lockfile)));
  if (selected === undefined) return { status: 'none' };
  const [, manager, args] = selected;
  try {
    await install(manager, [...args], {
      cwd: scratchPath,
      timeout: WORKFLOW_TIMEOUTS.stepMs,
      env: dependencyInstallEnv(scratchPath),
    });
    return { status: 'installed', manager };
  } catch (error: unknown) {
    return {
      status: 'failed',
      manager,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** NUL records count paths accurately, including filenames with newlines and renames. */
function dirtySourceWarning(repoRoot: string, baseSha: string): string | undefined {
  const records = git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter((record) => record !== '');
  if (records.length === 0) return undefined; // Clean/ignored-only source needs no warning.
  let paths = 0;
  for (let index = 0; index < records.length; index++) {
    paths++;
    // A rename/copy has a second record for the original path, not a second change.
    if (/[RC]/.test(records[index]?.slice(0, 2) ?? '')) index++;
  }
  return `The run was based on HEAD ${baseSha}; ${String(paths)} uncommitted paths were not included.`;
}

/** Whether two canonical paths are equal or one contains the other. */
function overlaps(a: string, b: string): boolean {
  const inside = (parent: string, child: string): boolean => {
    const path = relative(parent, child);
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  return inside(a, b) || inside(b, a);
}

/**
 * The default NEXUS_TMPDIR is `<repo>/.nexus-agents/tmp`, inside the source
 * checkout and usually the server's cwd. A scratch there fails the quality
 * gate's isolation check, so every untrusted gate would be refused; place it
 * under the system temp dir instead. If that overlaps too, the gate still
 * fails closed on the isolation check.
 */
function scratchRoot(repoRoot: string): string {
  const preferred = realpathSync(getNexusTmpDir());
  const occupied = [repoRoot, realpathSync(process.cwd())];
  return occupied.some((path) => overlaps(preferred, path)) ? tmpdir() : preferred;
}

/** Logging in finally must never replace an error or discard a successful result. */
function reportWarning(warning: string, context?: { error: string }): void {
  try {
    if (context === undefined) logger.warn(warning);
    else logger.warn(warning, context);
  } catch {
    // Logging is best effort here: the run error and returned warnings are authoritative.
  }
}

/** Keep the installer seam while ending lifecycle descendants on timeout. */
const installDependencies: DependencyInstaller = (command, args, options) =>
  execFileTree(command, args, {
    cwd: options.cwd,
    timeoutMs: options.timeout,
    env: options.env,
  });

/** Cleanup must never discard a patch or replace the run's original error. */
function disposeWorkspace(scratch: ScratchCheckout | undefined): string | undefined {
  if (scratch === undefined) return undefined; // Allocation failed before returning a handle.
  try {
    scratch.dispose();
    return undefined;
  } catch (error: unknown) {
    const warning = existsSync(scratch.path)
      ? `Failed to remove scratch worktree at ${scratch.path}: ${String(error)}. Leftover path: ${scratch.path}.`
      : `Failed to prune scratch worktree registration for ${scratch.path}: ${String(error)}.`;
    reportWarning(warning, { error: String(error) });
    return warning;
  }
}

/** Intent-to-add includes new files without committing or touching the source index. */
function captureChanges(
  scratchPath: string,
  baseSha: string,
  dependencies: DevPipelineDependencies
): NonNullable<DevPipelineResult['changes']> {
  git(scratchPath, ['add', '--intent-to-add', '--all', '--', ...PATCH_PATHS]);
  const diff = git(scratchPath, [
    'diff',
    '--binary',
    '--no-ext-diff',
    '--no-textconv',
    baseSha,
    '--',
    ...PATCH_PATHS,
  ]);
  const empty = diff === '';
  return {
    diff,
    baseSha,
    worktreePath: scratchPath,
    worktreeRemoved: false,
    dependencies,
    empty,
    status: empty ? 'no_changes' : 'changes',
  };
}

/**
 * BEST-EFFORT isolation, not an OS sandbox. Built-in stages bind implement,
 * QA and both gates to the same disposable checkout. Stages without a workspace
 * binding are external implementations.
 *
 * Pipeline-owned git runs hermetically with optional index refresh disabled and
 * source hooks disabled. Gate subprocesses receive the hermetic git environment.
 * Installs are scratch-local with directory overrides removed and copy imports,
 * run with HUSKY=0, and are killed as a process tree on timeout. Changes to the
 * source repository's shared git config are reported, never reverted.
 *
 * Known residual channel: an install descendant that ignores SIGTERM can write
 * during the kill grace period before the config snapshot. An OS sandbox is
 * tracked in #7011. The operator receives a diff and cleanup status, and failed
 * removal leaves a warning.
 */
export async function withDevPipelineWorkspace(
  stages: DevPipelineStages,
  run: (bound: DevPipelineStages) => Promise<DevPipelineResult>,
  install: DependencyInstaller = installDependencies
): Promise<DevPipelineResult> {
  if (stages.withWorkspace === undefined) return run(stages);
  const declared = stages.implementWorkspace?.directory;
  if (declared === undefined) throw new Error('Workspace binding requires a repository directory');
  const directory = realpathSync(declared);
  const repoRoot = git(directory, ['rev-parse', '--show-toplevel']).trim();
  const baseSha = git(repoRoot, ['rev-parse', 'HEAD']).trim();
  const sourceWarning = dirtySourceWarning(repoRoot, baseSha);
  const sharedConfig = readSharedGitConfig(repoRoot);
  let scratch: ScratchCheckout | undefined;
  let result: DevPipelineResult;
  let changes: NonNullable<DevPipelineResult['changes']>;
  let cleanupWarning: string | undefined;
  let configWarning: string | undefined;
  let completed = false;
  try {
    scratch = createScratchCheckout({
      repoRoot,
      sha: baseSha,
      tmpRoot: scratchRoot(repoRoot),
      hermetic: true,
    });
    const dependencies = await provisionDependencies(scratch.path, install);
    // Preserve a workingDir that points at a package below the repository root.
    const bound = stages.withWorkspace({
      directory: join(scratch.path, relative(repoRoot, directory)),
      dependencies,
    });
    result = await run(bound);
    changes = captureChanges(scratch.path, baseSha, dependencies);
    completed = true;
  } finally {
    // Every exit reports what the run did outside the patch: a thrown or timed-out
    // stage has no result to carry warnings, so they are logged instead (#6794 panel).
    cleanupWarning = disposeWorkspace(scratch);
    configWarning = sharedConfigWarning(sharedConfig);
    if (!completed && configWarning !== undefined) reportWarning(configWarning);
  }
  const warnings = [sourceWarning, cleanupWarning, configWarning].filter(
    (warning) => warning !== undefined
  );
  return {
    ...result,
    completed: result.completed && !changes.empty,
    changes: { ...changes, worktreeRemoved: !existsSync(scratch.path) },
    ...(warnings.length > 0 ? { warnings: [...(result.warnings ?? []), ...warnings] } : {}),
  };
}
