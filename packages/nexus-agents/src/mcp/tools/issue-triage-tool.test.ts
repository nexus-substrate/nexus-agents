/**
 * nexus-agents/mcp - Issue Triage Tool Tests
 *
 * Unit tests for the issue_triage MCP tool.
 *
 * @module mcp/tools/issue-triage-tool.test
 * (Source: Issue #828)
 * (Source: Issue #1136 — Updated mocks for SCM provider migration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok } from '../../core/index.js';
import type { ScmIssueDetail, ScmCommentDetail } from '../../scm/types.js';
import { IssueTriageInputSchema } from './issue-triage-tool.js';

// Mock SCM provider traits (same pattern as issue-triage.test.ts)
const mockGetIssueDetail = vi.fn();
const mockListCommentDetails = vi.fn();
const mockListRepositoryLabels = vi.fn();
const mockCreateFullGitHubProvider = vi.fn();

vi.mock('../../scm/github-provider-traits.js', () => ({
  createFullGitHubProvider: (...args: unknown[]): unknown => mockCreateFullGitHubProvider(...args),
}));

// Mock logger to suppress output
vi.mock('../../core/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../core/index.js')>('../../core/index.js');
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

describe('IssueTriageInputSchema', () => {
  it('should validate a valid issue URL', () => {
    const result = IssueTriageInputSchema.safeParse({
      issueUrl: 'https://github.com/owner/repo/issues/123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.issueUrl).toBe('https://github.com/owner/repo/issues/123');
      expect(result.data.dryRun).toBe(true); // default
    }
  });

  it('should accept dryRun override', () => {
    const result = IssueTriageInputSchema.safeParse({
      issueUrl: 'https://github.com/owner/repo/issues/42',
      dryRun: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dryRun).toBe(false);
    }
  });

  it('should reject empty issueUrl', () => {
    const result = IssueTriageInputSchema.safeParse({
      issueUrl: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing issueUrl', () => {
    const result = IssueTriageInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject non-string issueUrl', () => {
    const result = IssueTriageInputSchema.safeParse({
      issueUrl: 123,
    });
    expect(result.success).toBe(false);
  });
});

describe('issue_triage tool integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateFullGitHubProvider.mockReturnValue({
      platform: 'github',
      repo: 'owner/repo',
      getIssueDetail: mockGetIssueDetail,
      listCommentDetails: mockListCommentDetails,
      listRepositoryLabels: mockListRepositoryLabels,
      fetchUserMetadata: vi.fn(),
    });
    mockListRepositoryLabels.mockResolvedValue(ok(['bug']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle the full triage flow via IssueTriage', async () => {
    const issueDetail: ScmIssueDetail = {
      number: 42,
      title: 'Bug: crash on startup',
      body: 'The app fails to start with an error',
      author: 'testuser',
      authorAssociation: 'NONE',
      url: 'https://github.com/owner/repo/issues/42',
      state: 'open',
      labels: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    const comments: ScmCommentDetail[] = [];

    mockGetIssueDetail.mockResolvedValue(ok(issueDetail));
    mockListCommentDetails.mockResolvedValue(ok(comments));

    const { IssueTriage } = await import('../../dogfooding/issue-triage.js');
    const triage = new IssueTriage();
    const result = await triage.triageIssue('https://github.com/owner/repo/issues/42');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.issueNumber).toBe(42);
      expect(result.value.proposedActions.length).toBeGreaterThan(0);
      // Verify all actions have corroboration validation
      for (const action of result.value.proposedActions) {
        expect(typeof action.corroborated).toBe('boolean');
        expect(typeof action.policyApproved).toBe('boolean');
      }
    }
  });
});
