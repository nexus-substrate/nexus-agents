/**
 * Tests for the scheduled improvement_review runner (#3229).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  startImprovementReviewScheduler,
  shutdownImprovementReviewScheduler,
} from './improvement-review-scheduler.js';
import * as reviewModule from './improvement-review.js';

function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

describe('improvement-review-scheduler (#3229)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    shutdownImprovementReviewScheduler();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env['NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS'];
    delete process.env['NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES'];
  });

  it('is DISABLED by default — no run, no timer', () => {
    const run = vi.spyOn(reviewModule, 'runImprovementReview');
    startImprovementReviewScheduler({ logger: spyLogger() }); // no interval → off
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs on the interval when enabled, with fileIssues OFF by default', async () => {
    const run = vi.spyOn(reviewModule, 'runImprovementReview').mockResolvedValue({
      window: '7d',
      totalOutcomes: 0,
      signals: [],
      remediationTasks: [],
      issuesFiled: [],
      issuesSkipped: [],
    });

    startImprovementReviewScheduler({ intervalMs: 1000, logger: spyLogger() });
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).toHaveBeenCalledTimes(1);
    // fileIssues must default to false — the timer never auto-files issues.
    expect(run.mock.calls[0]?.[0]).toMatchObject({ fileIssues: false });

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('passes fileIssues: true only when explicitly opted in', async () => {
    const run = vi.spyOn(reviewModule, 'runImprovementReview').mockResolvedValue({
      window: '7d',
      totalOutcomes: 0,
      signals: [],
      remediationTasks: [],
      issuesFiled: [],
      issuesSkipped: [],
    });

    startImprovementReviewScheduler({ intervalMs: 1000, fileIssues: true, logger: spyLogger() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ fileIssues: true });
  });

  it('does not overlap runs — skips while a previous run is in flight', async () => {
    let resolveRun: (() => void) | undefined;
    const run = vi.spyOn(reviewModule, 'runImprovementReview').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = () => {
            resolve({
              window: '7d',
              totalOutcomes: 0,
              signals: [],
              remediationTasks: [],
              issuesFiled: [],
              issuesSkipped: [],
            });
          };
        })
    );

    startImprovementReviewScheduler({ intervalMs: 1000, logger: spyLogger() });
    await vi.advanceTimersByTimeAsync(1000); // first run starts, stays pending
    await vi.advanceTimersByTimeAsync(1000); // tick again while still running
    expect(run).toHaveBeenCalledTimes(1); // second tick skipped

    resolveRun?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000); // now free to run again
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('is idempotent on start and clean on shutdown', async () => {
    const run = vi.spyOn(reviewModule, 'runImprovementReview').mockResolvedValue({
      window: '7d',
      totalOutcomes: 0,
      signals: [],
      remediationTasks: [],
      issuesFiled: [],
      issuesSkipped: [],
    });

    startImprovementReviewScheduler({ intervalMs: 1000, logger: spyLogger() });
    startImprovementReviewScheduler({ intervalMs: 1000, logger: spyLogger() }); // no 2nd timer
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    shutdownImprovementReviewScheduler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1); // no runs after shutdown
  });
});
