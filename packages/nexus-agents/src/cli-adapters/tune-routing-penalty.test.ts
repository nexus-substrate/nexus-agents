/**
 * Tests for the tune-demotion → routing-penalty translation (#3147 keystone
 * step 2). Verifies the CompositeRouter applies the bounded TuneAdjustmentStore
 * demotion as a scoring penalty, gated by NEXUS_TUNE_ENFORCE.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CliName } from './types.js';
import { getTuneAdjustmentScores } from './composite-router-stages.js';
import { getTuneAdjustmentStore, resetTuneAdjustmentStore } from '../core/index.js';

const CANDIDATES: CliName[] = ['claude', 'gemini', 'codex'];

describe('getTuneAdjustmentScores (#3147 step 2)', () => {
  beforeEach(() => {
    resetTuneAdjustmentStore();
    delete process.env['NEXUS_TUNE_ENFORCE'];
  });
  afterEach(() => {
    resetTuneAdjustmentStore();
    delete process.env['NEXUS_TUNE_ENFORCE'];
  });

  it('is a no-op (empty map) when NEXUS_TUNE_ENFORCE is off — default', () => {
    getTuneAdjustmentStore().demote('gemini', 0.2, 'unhealthy');
    expect(getTuneAdjustmentScores(CANDIDATES).size).toBe(0);
  });

  it('applies a bounded negative penalty for a demoted CLI when enforce is on', () => {
    process.env['NEXUS_TUNE_ENFORCE'] = 'true';
    getTuneAdjustmentStore().demote('gemini', 0.2, 'unhealthy'); // multiplier 0.8
    const scores = getTuneAdjustmentScores(CANDIDATES);
    // -(1 - 0.8) * 10 = -2
    expect(scores.get('gemini')).toBeCloseTo(-2, 5);
    // undemoted CLIs get no entry (multiplier 1.0)
    expect(scores.has('claude')).toBe(false);
    expect(scores.has('codex')).toBe(false);
  });

  it('caps the penalty at the floor demotion (never stronger than ~-5)', () => {
    process.env['NEXUS_TUNE_ENFORCE'] = 'true';
    const store = getTuneAdjustmentStore();
    for (let i = 0; i < 10; i++) store.demote('codex', 0.2, 'repeat'); // drives to floor 0.5
    const penalty = getTuneAdjustmentScores(CANDIDATES).get('codex');
    // floor 0.5 → -(1 - 0.5) * 10 = -5; never beyond
    expect(penalty).toBeCloseTo(-5, 5);
    expect(penalty).toBeGreaterThanOrEqual(-5);
  });
});
