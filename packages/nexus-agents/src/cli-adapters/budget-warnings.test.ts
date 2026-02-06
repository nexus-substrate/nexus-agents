/**
 * Tests for budget-warnings.ts
 *
 * Covers warning level detection, token/cost warning creation,
 * and budget warning generation with configurable thresholds.
 */

import { describe, it, expect } from 'vitest';
import {
  getWarningLevel,
  createTokenWarning,
  createCostWarning,
  generateBudgetWarnings,
} from './budget-warnings.js';
import type { WarningThresholds } from './budget-warnings.js';
import type { SessionBudget } from './types-routing.js';

// ============================================================================
// Fixtures
// ============================================================================

const DEFAULT_THRESHOLDS: WarningThresholds = {
  info: 50,
  warning: 75,
  critical: 90,
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeBudget(overrides: Partial<SessionBudget> = {}) {
  return {
    tokenBudget: 10000,
    costBudgetUsd: 1.0,
    tokensUsed: 0,
    costSpentUsd: 0,
    tokensRemaining: 10000,
    costRemainingUsd: 1.0,
    utilizationPercent: 0,
    startedAt: new Date(),
    ...overrides,
  } satisfies SessionBudget;
}

// ============================================================================
// getWarningLevel
// ============================================================================

describe('getWarningLevel', () => {
  it('returns null below info threshold', () => {
    expect(getWarningLevel(30, DEFAULT_THRESHOLDS)).toBeNull();
  });

  it('returns info at exact info threshold', () => {
    expect(getWarningLevel(50, DEFAULT_THRESHOLDS)).toBe('info');
  });

  it('returns info between info and warning', () => {
    expect(getWarningLevel(60, DEFAULT_THRESHOLDS)).toBe('info');
  });

  it('returns info at one below warning threshold', () => {
    expect(getWarningLevel(74.99, DEFAULT_THRESHOLDS)).toBe('info');
  });

  it('returns warning at exact warning threshold', () => {
    expect(getWarningLevel(75, DEFAULT_THRESHOLDS)).toBe('warning');
  });

  it('returns warning between warning and critical', () => {
    expect(getWarningLevel(85, DEFAULT_THRESHOLDS)).toBe('warning');
  });

  it('returns warning at one below critical threshold', () => {
    expect(getWarningLevel(89.99, DEFAULT_THRESHOLDS)).toBe('warning');
  });

  it('returns critical at exact critical threshold', () => {
    expect(getWarningLevel(90, DEFAULT_THRESHOLDS)).toBe('critical');
  });

  it('returns critical above critical threshold', () => {
    expect(getWarningLevel(99, DEFAULT_THRESHOLDS)).toBe('critical');
  });

  it('returns critical at 100%', () => {
    expect(getWarningLevel(100, DEFAULT_THRESHOLDS)).toBe('critical');
  });

  it('returns critical above 100% (over-budget)', () => {
    expect(getWarningLevel(150, DEFAULT_THRESHOLDS)).toBe('critical');
  });

  it('returns null at exactly 0', () => {
    expect(getWarningLevel(0, DEFAULT_THRESHOLDS)).toBeNull();
  });

  it('returns null for negative utilization', () => {
    expect(getWarningLevel(-10, DEFAULT_THRESHOLDS)).toBeNull();
  });

  it('handles custom thresholds with tight ranges', () => {
    const tight: WarningThresholds = { info: 10, warning: 20, critical: 30 };
    expect(getWarningLevel(5, tight)).toBeNull();
    expect(getWarningLevel(10, tight)).toBe('info');
    expect(getWarningLevel(15, tight)).toBe('info');
    expect(getWarningLevel(20, tight)).toBe('warning');
    expect(getWarningLevel(25, tight)).toBe('warning');
    expect(getWarningLevel(30, tight)).toBe('critical');
    expect(getWarningLevel(99, tight)).toBe('critical');
  });

  it('handles all thresholds at same value', () => {
    const same: WarningThresholds = { info: 50, warning: 50, critical: 50 };
    expect(getWarningLevel(49, same)).toBeNull();
    // At 50: critical >= 50 is checked first
    expect(getWarningLevel(50, same)).toBe('critical');
  });

  it('handles fractional utilization values', () => {
    expect(getWarningLevel(49.9, DEFAULT_THRESHOLDS)).toBeNull();
    expect(getWarningLevel(50.0, DEFAULT_THRESHOLDS)).toBe('info');
    expect(getWarningLevel(50.1, DEFAULT_THRESHOLDS)).toBe('info');
  });

  it('handles thresholds at 0', () => {
    const zero: WarningThresholds = { info: 0, warning: 0, critical: 0 };
    // Everything >= 0 hits critical (checked first)
    expect(getWarningLevel(0, zero)).toBe('critical');
    expect(getWarningLevel(100, zero)).toBe('critical');
  });

  it('handles thresholds at 100', () => {
    const high: WarningThresholds = { info: 100, warning: 100, critical: 100 };
    expect(getWarningLevel(99.9, high)).toBeNull();
    expect(getWarningLevel(100, high)).toBe('critical');
  });
});

// ============================================================================
// createTokenWarning
// ============================================================================

describe('createTokenWarning', () => {
  it('returns null below info threshold', () => {
    expect(createTokenWarning(30, DEFAULT_THRESHOLDS, 7000)).toBeNull();
  });

  it('returns null at 0% utilization', () => {
    expect(createTokenWarning(0, DEFAULT_THRESHOLDS, 10000)).toBeNull();
  });

  it('returns null for negative utilization', () => {
    expect(createTokenWarning(-5, DEFAULT_THRESHOLDS, 10500)).toBeNull();
  });

  it('creates info warning at info threshold', () => {
    const warning = createTokenWarning(50, DEFAULT_THRESHOLDS, 5000);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('info');
    expect(warning?.constraint).toBe('tokens');
    expect(warning?.message).toContain('50%');
    expect(warning?.message).toContain('utilized');
    expect(warning?.utilizationPercent).toBe(50);
    expect(warning?.estimatedRemaining).toBe(5000);
  });

  it('creates info warning with correct message format', () => {
    const warning = createTokenWarning(55, DEFAULT_THRESHOLDS, 4500);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('info');
    expect(warning?.message).toBe('Token budget 55% utilized');
  });

  it('creates warning-level warning at warning threshold', () => {
    const warning = createTokenWarning(75, DEFAULT_THRESHOLDS, 2500);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('warning');
    expect(warning?.message).toContain('approaching limit');
    expect(warning?.message).toContain('75%');
  });

  it('creates warning-level warning with correct message format', () => {
    const warning = createTokenWarning(80, DEFAULT_THRESHOLDS, 2000);
    expect(warning).not.toBeNull();
    expect(warning?.message).toBe('Token budget approaching limit (80%)');
  });

  it('creates critical warning at critical threshold', () => {
    const warning = createTokenWarning(90, DEFAULT_THRESHOLDS, 1000);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.message).toContain('90%');
    expect(warning?.message).toContain('after this task');
  });

  it('creates critical warning with correct message format', () => {
    const warning = createTokenWarning(95, DEFAULT_THRESHOLDS, 500);
    expect(warning?.message).toBe('Token budget 95% utilized after this task');
  });

  it('rounds utilization in message', () => {
    const warning = createTokenWarning(55.7, DEFAULT_THRESHOLDS, 4430);
    expect(warning?.message).toContain('56%');
  });

  it('rounds down for .4 utilization', () => {
    const warning = createTokenWarning(55.4, DEFAULT_THRESHOLDS, 4460);
    expect(warning?.message).toContain('55%');
  });

  it('preserves exact utilization in utilizationPercent', () => {
    const warning = createTokenWarning(55.7, DEFAULT_THRESHOLDS, 4430);
    expect(warning?.utilizationPercent).toBe(55.7);
  });

  it('includes estimatedRemaining field', () => {
    const warning = createTokenWarning(60, DEFAULT_THRESHOLDS, 4000);
    expect(warning?.estimatedRemaining).toBe(4000);
  });

  it('handles negative remaining tokens', () => {
    const warning = createTokenWarning(95, DEFAULT_THRESHOLDS, -500);
    expect(warning).not.toBeNull();
    expect(warning?.estimatedRemaining).toBe(-500);
  });

  it('handles zero remaining tokens', () => {
    const warning = createTokenWarning(100, DEFAULT_THRESHOLDS, 0);
    expect(warning).not.toBeNull();
    expect(warning?.estimatedRemaining).toBe(0);
    expect(warning?.level).toBe('critical');
  });

  it('handles over-budget utilization', () => {
    const warning = createTokenWarning(120, DEFAULT_THRESHOLDS, -2000);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.message).toContain('120%');
  });

  it('constraint is always tokens', () => {
    const infoWarn = createTokenWarning(55, DEFAULT_THRESHOLDS, 4500);
    const warnWarn = createTokenWarning(80, DEFAULT_THRESHOLDS, 2000);
    const critWarn = createTokenWarning(95, DEFAULT_THRESHOLDS, 500);
    expect(infoWarn?.constraint).toBe('tokens');
    expect(warnWarn?.constraint).toBe('tokens');
    expect(critWarn?.constraint).toBe('tokens');
  });
});

