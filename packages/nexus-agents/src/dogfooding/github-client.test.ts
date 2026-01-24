/**
 * nexus-agents/dogfooding - GitHub Client Tests
 *
 * Unit tests for the GitHub REST API client.
 *
 * @module dogfooding/github-client.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitHubClient,
  GitHubError,
  parsePRUrl,
  createGitHubClientFromEnv,
  type GitHubClientConfig,
} from './github-client.js';

/**
 * Mock fetch response helper.
 */
function createMockResponse(
  data: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {}
): Response {
  const { ok = true, status = 200, statusText = 'OK' } = options;
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response;
}

describe('GitHubClient', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with token', () => {
      const client = new GitHubClient({ token: 'test-token' });

      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should use default base URL', () => {
      const client = new GitHubClient({ token: 'test-token' });

      // We can verify the base URL indirectly via request
      expect(client).toBeDefined();
    });

    it('should accept custom base URL for GitHub Enterprise', () => {
      const config: GitHubClientConfig = {
        token: 'test-token',
        baseUrl: 'https://github.mycompany.com/api/v3',
      };
      const client = new GitHubClient(config);

      expect(client).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const config: GitHubClientConfig = {
        token: 'test-token',
        timeoutMs: 60000,
      };
      const client = new GitHubClient(config);

      expect(client).toBeDefined();
    });
  });

  describe('getPullRequest', () => {
    it('should fetch PR metadata including file changes', async () => {
      const prData = {
        number: 123,
        title: 'Test PR',
        body: 'PR description',
        user: { login: 'testuser' },
        base: { ref: 'main' },
        head: { ref: 'feature-branch', sha: 'abc123' },
        html_url: 'https://github.com/owner/repo/pull/123',
        draft: false,
        labels: [{ name: 'enhancement' }],
        additions: 50,
        deletions: 10,
      };

      const filesData = [
        {
          filename: 'src/index.ts',
          status: 'modified',
          additions: 30,
          deletions: 5,
          patch: '@@ -1,3 +1,5 @@\n+new code',
        },
        {
          filename: 'src/new.ts',
          status: 'added',
          additions: 20,
          deletions: 0,
          patch: '@@ -0,0 +1,20 @@\n+new file',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(createMockResponse(prData))
        .mockResolvedValueOnce(createMockResponse(filesData));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.number).toBe(123);
        expect(result.value.title).toBe('Test PR');
        expect(result.value.author).toBe('testuser');
        expect(result.value.files).toHaveLength(2);
        expect(result.value.additions).toBe(50);
        expect(result.value.deletions).toBe(10);
        expect(result.value.labels).toContain('enhancement');
      }
    });

    it('should handle PR with no labels', async () => {
      const prData = {
        number: 123,
        title: 'Test PR',
        body: null,
        user: { login: 'testuser' },
        base: { ref: 'main' },
        head: { ref: 'feature-branch', sha: 'abc123' },
        html_url: 'https://github.com/owner/repo/pull/123',
        draft: false,
        labels: [],
        additions: 10,
        deletions: 5,
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(prData))
        .mockResolvedValueOnce(createMockResponse([]));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.labels).toEqual([]);
        expect(result.value.body).toBe('');
      }
    });

    it('should handle renamed files', async () => {
      const prData = {
        number: 123,
        title: 'Test PR',
        body: '',
        user: { login: 'testuser' },
        base: { ref: 'main' },
        head: { ref: 'feature', sha: 'abc123' },
        html_url: 'https://github.com/owner/repo/pull/123',
        draft: false,
        labels: [],
        additions: 0,
        deletions: 0,
      };

      const filesData = [
        {
          filename: 'src/new-name.ts',
          status: 'renamed',
          additions: 0,
          deletions: 0,
          previous_filename: 'src/old-name.ts',
        },
      ];

      mockFetch
        .mockResolvedValueOnce(createMockResponse(prData))
        .mockResolvedValueOnce(createMockResponse(filesData));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files[0]?.status).toBe('renamed');
        expect(result.value.files[0]?.previousFilename).toBe('src/old-name.ts');
      }
    });

    it('should handle file statuses correctly', async () => {
      const prData = {
        number: 123,
        title: 'Test PR',
        body: '',
        user: { login: 'testuser' },
        base: { ref: 'main' },
        head: { ref: 'feature', sha: 'abc123' },
        html_url: 'https://github.com/owner/repo/pull/123',
        draft: false,
        labels: [],
        additions: 10,
        deletions: 5,
      };

      const filesData = [
        { filename: 'added.ts', status: 'added', additions: 10, deletions: 0 },
        { filename: 'removed.ts', status: 'removed', additions: 0, deletions: 5 },
        { filename: 'modified.ts', status: 'modified', additions: 5, deletions: 2 },
        { filename: 'copied.ts', status: 'copied', additions: 0, deletions: 0 },
        { filename: 'unknown.ts', status: 'unknown_status', additions: 0, deletions: 0 },
      ];

      mockFetch
        .mockResolvedValueOnce(createMockResponse(prData))
        .mockResolvedValueOnce(createMockResponse(filesData));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files[0]?.status).toBe('added');
        expect(result.value.files[1]?.status).toBe('removed');
        expect(result.value.files[2]?.status).toBe('modified');
        expect(result.value.files[3]?.status).toBe('copied');
        expect(result.value.files[4]?.status).toBe('modified'); // Unknown defaults to modified
      }
    });

    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Not Found' },
          { ok: false, status: 404, statusText: 'Not Found' }
        )
      );

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 999);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(GitHubError);
        expect(result.error.statusCode).toBe(404);
      }
    });

    it('should handle rate limit error (403)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'API rate limit exceeded' },
          { ok: false, status: 403, statusText: 'Forbidden' }
        )
      );

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toContain('Forbidden');
      }
    });

    it('should handle rate limit error (429)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Too many requests' },
          { ok: false, status: 429, statusText: 'Too Many Requests' }
        )
      );

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.statusCode).toBe(429);
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.statusCode).toBe(0);
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle timeout via AbortController', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const client = new GitHubClient({ token: 'test-token', timeoutMs: 100 });
      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('aborted');
      }
    });

    it('should send correct authorization headers', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            number: 123,
            title: 'Test',
            body: '',
            user: { login: 'test' },
            base: { ref: 'main' },
            head: { ref: 'feat', sha: 'abc' },
            html_url: 'https://github.com/o/r/pull/123',
            draft: false,
            labels: [],
            additions: 0,
            deletions: 0,
          })
        )
        .mockResolvedValueOnce(createMockResponse([]));

      const client = new GitHubClient({ token: 'my-secret-token' });
      await client.getPullRequest('owner', 'repo', 123);

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(callArgs[1]?.headers).toMatchObject({
        Authorization: 'Bearer my-secret-token',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nexus-agents/1.0',
      });
    });

    it('should use custom base URL', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            number: 1,
            title: 'Test',
            body: '',
            user: { login: 'test' },
            base: { ref: 'main' },
            head: { ref: 'feat', sha: 'abc' },
            html_url: 'https://enterprise.example.com/o/r/pull/1',
            draft: false,
            labels: [],
            additions: 0,
            deletions: 0,
          })
        )
        .mockResolvedValueOnce(createMockResponse([]));

      const client = new GitHubClient({
        token: 'token',
        baseUrl: 'https://github.enterprise.com/api/v3',
      });
      await client.getPullRequest('owner', 'repo', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.enterprise.com/api/v3/repos/owner/repo/pulls/1',
        expect.anything()
      );
    });
  });

  describe('createReview', () => {
    it('should post a review with APPROVE event', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 456 }));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.createReview('owner', 'repo', 123, 'LGTM!', 'approve');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(456);
      }

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(callArgs[0]).toContain('/repos/owner/repo/pulls/123/reviews');
      const body = JSON.parse(callArgs[1]?.body as string) as { body: string; event: string };
      expect(body.event).toBe('APPROVE');
      expect(body.body).toBe('LGTM!');
    });

    it('should post a review with REQUEST_CHANGES event', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 789 }));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.createReview(
        'owner',
        'repo',
        123,
        'Please fix the issues',
        'request_changes'
      );

      expect(result.ok).toBe(true);

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1]?.body as string) as { event: string };
      expect(body.event).toBe('REQUEST_CHANGES');
    });

    it('should post a review with COMMENT event', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 101 }));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.createReview('owner', 'repo', 123, 'Some feedback', 'comment');

      expect(result.ok).toBe(true);

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1]?.body as string) as { event: string };
      expect(body.event).toBe('COMMENT');
    });

    it('should handle review creation failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Validation Failed' },
          { ok: false, status: 422, statusText: 'Unprocessable Entity' }
        )
      );

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.createReview('owner', 'repo', 123, 'Review', 'approve');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.statusCode).toBe(422);
      }
    });
  });

  describe('createComment', () => {
    it('should post a general comment', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 555 }));

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.createComment('owner', 'repo', 123, 'A general comment');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(555);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/owner/repo/issues/123/comments'),
        expect.anything()
      );
    });

    it('should handle comment creation failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { message: 'Forbidden' },
          { ok: false, status: 403, statusText: 'Forbidden' }
        )
      );

      const client = new GitHubClient({ token: 'test-token' });
      const result = await client.createComment('owner', 'repo', 123, 'Comment');

      expect(result.ok).toBe(false);
    });
  });
});

