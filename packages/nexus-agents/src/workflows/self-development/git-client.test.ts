/**
 * Tests for Git Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitCliClient, GitError, createGitClient } from './git-client.js';
import * as childProcess from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// Type for execFile callback signature
type ExecFileCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

/**
 * Helper to create mock execFile implementation
 */
function createMockExecFile(
  response: { stdout: string; stderr: string } | null,
  error: Error | null = null
): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockImplementation(
      (
        _cmd: string,
        _args: readonly string[],
        _opts: object,
        cb: ExecFileCallback
      ): ChildProcess => {
        cb(error, response ?? { stdout: '', stderr: '' });
        return {} as ChildProcess;
      }
    );
}

/**
 * Helper to create sequential mock responses
 */
function createSequentialMock(
  responses: Array<{ stdout: string; stderr: string } | Error>
): ReturnType<typeof vi.fn> {
  let callIndex = 0;
  return vi
    .fn()
    .mockImplementation(
      (
        _cmd: string,
        _args: readonly string[],
        _opts: object,
        cb: ExecFileCallback
      ): ChildProcess => {
        const response = responses[callIndex++];
        if (response instanceof Error) {
          cb(response, { stdout: '', stderr: '' });
        } else {
          cb(null, response ?? { stdout: '', stderr: '' });
        }
        return {} as ChildProcess;
      }
    );
}

describe('GitError', () => {
  it('creates error with command and stderr', () => {
    const error = new GitError('Test error', 'git commit', 'stderr output');

    expect(error.message).toBe('Test error');
    expect(error.command).toBe('git commit');
    expect(error.stderr).toBe('stderr output');
    expect(error.name).toBe('GitError');
  });

  it('creates error without stderr', () => {
    const error = new GitError('Test error', 'git push');

    expect(error.message).toBe('Test error');
    expect(error.command).toBe('git push');
    expect(error.stderr).toBeUndefined();
  });
});

describe('createGitClient', () => {
  it('creates GitCliClient instance with default cwd', () => {
    const client = createGitClient();
    expect(client).toBeInstanceOf(GitCliClient);
  });

  it('creates GitCliClient instance with custom cwd', () => {
    const client = createGitClient('/custom/path');
    expect(client).toBeInstanceOf(GitCliClient);
  });
});

describe('GitCliClient', () => {
  let client: GitCliClient;

  beforeEach(() => {
    client = new GitCliClient('/test/repo');
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createBranch', () => {
    it('creates branch on success', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.createBranch('feature/new')).resolves.not.toThrow();
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Branch exists'))
      );

      await expect(client.createBranch('existing')).rejects.toThrow(
        'Failed to create branch existing'
      );
    });
  });

  describe('checkout', () => {
    it('checks out branch on success', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.checkout('main')).resolves.not.toThrow();
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Branch not found'))
      );

      await expect(client.checkout('nonexistent')).rejects.toThrow(
        'Failed to checkout nonexistent'
      );
    });
  });

  describe('add', () => {
    it('adds files on success', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.add(['file1.ts', 'file2.ts'])).resolves.not.toThrow();
    });

    it('does nothing with empty paths', async () => {
      await expect(client.add([])).resolves.not.toThrow();
      expect(childProcess.execFile).not.toHaveBeenCalled();
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('File not found'))
      );

      await expect(client.add(['missing.ts'])).rejects.toThrow('Failed to add files');
    });
  });

  describe('commit', () => {
    it('returns short SHA on success', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createSequentialMock([
          { stdout: '', stderr: '' }, // commit
          { stdout: 'abc1234567890', stderr: '' }, // rev-parse HEAD
        ])
      );

      const sha = await client.commit('Test commit message');
      expect(sha).toBe('abc1234');
    });

    it('throws GitError on commit failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Nothing to commit'))
      );

      await expect(client.commit('Test')).rejects.toThrow('Failed to commit');
    });
  });

  describe('push', () => {
    it('pushes branch on success', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.push('feature/new')).resolves.not.toThrow();
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Permission denied'))
      );

      await expect(client.push('main')).rejects.toThrow('Failed to push main');
    });
  });

  describe('tag', () => {
    it('creates tag on success', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.tag('v1.0.0')).resolves.not.toThrow();
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Tag exists'))
      );

      await expect(client.tag('existing')).rejects.toThrow('Failed to create tag existing');
    });
  });

  describe('status', () => {
    it('returns array of changed files', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: 'M file1.ts\nA file2.ts\n', stderr: '' })
      );

      const status = await client.status();
      expect(status).toEqual(['M file1.ts', 'A file2.ts']);
    });

    it('returns empty array when clean', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      const status = await client.status();
      expect(status).toEqual([]);
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Not a git repo'))
      );

      await expect(client.status()).rejects.toThrow('Failed to get status');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: 'feature/test\n', stderr: '' })
      );

      const branch = await client.getCurrentBranch();
      expect(branch).toBe('feature/test');
    });

    it('throws GitError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Detached HEAD'))
      );

      await expect(client.getCurrentBranch()).rejects.toThrow('Failed to get current branch');
    });
  });

  describe('branchExists', () => {
    it('returns true for existing branch', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: 'abc123', stderr: '' })
      );

      const exists = await client.branchExists('main');
      expect(exists).toBe(true);
    });

    it('returns false for non-existing branch', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('not found'))
      );

      const exists = await client.branchExists('nonexistent');
      expect(exists).toBe(false);
    });
  });
});
