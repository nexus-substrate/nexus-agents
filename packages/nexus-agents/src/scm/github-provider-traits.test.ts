/**
 * Tests for GitHub provider trait implementations.
 *
 * Unit tests mock gh API calls to avoid real network calls.
 *
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubProvider } from './github-provider.js';
import {
  GitHubReviewer,
  GitHubUserInfo,
  createFullGitHubProvider,
} from './github-provider-traits.js';

// Mock child_process.execFile
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]): unknown => mockExecFile(...args),
}));

vi.mock('node:util', () => ({
  promisify:
    () =>
    (...args: unknown[]): unknown =>
      mockExecFile(...args),
}));

describe('GitHubReviewer', () => {
  let reviewer: GitHubReviewer;

  beforeEach(() => {
    const provider = new GitHubProvider('owner/repo');
    reviewer = new GitHubReviewer(provider);
    mockExecFile.mockReset();
  });

  describe('getPullRequestDetail', () => {
    it('returns full PR detail with files', async () => {
      // First call: PR metadata
      mockExecFile.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 42,
          title: 'Test PR',
          body: 'PR description',
          html_url: 'https://github.com/owner/repo/pull/42',
          user: { login: 'testuser' },
          author_association: 'COLLABORATOR',
          base: { ref: 'main' },
          head: { ref: 'feat/thing', sha: 'abc123' },
          draft: false,
          labels: [{ name: 'enhancement' }],
          additions: 100,
          deletions: 20,
        }),
      });
      // Second call: Files
      mockExecFile.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 80,
            deletions: 10,
            patch: '@@ -1,3 +1,5 @@\n+new line',
          },
          {
            filename: 'src/new-file.ts',
            status: 'added',
            additions: 20,
            deletions: 0,
          },
        ]),
      });

      const result = await reviewer.getPullRequestDetail(42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.number).toBe(42);
        expect(result.value.title).toBe('Test PR');
        expect(result.value.authorAssociation).toBe('COLLABORATOR');
        expect(result.value.draft).toBe(false);
        expect(result.value.headSha).toBe('abc123');
        expect(result.value.files).toHaveLength(2);
        expect(result.value.files[0]?.filename).toBe('src/index.ts');
        expect(result.value.files[0]?.patch).toContain('new line');
        expect(result.value.files[1]?.status).toBe('added');
        expect(result.value.additions).toBe(100);
        expect(result.value.deletions).toBe(20);
      }
    });

    it('returns error on API failure', async () => {
      mockExecFile.mockRejectedValue(new Error('gh: not found'));

      const result = await reviewer.getPullRequestDetail(999);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.platform).toBe('github');
        expect(result.error.message).toContain('gh api failed');
      }
    });
  });

  describe('createReview', () => {
    it('posts approve review', async () => {
      mockExecFile.mockResolvedValue({ stdout: '{}' });

      const result = await reviewer.createReview(42, 'LGTM', 'approve');

      expect(result.ok).toBe(true);
      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args).toContain('event=APPROVE');
    });

    it('posts request_changes review', async () => {
      mockExecFile.mockResolvedValue({ stdout: '{}' });

      const result = await reviewer.createReview(42, 'Needs fixes', 'request_changes');

      expect(result.ok).toBe(true);
      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args).toContain('event=REQUEST_CHANGES');
    });
  });

  describe('getIssueDetail', () => {
    it('returns issue with author association', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          number: 10,
          title: 'Bug report',
          body: 'Something broken',
          user: { login: 'reporter' },
          author_association: 'NONE',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/10',
          labels: [{ name: 'bug' }],
          created_at: '2026-01-01T00:00:00Z',
        }),
      });

      const result = await reviewer.getIssueDetail(10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.number).toBe(10);
        expect(result.value.authorAssociation).toBe('NONE');
        expect(result.value.state).toBe('open');
        expect(result.value.url).toContain('/issues/10');
      }
    });
  });

  describe('listCommentDetails', () => {
    it('returns comments with author associations', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify([
          {
            id: 1,
            body: 'First comment',
            user: { login: 'maintainer' },
            author_association: 'OWNER',
            created_at: '2026-01-02T00:00:00Z',
          },
          {
            id: 2,
            body: 'Second comment',
            user: { login: 'external' },
            author_association: 'NONE',
            created_at: '2026-01-03T00:00:00Z',
          },
        ]),
      });

      const result = await reviewer.listCommentDetails(10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.authorAssociation).toBe('OWNER');
        expect(result.value[1]?.authorAssociation).toBe('NONE');
      }
    });
  });
});

describe('GitHubUserInfo', () => {
  const userInfo = new GitHubUserInfo();

  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('returns user metadata', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        login: 'octocat',
        name: 'The Octocat',
        company: 'GitHub',
        followers: 1000,
        following: 50,
        public_repos: 42,
        created_at: '2011-01-25T00:00:00Z',
      }),
    });

    const result = await userInfo.fetchUserMetadata('octocat');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.login).toBe('octocat');
      expect(result.value.name).toBe('The Octocat');
      expect(result.value.company).toBe('GitHub');
      expect(result.value.followers).toBe(1000);
      expect(result.value.publicRepos).toBe(42);
    }
  });

  it('returns error for non-existent user', async () => {
    mockExecFile.mockRejectedValue(new Error('gh: not found'));

    const result = await userInfo.fetchUserMetadata('nonexistent');

    expect(result.ok).toBe(false);
  });
});

describe('createFullGitHubProvider', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('creates provider with all trait methods', () => {
    const provider = createFullGitHubProvider('owner/repo');

    expect(provider.platform).toBe('github');
    expect(provider.repo).toBe('owner/repo');
    // Core methods
    expect(typeof provider.getIssue).toBe('function');
    expect(typeof provider.listIssues).toBe('function');
    expect(typeof provider.createPR).toBe('function');
    // Reviewer trait
    expect(typeof provider.getPullRequestDetail).toBe('function');
    expect(typeof provider.createReview).toBe('function');
    expect(typeof provider.getIssueDetail).toBe('function');
    expect(typeof provider.listCommentDetails).toBe('function');
    // UserInfo trait
    expect(typeof provider.fetchUserMetadata).toBe('function');
  });

  it('works as ReviewCapableProvider', async () => {
    const provider = createFullGitHubProvider('owner/repo');

    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({
        number: 1,
        title: 'PR',
        body: '',
        html_url: 'https://github.com/owner/repo/pull/1',
        user: { login: 'dev' },
        author_association: 'MEMBER',
        base: { ref: 'main' },
        head: { ref: 'feat', sha: 'def456' },
        draft: false,
        labels: [],
        additions: 5,
        deletions: 2,
      }),
    });
    mockExecFile.mockResolvedValueOnce({ stdout: '[]' });

    const result = await provider.getPullRequestDetail(1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headSha).toBe('def456');
    }
  });
});
