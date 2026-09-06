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

    // #2962 site 4 regression: schema-drift surfaces as a typed
    // `schema mismatch` error with a useful path, not the
    // pre-fix misleading "Failed to parse JSON" TypeError-rewrap.
    it('returns schema-mismatch ScmError when gh JSON shape drifts', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          number: 42,
          title: 'Test issue',
          body: 'Description',
          // `labels` and `author` are missing — pre-fix this hit the
          // `raw.labels.map` deref inside mapIssue and was caught as a
          // TypeError that got rewrapped as "Failed to parse JSON".
          createdAt: '2026-01-01T00:00:00Z',
        }),
      });

      const result = await provider.getIssue(42);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.platform).toBe('github');
        expect(result.error.message).toContain('getIssue: schema mismatch');
        // The Zod path should call out the missing field.
        expect(result.error.message).toMatch(/labels|author/);
      }
    });

    // #2962 site 4: a truly malformed JSON (gh returned non-JSON) is
    // distinct from a schema mismatch — different label so debuggers
    // know which problem to chase.
    it('returns parse-failure ScmError when gh returns non-JSON', async () => {
      mockExecFile.mockResolvedValue({ stdout: '<html>404</html>' });

      const result = await provider.getIssue(42);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('getIssue: Failed to parse JSON');
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

  describe('listRepositoryLabels', () => {
    it('returns names from every paginated repository-label response', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'bug\ndocumentation\nhelp wanted\n' });

      const result = await provider.listRepositoryLabels();

      expect(result).toEqual({ ok: true, value: ['bug', 'documentation', 'help wanted'] });
      const callArgs = mockExecFile.mock.calls[0] as unknown[];
      expect(callArgs[1]).toEqual([
        'api',
        'repos/owner/repo/labels',
        '--paginate',
        '--jq',
        '.[].name',
      ]);
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

// ============================================================================
// createIssue must not report success for an issue it cannot identify
// ============================================================================

describe('createIssue identity', () => {
  // `gh issue create` has no `--json`, so the number can only be scraped from
  // the URL it prints. The previous form anchored to end-of-string and fell
  // back to `number: 0` INSIDE an ok(...), which is the one failure a caller
  // could not detect — and `task-tracker.createTask` feeds that straight into
  // `addComment(0)` and `gh issue close 0`.
  let provider: GitHubProvider;

  beforeEach(() => {
    provider = new GitHubProvider('owner/repo');
    mockExecFile.mockReset();
  });

  it('parses the number from a clean URL', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'https://github.com/o/r/issues/42\n' });

    const result = await provider.createIssue('t', 'b');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.number).toBe(42);
      expect(result.value.url).toBe('https://github.com/o/r/issues/42');
    }
  });

  it('parses the number when gh appends a notice line', async () => {
    // The end-anchored regex failed here and silently returned 0.
    mockExecFile.mockResolvedValue({
      stdout: 'https://github.com/o/r/issues/42\nnote: label applied\n',
    });

    const result = await provider.createIssue('t', 'b');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.number).toBe(42);
  });

  it('fails when the output carries no issue number', async () => {
    // A gh build that writes the URL to stderr leaves stdout empty. An issue
    // whose identity is unknown is not a usable result: reporting ok() hands
    // the caller a 0 to make its next API call with.
    mockExecFile.mockResolvedValue({ stdout: '' });

    const result = await provider.createIssue('t', 'b');

    expect(result.ok).toBe(false);
  });

  it('never returns issue number 0 on the success path', async () => {
    // The property, stated directly. GitHub issue numbers start at 1, so 0 is
    // only ever the placeholder.
    for (const stdout of [
      '',
      'nothing useful here',
      'https://github.com/o/r/pull/42',
      'error: could not create issue',
    ]) {
      mockExecFile.mockResolvedValue({ stdout });
      const result = await provider.createIssue('t', 'b');
      if (result.ok) expect(result.value.number).not.toBe(0);
    }
  });
});
