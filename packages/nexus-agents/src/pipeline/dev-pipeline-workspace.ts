/** Per-run implementation checkout and operator-owned patch handoff (#6794). */
import { execFileSync } from 'node:child_process';
import { realpathSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { createScratchCheckout, type ScratchCheckout } from '../cli/vote-scratch-checkout.js';
import { getNexusTmpDir } from '../config/nexus-tmp-dir.js';
import { createLogger } from '../core/index.js';
import type { DevPipelineResult, DevPipelineStages } from './dev-pipeline.js';

const GIT_TIMEOUT_MS = 30_000;
const DIFF_MAX_BYTES = 16 * 1024 * 1024;
const logger = createLogger({ component: 'dev-pipeline-workspace' });
// Exclude the links even when the source repository does not ignore node_modules.
const PATCH_PATHS = ['.', ':(exclude,glob)**/node_modules', ':(exclude,glob)**/node_modules/**'];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: DIFF_MAX_BYTES,
    stdio: 'pipe',
  });
}

/** Visit only tracked manifests, never searching the source tree or dependency directories. */
function linkDependencies(repoRoot: string, scratchPath: string): number {
  const manifests = git(scratchPath, [
    'ls-files',
    '-z',
    '--',
    'package.json',
    ':(glob)**/package.json',
    ':(exclude,glob)**/node_modules/**',
  ])
    .split('\0')
    .filter((path) => path !== '');
  let linked = 0;
  for (const manifest of manifests) {
    const directory = dirname(manifest);
    const source = join(repoRoot, directory, 'node_modules');
    if (statSync(source, { throwIfNoEntry: false })?.isDirectory() !== true) continue;
    symlinkSync(source, join(scratchPath, directory, 'node_modules'), 'dir');
    linked++;
  }
  // No installed dependencies means zero links; quality-check behaviour is unchanged.
  return linked;
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

/** Cleanup must never discard a patch or replace the run's original error. */
function disposeWorkspace(scratch: ScratchCheckout): string | undefined {
  try {
    scratch.dispose();
    return undefined;
  } catch (error: unknown) {
    const warning = `Failed to remove scratch worktree at ${scratch.path}: ${String(error)}. Leftover path: ${scratch.path}.`;
    logger.warn(warning, { error: String(error) });
    return warning;
  }
}

/** Intent-to-add includes new files without committing or touching the source index. */
function captureChanges(
  scratchPath: string,
  baseSha: string,
  dependenciesLinked: number
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
    dependenciesLinked,
    empty,
    status: empty ? 'no_changes' : 'changes',
  };
}

/**
 * Stages without a workspace binding are external implementations. Built-in
 * stages bind implement, QA and both gates to the same disposable checkout.
 * The operator receives a diff and cleanup status; failed removal leaves a warning.
 */
export async function withDevPipelineWorkspace(
  stages: DevPipelineStages,
  run: (bound: DevPipelineStages) => Promise<DevPipelineResult>
): Promise<DevPipelineResult> {
  if (stages.withWorkspace === undefined) return run(stages);
  const declared = stages.implementWorkspace?.directory;
  if (declared === undefined) throw new Error('Workspace binding requires a repository directory');
  const directory = realpathSync(declared);
  const repoRoot = git(directory, ['rev-parse', '--show-toplevel']).trim();
  const baseSha = git(repoRoot, ['rev-parse', 'HEAD']).trim();
  const sourceWarning = dirtySourceWarning(repoRoot, baseSha);
  const scratch = createScratchCheckout({ repoRoot, sha: baseSha, tmpRoot: scratchRoot(repoRoot) });
  let result: DevPipelineResult;
  let changes: NonNullable<DevPipelineResult['changes']>;
  let cleanupWarning: string | undefined;
  try {
    const dependenciesLinked = linkDependencies(repoRoot, scratch.path);
    // Preserve a workingDir that points at a package below the repository root.
    const bound = stages.withWorkspace(join(scratch.path, relative(repoRoot, directory)));
    result = await run(bound);
    changes = captureChanges(scratch.path, baseSha, dependenciesLinked);
  } finally {
    cleanupWarning = disposeWorkspace(scratch);
  }
  const warnings = [sourceWarning, cleanupWarning].filter((warning) => warning !== undefined);
  return {
    ...result,
    completed: result.completed && !changes.empty,
    changes: { ...changes, worktreeRemoved: cleanupWarning === undefined },
    ...(warnings.length > 0 ? { warnings: [...(result.warnings ?? []), ...warnings] } : {}),
  };
}
