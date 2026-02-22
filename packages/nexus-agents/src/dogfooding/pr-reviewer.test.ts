/**
 * nexus-agents/dogfooding - PR Reviewer Tests
 *
 * Unit tests for the multi-agent PR review orchestrator.
 * Tests focus on URL parsing, GitHub client interaction, and error handling.
 * Expert execution is tested via integration tests.
 *
 * @module dogfooding/pr-reviewer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, err } from '../core/index.js';
import { ScmError } from '../scm/types.js';
import type { ScmPullRequestDetail } from '../scm/types.js';
import { parsePRUrl } from './github-client.js';

// Mock SCM provider traits
const mockGetPullRequestDetail = vi.fn();
const mockCreateReview = vi.fn();
const mockCreateFullGitHubProvider = vi.fn();

vi.mock('../scm/github-provider-traits.js', () => ({
  createFullGitHubProvider: (...args: unknown[]): unknown => mockCreateFullGitHubProvider(...args),
}));

// Mock SwarmObserver
const mockRecordInteraction = vi.fn();
const mockGenerateTraceId = vi.fn(() => 'test-trace-id-12345');

vi.mock('../observability/swarm-observer.js', () => {
  const MockSwarmObserver = vi.fn().mockImplementation(() => ({
    recordInteraction: mockRecordInteraction,
  }));

  // Add static method
  (MockSwarmObserver as unknown as { generateTraceId: () => string }).generateTraceId =
    mockGenerateTraceId;

  return {
    SwarmObserver: MockSwarmObserver,
  };
});

// Mock logger
vi.mock('../core/index.js', async () => {
  const actual = await vi.importActual<typeof import('../core/index.js')>('../core/index.js');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    })),
  };
});

/** Creates a mock SCM PR detail that the provider would return. */
function createMockPRDetail(): ScmPullRequestDetail {
  return {
    number: 123,
    title: 'Test PR',
    body: 'This is a test pull request',
    author: 'testuser',
    authorAssociation: 'CONTRIBUTOR',
    base: 'main',
    head: 'feature-branch',
    headSha: 'abc123def456',
    url: 'https://github.com/owner/repo/pull/123',
    draft: false,
    labels: ['enhancement'],
    files: [
      {
        filename: 'src/index.ts',
        status: 'modified',
        additions: 50,
        deletions: 10,
        patch: '@@ -1,10 +1,50 @@\n+// New code',
      },
    ],
    additions: 50,
    deletions: 10,
  };
}

