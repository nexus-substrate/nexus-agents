/**
 * Handler-branch coverage for the issue_triage MCP tool (#2953).
 *
 * The handler closure has three distinct branches whose result envelope
 * shape (success/error category) flows into MCP transport, the audit
 * log, and the adaptive-routing OutcomeStore. Pre-#2953 the existing
 * `issue-triage-tool.test.ts` covered only the input schema — a refactor
 * that swapped `recordTriageOutcome(false)` and `recordTriageOutcome(true)`
 * would have shipped green and inverted the adaptive routing signal for
 * the `planning` category forever.
 *
 * This file lives separately from `issue-triage-tool.test.ts` because it
 * needs a module-level mock of `dogfooding/issue-triage.js` that the
 * sibling test relies on being real.
 *
 * @module mcp/tools/issue-triage-tool-handler.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerContext } from '../middleware/secure-handler.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';

const mockTriageIssue = vi.fn();
vi.mock('../../dogfooding/issue-triage.js', () => ({
  // vitest 4: arrow functions aren't constructor-callable. Use a real
  // function so `new IssueTriage(...)` works.
  IssueTriage: vi.fn(function () {
    return { triageIssue: mockTriageIssue };
  }),
}));

import { _testing } from './issue-triage-tool.js';

function makeRateLimiter(): RateLimiter {
  return {
    tryAcquire: vi.fn().mockReturnValue(true),
    getState: vi.fn().mockReturnValue({ nextTokenMs: 0 }),
  } as unknown as RateLimiter;
}

function makeDeps(): Parameters<typeof _testing.createIssueTriageHandler>[0] {
  return {
    rateLimiter: makeRateLimiter(),
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
  };
}

function makeCtx(): HandlerContext {
  return {
    requestContext: {
      requestId: 'test-req',
      toolName: 'issue_triage',
      startTimeMs: 0,
    } as unknown as HandlerContext['requestContext'],
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
  };
}

describe('createIssueTriageHandler (#2953)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('branch 1 — validation failure returns a structured `validation` error and never invokes triage', async () => {
    const handler = _testing.createIssueTriageHandler(makeDeps());
    const result = await handler({ issueUrl: '' }, makeCtx());
    expect(result.isError).toBe(true);
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toMatch(/Validation error/);
    // No triage call — validation short-circuits before triage runs.
    expect(mockTriageIssue).not.toHaveBeenCalled();
  });

  it('branch 2 — triage failure returns a structured `internal` error carrying the cause', async () => {
    mockTriageIssue.mockResolvedValue({
      ok: false,
      error: { message: 'gh CLI unavailable' },
    });
    const handler = _testing.createIssueTriageHandler(makeDeps());
    const result = await handler({ issueUrl: 'https://github.com/o/r/issues/1' }, makeCtx());
    expect(result.isError).toBe(true);
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toMatch(/Triage failed/);
    expect(text).toMatch(/gh CLI unavailable/);
    expect(mockTriageIssue).toHaveBeenCalledTimes(1);
  });

  it('branch 3 — success returns a JSON-stringified TriageResponse', async () => {
    mockTriageIssue.mockResolvedValue({
      ok: true,
      value: {
        issueNumber: 42,
        category: 'bug',
        categoryConfidence: 0.9,
        recommendedActions: ['add label "bug"'],
        sources: [],
        trustAssessment: {
          trustTier: '2',
          userRole: 'CONTRIBUTOR',
          reputationScore: 0.7,
          isSuspicious: false,
          suspiciousSignals: [],
        },
        proposedActions: [
          {
            type: 'label',
            description: 'add label "bug"',
            policyApproved: true,
            corroborated: true,
          },
        ],
        totalDurationMs: 100,
      },
    });
    const handler = _testing.createIssueTriageHandler(makeDeps());
    const result = await handler({ issueUrl: 'https://github.com/o/r/issues/42' }, makeCtx());
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as { issueNumber: number; category: string };
    expect(parsed.issueNumber).toBe(42);
    expect(parsed.category).toBe('bug');
    expect(mockTriageIssue).toHaveBeenCalledTimes(1);
  });
});
