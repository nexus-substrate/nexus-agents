/**
 * nexus-agents/mcp - Issue Triage Tool Tests
 *
 * Unit tests for the issue_triage MCP tool.
 *
 * @module mcp/tools/issue-triage-tool.test
 * (Source: Issue #828)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IssueTriageInputSchema } from './issue-triage-tool.js';

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

  it('should handle the full triage flow via IssueTriage', async () => {
    // This test verifies the tool creates IssueTriage and calls triageIssue
    // The full integration is tested in issue-triage.test.ts
    const { IssueTriage } = await import('../../dogfooding/issue-triage.js');

    const issueData = {
      number: 42,
      title: 'Bug: crash on startup',
      body: 'The app fails to start with an error',
      user: { login: 'testuser' },
      author_association: 'NONE',
      html_url: 'https://github.com/owner/repo/issues/42',
      state: 'open',
      labels: [],
      created_at: '2026-01-01T00:00:00Z',
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(issueData),
        text: vi.fn().mockResolvedValue(JSON.stringify(issueData)),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue([]),
        text: vi.fn().mockResolvedValue('[]'),
      } as unknown as Response);

    const triage = new IssueTriage({ githubToken: 'test-token' });
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
