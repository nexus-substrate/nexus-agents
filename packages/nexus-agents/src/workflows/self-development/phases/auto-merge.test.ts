/**
 * Auto-Merge Tests
 *
 * @module workflows/self-development/phases/auto-merge.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitForChecks, attemptAutoMerge } from './auto-merge.js';
import type { SelfDevWorkflowDependencies, IGitHubClient, PRStatus } from '../interfaces.js';

describe('auto-merge', () => {
  let mockGitHubClient: IGitHubClient;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    mockGitHubClient = {
      listIssues: vi.fn(),
      getIssue: vi.fn(),
      createPR: vi.fn(),
      addComment: vi.fn(),
      addLabels: vi.fn(),
      mergePR: vi.fn(),
      getPRStatus: vi.fn(),
    };

    deps = {
      modelAdapter: { complete: vi.fn() } as never,
      githubClient: mockGitHubClient,
    };
  });

  describe('waitForChecks', () => {
    it('returns ready when checks pass immediately', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'success',
        reviewStatus: 'approved',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);

      const result = await waitForChecks(deps, 123, 1000);

      expect(result.ready).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns not ready when PR has merge conflicts', async () => {
      const status: PRStatus = {
        mergeable: false,
        checksStatus: 'success',
        reviewStatus: 'approved',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);

      const result = await waitForChecks(deps, 123, 1000);

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('PR has merge conflicts');
    });

    it('returns not ready when CI checks fail', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'failure',
        reviewStatus: 'pending',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);

      const result = await waitForChecks(deps, 123, 1000);

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('CI checks failed');
    });

    it('returns not ready when changes requested', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'success',
        reviewStatus: 'changes_requested',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);

      const result = await waitForChecks(deps, 123, 1000);

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('Changes requested in review');
    });

    it('returns not ready when GitHub client is not available', async () => {
      const result = await waitForChecks({ modelAdapter: {} as never }, 123, 1000);

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('GitHub client not available');
    });
  });

  describe('attemptAutoMerge', () => {
    it('merges PR when checks pass', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'success',
        reviewStatus: 'approved',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);
      vi.mocked(mockGitHubClient.mergePR).mockResolvedValue();

      const result = await attemptAutoMerge(deps, 123, 'squash', 'Test feature');

      expect(result.merged).toBe(true);
      expect(mockGitHubClient.mergePR).toHaveBeenCalledWith(123, {
        method: 'squash',
        commitTitle: 'feat(self-dev): Test feature (#123)',
        deleteBranch: true,
      });
    });

    it('returns not merged when PR number is 0', async () => {
      const result = await attemptAutoMerge(deps, 0, 'squash', 'Test feature');

      expect(result.merged).toBe(false);
      expect(result.reason).toBe('No PR to merge');
    });

    it('returns not merged when GitHub client is not available', async () => {
      const result = await attemptAutoMerge(
        { modelAdapter: {} as never },
        123,
        'squash',
        'Test feature'
      );

      expect(result.merged).toBe(false);
      expect(result.reason).toBe('GitHub client not available');
    });

    it('returns not merged when checks fail', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'failure',
        reviewStatus: 'pending',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);

      const result = await attemptAutoMerge(deps, 123, 'squash', 'Test feature');

      expect(result.merged).toBe(false);
      expect(result.reason).toBe('CI checks failed');
    });

    it('returns not merged when merge fails', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'success',
        reviewStatus: 'approved',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);
      vi.mocked(mockGitHubClient.mergePR).mockRejectedValue(new Error('Merge conflict'));

      const result = await attemptAutoMerge(deps, 123, 'squash', 'Test feature');

      expect(result.merged).toBe(false);
      expect(result.reason).toBe('Merge conflict');
    });

    it('uses rebase merge method when specified', async () => {
      const status: PRStatus = {
        mergeable: true,
        checksStatus: 'success',
        reviewStatus: 'approved',
      };
      vi.mocked(mockGitHubClient.getPRStatus).mockResolvedValue(status);
      vi.mocked(mockGitHubClient.mergePR).mockResolvedValue();

      await attemptAutoMerge(deps, 123, 'rebase', 'Test feature');

      expect(mockGitHubClient.mergePR).toHaveBeenCalledWith(123, {
        method: 'rebase',
        commitTitle: 'feat(self-dev): Test feature (#123)',
        deleteBranch: true,
      });
    });
  });
});
