/**
 * Tests for GitHub provider trait implementations.
 *
 * Unit tests mock gh API calls to avoid real network calls.
 *
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubProvider } from './github-provider.js';
import {
  GitHubReviewer,
  GitHubUserInfo,
  createFullGitHubProvider,
  resetGhTokenCache,
} from './github-provider-traits.js';

// Mock child_process.execFile with a callback-compatible wrapper.
// The source code uses `promisify(execFile)` — the real promisify uses
// execFile[util.promisify.custom] if available, otherwise wraps for callback.
// We attach the custom symbol so promisify returns {stdout, stderr} like the real one.
const mockExecFile = vi.fn();

vi.mock('node:child_process', async () => {
  const util = await import('node:util');
  // Build a callback-style wrapper that also has a custom promisify
  const execFileFn = (...args: unknown[]): void => {
    // Find trailing callback
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') {
      const cb = lastArg as (err: Error | null, stdout: string, stderr: string) => void;
      const result = mockExecFile(...args) as
        | Promise<{ stdout: string; stderr?: string }>
        | { stdout: string; stderr?: string }
        | undefined;
      Promise.resolve(result)
        .then((r) => {
          const resolved = r ?? { stdout: '' };
          cb(null, resolved.stdout, resolved.stderr ?? '');
        })
        .catch((e: unknown) => {
          cb(e instanceof Error ? e : new Error(String(e)), '', '');
        });
    } else {
      mockExecFile(...args);
    }
  };
  // Attach custom promisify so `promisify(execFile)` returns {stdout, stderr}
  (execFileFn as unknown as Record<symbol, unknown>)[util.promisify.custom] = (
    ...args: unknown[]
  ): Promise<{ stdout: string; stderr?: string }> => {
    const result = mockExecFile(...args) as
      | Promise<{ stdout: string; stderr?: string }>
      | { stdout: string; stderr?: string }
      | undefined;
    return Promise.resolve(result).then((r) => r ?? { stdout: '' });
  };
  return { execFile: execFileFn };
});

/**
 * What `gh api <list> --paginate --jq '.[]'` actually writes: one compact JSON
 * object per line, concatenated across every page. The source switched to that
 * form because a bare `gh api` returns only GitHub's first 30 and drops the
 * `Link` cursor, and because `--paginate` alone concatenates one JSON ARRAY per
 * page, which is not parseable. Fixtures must match the real shape or they
 * would pass against a reader that cannot handle it.
 */
function ndjson(items: readonly unknown[]): string {
  return items.map((i) => JSON.stringify(i)).join('\n');
}

describe('GitHubReviewer', () => {
  let reviewer: GitHubReviewer;

  beforeEach(() => {
    const provider = new GitHubProvider('owner/repo');
    reviewer = new GitHubReviewer(provider);
    mockExecFile.mockReset();
    resetGhTokenCache();
    // Ensure resolveGhToken finds a token from env and doesn't spawn `gh auth token`
    // (which would consume a mockResolvedValueOnce meant for the API call).
    // GITHUB_TOKEN is checked first by resolveGhTokenImpl, so delete it to avoid
    // an empty-string value (e.g. from CI) bypassing GH_TOKEN.
    delete process.env['GITHUB_TOKEN'];
    process.env['GH_TOKEN'] = 'test-token';
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
        stdout: ndjson([
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

    describe('file status mapping', () => {
      beforeEach(() => {
        mockExecFile.mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 42,
            title: 'Status fidelity',
            body: '',
            html_url: 'https://github.com/owner/repo/pull/42',
            user: { login: 'testuser' },
            author_association: 'COLLABORATOR',
            base: { ref: 'main' },
            head: { ref: 'feat/status-fidelity', sha: 'abc123' },
            draft: false,
            labels: [],
            additions: 1,
            deletions: 1,
          }),
        });
      });

      it('preserves the changed status', async () => {
        mockExecFile.mockResolvedValueOnce({
          stdout: ndjson([
            { filename: 'changed.ts', status: 'changed', additions: 1, deletions: 1 },
          ]),
        });

        const result = await reviewer.getPullRequestDetail(42);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.files[0]?.status).toBe('changed');
          expect(result.value.files[0]?.rawStatus).toBeUndefined();
        }
      });

      it('preserves the unchanged status', async () => {
        mockExecFile.mockResolvedValueOnce({
          stdout: ndjson([
            { filename: 'unchanged.ts', status: 'unchanged', additions: 0, deletions: 0 },
          ]),
        });

        const result = await reviewer.getPullRequestDetail(42);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.files[0]?.status).toBe('unchanged');
          expect(result.value.files[0]?.rawStatus).toBeUndefined();
        }
      });

      it('maps an unknown status without hiding its raw value', async () => {
        mockExecFile.mockResolvedValueOnce({
          stdout: ndjson([{ filename: 'weird.ts', status: 'weird', additions: 0, deletions: 0 }]),
        });

        const result = await reviewer.getPullRequestDetail(42);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.files[0]?.status).toBe('unknown');
          expect(result.value.files[0]?.rawStatus).toBe('weird');
        }
      });
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
        stdout: ndjson([
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

describe('resolveGhToken inflight coalescing', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    resetGhTokenCache();
    delete process.env['GITHUB_TOKEN'];
    delete process.env['GH_TOKEN'];
  });

  afterEach(() => {
    // Restore GH_TOKEN for other test suites
    process.env['GH_TOKEN'] = 'test-token';
  });

  it('coalesces concurrent calls into a single gh auth token invocation', async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(function (...args: unknown[]): Promise<{ stdout: string }> {
      const cmdArgs = args[1] as string[];
      if (cmdArgs[0] === 'auth' && cmdArgs[1] === 'token') {
        callCount++;
        return Promise.resolve({ stdout: 'test-resolved-token\n' });
      }
      // For execGhApi calls (api endpoint)
      return Promise.resolve({ stdout: '{}' });
    });

    const provider = createFullGitHubProvider('owner/repo');

    // Fire 3 concurrent calls that all trigger resolveGhToken
    await Promise.all([
      provider.getIssueDetail(1),
      provider.getIssueDetail(2),
      provider.getIssueDetail(3),
    ]);

    // gh auth token should have been called exactly once
    expect(callCount).toBe(1);
  });
});

