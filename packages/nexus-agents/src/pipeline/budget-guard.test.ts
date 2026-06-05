/**
 * Tests for BudgetGuard — per-run token-budget enforcement (#3395).
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  BudgetGuard,
  createBudgetGuard,
  estimateRelativeBudget,
  resolveBudgetTolerance,
  DEFAULT_BUDGET_TOLERANCE,
} from './budget-guard.js';

describe('BudgetGuard (#3395)', () => {
  it('a no-budget guard never reports exhaustion and ignores records', () => {
    const guard = createBudgetGuard(); // default-off
    expect(guard.enforced).toBe(false);
    guard.record(1_000_000);
    expect(guard.isExhausted()).toBe(false);
  });

  it('opens once recorded usage crosses the critical threshold', () => {
    const guard = createBudgetGuard({ maxTokens: 100, criticalThreshold: 0.9 });
    expect(guard.enforced).toBe(true);
    expect(guard.isExhausted()).toBe(false);

    guard.record(80); // 80% < 90% → still closed
    expect(guard.isExhausted()).toBe(false);

    guard.record(15); // 95% >= 90% → opens
    expect(guard.isExhausted()).toBe(true);
  });

  it('stays closed while under the threshold', () => {
    const guard = createBudgetGuard({ maxTokens: 1000, criticalThreshold: 0.95 });
    guard.record(100);
    guard.record(200);
    guard.record(300);
    expect(guard.isExhausted()).toBe(false); // 60% < 95%
  });

  it('ignores undefined and non-positive token counts', () => {
    const guard = createBudgetGuard({ maxTokens: 10, criticalThreshold: 0.5 });
    guard.record(undefined); // CLI-subprocess path with no usage
    guard.record(0);
    guard.record(-5);
    expect(guard.isExhausted()).toBe(false);
  });

  it('a bare BudgetGuard (no breaker) is a safe no-op', () => {
    const guard = new BudgetGuard();
    expect(guard.enforced).toBe(false);
    expect(guard.isExhausted()).toBe(false);
    expect(() => {
      guard.record(999);
    }).not.toThrow();
  });
});

// ============================================================================
// estimate-relative budget (#3262)
// ============================================================================

describe('estimateRelativeBudget (#3262)', () => {
  it('caps the run at ceil(estimate × tolerance)', () => {
    expect(estimateRelativeBudget(1000, 1.5)).toEqual({ maxTokens: 1500 });
    expect(estimateRelativeBudget(999, 1.5)).toEqual({ maxTokens: 1499 }); // ceil(1498.5)
  });

  it('defaults the tolerance to 1.5×', () => {
    expect(estimateRelativeBudget(2000)).toEqual({ maxTokens: 3000 });
  });

  it('fails OPEN (undefined → no-op guard) for an absent or unusable estimate', () => {
    expect(estimateRelativeBudget(undefined)).toBeUndefined();
    expect(estimateRelativeBudget(0)).toBeUndefined();
    expect(estimateRelativeBudget(-5)).toBeUndefined();
    expect(estimateRelativeBudget(Number.NaN)).toBeUndefined();
    expect(estimateRelativeBudget(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('rejects a tolerance below 1 or non-finite (would trip below the estimate)', () => {
    expect(estimateRelativeBudget(1000, 0.5)).toBeUndefined();
    expect(estimateRelativeBudget(1000, Number.NaN)).toBeUndefined();
  });

  it('a tolerance of exactly 1 caps at the estimate itself', () => {
    expect(estimateRelativeBudget(1000, 1)).toEqual({ maxTokens: 1000 });
  });
});

describe('resolveBudgetTolerance (#3262)', () => {
  const prev = process.env['NEXUS_BUDGET_TOLERANCE'];
  afterEach(() => {
    if (prev === undefined) delete process.env['NEXUS_BUDGET_TOLERANCE'];
    else process.env['NEXUS_BUDGET_TOLERANCE'] = prev;
  });

  it('defaults to 1.5 when unset or empty', () => {
    delete process.env['NEXUS_BUDGET_TOLERANCE'];
    expect(resolveBudgetTolerance()).toBe(DEFAULT_BUDGET_TOLERANCE);
    process.env['NEXUS_BUDGET_TOLERANCE'] = '   ';
    expect(resolveBudgetTolerance()).toBe(DEFAULT_BUDGET_TOLERANCE);
  });

  it('parses a valid multiplier', () => {
    process.env['NEXUS_BUDGET_TOLERANCE'] = '2.5';
    expect(resolveBudgetTolerance()).toBe(2.5);
  });

  it('falls back to default (not NaN, not clamp) for non-numeric or sub-1 input', () => {
    process.env['NEXUS_BUDGET_TOLERANCE'] = 'abc';
    expect(resolveBudgetTolerance()).toBe(DEFAULT_BUDGET_TOLERANCE);
    process.env['NEXUS_BUDGET_TOLERANCE'] = '0.3';
    expect(resolveBudgetTolerance()).toBe(DEFAULT_BUDGET_TOLERANCE);
  });
});