// ============================================================================
// createCostWarning
// ============================================================================

describe('createCostWarning', () => {
  it('returns null below info threshold', () => {
    expect(createCostWarning(30, DEFAULT_THRESHOLDS, 0.7)).toBeNull();
  });

  it('returns null at 0% utilization', () => {
    expect(createCostWarning(0, DEFAULT_THRESHOLDS, 1.0)).toBeNull();
  });

  it('returns null for negative utilization', () => {
    expect(createCostWarning(-5, DEFAULT_THRESHOLDS, 1.05)).toBeNull();
  });

  it('returns null at info level (cost only does warning/critical)', () => {
    expect(createCostWarning(55, DEFAULT_THRESHOLDS, 0.45)).toBeNull();
  });

  it('returns null at exact info threshold', () => {
    expect(createCostWarning(50, DEFAULT_THRESHOLDS, 0.5)).toBeNull();
  });

  it('returns null between info and warning thresholds', () => {
    expect(createCostWarning(60, DEFAULT_THRESHOLDS, 0.4)).toBeNull();
    expect(createCostWarning(70, DEFAULT_THRESHOLDS, 0.3)).toBeNull();
    expect(createCostWarning(74.99, DEFAULT_THRESHOLDS, 0.2501)).toBeNull();
  });

  it('creates warning-level cost warning at warning threshold', () => {
    const warning = createCostWarning(75, DEFAULT_THRESHOLDS, 0.25);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('warning');
    expect(warning?.constraint).toBe('cost');
    expect(warning?.message).toContain('approaching limit');
    expect(warning?.message).toContain('75%');
  });

  it('creates warning-level cost warning with correct format', () => {
    const warning = createCostWarning(80, DEFAULT_THRESHOLDS, 0.2);
    expect(warning?.message).toBe('Cost budget approaching limit (80%)');
  });

  it('creates critical cost warning at critical threshold', () => {
    const warning = createCostWarning(90, DEFAULT_THRESHOLDS, 0.1);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.message).toContain('after this task');
  });

  it('creates critical cost warning with correct format', () => {
    const warning = createCostWarning(95, DEFAULT_THRESHOLDS, 0.05);
    expect(warning?.message).toBe('Cost budget 95% utilized after this task');
  });

  it('rounds utilization in message', () => {
    const warning = createCostWarning(80.6, DEFAULT_THRESHOLDS, 0.194);
    expect(warning?.message).toContain('81%');
  });

  it('preserves exact utilization in utilizationPercent', () => {
    const warning = createCostWarning(80.6, DEFAULT_THRESHOLDS, 0.194);
    expect(warning?.utilizationPercent).toBe(80.6);
  });

  it('includes estimatedRemaining as fractional USD', () => {
    const warning = createCostWarning(80, DEFAULT_THRESHOLDS, 0.2);
    expect(warning?.estimatedRemaining).toBe(0.2);
  });

  it('handles negative remaining cost', () => {
    const warning = createCostWarning(110, DEFAULT_THRESHOLDS, -0.1);
    expect(warning).not.toBeNull();
    expect(warning?.estimatedRemaining).toBe(-0.1);
  });

  it('handles zero remaining cost', () => {
    const warning = createCostWarning(100, DEFAULT_THRESHOLDS, 0);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.estimatedRemaining).toBe(0);
  });

  it('constraint is always cost', () => {
    const warnWarn = createCostWarning(80, DEFAULT_THRESHOLDS, 0.2);
    const critWarn = createCostWarning(95, DEFAULT_THRESHOLDS, 0.05);
    expect(warnWarn?.constraint).toBe('cost');
    expect(critWarn?.constraint).toBe('cost');
  });

  it('handles over-budget utilization', () => {
    const warning = createCostWarning(150, DEFAULT_THRESHOLDS, -0.5);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.message).toContain('150%');
  });
});

