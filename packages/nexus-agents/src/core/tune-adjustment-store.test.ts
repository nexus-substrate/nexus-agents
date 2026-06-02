/**
 * Tests for the bounded, time-decaying TuneAdjustmentStore (#3147, epic #3313).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TuneAdjustmentStore,
  TUNE_DEMOTION_FLOOR,
  TUNE_MAX_STEP,
  TUNE_DECAY_WINDOW_MS,
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
