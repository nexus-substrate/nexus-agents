/**
 * Tests for GitHub Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GhCliGitHubClient, GitHubError, createGitHubClient } from './github-client.js';
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
): typeof childProcess.execFile {
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

describe('GitHubError', () => {
  it('creates error with command and stderr', () => {
    const error = new GitHubError('Test error', 'gh issue list', 'stderr output');

    expect(error.message).toBe('Test error');
    expect(error.command).toBe('gh issue list');
    expect(error.stderr).toBe('stderr output');
    expect(error.name).toBe('GitHubError');
  });

  it('creates error without stderr', () => {
    const error = new GitHubError('Test error', 'gh pr create');

    expect(error.message).toBe('Test error');
    expect(error.command).toBe('gh pr create');
    expect(error.stderr).toBeUndefined();
  });
});

describe('createGitHubClient', () => {
  it('creates GhCliGitHubClient instance', () => {
    const client = createGitHubClient('owner/repo');
    expect(client).toBeInstanceOf(GhCliGitHubClient);
  });
});

describe('GhCliGitHubClient', () => {
  let client: GhCliGitHubClient;

  beforeEach(() => {
    client = new GhCliGitHubClient('test/repo');
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('listIssues', () => {
    it('returns parsed issues on success', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Test Issue',
          body: 'Issue body',
          labels: [{ name: 'bug' }],
          author: { login: 'testuser' },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: JSON.stringify(mockIssues), stderr: '' })
      );

      const issues = await client.listIssues();

      expect(issues).toHaveLength(1);
      expect(issues[0]?.number).toBe(1);
      expect(issues[0]?.title).toBe('Test Issue');
      expect(issues[0]?.labels).toEqual(['bug']);
    });

    it('returns empty array on error', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('gh not found'))
      );

      const issues = await client.listIssues();
      expect(issues).toEqual([]);
    });

    it('returns empty array on JSON parse error', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: 'not json', stderr: '' })
      );

      const issues = await client.listIssues();
      expect(issues).toEqual([]);
    });
  });

  describe('getIssue', () => {
    it('returns issue on success', async () => {
      const mockIssue = {
        number: 42,
        title: 'Feature Request',
        body: 'Please add this feature',
        labels: [{ name: 'enhancement' }],
        author: { login: 'developer' },
        createdAt: '2026-01-02T00:00:00Z',
      };

      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: JSON.stringify(mockIssue), stderr: '' })
      );

      const issue = await client.getIssue(42);

      expect(issue.number).toBe(42);
      expect(issue.title).toBe('Feature Request');
      expect(issue.author).toBe('developer');
    });

    it('throws GitHubError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Issue not found'))
      );

      await expect(client.getIssue(999)).rejects.toThrow('Failed to get issue #999');
    });
  });

  describe('createPR', () => {
    it('returns PR details on success', async () => {
      const mockPr = { number: 100, url: 'https://github.com/test/repo/pull/100' };

      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: JSON.stringify(mockPr), stderr: '' })
      );

      const pr = await client.createPR({
        title: 'New Feature',
        body: 'Description',
        head: 'feature-branch',
        base: 'main',
      });

      expect(pr.number).toBe(100);
      expect(pr.url).toBe('https://github.com/test/repo/pull/100');
    });

    it('throws GitHubError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('PR creation failed'))
      );

      await expect(
        client.createPR({
          title: 'New Feature',
          body: 'Description',
          head: 'feature-branch',
          base: 'main',
        })
      ).rejects.toThrow('Failed to create PR');
    });
  });

  describe('addComment', () => {
    it('succeeds without throwing', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.addComment(1, 'Test comment')).resolves.not.toThrow();
    });

    it('throws GitHubError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Comment failed'))
      );

      await expect(client.addComment(1, 'Test')).rejects.toThrow('Failed to add comment');
    });
  });

  describe('addLabels', () => {
    it('succeeds without throwing', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile({ stdout: '', stderr: '' })
      );

      await expect(client.addLabels(1, ['bug', 'priority'])).resolves.not.toThrow();
    });

    it('throws GitHubError on failure', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        createMockExecFile(null, new Error('Labels failed'))
      );

      await expect(client.addLabels(1, ['bug'])).rejects.toThrow('Failed to add labels');
    });
  });
});
