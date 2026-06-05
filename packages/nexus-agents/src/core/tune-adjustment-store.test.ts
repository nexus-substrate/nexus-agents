/**
 * Tests for the bounded, time-decaying TuneAdjustmentStore (#3147, epic #3313).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TuneAdjustmentStore,
  TUNE_DEMOTION_FLOOR,
  TUNE_MAX_STEP,
  TUNE_DECAY_WINDOW_MS,
  type TuneReversal,
} from './tune-adjustment-store.js';
import { setTimeProvider, resetTimeProvider, FixedTimeProvider } from './time-provider.js';

describe('TuneAdjustmentStore (#3147)', () => {
  let clock: FixedTimeProvider;

  beforeEach(() => {
    clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
  });
  afterEach(() => {
    resetTimeProvider();
  });

  it('defaults to a 1.0 multiplier (no adjustment = no effect)', () => {
    const store = new TuneAdjustmentStore();
    expect(store.effectiveMultiplier('claude')).toBe(1.0);
  });

  it('demotes by a bounded step (demotion-only, ≤ 1.0)', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0.2, 'unhealthy');
    expect(store.effectiveMultiplier('gemini')).toBeCloseTo(0.8, 5);
  });

  it('caps a single demotion at TUNE_MAX_STEP', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0.9, 'big'); // requested 0.9, capped to MAX_STEP
    expect(store.effectiveMultiplier('gemini')).toBeCloseTo(1.0 - TUNE_MAX_STEP, 5);
  });

  it('never demotes below the floor, even when compounded', () => {
    const store = new TuneAdjustmentStore();
    for (let i = 0; i < 20; i++) store.demote('codex', TUNE_MAX_STEP, 'repeat');
    expect(store.effectiveMultiplier('codex')).toBeGreaterThanOrEqual(TUNE_DEMOTION_FLOOR);
    expect(store.effectiveMultiplier('codex')).toBe(TUNE_DEMOTION_FLOOR);
  });

  it('decays linearly back to 1.0 over the decay window (auto-reversible)', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0.2, 'blip'); // multiplier 0.8 at t=0
    clock.setTime(TUNE_DECAY_WINDOW_MS / 2); // halfway
    // 0.8 + (1.0 - 0.8) * 0.5 = 0.9
    expect(store.effectiveMultiplier('gemini')).toBeCloseTo(0.9, 5);
    clock.setTime(TUNE_DECAY_WINDOW_MS); // fully decayed
    expect(store.effectiveMultiplier('gemini')).toBe(1.0);
  });

  it('records provenance (reason) for the active adjustment', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0.1, 'swarm_unhealthy: timeouts');
    const active = store.list();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ cli: 'gemini', reason: 'swarm_unhealthy: timeouts' });
  });

  it('clear() removes all adjustments', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0.2, 'x');
    store.clear();
    expect(store.effectiveMultiplier('gemini')).toBe(1.0);
  });

  it('ignores non-positive magnitudes (no-op)', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0, 'noop');
    store.demote('gemini', -0.5, 'noop');
    expect(store.effectiveMultiplier('gemini')).toBe(1.0);
  });
});

describe('TuneAdjustmentStore demotion telemetry (#3323)', () => {
  it('counts applied demotions and survives decay/eviction', () => {
    const clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
    try {
      const store = new TuneAdjustmentStore();
      store.demote('gemini', 0.2, 'swarm_unhealthy: a');
      store.demote('gemini', 0.2, 'swarm_unhealthy: b');
      // Advance past the decay window so the active adjustment is evicted...
      clock.advance(TUNE_DECAY_WINDOW_MS + 1);
      expect(store.effectiveMultiplier('gemini')).toBe(1.0); // adjustment gone
      // ...but the cumulative stat persists.
      const stats = store.demotionStats();
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({ cli: 'gemini', applied: 2, intended: 0 });
      expect(stats[0]?.lastReason).toBe('swarm_unhealthy: b');
    } finally {
      resetTimeProvider();
    }
  });

  it('recordIntended counts WITHOUT affecting routing (shadow soak)', () => {
    const store = new TuneAdjustmentStore();
    store.recordIntended('codex', 'swarm_unhealthy: would-demote');
    store.recordIntended('codex', 'swarm_unhealthy: again');
    // Routing is untouched — the loop is still shadow.
    expect(store.effectiveMultiplier('codex')).toBe(1.0);
    expect(store.list()).toHaveLength(0);
    // But the intended counter accrues for soak observability.
    const stat = store.demotionStats().find((s) => s.cli === 'codex');
    expect(stat).toMatchObject({ applied: 0, intended: 2 });
  });

  it('recordIntended ignores an empty reason (no-op)', () => {
    const store = new TuneAdjustmentStore();
    store.recordIntended('gemini', '');
    expect(store.demotionStats()).toHaveLength(0);
  });

  it('clear() also resets telemetry', () => {
    const store = new TuneAdjustmentStore();
    store.demote('gemini', 0.2, 'x');
    store.recordIntended('codex', 'y');
    store.clear();
    expect(store.demotionStats()).toHaveLength(0);
  });

  it('caps the retained reason length', () => {
    const store = new TuneAdjustmentStore();
    store.recordIntended('gemini', 'r'.repeat(5000));
    expect(store.demotionStats()[0]?.lastReason.length).toBeLessThanOrEqual(512);
  });
});

describe('TuneAdjustmentStore reversal audit hook (#3323)', () => {
  let clock: FixedTimeProvider;

  beforeEach(() => {
    clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
  });
  afterEach(() => {
    resetTimeProvider();
  });

  it('fires a decay_expiry reversal when a fully-decayed adjustment is evicted', () => {
    const store = new TuneAdjustmentStore();
    const reversals: TuneReversal[] = [];
    store.onReversal((r) => reversals.push(r));

    store.demote('gemini', 0.2, 'swarm_unhealthy: blip'); // multiplier 0.8 at t=0
    clock.advance(TUNE_DECAY_WINDOW_MS + 1); // past the window → eviction
    expect(store.effectiveMultiplier('gemini')).toBe(1.0); // restored

    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({
      cli: 'gemini',
      cause: 'decay_expiry',
      previousMultiplier: 0.8,
      restoredMultiplier: 1.0,
      reason: 'swarm_unhealthy: blip',
    });
  });

  it('fires a superseded reversal when a fresh demotion overwrites an active one', () => {
    const store = new TuneAdjustmentStore();
    const reversals: TuneReversal[] = [];
    store.onReversal((r) => reversals.push(r));

    store.demote('codex', 0.2, 'first'); // 0.8, active
    store.demote('codex', 0.2, 'second'); // supersedes → 0.6

    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({
      cli: 'codex',
      cause: 'superseded',
      reason: 'first',
    });
    expect(store.effectiveMultiplier('codex')).toBeCloseTo(0.6, 5);
  });

  it('does NOT fire a reversal for a first demotion (nothing to reverse)', () => {
    const store = new TuneAdjustmentStore();
    const listener = vi.fn();
    store.onReversal(listener);
    store.demote('gemini', 0.2, 'only');
    expect(listener).not.toHaveBeenCalled();
  });

  it('swallows a throwing reversal listener and never corrupts routing state', () => {
    const store = new TuneAdjustmentStore();
    store.onReversal(() => {
      throw new Error('audit sink down');
    });
    store.demote('gemini', 0.2, 'blip');
    clock.advance(TUNE_DECAY_WINDOW_MS + 1);
    // The eviction (reversal) still completes despite the throwing sink.
    expect(() => store.effectiveMultiplier('gemini')).not.toThrow();
    expect(store.effectiveMultiplier('gemini')).toBe(1.0);
  });

  it('onReversal(undefined) clears the listener', () => {
    const store = new TuneAdjustmentStore();
    const listener = vi.fn();
    store.onReversal(listener);
    store.onReversal(undefined);
    store.demote('gemini', 0.2, 'a');
    store.demote('gemini', 0.2, 'b'); // would supersede
    expect(listener).not.toHaveBeenCalled();
  });
});