describe('parsePRUrl', () => {
  describe('valid URLs', () => {
    it('should parse full GitHub URL', () => {
      const result = parsePRUrl('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('owner');
        expect(result.value.repo).toBe('repo');
        expect(result.value.prNumber).toBe(123);
      }
    });

    it('should parse URL with www prefix', () => {
      const result = parsePRUrl('https://www.github.com/owner/repo/pull/456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.prNumber).toBe(456);
      }
    });

    it('should parse short format with hash', () => {
      const result = parsePRUrl('owner/repo#789');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('owner');
        expect(result.value.repo).toBe('repo');
        expect(result.value.prNumber).toBe(789);
      }
    });

    it('should parse short format with /pull/', () => {
      const result = parsePRUrl('owner/repo/pull/101');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('owner');
        expect(result.value.repo).toBe('repo');
        expect(result.value.prNumber).toBe(101);
      }
    });

    it('should handle repos with hyphens', () => {
      const result = parsePRUrl('https://github.com/my-org/my-repo/pull/55');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('my-org');
        expect(result.value.repo).toBe('my-repo');
      }
    });

    it('should handle repos with underscores', () => {
      const result = parsePRUrl('my_org/my_repo#42');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('my_org');
        expect(result.value.repo).toBe('my_repo');
      }
    });

    it('should handle large PR numbers', () => {
      const result = parsePRUrl('https://github.com/owner/repo/pull/99999');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.prNumber).toBe(99999);
      }
    });
  });

  describe('invalid URLs', () => {
    it('should reject empty string', () => {
      const result = parsePRUrl('');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid PR URL');
      }
    });

    it('should reject random text', () => {
      const result = parsePRUrl('not a url at all');

      expect(result.ok).toBe(false);
    });

    it('should reject URL without PR number', () => {
      const result = parsePRUrl('https://github.com/owner/repo/pull/');

      expect(result.ok).toBe(false);
    });

    it('should reject issue URL (not PR)', () => {
      const result = parsePRUrl('https://github.com/owner/repo/issues/123');

      expect(result.ok).toBe(false);
    });

    it('should reject partial short format', () => {
      const result = parsePRUrl('owner/repo');

      expect(result.ok).toBe(false);
    });

    it('should reject format with non-numeric PR number', () => {
      const result = parsePRUrl('owner/repo#abc');

      expect(result.ok).toBe(false);
    });

    it('should reject URL with only owner', () => {
      const result = parsePRUrl('https://github.com/owner');

      expect(result.ok).toBe(false);
    });
  });
});

