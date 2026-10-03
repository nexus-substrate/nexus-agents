/** Detached, disposable repository access for ratification voters (#6358). */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
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
  dispose(): void;
}

function runGit(options: ScratchCheckoutOptions, args: string[]): void {
  const hermetic = options.hermetic === true;
  execFileSync('git', hermetic ? ['-c', 'core.hooksPath=/dev/null', ...args] : args, {
    cwd: options.repoRoot,
    stdio: 'pipe',
    timeout: GIT_TIMEOUT_MS,
    ...(hermetic ? { env: { ...hermeticGitEnv(), GIT_OPTIONAL_LOCKS: '0' } } : {}),
  });
}

/** Git can retain a worktree after a post-checkout hook fails. */
function removeScratchCheckout(options: ScratchCheckoutOptions, path: string): void {
  try {
    runGit(options, ['worktree', 'remove', '--force', path]);
  } finally {
    runGit(options, ['worktree', 'prune']);
  }
}

/** Preserve the allocation error while identifying any retained worktree. */
function failedAllocationCleanup(options: ScratchCheckoutOptions, path: string): string {
  if (!existsSync(path)) return 'No leftover worktree path exists.';
  let failure: string | undefined;
  try {
    removeScratchCheckout(options, path);
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
  try {
    runGit(options, ['worktree', 'add', '--detach', path, sha]);
  } catch (error: unknown) {
    throw new ScratchCheckoutError(
      `Failed to create panel scratch checkout at ${path}. ${failedAllocationCleanup(options, path)}`,
      toError(error)
    );
  }
  return {
    path,
    dispose(): void {
      try {
        removeScratchCheckout(options, path);
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
