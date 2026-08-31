/**
 * A watchdog must be able to say "I am not measuring this" (#5282).
 *
 * `isStalled` returned a bare boolean, collapsing `unmeasured` into `false`.
 * Both consumers — `execute-expert.ts` and `orchestrate.ts` — therefore read a
 * green "not stalled" from a session no instrumentation had ever reported on.
 *
 * The inertness is total for experts: `withStep` is the only emitter on
 * `stepBus`, it fires exactly twice per step (open and close) with no
 * intermediate progress, and no `withStep` call site lies inside the expert
 * execution path. So `heartbeatCount` stays 0, `classifyHealth` returns
 * `'unmeasured'`, and `isStalled` reported `false` forever.
 *
 * Resolved by a 7-voter `higher_order` panel (6 approve / 1 reject, option C
 * leading at 66.7%): make the inertness VISIBLE rather than emit a synthetic
 * heartbeat. The panel explicitly rejected the three fixes proposed on the
 * issue — because `withStep` emits no intermediate progress, each would have
 * produced exactly one heartbeat at session start and then silence, flipping
 * the check from inert to firing a FALSE stall on every model call over 120s.
 * `classifyHealth` already records that same finding in a comment.
 *
 * @module agents/heartbeat-stall-tick.test
 */

import { describe, it, expect } from 'vitest';

import { beforeEach, afterEach, vi } from 'vitest';

import { classifyStallTick, HeartbeatMonitor } from './heartbeat-monitor.js';

describe('classifyStallTick (#5282)', () => {
  it('reports an uninstrumented session as unmeasured, not as healthy', () => {
    // The whole point. `isStalled` returned `false` here, which a consumer
    // reads as "checked, and fine".
    expect(classifyStallTick('unmeasured')).toBe('unmeasured');
  });

  it('still reports a genuinely stalled session as stalled', () => {
    // The pair. A classifier that answered 'unmeasured' for everything would
    // satisfy the test above while disabling the check completely.
    expect(classifyStallTick('stalled')).toBe('stalled');
  });

  it('stays quiet for a live session', () => {
    expect(classifyStallTick('alive')).toBe('quiet');
  });

  it('stays quiet for a slow-but-reporting session', () => {
    // 'slow' is a distinct state the monitor already tracks; a session that is
    // reporting progress slowly is not stalled and must not be warned about.
    expect(classifyStallTick('slow')).toBe('quiet');
  });

  it('stays quiet for a session that is gone', () => {
    // A session can end between the watchdog tick and the lookup. That is
    // benign, and distinct from 'unmeasured' — there is nothing to report on,
    // rather than something we failed to measure.
    expect(classifyStallTick(undefined)).toBe('quiet');
  });
});

describe('getHealth counts unmeasured sessions (#5282)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts a session that never reported progress as unmeasured', () => {
    // `stalledSessions: 0` is true of an all-uninstrumented fleet and reads as
    // health. The separate count is what makes the absence visible in the
    // aggregate, and it is the signal that would justify real progress
    // instrumentation later.
    const monitor = new HeartbeatMonitor();
    monitor.startSession('never-reports');
    vi.advanceTimersByTime(130_000);

    const report = monitor.getHealth();
    expect(report.unmeasuredSessions).toBe(1);
    expect(report.stalledSessions).toBe(0);
    expect(report.activeSessions).toBe(1);
  });

  it('does not count a session that did report progress', () => {
    // The pair. A counter stuck at activeSessions would satisfy the test above.
    const monitor = new HeartbeatMonitor();
    const sid = monitor.startSession('reports');
    monitor.heartbeat(sid);
    vi.advanceTimersByTime(130_000);

    const report = monitor.getHealth();
    expect(report.unmeasuredSessions).toBe(0);
    expect(report.stalledSessions).toBe(1);
  });
});
