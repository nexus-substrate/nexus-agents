/**
 * Tests for the dropped-push-event detector (#4648).
 *
 * @module scripts/check-missing-push-runs.test
 */

import { describe, expect, it } from 'vitest';

import { assessPushRuns, MIN_COMMIT_AGE_MS } from './check-missing-push-runs.js';

const NOW = Date.UTC(2026, 7, 23, 18, 0, 0);
const MINUTE = 60_000;

describe('assessPushRuns', () => {
  it('reports ok when push runs exist', () => {
    const verdict = assessPushRuns({
      sha: 'abc1234',
      committedAtMs: NOW - 60 * MINUTE,
      pushRunCount: 9,
      now: NOW,
    });
    expect(verdict.kind).toBe('ok');
  });

  it('reports missing when an old commit has zero push runs', () => {
    // The observed failure: e7caa41835 had 0 while every neighbouring commit
    // had 7-9. No CI, no Release, and the commit is not marked failing.
    const verdict = assessPushRuns({
      sha: 'e7caa418',
      committedAtMs: NOW - 60 * MINUTE,
      pushRunCount: 0,
      now: NOW,
    });
    expect(verdict.kind).toBe('missing');
  });

  it('withholds judgement on a commit too recent to have registered runs', () => {
    // Not "ok" — unmeasured. A push seconds old legitimately has no runs yet,
    // and reporting that as healthy is the same defect the detector exists to
    // catch, one level up.
    const verdict = assessPushRuns({
      sha: 'fresh123',
      committedAtMs: NOW - MINUTE,
      pushRunCount: 0,
      now: NOW,
    });
    expect(verdict.kind).toBe('too-recent');
  });

  it('still reports ok for a recent commit that already has runs', () => {
    const verdict = assessPushRuns({
      sha: 'fresh456',
      committedAtMs: NOW - MINUTE,
      pushRunCount: 3,
      now: NOW,
    });
    expect(verdict.kind).toBe('ok');
  });

  it('treats the age boundary as too-recent, not missing', () => {
    // Retain on the tie: a false alarm on a commit that was about to register
    // its runs would train people to ignore the detector.
    const verdict = assessPushRuns({
      sha: 'boundary',
      committedAtMs: NOW - MIN_COMMIT_AGE_MS,
      pushRunCount: 0,
      now: NOW,
    });
    expect(verdict.kind).toBe('too-recent');
  });

  it('carries the sha and count so the alarm can name them', () => {
    const verdict = assessPushRuns({
      sha: 'e7caa418',
      committedAtMs: NOW - 6 * 60 * MINUTE,
      pushRunCount: 0,
      now: NOW,
    });
    expect(verdict.kind).toBe('missing');
    if (verdict.kind === 'missing') {
      expect(verdict.sha).toBe('e7caa418');
      expect(verdict.ageMinutes).toBe(360);
    }
  });
});
