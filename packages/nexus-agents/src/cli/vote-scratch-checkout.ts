/** Detached, disposable repository access for ratification voters (#6358). */
import { execFileSync } from 'node:child_process';
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
}

export interface ScratchCheckout {
  readonly path: string;
  dispose(): void;
}

function runGit(repoRoot: string, args: string[]): void {
  execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe', timeout: GIT_TIMEOUT_MS });
}

/** Creates a detached worktree without changing the caller's HEAD or files. */
export function createScratchCheckout(options: ScratchCheckoutOptions): ScratchCheckout {
  const { repoRoot, sha } = options;
  if (sha.trim() === '') {
    throw new ScratchCheckoutError('Cannot create a panel scratch checkout: SHA is empty.');
  }
  if (!/^[a-fA-F0-9]{40}$/.test(sha)) {
    throw new ScratchCheckoutError(
      'Panel scratch checkout requires a full 40-character commit SHA.'
    );
  }
  try {
    runGit(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]);
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
    runGit(repoRoot, ['worktree', 'add', '--detach', path, sha]);
  } catch (error: unknown) {
    throw new ScratchCheckoutError(
      `Failed to create panel scratch checkout at ${path}.`,
      toError(error)
    );
  }
  return {
    path,
    dispose(): void {
      try {
        try {
          runGit(repoRoot, ['worktree', 'remove', '--force', path]);
        } finally {
          runGit(repoRoot, ['worktree', 'prune']);
        }
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
