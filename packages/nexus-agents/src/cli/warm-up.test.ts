/**
 * Tests for LinUCB bandit warm-up from task specialization matrix.
 *
 * @module cli/warm-up.test
 * (Source: Issue #1023 — Bootstrap LinUCB with synthetic outcomes)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSyntheticPriors, runWarmUp, SYNTHETIC_MARKER } from './warm-up.js';
import { resetOutcomeStore, getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

describe('warm-up', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  describe('generateSyntheticPriors', () => {
    it('should return entries for all CLIs', () => {
      const priors = generateSyntheticPriors();
      expect(priors.size).toBe(CLI_NAMES.length);
      for (const cli of CLI_NAMES) {
        expect(priors.has(cli)).toBe(true);
      }
    });

    it('should produce rewards between 0 and 1', () => {
      const priors = generateSyntheticPriors();
      for (const [, reward] of priors) {
        expect(reward).toBeGreaterThan(0);
        expect(reward).toBeLessThanOrEqual(1);
      }
    });

    it('should give highest reward to CLI with most primary assignments', () => {
      const priors = generateSyntheticPriors();
      // claude is primary for architecture, security_review, planning, devops (4)
      // codex is primary for code_generation, code_review, testing (3)
      // gemini is primary for research, documentation, exploration (3)
      const claude = priors.get('claude') ?? 0;
      const codex = priors.get('codex') ?? 0;
      const gemini = priors.get('gemini') ?? 0;
      expect(claude).toBeGreaterThan(codex);
      expect(claude).toBeGreaterThan(gemini);
    });

    it('should distinguish primary from secondary reward levels', () => {
      const priors = generateSyntheticPriors();
      // Claude: 4 primary (0.85) + 5 secondary (0.6) + 1 other (0.35)
      // Expected: (4*0.85 + 5*0.6 + 1*0.35) / 10 = 0.675
      const claude = priors.get('claude') ?? 0;
      expect(claude).toBeCloseTo(0.675, 2);
    });

    it('should return consistent results on repeated calls', () => {
      const first = generateSyntheticPriors();
      const second = generateSyntheticPriors();
      for (const [cli, reward] of first) {
        expect(second.get(cli)).toBe(reward);
      }
    });
  });

  describe('runWarmUp', () => {
    it(`should seed ${String(CLI_NAMES.length)} CLIs x 10 categories synthetic outcomes`, () => {
      const result = runWarmUp();
      expect(result.seeded).toBe(CLI_NAMES.length * TASK_CATEGORIES.length);
      expect(result.skipped).toBe(false);
    });

    it('should mark all outcomes with synthetic marker', () => {
      runWarmUp();
      const outcomes = getOutcomeStore().query();
      const synthetic = outcomes.filter(
        (o) => o.qualitySignals?.includes(SYNTHETIC_MARKER) === true
      );
      expect(synthetic.length).toBe(CLI_NAMES.length * TASK_CATEGORIES.length);
    });

    it('should record outcomes with source manual', () => {
      runWarmUp();
      const outcomes = getOutcomeStore().query();
      for (const o of outcomes) {
        expect(o.source).toBe('manual');
      }
    });

    it('should mark primary CLI outcomes as success', () => {
      runWarmUp();
      const outcomes = getOutcomeStore().query();
      // Primary (0.85) and secondary (0.6) are >= 0.5 so success=true
      // Other (0.35) is < 0.5 so success=false
      const successful = outcomes.filter((o) => o.success);
      // 10 primary + 10 secondary = 20 successful
      expect(successful.length).toBe(20);
    });

    it('should be idempotent — second call returns skipped', () => {
      const first = runWarmUp();
      expect(first.skipped).toBe(false);
      expect(first.seeded).toBe(CLI_NAMES.length * TASK_CATEGORIES.length);

      const second = runWarmUp();
      expect(second.skipped).toBe(true);
      expect(second.seeded).toBe(0);
      expect(second.reason).toBeDefined();
    });

    it('should not add more outcomes on idempotent call', () => {
      runWarmUp();
      const countAfterFirst = getOutcomeStore().size;
      runWarmUp();
      const countAfterSecond = getOutcomeStore().size;
      expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('should cover all 10 task categories', () => {
      runWarmUp();
      const outcomes = getOutcomeStore().query();
      const categories = new Set(outcomes.map((o) => o.category));
      expect(categories.size).toBe(TASK_CATEGORIES.length);
      for (const cat of TASK_CATEGORIES) {
        expect(categories.has(cat)).toBe(true);
      }
    });
  });
});
