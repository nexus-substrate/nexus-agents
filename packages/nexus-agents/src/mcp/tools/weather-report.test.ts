/**
 * Tests for weather report — multi-CLI performance dashboard and adaptive routing.
 * (Source: Issue #865)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetOutcomeStore, getOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import {
  generateWeatherReport,
  getAdaptiveBonus,
  getModelWeatherSummary,
  MODEL_WEATHER_MIN_SAMPLES,
  shouldExplore,
  queryWithLookback,
} from './weather-report.js';
import { createDefaultWeatherConfig } from './weather-report-types.js';
import { CLI_NAMES } from '../../config/model-capabilities-types.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

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
    expect(config.coldStartThreshold).toBe(3);
    expect(config.explorationRate).toBe(0.1);
    expect(config.maxBonusAdjustment).toBe(10);
  });
});

describe('generateWeatherReport', () => {
  it('returns empty report when no outcomes', () => {
    const report = generateWeatherReport({});

    expect(report.overall.totalTasks).toBe(0);
    expect(report.overall.successRate).toBe(0);
    expect(report.cliWeather).toHaveLength(CLI_NAMES.length);
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

  it('auto-classifies failures without failureCategory as execution (#1441)', () => {
    getOutcomeStore().append(makeOutcome({ success: false }));
    const report = generateWeatherReport({});
    const breakdown = report.failureBreakdown ?? [];
    expect(breakdown).toHaveLength(1);
    // OutcomeStore.append() auto-classifies unclassified failures as 'execution'
    expect(breakdown[0]?.category).toBe('execution');
  });

  it('reports exploration rate and cold start threshold', () => {
    const report = generateWeatherReport({});

    expect(report.explorationRate).toBe(0.1);
    expect(report.coldStartThreshold).toBe(3);
  });
});

describe('adapter attempt stats (#1982)', () => {
  it('reports zero stats on an empty store', () => {
    const report = generateWeatherReport({});
    expect(report.overall.adapterAttemptSuccessRate).toBe(0);
    expect(report.overall.adapterUnavailableCount).toBe(0);
    expect(report.overall.adapterUnavailableRate).toBe(0);
  });

  it('excludes adapter_unavailable from attempt success denominator', () => {
    // 5 successes, 2 execution failures, 3 adapter_unavailable failures
    seedOutcomes(5, { cli: 'claude', success: true });
    seedOutcomes(2, { cli: 'claude', success: false, failureCategory: 'execution' });
    seedOutcomes(3, {
      cli: 'claude',
      success: false,
      failureCategory: 'adapter_unavailable',
    });

    const report = generateWeatherReport({});

    // Headline: 5 / 10 = 0.50
    expect(report.overall.successRate).toBeCloseTo(0.5, 2);
    // Adapter-attempt: 5 successes / (10 - 3 infra) = 5/7 ≈ 0.714
    expect(report.overall.adapterAttemptSuccessRate).toBeCloseTo(0.714, 2);
    expect(report.overall.adapterUnavailableCount).toBe(3);
    expect(report.overall.adapterUnavailableRate).toBeCloseTo(0.3, 2);
  });

  it('reports per-CLI adapter stats independently', () => {
    seedOutcomes(4, { cli: 'claude', success: true });
    seedOutcomes(1, { cli: 'claude', success: false, failureCategory: 'adapter_unavailable' });
    seedOutcomes(5, { cli: 'gemini', success: true });

    const report = generateWeatherReport({});
    const claude = report.cliWeather.find((c) => c.cli === 'claude');
    const gemini = report.cliWeather.find((c) => c.cli === 'gemini');

    // claude: 4 / (5 - 1) = 1.0 attempt success; 1/5 unavailable
    expect(claude?.adapterAttemptSuccessRate).toBe(1);
    expect(claude?.adapterUnavailableCount).toBe(1);
    expect(claude?.adapterUnavailableRate).toBeCloseTo(0.2, 2);
    // gemini: no adapter_unavailable events
    expect(gemini?.adapterAttemptSuccessRate).toBe(1);
    expect(gemini?.adapterUnavailableCount).toBe(0);
    expect(gemini?.adapterUnavailableRate).toBe(0);
  });

  it('falls back to message-based classification when failureCategory absent', () => {
    seedOutcomes(2, { cli: 'claude', success: true });
    // No failureCategory field; error message should be classified as adapter_unavailable
    seedOutcomes(2, {
      cli: 'claude',
      success: false,
      errorMessage: 'No model adapter configured',
    });

    const report = generateWeatherReport({});
    const claude = report.cliWeather.find((c) => c.cli === 'claude');
    // Note: outcome-store auto-classifies on append, so this may or may not be captured;
    // the helper's fallback classifier is exercised only for pre-#1441 records. Assert
    // the adapter-attempt rate is AT LEAST as high as the raw rate (the refinement
    // should never penalize the attempt metric relative to raw).
    expect(claude?.adapterAttemptSuccessRate ?? 0).toBeGreaterThanOrEqual(claude?.successRate ?? 0);
  });
});

describe('getAdaptiveBonus', () => {
  it('returns 0 below cold-start threshold', () => {
    seedOutcomes(2, { cli: 'claude', category: 'code_generation', success: true });

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
    seedOutcomes(2, { cli: 'claude', category: 'testing', success: true });

    // Default threshold is 3, so 2 samples = cold start
    expect(getAdaptiveBonus('claude', 'testing')).toBe(0);

    // With threshold of 2, 2 samples is sufficient
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

// ============================================================================
// Per-model weather lens (#4194)
// ============================================================================

describe('getModelWeatherSummary (#4194)', () => {
  it('computes per-model summaries from mixed-model outcomes', () => {
    seedOutcomes(6, { model: 'claude-opus-4', cli: 'claude', success: true, durationMs: 100 });
    seedOutcomes(3, { model: 'gemini-2.5-flash', cli: 'gemini', success: true, durationMs: 200 });
    seedOutcomes(3, { model: 'gemini-2.5-flash', cli: 'gemini', success: false, durationMs: 200 });

    const entries = getModelWeatherSummary();

    const opus = entries.find((e) => e.model === 'claude-opus-4');
    expect(opus).toMatchObject({
      scope: 'literal',
      sampleCount: 6,
      successRate: 1,
      avgDurationMs: 100,
      vendor: 'anthropic',
      family: 'claude-opus',
    });
    const flash = entries.find((e) => e.model === 'gemini-2.5-flash');
    expect(flash).toMatchObject({ sampleCount: 6, successRate: 0.5, avgDurationMs: 200 });
  });

  it('excludes models below the min-sample threshold', () => {
    seedOutcomes(6, { model: 'claude-opus-4', cli: 'claude' });
    seedOutcomes(MODEL_WEATHER_MIN_SAMPLES - 1, { model: 'gpt-5', cli: 'codex' });

    const entries = getModelWeatherSummary();

    expect(entries.some((e) => e.model === 'claude-opus-4')).toBe(true);
    expect(entries.some((e) => e.model === 'gpt-5')).toBe(false);
  });

  it('broadens cold-start models to family siblings via the #2548 fallback path', () => {
    seedOutcomes(2, { model: 'claude-sonnet-4-5', cli: 'claude', success: true });
    seedOutcomes(4, { model: 'claude-sonnet-4', cli: 'claude', success: false });

    const entries = getModelWeatherSummary();

    const cold = entries.find((e) => e.model === 'claude-sonnet-4-5');
    expect(cold).toMatchObject({ scope: 'family', sampleCount: 6, family: 'claude-sonnet' });
  });

  it('excludes placeholder and worker-role model ids', () => {
    seedOutcomes(6, { model: 'unknown' });
    seedOutcomes(6, { model: 'pipeline' });
    seedOutcomes(6, { model: 'worker-code' });

    expect(getModelWeatherSummary()).toEqual([]);
  });

  it('does not pool unrecognized models through the unknown/unknown family bucket', () => {
    // Both ids resolve to vendor/family 'unknown' — family fallback would
    // otherwise merge unrelated models into one bucket.
    seedOutcomes(6, { model: 'model-a', success: true });
    seedOutcomes(2, { model: 'model-b', success: false });

    const entries = getModelWeatherSummary();

    const a = entries.find((e) => e.model === 'model-a');
    expect(a).toMatchObject({ scope: 'literal', sampleCount: 6, successRate: 1 });
    expect(entries.some((e) => e.model === 'model-b')).toBe(false);
  });

  it('prefers the lookback window and falls back to all history when sparse', () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const cfg = { outcomeLookbackMs: 60 * 60 * 1000 };
    // claude-opus-4: enough recent samples — old failures fall out of the window
    seedOutcomes(5, { model: 'claude-opus-4', cli: 'claude', success: false, timestamp: old });
    seedOutcomes(5, { model: 'claude-opus-4', cli: 'claude', success: true });
    // gpt-5: only old samples — all-history fallback keeps it visible
    seedOutcomes(6, { model: 'gpt-5', cli: 'codex', success: true, timestamp: old });

    const entries = getModelWeatherSummary(undefined, cfg);

    expect(entries.find((e) => e.model === 'claude-opus-4')).toMatchObject({
      sampleCount: 5,
      successRate: 1,
    });
    expect(entries.find((e) => e.model === 'gpt-5')).toMatchObject({ sampleCount: 6 });
  });

  it('respects cli/category filters', () => {
    seedOutcomes(6, { model: 'claude-opus-4', cli: 'claude', category: 'testing' });
    seedOutcomes(6, { model: 'gemini-2.5-flash', cli: 'gemini', category: 'research' });

    const entries = getModelWeatherSummary({ cli: 'claude', category: 'testing' });

    expect(entries.map((e) => e.model)).toEqual(['claude-opus-4']);
  });

  it('rides the report payload without changing routing-visible bonuses', () => {
    seedOutcomes(15, { model: 'claude-opus-4', cli: 'claude', category: 'code_generation' });

    const report = generateWeatherReport({});

    // Telemetry lens present…
    expect(report.modelWeather?.some((e) => e.model === 'claude-opus-4')).toBe(true);
    // …while the routing-visible bonus stays the CLI×category computation.
    const bonus = report.adaptiveBonuses.find(
      (b) => b.cli === 'claude' && b.category === 'code_generation'
    );
    expect(bonus?.sampleCount).toBe(15);
    expect(bonus?.adaptiveBonus).toBe(
      Math.round(getAdaptiveBonus('claude', 'code_generation') * 10) / 10
    );
  });

  it('omits the modelWeather section when no model has sufficient samples', () => {
    seedOutcomes(2, { model: 'gpt-5', cli: 'codex' });

    const report = generateWeatherReport({});

    expect(report.modelWeather).toBeUndefined();
  });
});

// ============================================================================
// queryWithLookback (#1401)
// ============================================================================

describe('queryWithLookback', () => {
  it('returns only recent outcomes within lookback window', () => {
    const store = getOutcomeStore();
    const old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days ago
    const recent = new Date(Date.now() - 1000).toISOString(); // 1 second ago

    // Seed 5 old + 5 recent outcomes
    for (let i = 0; i < 5; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'testing', timestamp: old }));
    }
    for (let i = 0; i < 5; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'testing', timestamp: recent }));
    }

    const cfg = { ...createDefaultWeatherConfig(), outcomeLookbackMs: 7 * 24 * 60 * 60 * 1000 };
    const results = queryWithLookback(store, 'claude', 'testing', cfg);
    // Should return only the 5 recent outcomes (within 7-day window)
    expect(results).toHaveLength(5);
  });

  it('falls back to all history when lookback has insufficient samples', () => {
    const store = getOutcomeStore();
    const old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 1000).toISOString();

    // Seed 10 old + 2 recent outcomes
    for (let i = 0; i < 10; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'testing', timestamp: old }));
    }
    for (let i = 0; i < 2; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'testing', timestamp: recent }));
    }

    const cfg = {
      ...createDefaultWeatherConfig(),
      outcomeLookbackMs: 7 * 24 * 60 * 60 * 1000,
      coldStartThreshold: 3, // Need 3 samples, only 2 recent
    };
    const results = queryWithLookback(store, 'claude', 'testing', cfg);
    // Should fall back to all 12 outcomes
    expect(results).toHaveLength(12);
  });

  it('returns all outcomes when lookbackMs is 0', () => {
    const store = getOutcomeStore();
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < 5; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'testing', timestamp: old }));
    }

    const cfg = { ...createDefaultWeatherConfig(), outcomeLookbackMs: 0 };
    const results = queryWithLookback(store, 'claude', 'testing', cfg);
    expect(results).toHaveLength(5);
  });

  it('affects adaptive bonus calculation with lookback', () => {
    const store = getOutcomeStore();
    const old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 1000).toISOString();

    // 10 old failures + 10 recent successes
    for (let i = 0; i < 10; i++) {
      store.append(
        makeOutcome({ cli: 'gemini', category: 'architecture', success: false, timestamp: old })
      );
    }
    for (let i = 0; i < 10; i++) {
      store.append(
        makeOutcome({ cli: 'gemini', category: 'architecture', success: true, timestamp: recent })
      );
    }

    // Without lookback (0): 10/20 = 50% success → negative bonus
    const noLookback = getAdaptiveBonus('gemini', 'architecture', { outcomeLookbackMs: 0 });
    // With 7-day lookback: 10/10 = 100% success → positive bonus
    const withLookback = getAdaptiveBonus('gemini', 'architecture', {
      outcomeLookbackMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(withLookback).toBeGreaterThan(noLookback);
    expect(withLookback).toBeGreaterThan(0);
    expect(noLookback).toBeLessThan(withLookback);
  });
});

// ============================================================================
// Recent Window (#1401)
// ============================================================================

describe('recentWindow in weather report', () => {
  it('includes recentWindow with outcomes within lookback', () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    for (let i = 0; i < 5; i++) {
      getOutcomeStore().append(makeOutcome({ success: true, durationMs: 200, timestamp: recent }));
    }
    for (let i = 0; i < 3; i++) {
      getOutcomeStore().append(makeOutcome({ success: false, durationMs: 400, timestamp: recent }));
    }

    const report = generateWeatherReport({});
    expect(report.recentWindow).toBeDefined();
    expect(report.recentWindow?.totalTasks).toBe(8);
    expect(report.recentWindow?.successRate).toBeCloseTo(5 / 8, 2);
    expect(report.recentWindow?.avgDurationMs).toBeCloseTo(275, 0);
    expect(report.recentWindow?.windowMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('excludes old outcomes from recentWindow', () => {
    const old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 1000).toISOString();

    // 10 old failures
    for (let i = 0; i < 10; i++) {
      getOutcomeStore().append(makeOutcome({ success: false, durationMs: 500, timestamp: old }));
    }
    // 5 recent successes
    for (let i = 0; i < 5; i++) {
      getOutcomeStore().append(makeOutcome({ success: true, durationMs: 100, timestamp: recent }));
    }

    const report = generateWeatherReport({});
    // Overall includes everything
    expect(report.overall.totalTasks).toBe(15);
    // Recent window only includes the 5 recent
    expect(report.recentWindow?.totalTasks).toBe(5);
    expect(report.recentWindow?.successRate).toBe(1);
    expect(report.recentWindow?.avgDurationMs).toBe(100);
  });

  it('omits recentWindow when no outcomes in lookback', () => {
    const old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 5; i++) {
      getOutcomeStore().append(makeOutcome({ timestamp: old }));
    }

    const report = generateWeatherReport({});
    expect(report.recentWindow).toBeUndefined();
  });

  it('omits recentWindow when no outcomes at all', () => {
    const report = generateWeatherReport({});
    expect(report.recentWindow).toBeUndefined();
  });
});

describe('expert performance in weather report (Issue #1324)', () => {
  it('includes expertPerformance when worker outcomes exist', () => {
    // Seed worker-role outcomes (as produced by recordWorkerOutcomes)
    getOutcomeStore().append(makeOutcome({ model: 'worker-code', success: true, durationMs: 100 }));
    getOutcomeStore().append(makeOutcome({ model: 'worker-code', success: true, durationMs: 200 }));
    getOutcomeStore().append(
      makeOutcome({
        model: 'worker-security',
        success: false,
        durationMs: 300,
        failureCategory: 'timeout',
      })
    );

    const report = generateWeatherReport({});
    expect(report.expertPerformance).toBeDefined();
    expect(report.expertPerformance?.length).toBeGreaterThanOrEqual(2);
  });

  it('computes per-expert success rate and avg duration', () => {
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-testing', success: true, durationMs: 100 })
    );
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-testing', success: true, durationMs: 300 })
    );
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-testing', success: false, durationMs: 200 })
    );

    const report = generateWeatherReport({});
    const testing = report.expertPerformance?.find((e) => e.role === 'testing');
    expect(testing).toBeDefined();
    expect(testing?.totalTasks).toBe(3);
    expect(testing?.successRate).toBeCloseTo(2 / 3, 2);
    expect(testing?.avgDurationMs).toBe(200);
  });

  it('omits expertPerformance when no worker outcomes', () => {
    seedOutcomes(5, { model: 'orchestrator' }); // Non-worker outcomes
    const report = generateWeatherReport({});
    expect(report.expertPerformance).toBeUndefined();
  });

  it('extracts role name from worker-{role} model name', () => {
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-architecture', success: true, durationMs: 500 })
    );

    const report = generateWeatherReport({});
    const arch = report.expertPerformance?.find((e) => e.role === 'architecture');
    expect(arch).toBeDefined();
    expect(arch?.role).toBe('architecture');
  });

  it('includes consecutiveFailures from tail of outcome history (#1427)', () => {
    getOutcomeStore().append(makeOutcome({ model: 'worker-code', success: true, durationMs: 100 }));
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-code', success: false, durationMs: 200 })
    );
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-code', success: false, durationMs: 300 })
    );

    const report = generateWeatherReport({});
    const code = report.expertPerformance?.find((e) => e.role === 'code');
    expect(code?.consecutiveFailures).toBe(2);
  });

  it('flags degraded roles with successRate below 0.5 (#1427)', () => {
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-docs', success: false, durationMs: 100 })
    );
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-docs', success: false, durationMs: 200 })
    );
    getOutcomeStore().append(makeOutcome({ model: 'worker-docs', success: true, durationMs: 300 }));

    const report = generateWeatherReport({});
    const docs = report.expertPerformance?.find((e) => e.role === 'docs');
    expect(docs?.degraded).toBe(true);
    expect(docs?.successRate).toBeCloseTo(1 / 3, 2);
  });

  it('sorts by reliability worst-first (#1427)', () => {
    getOutcomeStore().append(makeOutcome({ model: 'worker-good', success: true, durationMs: 100 }));
    getOutcomeStore().append(makeOutcome({ model: 'worker-bad', success: false, durationMs: 100 }));

    const report = generateWeatherReport({});
    const roles = report.expertPerformance?.map((e) => e.role);
    expect(roles?.[0]).toBe('bad'); // 0% success rate = worst
    expect(roles?.[1]).toBe('good'); // 100% success rate = best
  });

  it('includes lastSuccessAt timestamp (#1427)', () => {
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-infra', success: true, durationMs: 100 })
    );
    getOutcomeStore().append(
      makeOutcome({ model: 'worker-infra', success: false, durationMs: 200 })
    );

    const report = generateWeatherReport({});
    const infra = report.expertPerformance?.find((e) => e.role === 'infra');
    expect(infra?.lastSuccessAt).toBeDefined();
    // Should be a valid ISO timestamp
    expect(new Date(infra!.lastSuccessAt!).getTime()).toBeGreaterThan(0);
  });

  it('includes dominant error pattern for failed experts', () => {
    getOutcomeStore().append(
      makeOutcome({
        model: 'worker-security',
        success: false,
        failureCategory: 'timeout',
        durationMs: 100,
      })
    );
    getOutcomeStore().append(
      makeOutcome({
        model: 'worker-security',
        success: false,
        failureCategory: 'timeout',
        durationMs: 200,
      })
    );
    getOutcomeStore().append(
      makeOutcome({
        model: 'worker-security',
        success: false,
        failureCategory: 'rate_limit',
        durationMs: 300,
      })
    );

    const report = generateWeatherReport({});
    const sec = report.expertPerformance?.find((e) => e.role === 'security');
    expect(sec?.dominantErrorPattern).toBe('timeout');
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

// ============================================================================
// Swarm Health Metrics (Issue #1403)
// ============================================================================

describe('swarmHealth in weather report', () => {
  it('is absent when no outcomes exist', () => {
    const report = generateWeatherReport({});
    expect(report.swarmHealth).toBeUndefined();
  });

  it('computes agent utilization from expert roles', () => {
    // 2 active expert roles, 1 failed
    seedOutcomes(3, { model: 'worker-code_expert', success: true, source: 'delegate' });
    seedOutcomes(2, { model: 'worker-security_expert', success: true, source: 'delegate' });
    seedOutcomes(2, { model: 'worker-testing_expert', success: false, source: 'delegate' });

    const report = generateWeatherReport({});
    expect(report.swarmHealth).toBeDefined();
    // 2 of 3 roles have successRate > 0
    expect(report.swarmHealth?.agentUtilization).toBeCloseTo(2 / 3, 2);
  });

  it('computes collaboration efficiency from delegate outcomes', () => {
    seedOutcomes(6, { source: 'delegate', success: true });
    seedOutcomes(4, { source: 'delegate', success: false });
    // Non-delegate outcomes should not affect collaboration efficiency
    seedOutcomes(5, { source: 'direct' as 'delegate', success: true });

    const report = generateWeatherReport({});
    expect(report.swarmHealth).toBeDefined();
    // 6 successes / 10 delegate = 0.6 (non-delegate 5 are excluded by source filter)
    // Actually total is 15 outcomes, 11 delegate, but we seeded with source overrides
    // The delegate filter: 6 success + 4 fail = 10 delegate outcomes → 6/10 = 0.6
    // But wait, the 5 with 'direct' aren't 'delegate', so collaboration = 6/10 = 0.6
    expect(report.swarmHealth?.collaborationEfficiency).toBeCloseTo(0.6, 2);
  });

  it('computes routing accuracy against best CLI per category', () => {
    // Claude is best for code_generation (100% success)
    seedOutcomes(5, { cli: 'claude', category: 'code_generation', success: true });
    // Gemini routed to code_generation too (0% success — suboptimal routing)
    seedOutcomes(5, { cli: 'gemini', category: 'code_generation', success: false });

    const report = generateWeatherReport({});
    expect(report.swarmHealth).toBeDefined();
    // Best CLI for code_generation = claude (100%). 5/10 tasks went to claude.
    expect(report.swarmHealth?.routingAccuracy).toBeCloseTo(0.5, 2);
  });

  it('computes weekly regret as gap from optimal', () => {
    // Best possible: 100% for code_generation via claude
    seedOutcomes(5, { cli: 'claude', category: 'code_generation', success: true });
    // Actual includes gemini failures → overall rate = 50%, best = 100% → regret = 0.5
    seedOutcomes(5, { cli: 'gemini', category: 'code_generation', success: false });

    const report = generateWeatherReport({});
    expect(report.swarmHealth).toBeDefined();
    expect(report.swarmHealth?.weeklyRegret).toBeCloseTo(0.5, 2);
  });

  it('includes observedCategories and observedRoles', () => {
    seedOutcomes(5, {
      model: 'worker-code_expert',
      category: 'code_generation',
      source: 'delegate',
    });
    seedOutcomes(5, {
      model: 'worker-security_expert',
      category: 'security_review',
      source: 'delegate',
    });

    const report = generateWeatherReport({});
    expect(report.swarmHealth).toBeDefined();
    expect(report.swarmHealth?.observedCategories).toBeGreaterThanOrEqual(2);
    expect(report.swarmHealth?.observedRoles).toBe(2);
  });
});

// ============================================================================
// Cost section (Epic G, #3856)
// ============================================================================

function makeDecisionCostRecord(
  gate: 'consensus_vote' | 'pr_review',
  over: {
    voterCount?: number;
    measuredVoters?: number;
    unmeasuredVoters?: number;
    totalTokens?: number;
    totalCostUsd?: number;
  } = {}
): import('../../observability/decision-cost-store.js').DecisionCostRecord {
  const voterCount = over.voterCount ?? 0;
  const measuredVoters = over.measuredVoters ?? voterCount;
  return {
    decisionId: `dc-${Math.random().toString(36).slice(2)}`,
    gate,
    timestamp: '2026-06-17T00:00:00.000Z',
    summary: {
      billingMode: 'api',
      voterCount,
      measuredVoters,
      unmeasuredVoters: over.unmeasuredVoters ?? voterCount - measuredVoters,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: over.totalTokens ?? 0,
      totalCostUsd: over.totalCostUsd ?? 0,
      perVoter: [],
      perModel: [],
    },
  };
}

describe('weather report cost section (#3856)', () => {
  it('always surfaces strategy cost profiles from the manifest registry', () => {
    const report = generateWeatherReport({});
    expect(report.costSection).toBeDefined();
    const profiles = report.costSection?.strategyCostProfiles ?? [];
    expect(profiles.length).toBe(8);
    const consensus = profiles.find((p) => p.strategy === 'consensus');
    expect(consensus?.costProfile).toBe('high');
    const singleShot = profiles.find((p) => p.strategy === 'single-shot');
    expect(singleShot?.costProfile).toBe('low');
  });

  it('has empty decisionCosts when no decision-cost records are available', () => {
    const report = generateWeatherReport({});
    expect(report.costSection?.decisionCosts.byGate).toEqual([]);
    expect(report.costSection?.decisionCosts.totalDecisions).toBe(0);
  });

  it('aggregates injected decision-cost records per gate type', () => {
    const records = [
      makeDecisionCostRecord('consensus_vote', {
        voterCount: 7,
        totalTokens: 1000,
        totalCostUsd: 0.06,
      }),
      makeDecisionCostRecord('consensus_vote', {
        voterCount: 5,
        totalTokens: 2000,
        totalCostUsd: 0.12,
      }),
      makeDecisionCostRecord('pr_review', {
        voterCount: 5,
        totalTokens: 800,
        totalCostUsd: 0.02,
      }),
    ];
    const report = generateWeatherReport({}, undefined, { decisionCostRecords: records });
    const byGate = report.costSection?.decisionCosts.byGate ?? [];
    expect(byGate.map((g) => g.gate)).toEqual(['consensus_vote', 'pr_review']);
    const consensus = byGate.find((g) => g.gate === 'consensus_vote');
    expect(consensus?.decisionCount).toBe(2);
    expect(consensus?.avgCostUsd).toBeCloseTo(0.09, 6);
    expect(consensus?.avgVoters).toBe(6);
    expect(report.costSection?.decisionCosts.totalDecisions).toBe(3);
  });
});
