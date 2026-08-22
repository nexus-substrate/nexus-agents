import { describe, expect, it } from 'vitest';

import { assessStuckRuns, STUCK_AFTER_MINUTES } from './check-stuck-runs.js';
import type { RunSummary } from './check-stuck-runs.js';

const run = (id: number, status: string, ageMinutes: number): RunSummary => ({
  databaseId: id,
  status,
  ageMinutes,
});

describe('assessStuckRuns', () => {
  it('finds nothing when every run is progressing', () => {
    const v = assessStuckRuns([run(1, 'in_progress', 5), run(2, 'completed', 900)]);

    expect(v.stuck).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('ignores a queued run inside the grace window', () => {
    // Runners are not always instant; a briefly queued run is normal.
    const v = assessStuckRuns([run(1, 'queued', 10)]);

    expect(v.stuck).toEqual([]);
  });

  it('flags a queued run past the window', () => {
    const v = assessStuckRuns([run(42, 'queued', STUCK_AFTER_MINUTES + 1)]);

    expect(v.stuck.map((r) => r.databaseId)).toEqual([42]);
    expect(v.ok).toBe(false);
  });

  it('treats a long-pending run the same as queued', () => {
    // The 2026-08-09 wedge reported `queued`; the surrounding runs reported
    // `pending`. Both occupy the concurrency group, so both count.
    const v = assessStuckRuns([run(7, 'pending', STUCK_AFTER_MINUTES + 1)]);

    expect(v.stuck.map((r) => r.databaseId)).toEqual([7]);
  });

  it('never flags a run that is actually executing, however long', () => {
    // in_progress is bounded by the job's own timeout-minutes. Queue
    // residency is the state nothing bounds — that is the whole point.
    const v = assessStuckRuns([run(9, 'in_progress', 10_000)]);

    expect(v.stuck).toEqual([]);
  });

  it('reproduces the incident: an 11-day queued run', () => {
    const elevenDays = 11 * 24 * 60;
    const v = assessStuckRuns([run(31293406815, 'queued', elevenDays)]);

    expect(v.ok).toBe(false);
    expect(v.reason).toContain('31293406815');
  });

  it('reports every stuck run, not just the first', () => {
    const v = assessStuckRuns([
      run(1, 'queued', 999),
      run(2, 'in_progress', 999),
      run(3, 'pending', 999),
    ]);

    expect(v.stuck.map((r) => r.databaseId).sort()).toEqual([1, 3]);
  });
});
