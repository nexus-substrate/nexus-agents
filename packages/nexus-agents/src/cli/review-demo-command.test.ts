/**
 * Tests for Review Demo Command
 * @module cli/review-demo-command.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PRReviewResult } from '../dogfooding/index.js';
import type { ProgressStep } from './review-demo-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../dogfooding/index.js', () => ({
  createPRReviewer: vi.fn(),
  formatReviewComment: vi.fn(() => '## Review Comment'),
}));

vi.mock('../core/index.js', () => ({
  getTimeProvider: vi.fn(() => ({
    now: vi.fn(() => 1000),
  })),
  formatPercentage: vi.fn((v: number) => `${String(Math.round(v * 100))}%`),
}));

vi.mock('./review-demo-helpers.js', () => ({
  checkSetupStatus: vi.fn(),
  runPreflightChecks: vi.fn(),
  formatSetupStatus: vi.fn(() => 'Setup Status: OK'),
  formatPreflightResults: vi.fn(() => 'Preflight: OK'),
  formatProgressStep: vi.fn(
    (step: ProgressStep, i: number, total: number) =>
      `(${String(i + 1)}/${String(total)}) ${step.name}`
  ),
  createProgressSteps: vi.fn(() => [
    { name: 'Validating credentials', status: 'pending' as const },
    { name: 'Fetching PR metadata', status: 'pending' as const },
    { name: 'Running security review', status: 'pending' as const },
    { name: 'Running code quality review', status: 'pending' as const },
    { name: 'Running test coverage review', status: 'pending' as const },
    { name: 'Aggregating results', status: 'pending' as const },
    { name: 'Posting review', status: 'pending' as const },
  ]),
  updateProgress: vi.fn((steps: ProgressStep[], index: number, update: Partial<ProgressStep>) =>
    steps.map((s, i) => (i === index ? { ...s, ...update } : s))
  ),
  getSetupInstructions: vi.fn(() => 'Setup Instructions'),
}));

vi.mock('../utils/text-utils.js', () => ({
  capitalize: vi.fn((s: string) => s.charAt(0).toUpperCase() + s.slice(1)),
}));

import { reviewDemoCommand } from './review-demo-command.js';
import { createPRReviewer } from '../dogfooding/index.js';
import {
  checkSetupStatus,
  runPreflightChecks,
  getSetupInstructions,
  formatSetupStatus,
  formatPreflightResults,
} from './review-demo-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeReviewResult(overrides: Partial<PRReviewResult> = {}) {
  return {
    prNumber: 123,
    repository: 'owner/repo',
    decision: 'approve' as const,
    summary: 'Looks good',
    expertReviews: [
      {
        expertId: 'sec-1',
        expertType: 'security',
        approved: true,
        summary: 'No issues',
        findings: [],
        durationMs: 500,
        confidence: 0.9,
      },
      {
        expertId: 'cq-1',
        expertType: 'code_quality',
        approved: true,
        summary: 'Clean code',
        findings: [],
        durationMs: 400,
        confidence: 0.85,
      },
    ],
    findingsBySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
    findingsByCategory: {
      security: 0,
      performance: 0,
      code_quality: 0,
      testing: 0,
      documentation: 0,
      architecture: 0,
    },
    totalDurationMs: 1500,
    expertCount: 2,
    consensusScore: 0.95,
    debateRounds: 1,
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  } satisfies PRReviewResult;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDefaultOptions() {
  return {
    prUrl: 'https://github.com/owner/repo/pull/123',
    setup: false,
    dryRun: false,
    verbose: false,
    skipChecks: true,
  };
}

let stdoutCalls: string[];
let stderrCalls: string[];

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  stdoutCalls = [];
  stderrCalls = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutCalls.push(String(data));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderrCalls.push(String(data));
    return true;
  });
});

// ============================================================================
// reviewDemoCommand - setup wizard
// ============================================================================

describe('reviewDemoCommand - setup wizard', () => {
  it('runs setup wizard when setup option is true', async () => {
    vi.mocked(checkSetupStatus).mockImplementation(() =>
      Promise.resolve({
        hasGitHubToken: true,
        hasGhCli: true,
        tokenScopes: ['repo'],
        tokenValid: true,
        username: 'testuser',
      })
    );

    const code = await reviewDemoCommand({ ...makeDefaultOptions(), setup: true });

    expect(code).toBe(0);
    expect(getSetupInstructions).toHaveBeenCalled();
    expect(formatSetupStatus).toHaveBeenCalled();
  });

  it('returns 1 when setup wizard finds invalid token', async () => {
    vi.mocked(checkSetupStatus).mockImplementation(() =>
      Promise.resolve({
        hasGitHubToken: false,
        hasGhCli: false,
        tokenScopes: [],
        tokenValid: false,
      })
    );

    const code = await reviewDemoCommand({ ...makeDefaultOptions(), setup: true });

    expect(code).toBe(1);
  });

  it('prints success hint when token is valid', async () => {
    vi.mocked(checkSetupStatus).mockImplementation(() =>
      Promise.resolve({
        hasGitHubToken: true,
        hasGhCli: true,
        tokenScopes: ['repo'],
        tokenValid: true,
        username: 'user1',
      })
    );

    await reviewDemoCommand({ ...makeDefaultOptions(), setup: true });

    const output = stdoutCalls.join('');
    expect(output).toContain("You're all set");
    expect(output).toContain('--dry-run');
  });
});

// ============================================================================
// reviewDemoCommand - missing PR URL
// ============================================================================

describe('reviewDemoCommand - missing PR URL', () => {
  it('returns 1 when prUrl is empty', async () => {
    const code = await reviewDemoCommand({ ...makeDefaultOptions(), prUrl: '' });

    expect(code).toBe(1);
  });

  it('prints quick start help when prUrl is empty', async () => {
    await reviewDemoCommand({ ...makeDefaultOptions(), prUrl: '' });

    const output = stdoutCalls.join('');
    expect(output).toContain('QUICK START');
    expect(output).toContain('--setup');
  });
});

// ============================================================================
// reviewDemoCommand - preflight checks
// ============================================================================

describe('reviewDemoCommand - preflight checks', () => {
  it('fails when preflight checks fail', async () => {
    vi.mocked(runPreflightChecks).mockImplementation(() =>
      Promise.resolve({
        passed: false,
        checks: [{ name: 'Token', passed: false, message: 'Missing' }],
      })
    );

    const code = await reviewDemoCommand({
      ...makeDefaultOptions(),
      skipChecks: false,
    });

    expect(code).toBe(1);
    expect(formatPreflightResults).toHaveBeenCalled();
  });

  it('prints configuration help on preflight failure', async () => {
    vi.mocked(runPreflightChecks).mockImplementation(() =>
      Promise.resolve({
        passed: false,
        checks: [{ name: 'Token', passed: false, message: 'Missing' }],
      })
    );

    await reviewDemoCommand({ ...makeDefaultOptions(), skipChecks: false });

    const output = stdoutCalls.join('');
    expect(output).toContain('review --setup');
  });

  it('skips preflight when skipChecks is true', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand({ ...makeDefaultOptions(), skipChecks: true });

    expect(runPreflightChecks).not.toHaveBeenCalled();
  });

  it('shows preflight results in verbose mode when passing', async () => {
    vi.mocked(runPreflightChecks).mockImplementation(() =>
      Promise.resolve({
        passed: true,
        checks: [{ name: 'Token', passed: true, message: 'OK' }],
      })
    );
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand({
      ...makeDefaultOptions(),
      skipChecks: false,
      verbose: true,
    });

    expect(formatPreflightResults).toHaveBeenCalled();
  });
});

// ============================================================================
// reviewDemoCommand - successful review
// ============================================================================

describe('reviewDemoCommand - successful review', () => {
  it('returns 0 on successful review', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    const code = await reviewDemoCommand(makeDefaultOptions());

    expect(code).toBe(0);
  });

  it('prints header with PR URL', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const output = stdoutCalls.join('');
    expect(output).toContain('nexus-agents PR Review');
    expect(output).toContain('owner/repo/pull/123');
  });

  it('prints dry-run mode indicator', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand({ ...makeDefaultOptions(), dryRun: true });

    const output = stdoutCalls.join('');
    expect(output).toContain('dry-run');
  });

  it('prints decision and consensus score', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const output = stdoutCalls.join('');
    expect(output).toContain('APPROVE');
    expect(output).toContain('95%');
  });

  it('prints "No issues found" when no findings', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const output = stdoutCalls.join('');
    expect(output).toContain('No issues found');
  });

  it('prints posted to GitHub when not dry-run', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand({ ...makeDefaultOptions(), dryRun: false });

    const output = stdoutCalls.join('');
    expect(output).toContain('Review posted to GitHub');
  });

  it('prints target met message for fast reviews', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const output = stdoutCalls.join('');
    expect(output).toContain('Review completed in');
    expect(output).toContain('Target met');
  });
});

// ============================================================================
// reviewDemoCommand - review with findings
// ============================================================================

describe('reviewDemoCommand - review with findings', () => {
  it('prints severity breakdown when findings exist', async () => {
    const review = makeReviewResult({
      decision: 'request_changes',
      findingsBySeverity: {
        critical: 1,
        high: 2,
        medium: 0,
        low: 3,
        info: 0,
      },
    });
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: review })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const output = stdoutCalls.join('');
    expect(output).toContain('6 total');
    expect(output).toContain('Critical: 1');
    expect(output).toContain('High: 2');
    expect(output).toContain('Low: 3');
    expect(output).not.toContain('Medium:');
    expect(output).not.toContain('Info:');
  });
});

// ============================================================================
// reviewDemoCommand - review failure
// ============================================================================

describe('reviewDemoCommand - review failure', () => {
  it('returns 1 when review fails', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: false, error: new Error('API rate limit') })),
    } as never);

    const code = await reviewDemoCommand(makeDefaultOptions());

    expect(code).toBe(1);
  });

  it('prints error to stderr on failure', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: false, error: new Error('Network timeout') })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const errOutput = stderrCalls.join('');
    expect(errOutput).toContain('Network timeout');
  });
});

// ============================================================================
// reviewDemoCommand - verbose mode
// ============================================================================

describe('reviewDemoCommand - verbose mode', () => {
  it('prints expert details in verbose mode', async () => {
    const review = makeReviewResult({
      expertReviews: [
        {
          expertId: 'sec-1',
          expertType: 'security',
          approved: false,
          summary: 'Found SQL injection',
          findings: [
            {
              id: 'f-1',
              category: 'security',
              severity: 'critical',
              title: 'SQL Injection',
              description: 'Unsanitized input',
              file: 'src/db.ts',
              line: 42,
              expertId: 'sec-1',
              confidence: 0.95,
            },
          ],
          durationMs: 500,
          confidence: 0.9,
        },
      ],
      findingsBySeverity: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
    });
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: review })),
    } as never);

    await reviewDemoCommand({ ...makeDefaultOptions(), verbose: true });

    const output = stdoutCalls.join('');
    expect(output).toContain('security Expert');
    expect(output).toContain('SQL Injection');
    expect(output).toContain('src/db.ts');
    expect(output).toContain(':42');
  });

  it('prints GitHub preview in verbose dry-run mode', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand({
      ...makeDefaultOptions(),
      verbose: true,
      dryRun: true,
    });

    const output = stdoutCalls.join('');
    expect(output).toContain('GitHub Comment Preview');
  });

  it('does not print GitHub preview when not dry-run', async () => {
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: makeReviewResult() })),
    } as never);

    await reviewDemoCommand({
      ...makeDefaultOptions(),
      verbose: true,
      dryRun: false,
    });

    const output = stdoutCalls.join('');
    expect(output).not.toContain('GitHub Comment Preview');
  });
});

// ============================================================================
// reviewDemoCommand - decision formatting
// ============================================================================

describe('reviewDemoCommand - decision formatting', () => {
  it('formats underscore decisions as spaces', async () => {
    const review = makeReviewResult({ decision: 'request_changes' });
    vi.mocked(createPRReviewer).mockReturnValue({
      reviewPR: vi.fn(() => Promise.resolve({ ok: true, value: review })),
    } as never);

    await reviewDemoCommand(makeDefaultOptions());

    const output = stdoutCalls.join('');
    expect(output).toContain('REQUEST CHANGES');
    expect(output).not.toContain('request_changes');
  });
});
