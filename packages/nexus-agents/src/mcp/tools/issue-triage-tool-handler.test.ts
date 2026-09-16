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

const { mockRecordLearning, mockTriageIssue } = vi.hoisted(() => ({
  mockRecordLearning: vi.fn(),
  mockTriageIssue: vi.fn(),
}));
vi.mock('../../dogfooding/issue-triage.js', () => ({
  // vitest 4: arrow functions aren't constructor-callable. Use a real
  // function so `new IssueTriage(...)` works.
  IssueTriage: vi.fn(function () {
    return { triageIssue: mockTriageIssue };
  }),
}));
vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordError: vi.fn(),
    recordLearning: mockRecordLearning,
    recordTask: vi.fn(),
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
    // #5385: the middleware always discloses what it removed; nothing here.
    sanitization: {
      wasModified: false,
      commentsRemoved: 0,
      fieldsModified: 0,
      tagsRemoved: 0,
      rawFieldHashes: {},
      rawFieldBytes: {},
    },
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
            details: { policyViolations: [], missingCorroboration: [] },
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

  it('the response carries WHY an action was refused: stage and missing sources, or policy rules (#6309)', async () => {
    // `details` used to be dropped here, so a corroboration refusal and a
    // policy refusal reached the MCP caller as the same two booleans.
    mockTriageIssue.mockResolvedValue({
      ok: true,
      value: {
        issueNumber: 44,
        repository: 'o/r',
        category: 'bug',
        categoryConfidence: 0.9,
        trustAssessment: {
          trustTier: '3',
          userRole: 'none',
          isSuspicious: false,
          suspiciousSignals: [],
        },
        proposedActions: [
          {
            type: 'SummarizeIssue',
            description: 'A summary',
            policyApproved: false,
            corroborated: false,
            details: {
              policyViolations: ['INSUFFICIENT_CORROBORATION'],
              missingCorroboration: ['At least one Tier 1/2 source'],
              refusedAtStage: 'corroboration',
            },
          },
          {
            type: 'ProposeLabels',
            description: 'Suggest labels: bug',
            policyApproved: false,
            corroborated: true,
            details: {
              policyViolations: ['INSUFFICIENT_TRUST'],
              missingCorroboration: [],
              corroborationWouldRefuse: false,
            },
          },
          {
            type: 'ClassifyIssue',
            description: 'Classified as bug',
            policyApproved: true,
            corroborated: true,
            details: { policyViolations: [], missingCorroboration: [], category: 'bug' },
          },
        ],
        totalDurationMs: 100,
      },
    });
    const handler = _testing.createIssueTriageHandler(makeDeps());
    const result = await handler({ issueUrl: 'https://github.com/o/r/issues/44' }, makeCtx());
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as { proposedActions: Record<string, unknown>[] };
    expect(parsed.proposedActions[0]).toEqual({
      type: 'SummarizeIssue',
      description: 'A summary',
      policyApproved: false,
      corroborated: false,
      policyViolations: ['INSUFFICIENT_CORROBORATION'],
      missingCorroboration: ['At least one Tier 1/2 source'],
      refusedAtStage: 'corroboration',
    });
    expect(parsed.proposedActions[1]).toEqual({
      type: 'ProposeLabels',
      description: 'Suggest labels: bug',
      policyApproved: false,
      corroborated: true,
      policyViolations: ['INSUFFICIENT_TRUST'],
      missingCorroboration: [],
    });
    // An approved action carries no refusal fields — absence, not empty noise.
    expect(parsed.proposedActions[2]).toEqual({
      type: 'ClassifyIssue',
      description: 'Classified as bug',
      policyApproved: true,
      corroborated: true,
    });
  });

  it('records low and high measured classifier confidence in learnings', async () => {
    for (const confidence of [0.1, 0.9]) {
      mockTriageIssue.mockResolvedValueOnce({
        ok: true,
        value: {
          issueNumber: 43,
          repository: 'o/r',
          category: 'other',
          categoryConfidence: confidence,
          trustAssessment: {
            trustTier: '2',
            userRole: 'CONTRIBUTOR',
            isSuspicious: false,
            suspiciousSignals: [],
          },
          proposedActions: [],
          totalDurationMs: 100,
        },
      });

      const handler = _testing.createIssueTriageHandler(makeDeps());
      await handler({ issueUrl: 'https://github.com/o/r/issues/43' }, makeCtx());
    }

    expect(mockRecordLearning).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ confidence: 0.1 })
    );
    expect(mockRecordLearning).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ confidence: 0.9 })
    );
  });
});
