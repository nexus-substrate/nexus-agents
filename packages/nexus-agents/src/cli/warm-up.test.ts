/**
 * Tests for LinUCB bandit warm-up from task specialization matrix.
 *
 * @module cli/warm-up.test
 * (Source: Issue #1023 — Bootstrap LinUCB with synthetic outcomes)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateSyntheticPriors, runWarmUp, SYNTHETIC_MARKER } from './warm-up.js';
import { resetOutcomeStore, getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';

describe('warm-up', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  describe('generateSyntheticPriors', () => {
    it('should return exactly 3 CLI entries', () => {
      const priors = generateSyntheticPriors();
      expect(priors.size).toBe(3);
      expect(priors.has('claude')).toBe(true);
      expect(priors.has('gemini')).toBe(true);
      expect(priors.has('codex')).toBe(true);
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
      // Claude: 4 primary (0.85) + 6 secondary (0.6) + 0 other (0.35)
      // Expected: (4*0.85 + 6*0.6) / 10 = 0.70
      const claude = priors.get('claude') ?? 0;
      expect(claude).toBeCloseTo(0.7, 2);
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
    it('should seed 30 synthetic outcomes (3 CLIs x 10 categories)', () => {
      const result = runWarmUp();
      expect(result.seeded).toBe(3 * TASK_CATEGORIES.length);
      expect(result.skipped).toBe(false);
    });

    it('should mark all outcomes with synthetic marker', () => {
      runWarmUp();
      const outcomes = getOutcomeStore().query();
      const synthetic = outcomes.filter(
        (o) => o.qualitySignals?.includes(SYNTHETIC_MARKER) === true
      );
      expect(synthetic.length).toBe(30);
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
      expect(first.seeded).toBe(30);

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