describe('PRReviewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateFullGitHubProvider.mockReturnValue({
      platform: 'github',
      repo: 'owner/repo',
      getPullRequestDetail: mockGetPullRequestDetail,
      createReview: mockCreateReview,
      getIssueDetail: vi.fn(),
      listCommentDetails: vi.fn(),
      fetchUserMetadata: vi.fn(),
    });
    mockGetPullRequestDetail.mockResolvedValue(ok(createMockPRDetail()));
    mockCreateReview.mockResolvedValue(ok(undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create with default config', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer();

      expect(reviewer).toBeInstanceOf(PRReviewer);
    });

    it('should merge partial config with defaults', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({
        dryRun: true,
        experts: ['security', 'testing'],
      });

      expect(reviewer).toBeDefined();
    });
  });

  describe('createPRReviewer', () => {
    it('should create reviewer with factory function', async () => {
      const { createPRReviewer, PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = createPRReviewer();

      expect(reviewer).toBeInstanceOf(PRReviewer);
    });

    it('should pass config through factory', async () => {
      const { createPRReviewer } = await import('./pr-reviewer.js');
      const reviewer = createPRReviewer({ dryRun: true });

      expect(reviewer).toBeDefined();
    });
  });

  describe('reviewPR - URL parsing', () => {
    it('should accept valid GitHub PR URL', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });

      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(true);
    });

    it('should accept short format PR URL', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });

      const result = await reviewer.reviewPR('owner/repo#123');

      expect(result.ok).toBe(true);
    });

    it('should return error for invalid PR URL', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });

      const result = await reviewer.reviewPR('invalid-url');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid PR URL');
      }
    });

    it('should return error for empty URL', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });

      const result = await reviewer.reviewPR('');

      expect(result.ok).toBe(false);
    });
  });

  describe('reviewPR - GitHub client', () => {
    it('should create SCM provider with parsed repo', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });

      await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(mockCreateFullGitHubProvider).toHaveBeenCalledWith('owner/repo');
    });

    it('should return error on SCM API failure', async () => {
      mockGetPullRequestDetail.mockResolvedValue(
        err(new ScmError('gh api failed: Not Found', 'github', 404))
      );

      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });

      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(false);
    });
  });

  describe('reviewPR - SCM API errors', () => {
    it('should handle SCM rate limit error', async () => {
      mockGetPullRequestDetail.mockResolvedValue(
        err(new ScmError('gh api failed: rate limit exceeded', 'github', 403))
      );

      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });
      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ScmError);
      }
    });

    it('should handle SCM not found error', async () => {
      mockGetPullRequestDetail.mockResolvedValue(
        err(new ScmError('gh api failed: Not Found', 'github', 404))
      );

      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({ dryRun: true });
      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/999');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ScmError);
      }
    });
  });

  describe('reviewPR - Result structure', () => {
    it('should return result with expected fields', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({
        dryRun: true,
        githubToken: 'test-token',
      });

      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.prNumber).toBe(123);
        expect(result.value.repository).toBe('owner/repo');
        expect(result.value.decision).toBeDefined();
        expect(result.value.summary).toBeDefined();
        expect(result.value.expertReviews).toBeDefined();
        expect(result.value.findingsBySeverity).toBeDefined();
        expect(result.value.findingsByCategory).toBeDefined();
        expect(result.value.totalDurationMs).toBeGreaterThanOrEqual(0);
        expect(result.value.expertCount).toBeGreaterThanOrEqual(0);
        expect(result.value.consensusScore).toBeGreaterThanOrEqual(0);
        expect(result.value.consensusScore).toBeLessThanOrEqual(1);
        expect(result.value.debateRounds).toBeGreaterThanOrEqual(1);
        expect(result.value.timestamp).toBeDefined();
      }
    });

    it('should include all severity categories in findingsBySeverity', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({
        dryRun: true,
        githubToken: 'test-token',
      });

      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.findingsBySeverity).toHaveProperty('critical');
        expect(result.value.findingsBySeverity).toHaveProperty('high');
        expect(result.value.findingsBySeverity).toHaveProperty('medium');
        expect(result.value.findingsBySeverity).toHaveProperty('low');
        expect(result.value.findingsBySeverity).toHaveProperty('info');
      }
    });

    it('should include all review categories in findingsByCategory', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({
        dryRun: true,
        githubToken: 'test-token',
      });

      const result = await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.findingsByCategory).toHaveProperty('security');
        expect(result.value.findingsByCategory).toHaveProperty('performance');
        expect(result.value.findingsByCategory).toHaveProperty('code_quality');
        expect(result.value.findingsByCategory).toHaveProperty('testing');
        expect(result.value.findingsByCategory).toHaveProperty('documentation');
        expect(result.value.findingsByCategory).toHaveProperty('architecture');
      }
    });
  });

  describe('reviewPR - GitHub posting', () => {
    it('should not post review in dry-run mode', async () => {
      const { PRReviewer } = await import('./pr-reviewer.js');
      const reviewer = new PRReviewer({
        dryRun: true,
        githubToken: 'test-token',
      });

      await reviewer.reviewPR('https://github.com/owner/repo/pull/123');

      expect(mockCreateReview).not.toHaveBeenCalled();
    });
  });
});

// Test parsePRUrl separately since it's a pure function
describe('parsePRUrl', () => {
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
      expect(result.value.prNumber).toBe(101);
    }
  });

  it('should handle repos with hyphens and underscores', () => {
    const result1 = parsePRUrl('my-org/my-repo#55');
    const result2 = parsePRUrl('my_org/my_repo#42');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  it('should reject empty string', () => {
    const result = parsePRUrl('');

    expect(result.ok).toBe(false);
  });

  it('should reject random text', () => {
    const result = parsePRUrl('not a url at all');

    expect(result.ok).toBe(false);
  });

  it('should reject URL without PR number', () => {
    const result = parsePRUrl('https://github.com/owner/repo/pull/');

    expect(result.ok).toBe(false);
  });

  it('should reject issue URL', () => {
    const result = parsePRUrl('https://github.com/owner/repo/issues/123');

    expect(result.ok).toBe(false);
  });
});
