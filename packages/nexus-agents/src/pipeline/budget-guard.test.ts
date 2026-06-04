/**
 * Tests for BudgetGuard — per-run token-budget enforcement (#3395).
 */
import { describe, it, expect } from 'vitest';

import { BudgetGuard, createBudgetGuard } from './budget-guard.js';

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