describe('createFullGitHubProvider', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    resetGhTokenCache();
    // Set GH_TOKEN so resolveGhToken doesn't spawn `gh auth token`
    process.env['GH_TOKEN'] = 'test-token';
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

// ============================================================================
// List endpoints must fetch every page, and say so in the command they run
// ============================================================================

describe('paginated list endpoints', () => {
  // A bare `gh api repos/o/r/pulls/N/files` returns GitHub's default first page
  // of 30 and discards the `Link` cursor. `getPullRequestDetail` therefore saw
  // at most 30 changed files of any PR, and `listCommentDetails` at most the 30
  // OLDEST comments — both returning ok(...) with nothing to say a page had been
  // left behind. Downstream, `getFileReviewCoverage` divided by that truncated
  // denominator and posted "30 of 30 files reviewed (full)" on a 120-file PR.
  let reviewer: GitHubReviewer;

  beforeEach(() => {
    reviewer = new GitHubReviewer(new GitHubProvider('owner/repo'));
    mockExecFile.mockReset();
    resetGhTokenCache();
    delete process.env['GITHUB_TOKEN'];
    process.env['GH_TOKEN'] = 'test-token';
  });

  function argsOfCall(index: number): string[] {
    return (mockExecFile.mock.calls[index]?.[1] ?? []) as string[];
  }

  it('asks gh to walk every page of the PR file list', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify({ number: 42 }) });
    mockExecFile.mockResolvedValueOnce({
      stdout: ndjson([{ filename: 'a.ts', status: 'modified' }]),
    });

    await reviewer.getPullRequestDetail(42);

    const args = argsOfCall(1);
    expect(args).toContain('--paginate');
    // `--paginate` alone concatenates one JSON array per page, which does not
    // parse. `--slurp` fixes that but landed in gh 2.51; `--jq '.[]'` works on
    // every version, so the flag pair is load-bearing, not decorative.
    expect(args).toContain('--jq');
    expect(args).toContain('.[]');
    expect(args.some((a) => a.includes('per_page=100'))).toBe(true);
  });

  it('returns more than one page worth of files', async () => {
    // The assertion the 30-cap fails: 45 files must arrive as 45.
    const files = Array.from({ length: 45 }, (_, i) => ({
      filename: `src/f${String(i)}.ts`,
      status: 'modified',
      additions: 1,
      deletions: 0,
    }));
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({
        number: 42,
        title: 'Big PR',
        body: '',
        html_url: 'https://github.com/owner/repo/pull/42',
        user: { login: 'testuser' },
        author_association: 'COLLABORATOR',
        base: { ref: 'main' },
        head: { ref: 'feat/big', sha: 'abc123' },
        draft: false,
        labels: [],
        additions: 45,
        deletions: 0,
      }),
    });
    mockExecFile.mockResolvedValueOnce({ stdout: ndjson(files) });

    const result = await reviewer.getPullRequestDetail(42);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.files).toHaveLength(45);
  });

  it('asks gh to walk every page of the comment list', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: ndjson([]) });

    await reviewer.listCommentDetails(7);

    const args = argsOfCall(0);
    expect(args).toContain('--paginate');
    expect(args.some((a) => a.includes('per_page=100'))).toBe(true);
  });

  it('reads an empty list as zero items, not one bad line', async () => {
    // The empty case, named: `''.split('\n')` is `['']`, so without the blank
    // filter an issue with no comments would fail to parse rather than return
    // none — and this endpoint is on the reputation path, where a parse error
    // and "no comments" mean very different things.
    mockExecFile.mockResolvedValueOnce({ stdout: '' });

    const result = await reviewer.listCommentDetails(7);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('fails loudly when a page line cannot be parsed', async () => {
    // A truncated stream must not silently yield the objects that did parse.
    mockExecFile.mockResolvedValueOnce({ stdout: '{"id":1}\n{"id":' });

    const result = await reviewer.listCommentDetails(7);

    expect(result.ok).toBe(false);
  });
});
