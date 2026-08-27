/**
 * Tests for budget-errors.ts
 *
 * Covers determineExceededConstraint and createBudgetExceededError
 * with happy path, edge cases, and boundary conditions.
 */

import { describe, it, expect } from 'vitest';
import { determineExceededConstraint, createBudgetExceededError } from './budget-errors.js';
import type { BudgetConstraint, SessionBudget, BudgetRoutingResult } from './types.js';

// ============================================================================
// Fixtures
// ============================================================================

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

function makeResult(overrides: Partial<BudgetRoutingResult> = {}): BudgetRoutingResult {
  return {
    adapter: null,
    withinBudget: false,
    estimatedCostUsd: 0.05,
    estimatedTokens: 500,
    warnings: [],
    projectedBudget: makeBudget(),
    ...overrides,
  };
}

function makeConstraint(overrides: Partial<BudgetConstraint> = {}): BudgetConstraint {
  return {
    ...overrides,
  };
}

// ============================================================================
// determineExceededConstraint
// ============================================================================

describe('determineExceededConstraint', () => {
  describe('latency constraint exceeded (maxLatencyMs) — #4907', () => {
    it('names latency when no candidate met the latency budget', () => {
      // `'latency'` was a declared member of the constraint union that no
      // producer emitted, so a consumer switching on it had a dead arm and
      // "no latency violations" meant "never checked".
      const budget = makeConstraint({ maxLatencyMs: 500 });
      const result = makeResult({ adapter: null, estimatedLatencyMs: undefined });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('latency');
      expect(exceeded.limit).toBe(500);
      // The fastest model in the cost table — the best any candidate offered.
      expect(exceeded.current).toBe(1000);
    });

    it('does not blame latency when an adapter was selected', () => {
      // A selected adapter met the latency budget, so a rejection here is
      // about the session totals and must not be misattributed.
      const budget = makeConstraint({ maxLatencyMs: 5000 });
      const result = makeResult({ estimatedLatencyMs: 1500, estimatedTokens: 500 });
      const session = makeBudget({ tokensRemaining: 10 });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
    });

    it('does not blame latency when no latency budget was set', () => {
      // Absent constraint means unchecked, not violated.
      const budget = makeConstraint({});
      const result = makeResult({ adapter: null, estimatedTokens: 500 });
      const session = makeBudget({ tokensRemaining: 10 });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
    });
  });

  describe('token constraint exceeded (maxTokens)', () => {
    it('detects when estimated tokens exceed maxTokens', () => {
      const budget = makeConstraint({ maxTokens: 1000 });
      const result = makeResult({ estimatedTokens: 1500 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
      expect(exceeded.limit).toBe(1000);
      expect(exceeded.current).toBe(1500);
      expect(exceeded.suggestion).toContain('token budget');
    });

    it('detects when estimated tokens equal maxTokens + 1', () => {
      const budget = makeConstraint({ maxTokens: 1000 });
      const result = makeResult({ estimatedTokens: 1001 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
      expect(exceeded.limit).toBe(1000);
      expect(exceeded.current).toBe(1001);
    });

    it('does not trigger when estimated tokens equal maxTokens exactly', () => {
      const budget = makeConstraint({ maxTokens: 1000 });
      const result = makeResult({ estimatedTokens: 1000, estimatedCostUsd: 0 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      // Exactly equal does not exceed (> check, not >=)
      // Falls through to session budget checks
      expect(exceeded.constraint).not.toBe('tokens');
    });

    it('takes priority over cost constraint when both exceeded', () => {
      const budget = makeConstraint({ maxTokens: 100, maxCostUsd: 0.01 });
      const result = makeResult({ estimatedTokens: 200, estimatedCostUsd: 0.05 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
    });
  });

  describe('cost constraint exceeded (maxCostUsd)', () => {
    it('detects when estimated cost exceeds maxCostUsd', () => {
      const budget = makeConstraint({ maxCostUsd: 0.1 });
      const result = makeResult({ estimatedCostUsd: 0.5, estimatedTokens: 100 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('cost');
      expect(exceeded.limit).toBe(0.1);
      expect(exceeded.current).toBe(0.5);
      expect(exceeded.suggestion).toContain('cost budget');
    });

    it('detects cost exceeded when tokens are within budget', () => {
      const budget = makeConstraint({ maxTokens: 10000, maxCostUsd: 0.01 });
      const result = makeResult({ estimatedTokens: 500, estimatedCostUsd: 0.05 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('cost');
      expect(exceeded.limit).toBe(0.01);
      expect(exceeded.current).toBe(0.05);
    });

    it('falls through when estimated cost equals maxCostUsd exactly', () => {
      const budget = makeConstraint({ maxCostUsd: 0.05 });
      const result = makeResult({ estimatedCostUsd: 0.05, estimatedTokens: 100 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      // Exactly equal does not exceed the per-task maxCostUsd check (> not >=),
      // but falls through to session cost fallback which still returns 'cost'
      expect(exceeded.constraint).toBe('cost');
      // The limit comes from sessionBudget, not the per-task constraint
      expect(exceeded.limit).toBe(1.0);
    });
  });

  describe('session token budget exceeded (tokensRemaining)', () => {
    it('detects when estimated tokens exceed remaining session tokens', () => {
      const budget = makeConstraint(); // no per-task constraints
      const result = makeResult({ estimatedTokens: 2000 });
      const session = makeBudget({
        tokensRemaining: 500,
        tokenBudget: 10000,
        tokensUsed: 9500,
      });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
      expect(exceeded.limit).toBe(10000);
      expect(exceeded.current).toBe(9500 + 2000);
      expect(exceeded.suggestion).toContain('budget reset');
    });

    it('detects when tokensRemaining is exactly 0', () => {
      const budget = makeConstraint();
      const result = makeResult({ estimatedTokens: 1 });
      const session = makeBudget({
        tokensRemaining: 0,
        tokenBudget: 10000,
        tokensUsed: 10000,
      });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
      expect(exceeded.limit).toBe(10000);
      expect(exceeded.current).toBe(10001);
    });

    it('does not trigger when remaining equals estimated exactly', () => {
      const budget = makeConstraint();
      const result = makeResult({ estimatedTokens: 500, estimatedCostUsd: 0 });
      const session = makeBudget({
        tokensRemaining: 500,
        tokensUsed: 9500,
        costSpentUsd: 0,
      });

      const exceeded = determineExceededConstraint(budget, result, session);

      // 500 < 500 is false, so tokens check doesn't fire; falls through to cost
      expect(exceeded.constraint).toBe('cost');
    });
  });

  describe('session cost budget fallback', () => {
    it('falls through to cost when no other constraint is exceeded', () => {
      const budget = makeConstraint();
      const result = makeResult({ estimatedTokens: 100, estimatedCostUsd: 0.05 });
      const session = makeBudget({
        tokensRemaining: 5000,
        costBudgetUsd: 1.0,
        costSpentUsd: 0.8,
      });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('cost');
      expect(exceeded.limit).toBe(1.0);
      expect(exceeded.current).toBeCloseTo(0.85, 10);
      expect(exceeded.suggestion).toContain('budget reset');
    });

    it('returns session cost even when all per-task constraints are undefined', () => {
      const budget = makeConstraint();
      const result = makeResult({ estimatedTokens: 10, estimatedCostUsd: 0.001 });
      const session = makeBudget({
        tokensRemaining: 10000,
        costBudgetUsd: 5.0,
        costSpentUsd: 0,
      });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('cost');
      expect(exceeded.limit).toBe(5.0);
      expect(exceeded.current).toBe(0.001);
    });
  });

  describe('boundary values', () => {
    it('handles zero estimated tokens', () => {
      const budget = makeConstraint({ maxTokens: 0 });
      const result = makeResult({ estimatedTokens: 0 });
      const session = makeBudget();

      // 0 > 0 is false, falls through
      const exceeded = determineExceededConstraint(budget, result, session);
      expect(exceeded).toBeDefined();
    });

    it('handles very large numbers', () => {
      const budget = makeConstraint({ maxTokens: 1_000_000 });
      const result = makeResult({ estimatedTokens: 2_000_000 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
      expect(exceeded.limit).toBe(1_000_000);
      expect(exceeded.current).toBe(2_000_000);
    });

    it('handles fractional cost values', () => {
      const budget = makeConstraint({ maxCostUsd: 0.001 });
      const result = makeResult({ estimatedCostUsd: 0.0015, estimatedTokens: 10 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('cost');
      expect(exceeded.limit).toBe(0.001);
      expect(exceeded.current).toBe(0.0015);
    });
  });

  describe('constraint priority order', () => {
    it('checks maxTokens before maxCostUsd', () => {
      const budget = makeConstraint({ maxTokens: 100, maxCostUsd: 0.01 });
      const result = makeResult({ estimatedTokens: 200, estimatedCostUsd: 0.05 });
      const session = makeBudget();

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
    });

    it('checks maxCostUsd before session tokensRemaining', () => {
      const budget = makeConstraint({ maxCostUsd: 0.01 });
      const result = makeResult({ estimatedTokens: 2000, estimatedCostUsd: 0.05 });
      const session = makeBudget({ tokensRemaining: 100 });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('cost');
    });

    it('checks session tokensRemaining before session cost fallback', () => {
      const budget = makeConstraint();
      const result = makeResult({ estimatedTokens: 2000, estimatedCostUsd: 0.5 });
      const session = makeBudget({
        tokensRemaining: 100,
        tokensUsed: 9900,
        tokenBudget: 10000,
      });

      const exceeded = determineExceededConstraint(budget, result, session);

      expect(exceeded.constraint).toBe('tokens');
    });
  });
});

// ============================================================================
// createBudgetExceededError
// ============================================================================

describe('createBudgetExceededError', () => {
  it('creates error with BUDGET_EXCEEDED code', () => {
    const budget = makeConstraint({ maxTokens: 100 });
    const result = makeResult({ estimatedTokens: 200 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.code).toBe('BUDGET_EXCEEDED');
  });

  it('creates error with correct constraint type', () => {
    const budget = makeConstraint({ maxTokens: 100 });
    const result = makeResult({ estimatedTokens: 200 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.constraint).toBe('tokens');
  });

  it('sets cli to claude', () => {
    const budget = makeConstraint({ maxCostUsd: 0.01 });
    const result = makeResult({ estimatedCostUsd: 0.05, estimatedTokens: 10 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.cli).toBe('claude');
  });

  it('sets retryable to false', () => {
    const budget = makeConstraint({ maxTokens: 100 });
    const result = makeResult({ estimatedTokens: 200 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.retryable).toBe(false);
  });

  it('includes constraint details from determineExceededConstraint', () => {
    const budget = makeConstraint({ maxTokens: 500 });
    const result = makeResult({ estimatedTokens: 1000 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.limit).toBe(500);
    expect(error.current).toBe(1000);
    expect(error.suggestion).toBeTruthy();
  });

  it('message contains the constraint type', () => {
    const budget = makeConstraint({ maxCostUsd: 0.01 });
    const result = makeResult({ estimatedCostUsd: 0.05, estimatedTokens: 10 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.message).toContain('cost');
    expect(error.message).toContain('Budget constraint exceeded');
  });

  it('creates error for session token budget exceeded', () => {
    const budget = makeConstraint();
    const result = makeResult({ estimatedTokens: 5000 });
    const session = makeBudget({
      tokensRemaining: 100,
      tokensUsed: 9900,
      tokenBudget: 10000,
    });

    const error = createBudgetExceededError(budget, result, session);

    expect(error.code).toBe('BUDGET_EXCEEDED');
    expect(error.constraint).toBe('tokens');
    expect(error.limit).toBe(10000);
    expect(error.current).toBe(14900);
    expect(error.suggestion).toContain('budget reset');
  });

  it('creates error for session cost fallback', () => {
    const budget = makeConstraint();
    const result = makeResult({ estimatedTokens: 10, estimatedCostUsd: 0.1 });
    const session = makeBudget({
      tokensRemaining: 10000,
      costBudgetUsd: 2.0,
      costSpentUsd: 1.5,
    });

    const error = createBudgetExceededError(budget, result, session);

    expect(error.code).toBe('BUDGET_EXCEEDED');
    expect(error.constraint).toBe('cost');
    expect(error.limit).toBe(2.0);
    expect(error.current).toBe(1.6);
  });

  it('returns a complete BudgetExceededError structure', () => {
    const budget = makeConstraint({ maxTokens: 100 });
    const result = makeResult({ estimatedTokens: 200 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    // Verify all required fields exist
    expect(error).toHaveProperty('code');
    expect(error).toHaveProperty('message');
    expect(error).toHaveProperty('cli');
    expect(error).toHaveProperty('retryable');
    expect(error).toHaveProperty('constraint');
    expect(error).toHaveProperty('limit');
    expect(error).toHaveProperty('current');
    expect(error).toHaveProperty('suggestion');
  });

  it('handles maxTokens exceeded with message containing tokens', () => {
    const budget = makeConstraint({ maxTokens: 50 });
    const result = makeResult({ estimatedTokens: 100 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.message).toBe('Budget constraint exceeded: tokens');
  });

  it('handles cost exceeded with message containing cost', () => {
    const budget = makeConstraint({ maxCostUsd: 0.001 });
    const result = makeResult({ estimatedCostUsd: 0.01, estimatedTokens: 5 });
    const session = makeBudget();

    const error = createBudgetExceededError(budget, result, session);

    expect(error.message).toBe('Budget constraint exceeded: cost');
  });
});
