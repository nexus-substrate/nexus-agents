/**
 * Tests for `nexus-agents improvement-review` CLI subcommand (#2444).
 *
 * The handler delegates to `runImprovementReview()` from the MCP module —
 * we mock that so the tests don't depend on a real OutcomeStore or fitness
 * audit. The CLI's job is parsing flags, choosing format, and printing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedCliArgs } from '../cli-types.js';
import type { ImprovementReviewResponse } from '../mcp/tools/improvement-review.js';

const runMock = vi.fn();
vi.mock('../mcp/tools/improvement-review.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcp/tools/improvement-review.js')>();
  return {
    ...actual,
    runImprovementReview: (...args: unknown[]) => runMock(...args) as unknown,
  };
});

import { handleImprovementReviewCommand } from './improvement-review-command.js';

function makeArgs(overrides: Record<string, unknown> = {}): ParsedCliArgs {
  return {
    command: 'improvement-review',
    options: overrides as ParsedCliArgs['options'],
    positionals: [],
  };
}

const emptyResponse: ImprovementReviewResponse = {
  window: '7d',
  totalOutcomes: 0,
  signals: [],
  remediationTasks: [],
  issuesFiled: [],
  issuesSkipped: [],
};

import type { MockInstance } from 'vitest';

describe('handleImprovementReviewCommand', () => {
  let stdout: string[] = [];
  let writeSpy: MockInstance | undefined;
  let logSpy: MockInstance | undefined;

  beforeEach(() => {
    runMock.mockReset();
    runMock.mockResolvedValue(emptyResponse);
    stdout = [];
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map((a) => String(a)).join(' '));
    });
  });

  afterEach(() => {
    writeSpy?.mockRestore();
    logSpy?.mockRestore();
  });

  it('defaults lookback to 7 days, file-issues off', async () => {
    await handleImprovementReviewCommand(makeArgs());

    expect(runMock).toHaveBeenCalledOnce();
    const call = runMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['lookbackDays']).toBe(7);
    expect(call['fileIssues']).toBe(false);
    expect(call['minSampleSize']).toBe(5);
    expect(call['fitnessFloor']).toBe(90);
  });

  it('parses --lookback-days, --min-sample-size, --fitness-floor', async () => {
    await handleImprovementReviewCommand(
      makeArgs({
        'lookback-days': '14',
        'min-sample-size': '10',
        'fitness-floor': '85',
      })
    );

    const call = runMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['lookbackDays']).toBe(14);
    expect(call['minSampleSize']).toBe(10);
    expect(call['fitnessFloor']).toBe(85);
  });

  it('forwards --file-issues=true', async () => {
    await handleImprovementReviewCommand(makeArgs({ 'file-issues': true }));
    const call = runMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['fileIssues']).toBe(true);
  });

  it('--dry-run forces fileIssues to false even when --file-issues is set', async () => {
    await handleImprovementReviewCommand(makeArgs({ 'file-issues': true, 'dry-run': true }));
    const call = runMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['fileIssues']).toBe(false);
  });

  it('json format emits a parseable payload', async () => {
    runMock.mockResolvedValueOnce({
      ...emptyResponse,
      totalOutcomes: 12,
      signals: [
        {
          category: 'routing',
          signalKey: 'routing:cli-floor:claude:research',
          severity: 'warning',
          title: 'routing: claude success rate 50% on research (7d)',
          body: '...',
          evidence: { samples: 8, window: '7d', observedValue: 0.5, threshold: 0.6 },
        },
      ],
    });

    await handleImprovementReviewCommand(makeArgs({ format: 'json' }));

    const stdoutText = stdout.join('');
    const parsed = JSON.parse(stdoutText) as ImprovementReviewResponse;
    expect(parsed.totalOutcomes).toBe(12);
    expect(parsed.signals).toHaveLength(1);
    expect(parsed.signals[0]?.signalKey).toBe('routing:cli-floor:claude:research');
  });

  it('text format prints a header and the no-breach hint when empty', async () => {
    await handleImprovementReviewCommand(makeArgs());
    const text = stdout.join('\n');
    expect(text).toContain('Nexus Agents — Improvement Review');
    expect(text).toContain('No threshold breaches');
  });

  it('text format prints filed-issue URLs when present', async () => {
    runMock.mockResolvedValueOnce({
      ...emptyResponse,
      signals: [
        {
          category: 'routing',
          signalKey: 'routing:cli-floor:claude:research',
          severity: 'warning',
          title: 'routing breach',
          body: '...',
          evidence: { samples: 8, window: '7d', observedValue: 0.5, threshold: 0.6 },
        },
      ],
      issuesFiled: [
        {
          signalKey: 'routing:cli-floor:claude:research',
          issueUrl: 'https://github.com/owner/repo/issues/9999',
        },
      ],
    });

    await handleImprovementReviewCommand(makeArgs({ 'file-issues': true }));
    const text = stdout.join('\n');
    expect(text).toContain('Filed 1 issue');
    expect(text).toContain('issues/9999');
  });

  it('rejects out-of-range lookback (101 days) via Zod schema', async () => {
    await expect(
      handleImprovementReviewCommand(makeArgs({ 'lookback-days': '101' }))
    ).rejects.toThrow();
  });
});
