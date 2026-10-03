/** Detached, disposable repository access for ratification voters (#6358). */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import { randomUUID } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import type { VoteCommandOptions } from './vote-types.js';
import { getNexusTmpDir } from '../config/nexus-tmp-dir.js';
import { ErrorCode, NexusError, toError } from '../core/errors.js';

const GIT_TIMEOUT_MS = 30_000;
const SHA_PREFIX_LENGTH = 12;

/** A ratification checkout could not be created or removed. */
export class ScratchCheckoutError extends NexusError {
  constructor(message: string, cause?: Error) {
    super(message, {
      code: ErrorCode.WORKFLOW_ERROR,
      ...(cause !== undefined ? { cause } : {}),
    });
    this.name = 'ScratchCheckoutError';
  }
}

export interface ScratchCheckoutOptions {
  readonly repoRoot: string;
  readonly sha: string;
  readonly tmpRoot?: string;
  /** Disable source hooks and remove repository-local git environment redirects. */
  readonly hermetic?: boolean;
}

export interface ScratchCheckout {
  readonly path: string;
  /** Refuse redirected or symlinked metadata using the bytes pinned at allocation. */
  gitMetadataUnchanged?(): boolean;
  dispose(): void;
}

function runGit(options: ScratchCheckoutOptions, args: string[]): void {
  const hermetic = options.hermetic === true;
  execFileSync(
    'git',
    hermetic ? ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args] : args,
    {
      cwd: options.repoRoot,
      stdio: 'pipe',
      timeout: GIT_TIMEOUT_MS,
      ...(hermetic ? { env: { ...hermeticGitEnv(), GIT_OPTIONAL_LOCKS: '0' } } : {}),
    }
  );
}

/** Paths are pinned before allocation, never rediscovered from sandbox-written metadata. */
interface ScratchPaths {
  readonly checkout: string;
  readonly registration: string;
}

function scratchPaths(options: ScratchCheckoutOptions, path: string): ScratchPaths {
  const commonDir = realpathSync(
    execFileSync(
      'git',
      [
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.hooksPath=/dev/null',
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      ],
      {
        cwd: options.repoRoot,
        env: hermeticGitEnv(),
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        stdio: 'pipe',
      }
    ).trim()
  );
  return { checkout: path, registration: join(commonDir, 'worktrees', basename(path)) };
}

/** Remove only the two recorded paths. rm unlinks symlinks without following them. */
function removeScratchCheckout(options: ScratchCheckoutOptions, paths: ScratchPaths): void {
  try {
    rmSync(paths.checkout, { recursive: true, force: true });
  } finally {
    rmSync(paths.registration, { recursive: true, force: true });
  }
  // Prune only after both removals succeed, never interpreting a retained registration.
  runGit({ ...options, hermetic: true }, ['worktree', 'prune']);
}

/** Raw regular-file bytes only, never git interpretation or symlink traversal. */
function metadataSnapshot(paths: ScratchPaths): () => boolean {
  const files = [
    join(paths.checkout, '.git'),
    join(paths.registration, 'commondir'),
    join(paths.registration, 'gitdir'),
  ];
  const bytes = files.map((path) => {
    if (!lstatSync(path).isFile())
      throw new Error(`Scratch metadata is not a regular file: ${path}`);
    return readFileSync(path);
  });
  return () => {
    try {
      return files.every(
        (path, index) =>
          lstatSync(path).isFile() && readFileSync(path).equals(bytes[index] ?? Buffer.alloc(0))
      );
    } catch {
      return false; // Missing/unreadable metadata cannot authorize a diff.
    }
  };
}

/** Preserve the allocation error while identifying any retained worktree. */
function failedAllocationCleanup(options: ScratchCheckoutOptions, paths: ScratchPaths): string {
  const path = paths.checkout;
  if (!existsSync(path)) return 'No leftover worktree path exists.';
  let failure: string | undefined;
  try {
    removeScratchCheckout(options, paths);
  } catch (error: unknown) {
    failure = String(error);
  }
  const status = existsSync(path)
    ? `Leftover worktree remains at ${path}.`
    : 'Leftover worktree removed.';
  return failure === undefined ? status : `${status} Cleanup failed: ${failure}`;
}

/** Creates a detached worktree without changing the caller's HEAD or files. */
export function createScratchCheckout(options: ScratchCheckoutOptions): ScratchCheckout {
  const { sha } = options;
  if (sha.trim() === '') {
    throw new ScratchCheckoutError('Cannot create a panel scratch checkout: SHA is empty.');
  }
  if (!/^[a-fA-F0-9]{40}$/.test(sha)) {
    throw new ScratchCheckoutError(
      'Panel scratch checkout requires a full 40-character commit SHA.'
    );
  }
  try {
    runGit(options, ['cat-file', '-e', `${sha}^{commit}`]);
  } catch (error: unknown) {
    throw new ScratchCheckoutError(
      `Ratified commit ${sha} is not available locally; fetch it first.`,
      toError(error)
    );
  }
  const path = resolve(
    options.tmpRoot ?? getNexusTmpDir(),
    `vote-${sha.slice(0, SHA_PREFIX_LENGTH)}-${randomUUID()}`
  );
  const paths = scratchPaths(options, path);
  let gitMetadataUnchanged: () => boolean;
  try {
    runGit(options, ['worktree', 'add', '--detach', path, sha]);
    gitMetadataUnchanged = metadataSnapshot(paths);
  } catch (error: unknown) {
    throw new ScratchCheckoutError(
      `Failed to create panel scratch checkout at ${path}. ${failedAllocationCleanup(options, paths)}`,
      toError(error)
    );
  }
  return {
    path,
    gitMetadataUnchanged,
    dispose(): void {
      try {
        removeScratchCheckout(options, paths);
      } catch (error: unknown) {
        throw new ScratchCheckoutError(
          `Failed to dispose panel scratch checkout at ${path}.`,
          toError(error)
        );
      }
    },
  };
}

/** Keeps the scratch checkout alive through retries, tallying and recording. */
export async function withPanelWorkspace<T>(
  options: VoteCommandOptions,
  run: (workspace?: string) => Promise<T>
): Promise<T> {
  if (options.ratifiesPr === undefined) return run();
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    stdio: 'pipe',
  }).trim();
  const scratch = createScratchCheckout({ repoRoot, sha: options.ratifiesPr.headSha });
  try {
    process.stderr.write(
      `panel workspace: ${scratch.path} (detached at ${options.ratifiesPr.headSha})\n`
    );
    return await run(scratch.path);
  } finally {
    scratch.dispose();
    process.stderr.write(`panel workspace disposed: ${scratch.path}\n`);
  }
}