describe('createGitHubClientFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_API_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create client with GITHUB_TOKEN', () => {
    process.env.GITHUB_TOKEN = 'gh-token-123';

    const result = createGitHubClientFromEnv();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(GitHubClient);
    }
  });

  it('should create client with GH_TOKEN as fallback', () => {
    process.env.GH_TOKEN = 'gh-token-456';

    const result = createGitHubClientFromEnv();

    expect(result.ok).toBe(true);
  });

  it('should prefer GITHUB_TOKEN over GH_TOKEN', () => {
    process.env.GITHUB_TOKEN = 'primary-token';
    process.env.GH_TOKEN = 'fallback-token';

    const result = createGitHubClientFromEnv();

    expect(result.ok).toBe(true);
  });

  it('should use custom GITHUB_API_URL', () => {
    process.env.GITHUB_TOKEN = 'token';
    process.env.GITHUB_API_URL = 'https://github.enterprise.com/api/v3';

    const result = createGitHubClientFromEnv();

    expect(result.ok).toBe(true);
  });

  it('should return error when no token is set', () => {
    const result = createGitHubClientFromEnv();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('GITHUB_TOKEN');
      expect(result.error.message).toContain('GH_TOKEN');
    }
  });
});

describe('GitHubError', () => {
  it('should store status code', () => {
    const error = new GitHubError('Not found', 404);

    expect(error.name).toBe('GitHubError');
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('should store context', () => {
    const error = new GitHubError('Rate limited', 429, {
      path: '/repos/owner/repo',
      retryAfter: 60,
    });

    expect(error.context).toEqual({
      path: '/repos/owner/repo',
      retryAfter: 60,
    });
  });

  it('should work as Error subclass', () => {
    const error = new GitHubError('Test', 500);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error.stack).toBeDefined();
  });
});