// ============================================================================
// generateBudgetWarnings
// ============================================================================

describe('generateBudgetWarnings', () => {
  it('returns empty array for low utilization', () => {
    const budget = makeBudget({
      tokensUsed: 1000,
      tokensRemaining: 9000,
    });
    const warnings = generateBudgetWarnings(budget, 100, 0.01, {});
    expect(warnings).toEqual([]);
  });

  it('returns empty array for zero usage', () => {
    const budget = makeBudget();
    const warnings = generateBudgetWarnings(budget, 0, 0, {});
    expect(warnings).toEqual([]);
  });

  it('returns empty array when estimated tokens are small', () => {
    const budget = makeBudget({
      tokensUsed: 100,
      tokensRemaining: 9900,
      costSpentUsd: 0.01,
      costRemainingUsd: 0.99,
    });
    const warnings = generateBudgetWarnings(budget, 10, 0.001, {});
    expect(warnings).toEqual([]);
  });

  it('generates token warning at high utilization', () => {
    const budget = makeBudget({
      tokensUsed: 8000,
      tokensRemaining: 2000,
    });
    // Projected: (8000 + 1000) / 10000 * 100 = 90% -> critical
    const warnings = generateBudgetWarnings(budget, 1000, 0.01, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning).toBeDefined();
    expect(tokenWarning?.level).toBe('critical');
  });

  it('generates cost warning at high cost utilization', () => {
    const budget = makeBudget({
      costSpentUsd: 0.85,
      costRemainingUsd: 0.15,
      costBudgetUsd: 1.0,
    });
    // Projected: (0.85 + 0.1) / 1.0 * 100 = 95% -> critical
    const warnings = generateBudgetWarnings(budget, 100, 0.1, {});
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(costWarning).toBeDefined();
    expect(costWarning?.level).toBe('critical');
  });

  it('generates both token and cost warnings when both high', () => {
    const budget = makeBudget({
      tokensUsed: 9000,
      tokensRemaining: 1000,
      costSpentUsd: 0.9,
      costRemainingUsd: 0.1,
    });
    const warnings = generateBudgetWarnings(budget, 500, 0.05, {});
    const hasToken = warnings.some((w) => w.constraint === 'tokens');
    const hasCost = warnings.some((w) => w.constraint === 'cost');
    expect(hasToken).toBe(true);
    expect(hasCost).toBe(true);
    expect(warnings).toHaveLength(2);
  });

  it('generates only token warning when cost is low', () => {
    const budget = makeBudget({
      tokensUsed: 9000,
      tokensRemaining: 1000,
      costSpentUsd: 0.1,
      costRemainingUsd: 0.9,
    });
    // Token projected: (9000 + 500) / 10000 = 95% -> critical
    // Cost projected: (0.1 + 0.01) / 1.0 = 11% -> null
    const warnings = generateBudgetWarnings(budget, 500, 0.01, {});
    expect(warnings).toHaveLength(1);
    expect(warnings[0].constraint).toBe('tokens');
  });

  it('generates only cost warning when tokens are low', () => {
    const budget = makeBudget({
      tokensUsed: 1000,
      tokensRemaining: 9000,
      costSpentUsd: 0.85,
      costRemainingUsd: 0.15,
    });
    // Token projected: (1000 + 100) / 10000 = 11% -> null
    // Cost projected: (0.85 + 0.1) / 1.0 = 95% -> critical
    const warnings = generateBudgetWarnings(budget, 100, 0.1, {});
    expect(warnings).toHaveLength(1);
    expect(warnings[0].constraint).toBe('cost');
  });

  it('uses default thresholds when partial config provided', () => {
    const budget = makeBudget({ tokensUsed: 5500, tokensRemaining: 4500 });
    // (5500 + 500) / 10000 * 100 = 60% -> info (default info=50)
    const warnings = generateBudgetWarnings(budget, 500, 0, {});
    expect(warnings.some((w) => w.level === 'info')).toBe(true);
  });

  it('uses default info=50 when not provided', () => {
    const budget = makeBudget({ tokensUsed: 4500, tokensRemaining: 5500 });
    // (4500 + 500) / 10000 * 100 = 50% -> info (default info=50)
    const warnings = generateBudgetWarnings(budget, 500, 0, {});
    expect(warnings.some((w) => w.level === 'info')).toBe(true);
  });

  it('uses default warning=75 when not provided', () => {
    const budget = makeBudget({ tokensUsed: 7000, tokensRemaining: 3000 });
    // (7000 + 500) / 10000 * 100 = 75% -> warning (default warning=75)
    const warnings = generateBudgetWarnings(budget, 500, 0, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.level).toBe('warning');
  });

  it('uses default critical=90 when not provided', () => {
    const budget = makeBudget({ tokensUsed: 8500, tokensRemaining: 1500 });
    // (8500 + 500) / 10000 * 100 = 90% -> critical (default critical=90)
    const warnings = generateBudgetWarnings(budget, 500, 0, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.level).toBe('critical');
  });

  it('respects custom info threshold', () => {
    const budget = makeBudget({ tokensUsed: 2000, tokensRemaining: 8000 });
    // (2000 + 500) / 10000 * 100 = 25% -> null with defaults, info with custom
    const warnings = generateBudgetWarnings(budget, 500, 0, { info: 20 });
    expect(warnings.some((w) => w.level === 'info')).toBe(true);
  });

  it('respects custom warning threshold', () => {
    const budget = makeBudget({ tokensUsed: 5500, tokensRemaining: 4500 });
    // (5500 + 500) / 10000 * 100 = 60% -> warning with custom warning=60
    const warnings = generateBudgetWarnings(budget, 500, 0, { warning: 60 });
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.level).toBe('warning');
  });

  it('respects custom critical threshold', () => {
    const budget = makeBudget({ tokensUsed: 5500, tokensRemaining: 4500 });
    // (5500 + 500) / 10000 * 100 = 60% -> critical with custom critical=60
    const warnings = generateBudgetWarnings(budget, 500, 0, { critical: 60 });
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.level).toBe('critical');
  });

  it('calculates correct projected token utilization', () => {
    const budget = makeBudget({
      tokensUsed: 5000,
      tokensRemaining: 5000,
      tokenBudget: 10000,
    });
    // Projected: (5000 + 2000) / 10000 * 100 = 70% -> info
    const warnings = generateBudgetWarnings(budget, 2000, 0, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning).toBeDefined();
    expect(tokenWarning?.utilizationPercent).toBe(70);
  });

  it('calculates correct estimated remaining tokens', () => {
    const budget = makeBudget({
      tokensUsed: 5000,
      tokensRemaining: 5000,
      tokenBudget: 10000,
    });
    // Remaining: 5000 - 2000 = 3000
    const warnings = generateBudgetWarnings(budget, 2000, 0, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.estimatedRemaining).toBe(3000);
  });

  it('calculates correct projected cost utilization', () => {
    const budget = makeBudget({
      costSpentUsd: 0.5,
      costRemainingUsd: 0.5,
      costBudgetUsd: 1.0,
    });
    // Projected: (0.5 + 0.3) / 1.0 * 100 = 80% -> warning
    const warnings = generateBudgetWarnings(budget, 0, 0.3, {});
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(costWarning).toBeDefined();
    expect(costWarning?.utilizationPercent).toBe(80);
  });

  it('calculates correct estimated remaining cost', () => {
    const budget = makeBudget({
      costSpentUsd: 0.5,
      costRemainingUsd: 0.5,
      costBudgetUsd: 1.0,
    });
    // Remaining: 0.5 - 0.3 = 0.2
    const warnings = generateBudgetWarnings(budget, 0, 0.3, {});
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(costWarning?.estimatedRemaining).toBeCloseTo(0.2, 10);
  });

  it('handles cost that crosses warning but not critical', () => {
    const budget = makeBudget({
      costSpentUsd: 0.5,
      costRemainingUsd: 0.5,
      costBudgetUsd: 1.0,
    });
    // Projected: (0.5 + 0.3) / 1.0 * 100 = 80% -> warning
    const warnings = generateBudgetWarnings(budget, 0, 0.3, {});
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(costWarning?.level).toBe('warning');
  });

  it('does not generate cost warning at info level (cost skips info)', () => {
    const budget = makeBudget({
      costSpentUsd: 0.5,
      costRemainingUsd: 0.5,
      costBudgetUsd: 1.0,
    });
    // Projected: (0.5 + 0.1) / 1.0 * 100 = 60% -> info for tokens, but cost skips info
    const warnings = generateBudgetWarnings(budget, 0, 0.1, {});
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(costWarning).toBeUndefined();
  });

  it('handles large token budgets', () => {
    const budget = makeBudget({
      tokenBudget: 1_000_000,
      tokensUsed: 900_000,
      tokensRemaining: 100_000,
    });
    // Projected: (900000 + 50000) / 1000000 * 100 = 95% -> critical
    const warnings = generateBudgetWarnings(budget, 50_000, 0, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.level).toBe('critical');
  });

  it('handles very small cost budgets', () => {
    const budget = makeBudget({
      costBudgetUsd: 0.01,
      costSpentUsd: 0.008,
      costRemainingUsd: 0.002,
    });
    // Projected: (0.008 + 0.002) / 0.01 * 100 = 100% -> critical for cost
    const warnings = generateBudgetWarnings(budget, 0, 0.002, {});
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(costWarning).toBeDefined();
    expect(costWarning?.level).toBe('critical');
  });

  it('handles fully custom thresholds overriding all defaults', () => {
    const budget = makeBudget({
      tokensUsed: 1000,
      tokensRemaining: 9000,
    });
    // Projected: (1000 + 500) / 10000 * 100 = 15% -> critical with custom critical=15
    const warnings = generateBudgetWarnings(budget, 500, 0, {
      info: 5,
      warning: 10,
      critical: 15,
    });
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    expect(tokenWarning?.level).toBe('critical');
  });

  it('handles zero estimated tokens and cost', () => {
    const budget = makeBudget({
      tokensUsed: 6000,
      tokensRemaining: 4000,
      costSpentUsd: 0.8,
      costRemainingUsd: 0.2,
    });
    // Token projected: (6000 + 0) / 10000 = 60% -> info
    // Cost projected: (0.8 + 0) / 1.0 = 80% -> warning
    const warnings = generateBudgetWarnings(budget, 0, 0, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(tokenWarning?.level).toBe('info');
    expect(costWarning?.level).toBe('warning');
  });

  it('warning messages differ between token and cost', () => {
    const budget = makeBudget({
      tokensUsed: 9000,
      tokensRemaining: 1000,
      costSpentUsd: 0.92,
      costRemainingUsd: 0.08,
    });
    const warnings = generateBudgetWarnings(budget, 500, 0.05, {});
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    const costWarning = warnings.find((w) => w.constraint === 'cost');
    expect(tokenWarning?.message).toContain('Token budget');
    expect(costWarning?.message).toContain('Cost budget');
    expect(tokenWarning?.message).not.toBe(costWarning?.message);
  });

  it('returns array (not null) even with no warnings', () => {
    const budget = makeBudget();
    const warnings = generateBudgetWarnings(budget, 0, 0, {});
    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('partial thresholds merge correctly with defaults', () => {
    const budget = makeBudget({
      tokensUsed: 8500,
      tokensRemaining: 1500,
    });
    // Only provide critical override; info and warning should use defaults (50, 75)
    // Projected: (8500 + 500) / 10000 = 90% -> equals custom critical=95? no -> warning
    const warnings = generateBudgetWarnings(budget, 500, 0, { critical: 95 });
    const tokenWarning = warnings.find((w) => w.constraint === 'tokens');
    // 90% is below custom critical=95 but above default warning=75
    expect(tokenWarning?.level).toBe('warning');
  });
});
