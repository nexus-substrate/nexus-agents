/**
 * Tests for weather report — multi-CLI performance dashboard and adaptive routing.
 * (Source: Issue #865)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetOutcomeStore, getOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { generateWeatherReport, getAdaptiveBonus, shouldExplore } from './weather-report.js';
import { createDefaultWeatherConfig } from './weather-report-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: `test-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
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

function seedOutcomes(count: number, overrides: Partial<TaskOutcome> = {}): void {
  const store = getOutcomeStore();
  for (let i = 0; i < count; i++) {
    store.append(makeOutcome(overrides));
  }
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  resetOutcomeStore();
});

describe('createDefaultWeatherConfig', () => {
  it('returns expected defaults', () => {
    const config = createDefaultWeatherConfig();
    expect(config.coldStartThreshold).toBe(5);
    expect(config.explorationRate).toBe(0.1);
    expect(config.maxBonusAdjustment).toBe(5);
  });
});

describe('generateWeatherReport', () => {
  it('returns empty report when no outcomes', () => {
    const report = generateWeatherReport({});

    expect(report.overall.totalTasks).toBe(0);
    expect(report.overall.successRate).toBe(0);
    expect(report.cliWeather).toHaveLength(3); // claude, gemini, codex
    expect(report.collectedAt).toBeDefined();
  });

  it('reports per-CLI stats', () => {
    seedOutcomes(5, { cli: 'claude', success: true, durationMs: 100 });
    seedOutcomes(3, { cli: 'gemini', success: true, durationMs: 200 });
    seedOutcomes(2, { cli: 'codex', success: false, durationMs: 300 });

    const report = generateWeatherReport({});

    expect(report.overall.totalTasks).toBe(10);
    const claudeW = report.cliWeather.find((c) => c.cli === 'claude');
    expect(claudeW?.totalTasks).toBe(5);
    expect(claudeW?.successRate).toBe(1);

    const codexW = report.cliWeather.find((c) => c.cli === 'codex');
    expect(codexW?.totalTasks).toBe(2);
    expect(codexW?.successRate).toBe(0);
  });

  it('filters by CLI when specified', () => {
    seedOutcomes(5, { cli: 'claude' });
    seedOutcomes(3, { cli: 'gemini' });

    const report = generateWeatherReport({ cli: 'claude' });

    expect(report.overall.totalTasks).toBe(5);
    expect(report.cliWeather).toHaveLength(1);
    expect(report.cliWeather[0]?.cli).toBe('claude');
  });

  it('filters by category when specified', () => {
    seedOutcomes(5, { category: 'code_review' });
    seedOutcomes(3, { category: 'testing' });

    const report = generateWeatherReport({ category: 'code_review' });

    expect(report.overall.totalTasks).toBe(5);
  });

  it('includes per-category breakdown in CLI weather', () => {
    seedOutcomes(3, { cli: 'claude', category: 'code_review' });
    seedOutcomes(2, { cli: 'claude', category: 'testing' });

    const report = generateWeatherReport({});
    const claudeW = report.cliWeather.find((c) => c.cli === 'claude');
    expect(claudeW?.byCategory.get('code_review')?.count).toBe(3);
    expect(claudeW?.byCategory.get('testing')?.count).toBe(2);
  });

  it('includes adaptive bonuses when requested', () => {
    seedOutcomes(15, { cli: 'claude', category: 'architecture', success: true });

    const report = generateWeatherReport({ includeAdaptive: true });

    expect(report.adaptiveBonuses.length).toBeGreaterThan(0);
    const archBonus = report.adaptiveBonuses.find(
      (b) => b.cli === 'claude' && b.category === 'architecture'
    );
    expect(archBonus?.sufficient).toBe(true);
    expect(archBonus?.sampleCount).toBe(15);
  });

  it('excludes adaptive bonuses when not requested', () => {
    seedOutcomes(5, { cli: 'claude' });

    const report = generateWeatherReport({ includeAdaptive: false });

    expect(report.adaptiveBonuses).toHaveLength(0);
  });

  it('includes failureBreakdown when failures have categories', () => {
    getOutcomeStore().append(makeOutcome({ success: false, failureCategory: 'timeout' }));
    getOutcomeStore().append(makeOutcome({ success: false, failureCategory: 'timeout' }));
    getOutcomeStore().append(makeOutcome({ success: false, failureCategory: 'rate_limit' }));
    seedOutcomes(3); // successes

    const report = generateWeatherReport({});

    expect(report.failureBreakdown).toBeDefined();
    const breakdown = report.failureBreakdown ?? [];
    expect(breakdown).toHaveLength(2);
    const timeoutEntry = breakdown.find((e) => e.category === 'timeout');
    expect(timeoutEntry?.count).toBe(2);
    expect(timeoutEntry?.percentage).toBeCloseTo(66.7, 0);
    const rateLimitEntry = breakdown.find((e) => e.category === 'rate_limit');
    expect(rateLimitEntry?.count).toBe(1);
  });

  it('omits failureBreakdown when no failures', () => {
    seedOutcomes(5);
    const report = generateWeatherReport({});
    expect(report.failureBreakdown).toBeUndefined();
  });

  it('assigns unknown category to failures without failureCategory', () => {
    getOutcomeStore().append(makeOutcome({ success: false }));
    const report = generateWeatherReport({});
    const breakdown = report.failureBreakdown ?? [];
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.category).toBe('unknown');
  });

  it('reports exploration rate and cold start threshold', () => {
    const report = generateWeatherReport({});

    expect(report.explorationRate).toBe(0.1);
    expect(report.coldStartThreshold).toBe(5);
  });
});

describe('getAdaptiveBonus', () => {
  it('returns 0 below cold-start threshold', () => {
    seedOutcomes(3, { cli: 'claude', category: 'code_generation', success: true });

    const bonus = getAdaptiveBonus('claude', 'code_generation');
    expect(bonus).toBe(0);
  });

  it('returns positive bonus for high success rate', () => {
    seedOutcomes(15, { cli: 'claude', category: 'code_generation', success: true });

    const bonus = getAdaptiveBonus('claude', 'code_generation');
    expect(bonus).toBeGreaterThan(0);
  });

  it('returns negative bonus for low success rate', () => {
    seedOutcomes(15, { cli: 'codex', category: 'research', success: false });

    const bonus = getAdaptiveBonus('codex', 'research');
    expect(bonus).toBeLessThan(0);
  });

  it('clamps to maxBonusAdjustment', () => {
    seedOutcomes(20, { cli: 'claude', category: 'architecture', success: true });

    const bonus = getAdaptiveBonus('claude', 'architecture', { maxBonusAdjustment: 3 });
    expect(bonus).toBeLessThanOrEqual(3);
    expect(bonus).toBeGreaterThanOrEqual(-3);
  });

  it('respects custom cold-start threshold', () => {
    seedOutcomes(3, { cli: 'claude', category: 'testing', success: true });

    // Default threshold is 10, so 3 samples = cold start
    expect(getAdaptiveBonus('claude', 'testing')).toBe(0);

    // With threshold of 2, 3 samples is sufficient
    const bonus = getAdaptiveBonus('claude', 'testing', { coldStartThreshold: 2 });
    expect(bonus).toBeGreaterThan(0);
  });

  it('scales with observed success rate', () => {
    // Mixed success: 70% = baseline → ~0 adjustment
    for (let i = 0; i < 7; i++) {
      getOutcomeStore().append(
        makeOutcome({ cli: 'gemini', category: 'documentation', success: true })
      );
    }
    for (let i = 0; i < 3; i++) {
      getOutcomeStore().append(
        makeOutcome({ cli: 'gemini', category: 'documentation', success: false })
      );
    }

    const bonus = getAdaptiveBonus('gemini', 'documentation');
    // 70% success = baseline, should be near 0
    expect(Math.abs(bonus)).toBeLessThan(1);
  });
});

describe('shouldExplore', () => {
  it('returns boolean', () => {
    const result = shouldExplore();
    expect(typeof result).toBe('boolean');
  });

  it('always returns false with 0 exploration rate', () => {
    // With rate 0, should never explore
    let explored = false;
    for (let i = 0; i < 100; i++) {
      if (shouldExplore({ explorationRate: 0 })) explored = true;
    }
    expect(explored).toBe(false);
  });

  it('always returns true with 1.0 exploration rate', () => {
    expect(shouldExplore({ explorationRate: 1 })).toBe(true);
  });
});
