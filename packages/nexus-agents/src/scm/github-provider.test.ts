/**
 * Tests for GitHub provider (gh CLI wrapper).
 *
 * Unit tests mock execFile to avoid real gh CLI calls.
 *
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubProvider } from './github-provider.js';

// Mock child_process.execFile
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]): unknown => mockExecFile(...args),
}));

// Mock node:util promisify to return our mock
vi.mock('node:util', () => ({
  promisify:
    () =>
    (...args: unknown[]): unknown =>
      mockExecFile(...args),
}));

describe('GitHubProvider', () => {
  let provider: GitHubProvider;

  beforeEach(() => {
    provider = new GitHubProvider('owner/repo');
    mockExecFile.mockReset();
  });

  it('has correct platform and repo', () => {
    expect(provider.platform).toBe('github');
    expect(provider.repo).toBe('owner/repo');
  });

  describe('getIssue', () => {
    it('returns parsed issue on success', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          number: 42,
          title: 'Test issue',
          body: 'Description',
          labels: [{ name: 'bug' }],
          author: { login: 'testuser' },
          createdAt: '2026-01-01T00:00:00Z',
        }),
      });

      const result = await provider.getIssue(42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.number).toBe(42);
        expect(result.value.title).toBe('Test issue');
        expect(result.value.labels).toEqual(['bug']);
        expect(result.value.author).toBe('testuser');
      }
    });

    it('returns ScmError on gh CLI failure', async () => {
      mockExecFile.mockRejectedValue(new Error('gh: not authenticated'));

      const result = await provider.getIssue(42);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.platform).toBe('github');
        expect(result.error.message).toContain('gh command failed');
      }
    });
  });

  describe('listIssues', () => {
    it('returns list of issues', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify([
          {
            number: 1,
            title: 'Issue 1',
            body: null,
            labels: [],
            author: { login: 'user1' },
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]),
      });

      const result = await provider.listIssues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.body).toBe('');
      }
    });

    it('passes label filters to gh CLI', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]' });

      await provider.listIssues({ labels: ['bug', 'p1'] });

      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args).toContain('--label');
      expect(args).toContain('bug,p1');
    });
  });

  describe('addLabels', () => {
    it('returns ok on success', async () => {
      mockExecFile.mockResolvedValue({ stdout: '' });

      const result = await provider.addLabels(42, ['bug', 'urgent']);

      expect(result.ok).toBe(true);
    });
  });

  describe('createPR', () => {
    it('returns parsed PR on success', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          number: 99,
          title: 'New PR',
          body: 'PR body',
          url: 'https://github.com/owner/repo/pull/99',
          author: { login: 'dev' },
          baseRefName: 'main',
          headRefName: 'feat/thing',
        }),
      });

      const result = await provider.createPR({
        title: 'New PR',
        body: 'PR body',
        head: 'feat/thing',
        base: 'main',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.number).toBe(99);
        expect(result.value.url).toContain('/pull/99');
      }
    });
  });

  describe('getPRStatus', () => {
    it('maps MERGEABLE status correctly', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ state: 'SUCCESS' }],
          reviewDecision: 'APPROVED',
        }),
      });

      const result = await provider.getPRStatus(99);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mergeable).toBe(true);
        expect(result.value.checksStatus).toBe('success');
        expect(result.value.reviewStatus).toBe('approved');
      }
    });

    it('maps CONFLICTING status correctly', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          mergeable: 'CONFLICTING',
          statusCheckRollup: [{ state: 'FAILURE' }],
          reviewDecision: 'CHANGES_REQUESTED',
        }),
      });

      const result = await provider.getPRStatus(99);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mergeable).toBe(false);
        expect(result.value.checksStatus).toBe('failure');
        expect(result.value.reviewStatus).toBe('changes_requested');
      }
    });
  });

  describe('addComment', () => {
    it('returns ok on success', async () => {
      mockExecFile.mockResolvedValue({ stdout: '' });

      const result = await provider.addComment(42, 'Test comment');

      expect(result.ok).toBe(true);
    });
  });

  describe('mergePR', () => {
    it('passes squash method by default', async () => {
      mockExecFile.mockResolvedValue({ stdout: '' });

      await provider.mergePR(99);

      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args).toContain('--squash');
    });

    it('passes merge method when specified', async () => {
      mockExecFile.mockResolvedValue({ stdout: '' });

      await provider.mergePR(99, { method: 'merge' });

      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args).toContain('--merge');
    });

    it('passes delete-branch when specified', async () => {
      mockExecFile.mockResolvedValue({ stdout: '' });

      await provider.mergePR(99, { deleteBranch: true });

      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args).toContain('--delete-branch');
    });
  });
});
