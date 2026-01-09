/**
 * Git Client Implementation
 *
 * Uses git CLI for local repository operations. Provides branch management,
 * commits, and push operations for the self-development workflow.
 *
 * @module workflows/self-development/git-client
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../../core/index.js';
import { ok, err, createLogger } from '../../core/index.js';
import type { IGitClient } from './interfaces.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'git-client' });

/** Error returned when Git operations fail. */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * Execute a git command and return the result.
 */
async function execGit(args: readonly string[], cwd: string): Promise<Result<string, GitError>> {
  try {
    const { stdout } = await execFileAsync('git', [...args], { cwd });
    return ok(stdout.trim());
  } catch (error) {
    const execError = error as { message: string; stderr?: string };
    return err(
      new GitError(
        `git command failed: ${execError.message}`,
        `git ${args.join(' ')}`,
        execError.stderr
      )
    );
  }
}

/**
 * Git client using git CLI.
 */
export class GitCliClient implements IGitClient {
  constructor(private readonly cwd: string) {}

  async createBranch(name: string): Promise<void> {
    logger.debug('Creating branch', { name, cwd: this.cwd });
    const result = await execGit(['checkout', '-b', name], this.cwd);

    if (!result.ok) {
      throw new GitError(
        `Failed to create branch ${name}`,
        result.error.command,
        result.error.stderr
      );
    }
  }

  async checkout(branch: string): Promise<void> {
    logger.debug('Checking out branch', { branch, cwd: this.cwd });
    const result = await execGit(['checkout', branch], this.cwd);

    if (!result.ok) {
      throw new GitError(`Failed to checkout ${branch}`, result.error.command, result.error.stderr);
    }
  }

  async add(paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    logger.debug('Adding files', { paths: paths.length, cwd: this.cwd });
    const result = await execGit(['add', ...paths], this.cwd);

    if (!result.ok) {
      throw new GitError('Failed to add files', result.error.command, result.error.stderr);
    }
  }

  async commit(message: string): Promise<string> {
    logger.debug('Creating commit', { cwd: this.cwd });

    // First commit
    const commitResult = await execGit(['commit', '-m', message], this.cwd);
    if (!commitResult.ok) {
      throw new GitError('Failed to commit', commitResult.error.command, commitResult.error.stderr);
    }

    // Get the commit SHA
    const shaResult = await execGit(['rev-parse', 'HEAD'], this.cwd);
    if (!shaResult.ok) {
      throw new GitError(
        'Failed to get commit SHA',
        shaResult.error.command,
        shaResult.error.stderr
      );
    }

    return shaResult.value.slice(0, 7); // Return short SHA
  }

  async push(branch: string): Promise<void> {
    logger.info('Pushing branch', { branch, cwd: this.cwd });
    const result = await execGit(['push', '-u', 'origin', branch], this.cwd);

    if (!result.ok) {
      throw new GitError(`Failed to push ${branch}`, result.error.command, result.error.stderr);
    }
  }

  async tag(name: string): Promise<void> {
    logger.debug('Creating tag', { name, cwd: this.cwd });
    const result = await execGit(['tag', name], this.cwd);

    if (!result.ok) {
      throw new GitError(`Failed to create tag ${name}`, result.error.command, result.error.stderr);
    }
  }

  async status(): Promise<string[]> {
    const result = await execGit(['status', '--porcelain'], this.cwd);

    if (!result.ok) {
      throw new GitError('Failed to get status', result.error.command, result.error.stderr);
    }

    if (result.value.length === 0) return [];
    return result.value.split('\n').filter((line) => line.length > 0);
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    const result = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], this.cwd);

    if (!result.ok) {
      throw new GitError('Failed to get current branch', result.error.command, result.error.stderr);
    }

    return result.value;
  }

  /**
   * Check if a branch exists.
   */
  async branchExists(name: string): Promise<boolean> {
    const result = await execGit(['rev-parse', '--verify', `refs/heads/${name}`], this.cwd);
    return result.ok;
  }
}

/**
 * Create a Git client for the specified working directory.
 *
 * @param cwd - Working directory (defaults to current directory)
 * @returns Git client instance
 */
export function createGitClient(cwd = process.cwd()): IGitClient {
  return new GitCliClient(cwd);
}
