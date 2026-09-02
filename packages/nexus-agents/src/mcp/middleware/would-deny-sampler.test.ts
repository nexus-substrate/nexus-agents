/**
 * Warn-mode near-miss sampling (#5228 review dissent).
 *
 * @module mcp/middleware/would-deny-sampler.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../core/index.js';

import {
  sampleWouldDeny,
  describeOccurrence,
  resetWouldDenySampler,
  MAX_TRACKED_PAIRS,
  IDLE_RESET_MS,
} from './would-deny-sampler.js';

beforeEach(() => {
  resetWouldDenySampler();
});

describe('the first near-miss is always recorded', () => {
  it('emits on the very first occurrence', () => {
    // #4991's whole purpose: a near-miss must never be invisible. A sampler
    // that warmed up before emitting would reintroduce the defect for any rule
    // that fires only once.
    expect(sampleWouldDeny('read_file', 'path-traversal')).toEqual({
      emit: true,
      occurrence: 1,
    });
  });
});

describe('growth is logarithmic, not linear', () => {
  it('emits on powers of two and suppresses between them', () => {
    const emitted: number[] = [];
    for (let i = 0; i < 100; i++) {
      const s = sampleWouldDeny('read_file', 'path-traversal');
      if (s.emit) emitted.push(s.occurrence);
    }
    expect(emitted).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });

  it('turns ten thousand occurrences into fourteen records', () => {
    let count = 0;
    for (let i = 0; i < 10_000; i++) {
      if (sampleWouldDeny('read_file', 'path-traversal').emit) count++;
    }
    // The dissent's scenario. Linear emission would have written 10,000.
    expect(count).toBe(14);
  });
});

describe('pairs are counted independently', () => {
  it('does not let one rule suppress another', () => {
    sampleWouldDeny('read_file', 'path-traversal');
    sampleWouldDeny('read_file', 'path-traversal');
    sampleWouldDeny('read_file', 'path-traversal');

    // A different rule on the same tool is its own first occurrence, and a
    // first occurrence always emits.
    expect(sampleWouldDeny('read_file', 'secret-scan')).toEqual({
      emit: true,
      occurrence: 1,
    });
    expect(sampleWouldDeny('write_file', 'path-traversal')).toEqual({
      emit: true,
      occurrence: 1,
    });
  });

  it('treats an unnamed rule as its own pair rather than merging it', () => {
    sampleWouldDeny('read_file', undefined);
    const second = sampleWouldDeny('read_file', undefined);
    expect(second.occurrence).toBe(2);
    // Not merged with a named rule on the same tool.
    expect(sampleWouldDeny('read_file', 'path-traversal').occurrence).toBe(1);
  });
});

describe('the counter map is bounded', () => {
  it('does not grow without limit', () => {
    for (let i = 0; i < MAX_TRACKED_PAIRS + 10; i++) {
      sampleWouldDeny(`tool_${String(i)}`, 'rule');
    }
    // After the reset, a previously-seen pair reads as a first occurrence.
    // That understates ("at least N") rather than fabricating, which is the
    // right direction for a floor.
    expect(sampleWouldDeny('tool_0', 'rule').occurrence).toBe(1);
  });
});

describe('the emitted record says which occurrence it is', () => {
  it('says nothing extra for the first', () => {
    // Nothing has been suppressed yet, so there is nothing to disclose.
    expect(describeOccurrence(1)).toBe('');
  });

  it('names the ordinal and the sampling for later ones', () => {
    const text = describeOccurrence(64);
    expect(text).toContain('64');
    expect(text).toContain('sampled out');
  });

  it('lets a reader establish a floor without a later flush', () => {
    // The property that ruled out time-windowing: a loop that stops mid-window
    // still leaves its last record naming an ordinal, so "fired at least 64
    // times" survives without anything having to flush afterwards.
    let last = 0;
    for (let i = 0; i < 100; i++) {
      const s = sampleWouldDeny('read_file', 'path-traversal');
      if (s.emit) last = s.occurrence;
    }
    expect(describeOccurrence(last)).toContain('64');
  });
});

/**
 * Idle reset (#5228 round-4 dissent).
 *
 * Without it the counter is process-lifetime state, so an occurrence on day 1
 * and another on day 30 belong to one continuous sequence and the later one is
 * sampled out. #4988 reads a soak window measured in days, so chronologically
 * distinct incidents were collapsing into a single exponential backoff.
 *
 * Driven with a fake clock rather than real sleeps — the behaviour under test
 * is a threshold comparison, and a test that waits ten minutes proves nothing a
 * controlled clock does not.
 */
describe('a pair that goes quiet starts a new burst', () => {
  let clock: FixedTimeProvider;

  beforeEach(() => {
    resetWouldDenySampler();
    clock = new FixedTimeProvider(1_000_000);
    setTimeProvider(clock);
  });

  afterEach(() => {
    resetTimeProvider();
  });

  it('emits again after the idle threshold, rather than staying sampled out', () => {
    // Burn the low ordinals: after 20 occurrences the next emit is at 32.
    for (let i = 0; i < 20; i++) sampleWouldDeny('read_file', 'path-traversal');
    expect(sampleWouldDeny('read_file', 'path-traversal').emit).toBe(false);

    clock.advance(IDLE_RESET_MS + 1);

    // A separate incident, not a continuation of the earlier loop.
    expect(sampleWouldDeny('read_file', 'path-traversal')).toEqual({
      emit: true,
      occurrence: 1,
    });
  });

  it('does not reset while the pair is still active', () => {
    sampleWouldDeny('read_file', 'path-traversal');
    // Just under the threshold, repeatedly — an ongoing loop must stay one
    // sequence, or the sampling would not bound anything.
    for (let i = 0; i < 5; i++) {
      clock.advance(IDLE_RESET_MS - 1);
      sampleWouldDeny('read_file', 'path-traversal');
    }
    expect(sampleWouldDeny('read_file', 'path-traversal').occurrence).toBe(7);
  });

  it('keeps a tight loop bounded across a long window', () => {
    // The property the idle reset must not break: continuous activity is still
    // logarithmic, not one record per occurrence.
    let emitted = 0;
    for (let i = 0; i < 1000; i++) {
      clock.advance(1000);
      if (sampleWouldDeny('read_file', 'path-traversal').emit) emitted++;
    }
    expect(emitted).toBe(10);
  });

  it('resets each pair on its own idleness', () => {
    sampleWouldDeny('read_file', 'path-traversal');
    sampleWouldDeny('read_file', 'path-traversal');
    clock.advance(IDLE_RESET_MS + 1);
    sampleWouldDeny('write_file', 'secret-scan');

    // `read_file` went quiet and resets; `write_file` has only just started.
    expect(sampleWouldDeny('read_file', 'path-traversal').occurrence).toBe(1);
    expect(sampleWouldDeny('write_file', 'secret-scan').occurrence).toBe(2);
  });
});
