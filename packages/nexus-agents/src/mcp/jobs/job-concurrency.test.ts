/**
 * Tests for job-concurrency (#3044 / epic #2631 Stage 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_GLOBAL_JOB_CAP,
  DEFAULT_JOB_CAPS,
  getGlobalJobCap,
  getInFlight,
  getJobCap,
  getTotalInFlight,
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
  delete process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'];
});

describe('getJobCap', () => {
  it('returns the per-tool default when no env override is set', () => {
    expect(getJobCap('orchestrate')).toBe(DEFAULT_JOB_CAPS['orchestrate']);
    expect(getJobCap('run_workflow')).toBe(DEFAULT_JOB_CAPS['run_workflow']);
  });

  it('caps run_dev_pipeline at 2 concurrent runs (#3726)', () => {
    expect(DEFAULT_JOB_CAPS['run_dev_pipeline']).toBe(2);
    expect(getJobCap('run_dev_pipeline')).toBe(2);
  });

  it('caps run_pipeline at 2 concurrent runs (#3730)', () => {
    expect(DEFAULT_JOB_CAPS['run_pipeline']).toBe(2);
    expect(getJobCap('run_pipeline')).toBe(2);
  });

  it('caps pr_review at 2 concurrent runs (#3731)', () => {
    expect(DEFAULT_JOB_CAPS['pr_review']).toBe(2);
    expect(getJobCap('pr_review')).toBe(2);
  });

  it('caps supply_chain_tradeoff_panel at 2 concurrent runs (#3731)', () => {
    expect(DEFAULT_JOB_CAPS['supply_chain_tradeoff_panel']).toBe(2);
    expect(getJobCap('supply_chain_tradeoff_panel')).toBe(2);
  });

  it('caps execute_spec at 2 concurrent runs (#3732)', () => {
    expect(DEFAULT_JOB_CAPS['execute_spec']).toBe(2);
    expect(getJobCap('execute_spec')).toBe(2);
  });

  it('caps run_graph_workflow at 2 concurrent runs (#3732)', () => {
    expect(DEFAULT_JOB_CAPS['run_graph_workflow']).toBe(2);
    expect(getJobCap('run_graph_workflow')).toBe(2);
  });

  it('caps run at 2 concurrent runs (#3732)', () => {
    expect(DEFAULT_JOB_CAPS['run']).toBe(2);
    expect(getJobCap('run')).toBe(2);
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

// #3046 Stage 5 — cross-tool global cap.
describe('global cap (#3046)', () => {
  it('returns default when no env override is set', () => {
    expect(getGlobalJobCap()).toBe(DEFAULT_GLOBAL_JOB_CAP);
  });

  it('honors NEXUS_JOB_MAX_CONCURRENT_TOTAL env override', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'] = '5';
    expect(getGlobalJobCap()).toBe(5);
  });

  it('falls back to default when env var is non-numeric', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'] = 'not-a-number';
    expect(getGlobalJobCap()).toBe(DEFAULT_GLOBAL_JOB_CAP);
  });

  it('cap=0 globally disables async-mode across ALL tools', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'] = '0';
    expect(tryAcquire('orchestrate')).toBe(false);
    expect(tryAcquire('run_workflow')).toBe(false);
    expect(tryAcquire('consensus_vote')).toBe(false);
  });

  it('global cap blocks new acquires even when per-tool slots are available', () => {
    // Set global cap of 2 — well below any per-tool default. Fill it
    // with two acquires on orchestrate, then try a third on a different
    // tool. orchestrate per-tool cap (3) still has room; run_workflow
    // has its own per-tool cap entirely. But global is full.
    process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'] = '2';
    expect(tryAcquire('orchestrate')).toBe(true);
    expect(tryAcquire('orchestrate')).toBe(true);
    expect(getTotalInFlight()).toBe(2);
    // Both per-tool caps have room (3 and 3), but global is at 2/2.
    expect(tryAcquire('run_workflow')).toBe(false);
    expect(tryAcquire('orchestrate')).toBe(false);
  });

  it('release() frees a global slot, opening room for another tool', () => {
    process.env['NEXUS_JOB_MAX_CONCURRENT_TOTAL'] = '2';
    tryAcquire('orchestrate');
    tryAcquire('orchestrate');
    expect(tryAcquire('run_workflow')).toBe(false);
    release('orchestrate');
    expect(tryAcquire('run_workflow')).toBe(true);
  });

  it('getTotalInFlight sums across tools', () => {
    tryAcquire('orchestrate');
    tryAcquire('run_workflow');
    tryAcquire('consensus_vote');
    expect(getTotalInFlight()).toBe(3);
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
