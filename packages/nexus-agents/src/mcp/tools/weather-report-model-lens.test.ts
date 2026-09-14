/**
 * Tests for the per-model weather lens (#4194), tested through the one
 * export `weather-report.ts` consumes: `getModelWeatherSummary`. Moved out
 * of `weather-report.test.ts` with the section (#6148).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetOutcomeStore, getOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { getModelWeatherSummary } from './weather-report-model-lens.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

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

beforeEach(() => {
  resetOutcomeStore();
});

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

  it('excludes models below the min-sample threshold and keeps those at it', () => {
    // MODEL_WEATHER_MIN_SAMPLES is 5 and module-private; both sides of the
    // boundary are seeded so the value itself is pinned here.
    seedOutcomes(5, { model: 'claude-opus-4', cli: 'claude' });
    seedOutcomes(4, { model: 'gpt-5', cli: 'codex' });

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
});
