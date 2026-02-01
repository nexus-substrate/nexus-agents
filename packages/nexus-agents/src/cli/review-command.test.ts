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

// Mock the core module
vi.mock('../core/index.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  formatPercentage: vi.fn((n: number) => `${String(Math.round(n * 100))}%`),
}));

import { createPRReviewer, formatReviewComment } from '../dogfooding/index.js';
import type { PRReviewResult } from '../dogfooding/index.js';

const mockCreatePRReviewer = vi.mocked(createPRReviewer);
const mockFormatReviewComment = vi.mocked(formatReviewComment);

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
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
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

      expect(mockCreatePRReviewer).toHaveBeenCalledWith({ dryRun: true });
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
