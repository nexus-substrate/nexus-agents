/**
 * Tests for review-command CLI
 *
 * (Source: Issue #249 - CLI test coverage)
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reviewCommand } from './review-command.js';

// Mock the dogfooding module
vi.mock('../dogfooding/index.js', () => ({
  createPRReviewer: vi.fn(),
  formatReviewComment: vi.fn(),
}));

// #4350: the review path resolves its adapter from the canonical registry.
const getDefaultMock = vi.fn(() => ({ name: 'test-adapter' }));
vi.mock('../adapters/unified-registry.js', () => ({
  getGlobalRegistry: () => ({ getDefault: getDefaultMock }),
}));

// Mock the core module
vi.mock('../core/index.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  formatPercentage: vi.fn((n: number) => `${String(Math.round(n * 100))}%`),
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

import { createPRReviewer, formatReviewComment } from '../dogfooding/index.js';
import type { PRReviewResult } from '../dogfooding/index.js';
const mockCreatePRReviewer = vi.mocked(createPRReviewer);
const mockFormatReviewComment = vi.mocked(formatReviewComment);
const mockGetDefault = getDefaultMock;

describe('review-command', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWriteSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrWriteSpy: any;

  const createMockReview = (overrides: Partial<PRReviewResult> = {}): PRReviewResult => ({
    prNumber: 123,
    repository: 'owner/repo',
    decision: 'approve',
    summary: 'Overall review summary',
    expertCount: 3,
    consensusScore: 0.85,
    totalDurationMs: 5000,
    debateRounds: 1,
    timestamp: '2026-01-14T10:00:00Z',
    trustAssessment: {
      trustTier: '3',
      userRole: 'unknown',
      isAllowlisted: false,
      auditSink: 'none',
      suspiciousSignals: [],
      isSuspicious: false,
    },
    findingsBySeverity: {
      critical: 0,
      high: 0,
      medium: 1,
      low: 2,
      info: 0,
    },
    findingsByCategory: {
      security: 0,
      performance: 0,
      code_quality: 2,
      testing: 0,
      documentation: 1,
      architecture: 0,
    },
    expertReviews: [],
    postOutcome: { status: 'posted' },
    filesReviewed: 7,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getDefaultMock.mockReturnValue({ name: 'test-adapter' });
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockFormatReviewComment.mockReturnValue('# Review Comment Preview');
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  describe('successful review', () => {
    it('should return 0 on successful review', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      const exitCode = await reviewCommand({
        prUrl: 'https://github.com/owner/repo/pull/123',
        dryRun: false,
        verbose: false,
      });

      expect(exitCode).toBe(0);
    });

    it('should print review header', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'owner/repo#123',
        dryRun: false,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Reviewing: owner/repo#123');
    });

    it('should display decision and metrics', async () => {
      const mockReview = createMockReview({
        decision: 'request_changes',
        expertCount: 5,
        consensusScore: 0.9,
        totalDurationMs: 3000,
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('REQUEST CHANGES');
      expect(output).toContain('Experts: 5');
      expect(output).toContain('90%');
      expect(output).toContain('3000ms');
    });

    it('should display findings by severity', async () => {
      const mockReview = createMockReview({
        findingsBySeverity: {
          critical: 1,
          high: 2,
          medium: 3,
          low: 0,
          info: 1,
        },
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Findings: 7 total');
      expect(output).toContain('Critical: 1');
      expect(output).toContain('High: 2');
      expect(output).toContain('Medium: 3');
      expect(output).toContain('Info: 1');
      expect(output).not.toContain('Low:'); // Low is 0
    });

    it('should show "No issues found" when no findings', async () => {
      const mockReview = createMockReview({
        findingsBySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('No issues found');
    });

    it('should indicate review posted to GitHub', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Review posted to GitHub');
    });
  });

  // #4354: the command printed "Review posted to GitHub." and exited 0 whenever
  // the review itself succeeded, regardless of what GitHub did with the post. A
  // real HTTP 422 (requesting changes on your own PR) was logged and discarded,
  // so a script gating on the exit code saw a review that did not exist.
  describe('posting failure is not reported as success (#4354)', () => {
    function withOutcome(postOutcome: PRReviewResult['postOutcome']): void {
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: createMockReview({ postOutcome }) }),
      } as never);
    }

    const run = async (): Promise<number> =>
      reviewCommand({ prUrl: 'test/pr', dryRun: false, verbose: false });

    it('exits non-zero when GitHub rejected the review', async () => {
      withOutcome({ status: 'failed', error: 'gh: Unprocessable Entity (HTTP 422)' });

      expect(await run()).toBe(1);
    });

    it('does not claim the review was posted', async () => {
      withOutcome({ status: 'failed', error: 'gh: Unprocessable Entity (HTTP 422)' });

      await run();

      const stdout = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stdout).not.toContain('Review posted to GitHub');
    });

    it('reports the rejection reason on stderr', async () => {
      withOutcome({ status: 'failed', error: 'gh: Unprocessable Entity (HTTP 422)' });

      await run();

      const stderr = stderrWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stderr).toContain('HTTP 422');
    });

    it('says so when a policy gate blocked the post, and still exits 0', async () => {
      // A Rule of Two block is a deliberate governance outcome, not a fault —
      // but it must not read as "posted" either.
      withOutcome({ status: 'skipped', reason: 'Rule of Two: rule-of-two' });

      expect(await run()).toBe(0);
      const stdout = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stdout).toContain('Review NOT posted to GitHub');
      expect(stdout).not.toContain('Review posted to GitHub');
    });

    it('stays silent about posting in dry-run — the header already said so', async () => {
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({
          ok: true,
          value: createMockReview({ postOutcome: { status: 'skipped', reason: 'dry-run' } }),
        }),
      } as never);

      const code = await reviewCommand({ prUrl: 'test/pr', dryRun: true, verbose: false });

      expect(code).toBe(0);
      const stdout = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stdout).not.toContain('Review NOT posted');
    });
  });

  describe('dry run mode', () => {
    it('should show dry-run indicator', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: true,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('dry-run mode');
    });

    it('should not show "posted to GitHub" in dry run', async () => {
      // #4354: the message now follows the reviewer's reported outcome rather
      // than the caller's dryRun flag, so the fixture has to carry the outcome a
      // dry run actually produces.
      const mockReview = createMockReview({
        postOutcome: { status: 'skipped', reason: 'dry-run' },
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: true,
        verbose: false,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).not.toContain('Review posted to GitHub');
    });

    it('should pass dryRun to reviewer', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: true,
        verbose: false,
      });

      // #4350: the factory now also receives the resolved adapter as its second
      // argument — the parameter the CLI used to leave empty.
      expect(mockCreatePRReviewer).toHaveBeenCalledWith({ dryRun: true }, expect.anything());
    });
  });

  describe('verbose mode', () => {
    it('should show expert details in verbose mode', async () => {
      const mockReview = createMockReview({
        expertReviews: [
          {
            expertId: 'expert-security-1',
            expertType: 'security',
            approved: true,
            summary: 'Security review complete',
            findings: [
              {
                id: 'finding-1',
                category: 'security' as const,
                severity: 'high' as const,
                title: 'SQL Injection Risk',
                description: 'Potential SQL injection vulnerability',
                file: 'src/db.ts',
                line: 42,
                expertId: 'expert-security-1',
                confidence: 0.9,
              },
            ],
            durationMs: 1000,
            confidence: 0.9,
          },
        ],
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: true,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('--- security Expert ---');
      expect(output).toContain('Security review complete');
      expect(output).toContain('[HIGH] SQL Injection Risk');
      expect(output).toContain('File: src/db.ts:42');
    });

    it('should show GitHub preview in verbose dry-run', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);
      mockFormatReviewComment.mockReturnValue('## Formatted Review Comment');

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: true,
        verbose: true,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('=== GitHub Comment Preview ===');
      expect(output).toContain('Formatted Review Comment');
    });

    it('should not show GitHub preview in verbose non-dry-run', async () => {
      const mockReview = createMockReview();
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: true,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).not.toContain('GitHub Comment Preview');
    });
  });

  // #4350: both CLI entry points called `createPRReviewer({ dryRun })`, but the
  // adapter is that factory's SECOND parameter — so the review path never wired
  // one. Every expert logged `hasAdapter: false` and fell through to its
  // heuristic branch, and the command printed a confident decision built from
  // generic findings with `tokensUsed: 0` and exited 0.
  describe('model adapter wiring (#4350)', () => {
    it('passes the registry adapter to the reviewer', async () => {
      const adapter = { name: 'claude-resilient' };
      mockGetDefault.mockReturnValue(adapter);
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: createMockReview() }),
      } as never);

      await reviewCommand({ prUrl: 'test/pr', dryRun: false, verbose: false });

      // Assert on the SECOND argument specifically — passing it positionally
      // wrong is exactly the slip that caused this bug, and a looser assertion
      // would not catch a repeat.
      expect(mockCreatePRReviewer).toHaveBeenCalledWith(expect.anything(), adapter);
    });

    it('fails closed when no adapter is configured', async () => {
      mockGetDefault.mockImplementation(() => {
        throw new Error('No model adapter configured');
      });

      const exitCode = await reviewCommand({ prUrl: 'test/pr', dryRun: false, verbose: false });

      expect(exitCode).toBe(1);
      expect(mockCreatePRReviewer).not.toHaveBeenCalled();
    });

    it('tells the user what to do, not just what is missing', async () => {
      // The confusing part of this bug is that `doctor` reports healthy CLIs
      // while the review path ignored them — the message has to bridge that.
      mockGetDefault.mockImplementation(() => {
        throw new Error('No model adapter configured');
      });

      await reviewCommand({ prUrl: 'test/pr', dryRun: false, verbose: false });

      const stderr = stderrWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stderr).toContain('nexus-agents doctor');
    });

    it('fails closed in dry-run too — a dry run still needs a real review', async () => {
      mockGetDefault.mockImplementation(() => {
        throw new Error('No model adapter configured');
      });

      expect(await reviewCommand({ prUrl: 'test/pr', dryRun: true, verbose: false })).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should return 1 on review error', async () => {
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({
          ok: false,
          error: { message: 'PR not found' },
        }),
      } as never);

      const exitCode = await reviewCommand({
        prUrl: 'invalid/pr',
        dryRun: false,
        verbose: false,
      });

      expect(exitCode).toBe(1);
    });

    it('should display error message', async () => {
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({
          ok: false,
          error: { message: 'Authentication failed' },
        }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: false,
      });

      const output = stderrWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Error: Authentication failed');
    });
  });

  describe('expert findings formatting', () => {
    it('should handle findings without file location', async () => {
      const mockReview = createMockReview({
        expertReviews: [
          {
            expertId: 'expert-arch-1',
            expertType: 'architecture',
            approved: true,
            summary: 'Architecture review',
            findings: [
              {
                id: 'finding-1',
                category: 'documentation' as const,
                severity: 'medium' as const,
                title: 'Missing Documentation',
                description: 'README needs updating',
                expertId: 'expert-arch-1',
                confidence: 0.8,
              },
            ],
            durationMs: 500,
            confidence: 0.8,
          },
        ],
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: true,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('[MEDIUM] Missing Documentation');
      expect(output).not.toContain('File:'); // No file location
    });

    it('should handle findings with file but no line', async () => {
      const mockReview = createMockReview({
        expertReviews: [
          {
            expertId: 'expert-code-1',
            expertType: 'code',
            approved: true,
            summary: 'Code review',
            findings: [
              {
                id: 'finding-1',
                category: 'code_quality' as const,
                severity: 'low' as const,
                title: 'Long File',
                description: 'Consider splitting this file',
                file: 'src/big-file.ts',
                expertId: 'expert-code-1',
                confidence: 0.7,
              },
            ],
            durationMs: 800,
            confidence: 0.7,
          },
        ],
      });
      mockCreatePRReviewer.mockReturnValue({
        reviewPR: vi.fn().mockResolvedValue({ ok: true, value: mockReview }),
      } as never);

      await reviewCommand({
        prUrl: 'test/pr',
        dryRun: false,
        verbose: true,
      });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('File: src/big-file.ts');
      expect(output).not.toContain('src/big-file.ts:'); // No line number
    });
  });
});
