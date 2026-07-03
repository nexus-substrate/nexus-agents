/**
 * Tests for the route-time model-selection flip readiness gate (#4197).
 * Covers the pre-declared win metric (volume / success-delta / cost-measured),
 * fail-closed behavior on empty and one-cohort logs, config overrides, and the
 * log-once operator surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_MODEL_SELECTION_READINESS_CONFIG,
  evaluateModelSelectionReadiness,
  logModelSelectionReadinessOnce,
  resetModelSelectionReadinessLogging,
  summarizeModelSelectionShadow,
} from './model-selection-readiness.js';
import {
  MODEL_SELECTION_SHADOW_SCHEMA_VERSION,
  persistModelSelectionShadowRecord,
  type ModelSelectionShadowRecord,
} from './model-selection-shadow.js';
import type { ILogger } from '../core/index.js';

function record(over: Partial<ModelSelectionShadowRecord> = {}): ModelSelectionShadowRecord {
  return {
    schema: MODEL_SELECTION_SHADOW_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    cli: 'claude',
    tier: 'balanced',
    actualModel: 'model-a',
    shadowModel: 'model-b',
    agree: false,
    success: true,
    ...over,
  };
}

/** n records per cohort with the given success counts. */
function cohort(
  n: number,
  successes: number,
  agree: boolean,
  costUsd?: number
): ModelSelectionShadowRecord[] {
  return Array.from({ length: n }, (_, i) =>
    record({
      agree,
      success: i < successes,
      ...(agree ? { actualModel: 'model-b' } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
    })
  );
}

describe('summarizeModelSelectionShadow (#4197)', () => {
  it('is empty-safe: zero counts and zero rates', () => {
    const s = summarizeModelSelectionShadow([]);
    expect(s.total).toBe(0);
    expect(s.agreeing).toBe(0);
    expect(s.diverging).toBe(0);
    expect(s.agreeSuccessRate).toBe(0);
    expect(s.divergeSuccessRate).toBe(0);
    expect(s.successDelta).toBe(0);
    expect(s.costSamples).toBe(0);
    expect(s.meanCostUsd).toBe(0);
  });

  it('computes per-cohort success rates and the delta', () => {
    const records = [...cohort(10, 9, true), ...cohort(10, 5, false)];
    const s = summarizeModelSelectionShadow(records);
    expect(s.total).toBe(20);
    expect(s.agreeing).toBe(10);
    expect(s.diverging).toBe(10);
    expect(s.agreeSuccessRate).toBeCloseTo(0.9);
    expect(s.divergeSuccessRate).toBeCloseTo(0.5);
    expect(s.successDelta).toBeCloseTo(0.4);
  });

  it('fail-closes the delta to 0 when either cohort is empty', () => {
    // Only agreeing records with a perfect success rate — the naive delta
    // would be +1.0; an incomparable log must not look like a win.
    const s = summarizeModelSelectionShadow(cohort(10, 10, true));
    expect(s.successDelta).toBe(0);
    const s2 = summarizeModelSelectionShadow(cohort(10, 10, false));
    expect(s2.successDelta).toBe(0);
  });

  it('computes the mean costUsd over measured records only', () => {
    const records = [
      record({ costUsd: 0.02 }),
      record({ costUsd: 0.04 }),
      record(), // unmeasured — excluded from the mean
    ];
    const s = summarizeModelSelectionShadow(records);
    expect(s.costSamples).toBe(2);
    expect(s.meanCostUsd).toBeCloseTo(0.03);
  });
});

describe('evaluateModelSelectionReadiness (#4197)', () => {
  it('is NOT_READY on an empty log with all three blockers (fail-closed)', () => {
    const verdict = evaluateModelSelectionReadiness([]);
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers).toEqual(['volume', 'success-delta', 'cost-measured']);
    expect(verdict.criteria).toHaveLength(3);
    for (const c of verdict.criteria) expect(c.met).toBe(false);
  });

  it('blocks on volume below 50 diverging decisions', () => {
    const records = [...cohort(100, 90, true, 0.01), ...cohort(49, 20, false, 0.01)];
    const verdict = evaluateModelSelectionReadiness(records);
    expect(verdict.blockers).toContain('volume');
    expect(verdict.ready).toBe(false);
  });

  it('blocks on a success delta below the margin (a tie is not enough)', () => {
    const records = [...cohort(60, 48, true, 0.01), ...cohort(60, 48, false, 0.01)];
    const verdict = evaluateModelSelectionReadiness(records);
    expect(verdict.blockers).toEqual(['success-delta']);
    expect(verdict.ready).toBe(false);
  });

  it('blocks on cost when fewer than 10 records carry a measured costUsd', () => {
    const records = [...cohort(60, 55, true), ...cohort(60, 30, false)];
    const verdict = evaluateModelSelectionReadiness(records);
    expect(verdict.blockers).toEqual(['cost-measured']);
    expect(verdict.ready).toBe(false);
  });

  it('is ready IFF every criterion is met', () => {
    // 60 diverging (≥50), delta 0.92−0.5 = 0.42 (≥0.05), 120 costed (≥10).
    const records = [...cohort(60, 55, true, 0.01), ...cohort(60, 30, false, 0.02)];
    const verdict = evaluateModelSelectionReadiness(records);
    expect(verdict.blockers).toEqual([]);
    expect(verdict.ready).toBe(true);
    for (const c of verdict.criteria) expect(c.met).toBe(true);
  });

  it('respects config overrides', () => {
    const records = [...cohort(5, 5, true, 0.01), ...cohort(5, 2, false, 0.01)];
    const verdict = evaluateModelSelectionReadiness(records, {
      minDivergingDecisions: 5,
      minSuccessDelta: 0.05,
      minCostSamples: 5,
    });
    expect(verdict.ready).toBe(true);
  });

  it('exposes the pre-declared defaults', () => {
    expect(DEFAULT_MODEL_SELECTION_READINESS_CONFIG.minDivergingDecisions).toBe(50);
    expect(DEFAULT_MODEL_SELECTION_READINESS_CONFIG.minSuccessDelta).toBe(0.05);
    expect(DEFAULT_MODEL_SELECTION_READINESS_CONFIG.minCostSamples).toBe(10);
  });

  it('carries human-readable evidence in every criterion detail', () => {
    const verdict = evaluateModelSelectionReadiness([]);
    const byName = new Map(verdict.criteria.map((c) => [c.name, c.detail]));
    expect(byName.get('volume')).toContain('need ≥ 50');
    expect(byName.get('success-delta')).toContain('need ≥ 0.05');
    expect(byName.get('cost-measured')).toContain('need ≥ 10');
  });
});

