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

function makeBudget(overrides: Partial<SessionBudget> = {}): SessionBudget {
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
  };
}

// ============================================================================
// getWarningLevel
// ============================================================================

describe('getWarningLevel', () => {
  it('returns null below info threshold', () => {
    expect(getWarningLevel(30, DEFAULT_THRESHOLDS)).toBeNull();
  });

  it('returns info at info threshold', () => {
    expect(getWarningLevel(50, DEFAULT_THRESHOLDS)).toBe('info');
  });

  it('returns info between info and warning', () => {
    expect(getWarningLevel(60, DEFAULT_THRESHOLDS)).toBe('info');
  });

  it('returns warning at warning threshold', () => {
    expect(getWarningLevel(75, DEFAULT_THRESHOLDS)).toBe('warning');
  });

  it('returns warning between warning and critical', () => {
    expect(getWarningLevel(85, DEFAULT_THRESHOLDS)).toBe('warning');
  });

  it('returns critical at critical threshold', () => {
    expect(getWarningLevel(90, DEFAULT_THRESHOLDS)).toBe('critical');
  });

  it('returns critical above critical threshold', () => {
    expect(getWarningLevel(99, DEFAULT_THRESHOLDS)).toBe('critical');
  });

  it('returns null at exactly 0', () => {
    expect(getWarningLevel(0, DEFAULT_THRESHOLDS)).toBeNull();
  });
});

// ============================================================================
// createTokenWarning
// ============================================================================

describe('createTokenWarning', () => {
  it('returns null below info threshold', () => {
    expect(createTokenWarning(30, DEFAULT_THRESHOLDS, 7000)).toBeNull();
  });

  it('creates info warning', () => {
    const warning = createTokenWarning(55, DEFAULT_THRESHOLDS, 4500);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('info');
    expect(warning?.constraint).toBe('tokens');
    expect(warning?.message).toContain('55%');
  });

  it('creates warning-level warning', () => {
    const warning = createTokenWarning(80, DEFAULT_THRESHOLDS, 2000);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('warning');
    expect(warning?.message).toContain('approaching limit');
  });

  it('creates critical warning', () => {
    const warning = createTokenWarning(95, DEFAULT_THRESHOLDS, 500);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.message).toContain('95%');
  });

  it('includes utilization percent', () => {
    const warning = createTokenWarning(60, DEFAULT_THRESHOLDS, 4000);
    expect(warning?.utilizationPercent).toBe(60);
  });

  it('includes estimated remaining', () => {
    const warning = createTokenWarning(60, DEFAULT_THRESHOLDS, 4000);
    expect(warning?.estimatedRemaining).toBe(4000);
  });
});

// ============================================================================
// createCostWarning
// ============================================================================

describe('createCostWarning', () => {
  it('returns null below info threshold', () => {
    expect(createCostWarning(30, DEFAULT_THRESHOLDS, 0.7)).toBeNull();
  });

  it('returns null at info level (cost only does warning/critical)', () => {
    expect(createCostWarning(55, DEFAULT_THRESHOLDS, 0.45)).toBeNull();
  });

  it('creates warning-level cost warning', () => {
    const warning = createCostWarning(80, DEFAULT_THRESHOLDS, 0.2);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('warning');
    expect(warning?.constraint).toBe('cost');
    expect(warning?.message).toContain('approaching limit');
  });

  it('creates critical cost warning', () => {
    const warning = createCostWarning(95, DEFAULT_THRESHOLDS, 0.05);
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('critical');
    expect(warning?.message).toContain('95%');
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

  it('generates token warning at high utilization', () => {
    const budget = makeBudget({
      tokensUsed: 8000,
      tokensRemaining: 2000,
    });
    // Projected: (8000 + 1000) / 10000 * 100 = 90% → critical
    const warnings = generateBudgetWarnings(budget, 1000, 0.01, {});
    expect(warnings.some((w) => w.constraint === 'tokens')).toBe(true);
  });

  it('generates cost warning at high cost utilization', () => {
    const budget = makeBudget({
      costSpentUsd: 0.85,
      costRemainingUsd: 0.15,
      costBudgetUsd: 1.0,
    });
    // Projected: (0.85 + 0.1) / 1.0 * 100 = 95% → critical
    const warnings = generateBudgetWarnings(budget, 100, 0.1, {});
    expect(warnings.some((w) => w.constraint === 'cost')).toBe(true);
  });

  it('can generate both token and cost warnings', () => {
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
  });

  it('uses default thresholds when partial config', () => {
    const budget = makeBudget({ tokensUsed: 5500, tokensRemaining: 4500 });
    // (5500 + 500) / 10000 * 100 = 60% → info (default info=50)
    const warnings = generateBudgetWarnings(budget, 500, 0, {});
    expect(warnings.some((w) => w.level === 'info')).toBe(true);
  });

  it('respects custom thresholds', () => {
    const budget = makeBudget({ tokensUsed: 2000, tokensRemaining: 8000 });
    // (2000 + 500) / 10000 * 100 = 25% → would be null with defaults
    // But with custom info=20, it triggers info
    const warnings = generateBudgetWarnings(budget, 500, 0, { info: 20 });
    expect(warnings.some((w) => w.level === 'info')).toBe(true);
  });
});
