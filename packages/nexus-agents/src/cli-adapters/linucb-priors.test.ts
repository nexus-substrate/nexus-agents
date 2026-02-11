/**
 * Tests for LinUCB prior seeding (Epic #952, Phase 6)
 *
 * @module cli-adapters/linucb-priors.test
 */

import { describe, it, expect } from 'vitest';
import { LinUCBBandit } from './linucb-bandit.js';

describe('LinUCBBandit.seedPriors', () => {
  it('seeds arms with provided reward hints', () => {
    const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
    const priors = new Map([
      ['claude', 0.9],
      ['gemini', 0.7],
      ['codex', 0.5],
    ]);

    bandit.seedPriors(priors, 5);

    const stats = bandit.getStats();
    expect(stats[0]?.pullCount).toBe(5);
    expect(stats[1]?.pullCount).toBe(5);
    expect(stats[2]?.pullCount).toBe(5);
  });

  it('respects the observation count cap of 20', () => {
    const bandit = new LinUCBBandit(['claude', 'gemini']);
    const priors = new Map([['claude', 0.8]]);

    bandit.seedPriors(priors, 100);

    const stats = bandit.getStats();
    expect(stats[0]?.pullCount).toBe(20);
  });

  it('skips arms not in priors map', () => {
    const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
    const priors = new Map([['claude', 0.9]]);

    bandit.seedPriors(priors);

    const stats = bandit.getStats();
    expect(stats[0]?.pullCount).toBe(5);
    expect(stats[1]?.pullCount).toBe(0);
    expect(stats[2]?.pullCount).toBe(0);
  });

  it('clamps rewards to [0, 1]', () => {
    const bandit = new LinUCBBandit(['claude']);
    const priors = new Map([['claude', 1.5]]);

    bandit.seedPriors(priors, 3);

    const stats = bandit.getStats();
    expect(stats[0]?.avgReward).toBeLessThanOrEqual(1);
    expect(stats[0]?.pullCount).toBe(3);
  });

  it('defaults to 5 observations', () => {
    const bandit = new LinUCBBandit(['claude']);
    const priors = new Map([['claude', 0.7]]);

    bandit.seedPriors(priors);

    const stats = bandit.getStats();
    expect(stats[0]?.pullCount).toBe(5);
  });

  it('seeded priors are soft — exploration can override', () => {
    const bandit = new LinUCBBandit(['claude', 'gemini']);

    // Seed claude high, gemini low
    bandit.seedPriors(
      new Map([
        ['claude', 0.9],
        ['gemini', 0.3],
      ]),
      3
    );

    // Now update gemini with high real rewards
    const context = {
      taskComplexity: 0.5,
      contextLengthNormalized: 0.5,
      isCodeTask: 1,
      isReasoningTask: 0,
      budgetUtilization: 0.5,
      timePressure: 0.5,
    };

    for (let i = 0; i < 20; i++) {
      bandit.update(1, context, 1.0);
    }

    // After many high-reward updates, gemini should have higher avg
    const stats = bandit.getStats();
    const geminiStats = stats[1];
    expect(geminiStats?.avgReward).toBeGreaterThan(0.8);
  });

  it('preserves existing observations when seeded', () => {
    const bandit = new LinUCBBandit(['claude']);

    const context = {
      taskComplexity: 0.5,
      contextLengthNormalized: 0.5,
      isCodeTask: 0,
      isReasoningTask: 0,
      budgetUtilization: 0.5,
      timePressure: 0.5,
    };

    // Add 3 real observations
    bandit.update(0, context, 0.8);
    bandit.update(0, context, 0.7);
    bandit.update(0, context, 0.9);

    // Then seed
    bandit.seedPriors(new Map([['claude', 0.5]]), 2);

    // Should have 3 + 2 = 5 total pulls
    const stats = bandit.getStats();
    expect(stats[0]?.pullCount).toBe(5);
  });

  it('handles empty priors map', () => {
    const bandit = new LinUCBBandit(['claude', 'gemini']);
    const priors = new Map<string, number>();

    bandit.seedPriors(priors, 5);

    const stats = bandit.getStats();
    expect(stats[0]?.pullCount).toBe(0);
    expect(stats[1]?.pullCount).toBe(0);
  });
});