describe('logModelSelectionReadinessOnce (#4197, mirrors #4161)', () => {
  let dir: string;
  let prevDataDir: string | undefined;

  function mockLogger(): ILogger & { infos: unknown[][]; warns: unknown[][] } {
    const infos: unknown[][] = [];
    const warns: unknown[][] = [];
    return {
      infos,
      warns,
      trace: vi.fn(),
      debug: vi.fn(),
      info: (...args: unknown[]) => {
        infos.push(args);
      },
      warn: (...args: unknown[]) => {
        warns.push(args);
      },
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    } as unknown as ILogger & { infos: unknown[][]; warns: unknown[][] };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'model-readiness-'));
    prevDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    resetModelSelectionReadinessLogging();
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = prevDataDir;
    rmSync(dir, { recursive: true, force: true });
    resetModelSelectionReadinessLogging();
  });

  it('logs the verdict exactly once per process', () => {
    persistModelSelectionShadowRecord(record());
    const logger = mockLogger();
    logModelSelectionReadinessOnce(logger);
    logModelSelectionReadinessOnce(logger);
    expect(logger.infos).toHaveLength(1);
    const payload = logger.infos[0]?.[1] as Record<string, unknown>;
    expect(payload['ready']).toBe(false);
    expect(payload['total']).toBe(1);
    expect(payload['blockers']).toEqual(['volume', 'success-delta', 'cost-measured']);
  });

  it('never throws — an eval failure is a warn, not a routing break', () => {
    const logger = mockLogger();
    // Force the read to fail by making the data dir unusable mid-call.
    const throwingLogger = {
      ...logger,
      info: () => {
        throw new Error('sink exploded');
      },
    } as unknown as ILogger;
    expect(() => {
      logModelSelectionReadinessOnce(throwingLogger);
    }).not.toThrow();
  });
});
