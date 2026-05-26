/**
 * Tests for job-concurrency (#3044 / epic #2631 Stage 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_JOB_CAPS,
  getInFlight,
  getJobCap,
  release,
  suggestRetryAfterMs,
  tryAcquire,
  _resetForTests,
} from './job-concurrency.js';

beforeEach(() => {
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  // Clean env to avoid bleed between tests.
  delete process.env['NEXUS_JOB_MAX_CONCURRENT_ORCHESTRATE'];
  delete process.env['NEXUS_JOB_MAX_CONCURRENT_RUN_WORKFLOW'];
  delete process.env['NEXUS_JOB_MAX_CONCURRENT_UNKNOWN_TOOL'];
});

describe('getJobCap', () => {
  it('returns the per-tool default when no env override is set', () => {
    expect(getJobCap('orchestrate')).toBe(DEFAULT_JOB_CAPS['orchestrate']);
    expect(getJobCap('run_workflow')).toBe(DEFAULT_JOB_CAPS['run_workflow']);
  });

  it('honors NEXUS_JOB_MAX_CONCURRENT_<TOOL> env override', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_ORCHESTRATE'] = '7';
    expect(getJobCap('orchestrate')).toBe(7);
  });

  it('cap of 0 disables async-mode for the tool', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_RUN_WORKFLOW'] = '0';
    expect(getJobCap('run_workflow')).toBe(0);
    expect(tryAcquire('run_workflow')).toBe(false);
  });

  it('falls back to default when env var is non-numeric', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_ORCHESTRATE'] = 'not-a-number';
    expect(getJobCap('orchestrate')).toBe(DEFAULT_JOB_CAPS['orchestrate']);
  });

  it('falls back to global cap for unknown tools (no per-tool default)', () => {
    expect(getJobCap('totally_new_tool')).toBeGreaterThan(0);
  });
});

describe('tryAcquire + release', () => {
  it('returns true while under cap, false at cap, in-flight count tracks', () => {
    const cap = DEFAULT_JOB_CAPS['orchestrate'] ?? 3;
    expect(getInFlight('orchestrate')).toBe(0);
    for (let i = 0; i < cap; i++) {
      expect(tryAcquire('orchestrate')).toBe(true);
    }
    expect(getInFlight('orchestrate')).toBe(cap);
    // One past cap → busy.
    expect(tryAcquire('orchestrate')).toBe(false);
    expect(getInFlight('orchestrate')).toBe(cap);
  });

  it('release() opens slots for new acquires', () => {
    const cap = DEFAULT_JOB_CAPS['orchestrate'] ?? 3;
    for (let i = 0; i < cap; i++) tryAcquire('orchestrate');
    expect(tryAcquire('orchestrate')).toBe(false);
    release('orchestrate');
    expect(tryAcquire('orchestrate')).toBe(true);
  });

  it('per-tool isolation: filling orchestrate does not block run_workflow', () => {
    const cap = DEFAULT_JOB_CAPS['orchestrate'] ?? 3;
    for (let i = 0; i < cap; i++) tryAcquire('orchestrate');
    expect(tryAcquire('orchestrate')).toBe(false);
    expect(tryAcquire('run_workflow')).toBe(true);
  });

  it('release() with no in-flight count is a logged no-op, not a crash', () => {
    // Caller bug — but the primitive must not throw. The release just
    // logs a warning and returns. getInFlight stays at 0 (not negative).
    expect(() => {
      release('orchestrate');
    }).not.toThrow();
    expect(getInFlight('orchestrate')).toBe(0);
  });
});

describe('suggestRetryAfterMs', () => {
  it('returns 0 when the tool is disabled (cap=0) — never retry', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_RUN_WORKFLOW'] = '0';
    expect(suggestRetryAfterMs('run_workflow')).toBe(0);
  });

  it('returns a value in [5_000, 60_000] under normal load', () => {
    tryAcquire('orchestrate');
    const v = suggestRetryAfterMs('orchestrate');
    expect(v).toBeGreaterThanOrEqual(5_000);
    expect(v).toBeLessThanOrEqual(60_000);
  });

  it('returns higher value at full load than at low load', () => {
    const low = suggestRetryAfterMs('orchestrate'); // 0 in-flight
    const cap = DEFAULT_JOB_CAPS['orchestrate'] ?? 3;
    for (let i = 0; i < cap; i++) tryAcquire('orchestrate');
    const high = suggestRetryAfterMs('orchestrate');
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
