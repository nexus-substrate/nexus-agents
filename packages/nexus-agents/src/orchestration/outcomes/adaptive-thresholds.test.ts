/**
 * Tests for adaptive thresholds — learning loop (Issue #901, Phase 4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OutcomeStore } from './outcome-store.js';
import type { TaskOutcome } from './outcome-types.js';
import { computeAdaptiveThresholds, detectTrend } from './adaptive-thresholds.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: `t-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet',
    success: true,
    durationMs: 1000,
    timestamp: new Date().toISOString(),
    source: 'delegate',
    ...overrides,
  };
}

function seedStore(store: OutcomeStore, count: number, overrides: Partial<TaskOutcome> = {}): void {
  for (let i = 0; i < count; i++) {
    store.append(makeOutcome(overrides));
  }
}

// ============================================================================
// computeAdaptiveThresholds
// ============================================================================

describe('computeAdaptiveThresholds', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    store = new OutcomeStore();
  });

  it('returns defaults below cold start threshold', () => {
    seedStore(store, 2, { cli: 'claude', category: 'code_generation' });

    const result = computeAdaptiveThresholds(store, 'claude', 'code_generation');

    expect(result.baseline).toBe(0.7);
    expect(result.maxBonus).toBe(5);
    expect(result.coldStart).toBe(3);
    expect(result.trend).toBe('stable');
    expect(result.confidence).toBe(0);
    expect(result.sampleCount).toBe(2);
  });

  it('returns defaults for empty store', () => {
    const result = computeAdaptiveThresholds(store, 'claude', 'code_generation');

    expect(result.baseline).toBe(0.7);
    expect(result.confidence).toBe(0);
    expect(result.sampleCount).toBe(0);
  });

  it('adjusts baseline toward observed rate above cold start', () => {
    // All successes → observed rate = 1.0
    seedStore(store, 20, { cli: 'claude', category: 'code_generation', success: true });

    const result = computeAdaptiveThresholds(store, 'claude', 'code_generation');

    // Confidence = 20/50 = 0.4
    // baseline = 0.7 * 0.6 + 1.0 * 0.4 = 0.42 + 0.4 = 0.82
    expect(result.baseline).toBeGreaterThan(0.7);
    expect(result.baseline).toBeLessThan(1.0);
    expect(result.sampleCount).toBe(20);
  });

  it('lowers baseline when observed rate is below default', () => {
    // All failures → observed rate = 0.0
    seedStore(store, 20, { cli: 'codex', category: 'research', success: false });

    const result = computeAdaptiveThresholds(store, 'codex', 'research');

    // baseline = 0.7 * 0.6 + 0.0 * 0.4 = 0.42
    expect(result.baseline).toBeLessThan(0.7);
  });

  it('reaches full confidence at 50 samples', () => {
    seedStore(store, 50, { cli: 'gemini', category: 'testing', success: true });

    const result = computeAdaptiveThresholds(store, 'gemini', 'testing');

    expect(result.confidence).toBe(1);
    // At full confidence, baseline = observed rate
    expect(result.baseline).toBe(1);
    expect(result.maxBonus).toBe(5);
  });

  it('confidence ramps linearly', () => {
    seedStore(store, 25, { cli: 'claude', category: 'architecture', success: true });

    const result = computeAdaptiveThresholds(store, 'claude', 'architecture');

    expect(result.confidence).toBe(0.5);
  });

  it('scales max bonus with confidence', () => {
    // 10 samples → confidence = 10/50 = 0.2, maxBonus = 5 * 0.2 = 1
    seedStore(store, 10, { cli: 'claude', category: 'planning', success: true });

    const result = computeAdaptiveThresholds(store, 'claude', 'planning');

    expect(result.maxBonus).toBe(1);
  });

  it('detects improving trend', () => {
    // First half failures, second half successes
    seedStore(store, 10, { cli: 'claude', category: 'code_generation', success: false });
    seedStore(store, 10, { cli: 'claude', category: 'code_generation', success: true });

    const result = computeAdaptiveThresholds(store, 'claude', 'code_generation');

    expect(result.trend).toBe('improving');
  });

  it('detects declining trend', () => {
    // First half successes, second half failures
    seedStore(store, 10, { cli: 'claude', category: 'code_review', success: true });
    seedStore(store, 10, { cli: 'claude', category: 'code_review', success: false });

    const result = computeAdaptiveThresholds(store, 'claude', 'code_review');

    expect(result.trend).toBe('declining');
  });

  it('detects stable trend when rates are similar', () => {
    // All successes → both halves are identical
    seedStore(store, 20, { cli: 'claude', category: 'documentation', success: true });

    const result = computeAdaptiveThresholds(store, 'claude', 'documentation');

    expect(result.trend).toBe('stable');
  });

  it('filters by CLI and category', () => {
    seedStore(store, 20, { cli: 'claude', category: 'code_generation', success: true });
    seedStore(store, 20, { cli: 'gemini', category: 'research', success: false });

    const claudeResult = computeAdaptiveThresholds(store, 'claude', 'code_generation');
    const geminiResult = computeAdaptiveThresholds(store, 'gemini', 'research');

    expect(claudeResult.baseline).toBeGreaterThan(0.7);
    expect(geminiResult.baseline).toBeLessThan(0.7);
  });
});

// ============================================================================
// detectTrend
// ============================================================================

describe('detectTrend', () => {
  it('returns stable for empty outcomes', () => {
    expect(detectTrend([])).toBe('stable');
  });

  it('returns stable for single outcome', () => {
    expect(detectTrend([makeOutcome()])).toBe('stable');
  });

  it('detects improving when recent rate exceeds historical', () => {
    const outcomes = [
      ...Array.from({ length: 10 }, () => makeOutcome({ success: false })),
      ...Array.from({ length: 10 }, () => makeOutcome({ success: true })),
    ];
    expect(detectTrend(outcomes)).toBe('improving');
  });

  it('detects declining when recent rate drops', () => {
    const outcomes = [
      ...Array.from({ length: 10 }, () => makeOutcome({ success: true })),
      ...Array.from({ length: 10 }, () => makeOutcome({ success: false })),
    ];
    expect(detectTrend(outcomes)).toBe('declining');
  });

  it('returns stable when within threshold', () => {
    // All successes → both halves identical → delta = 0
    const outcomes = Array.from({ length: 20 }, () => makeOutcome({ success: true }));
    expect(detectTrend(outcomes)).toBe('stable');
  });

  it('returns stable for all failures', () => {
    const outcomes = Array.from({ length: 20 }, () => makeOutcome({ success: false }));
    expect(detectTrend(outcomes)).toBe('stable');
  });

  it('respects custom window size', () => {
    // 5 failures then 5 successes with small window
    const outcomes = [
      ...Array.from({ length: 5 }, () => makeOutcome({ success: false })),
      ...Array.from({ length: 5 }, () => makeOutcome({ success: true })),
    ];
    expect(detectTrend(outcomes, 5)).toBe('improving');
  });
});
