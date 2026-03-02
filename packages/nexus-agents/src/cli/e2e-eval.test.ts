/**
 * Tests for E2E evaluation runner.
 *
 * @module cli/e2e-eval.test
 * (Source: Issue #1030 — E2E scenario runner to validate learning loop)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runE2EEval, formatE2EEvalResult, E2E_EVAL_MARKER } from './e2e-eval.js';
import { resetOutcomeStore, getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

describe('e2e-eval', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  describe('runE2EEval', () => {
    it('should run default 50 tasks', () => {
      const result = runE2EEval();
      expect(result.tasksRun).toBe(50);
    });

    it('should accept custom task count', () => {
      const result = runE2EEval({ taskCount: 10 });
      expect(result.tasksRun).toBe(10);
    });

    it('should record outcomes to OutcomeStore', () => {
      runE2EEval({ taskCount: 20 });
      const outcomes = getOutcomeStore().query();
      expect(outcomes.length).toBe(20);
    });

    it('should mark outcomes with E2E eval marker', () => {
      runE2EEval({ taskCount: 10 });
      const outcomes = getOutcomeStore().query();
      const marked = outcomes.filter((o) => o.qualitySignals?.includes(E2E_EVAL_MARKER) === true);
      expect(marked.length).toBe(10);
    });

    it('should track per-CLI success/total counts', () => {
      const result = runE2EEval({ taskCount: 30 });
      let totalTasks = 0;
      for (const [, count] of result.outcomesByCliTotal) {
        totalTasks += count;
      }
      expect(totalTasks).toBe(30);
    });

    it('should produce convergence score between 0 and 1', () => {
      const result = runE2EEval({ taskCount: 50 });
      expect(result.convergenceScore).toBeGreaterThanOrEqual(0);
      expect(result.convergenceScore).toBeLessThanOrEqual(1);
    });

    it('should return details array with summary lines', () => {
      const result = runE2EEval({ taskCount: 20 });
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.details[0]).toContain('Outcomes recorded');
    });

    it('should reset store when resetStore is true', () => {
      // Pre-seed some outcomes
      getOutcomeStore().append({
        id: 'pre-existing',
        cli: 'claude',
        category: 'architecture',
        model: 'claude-default',
        success: true,
        durationMs: 1000,
        timestamp: new Date().toISOString(),
        source: 'manual',
      });
      expect(getOutcomeStore().query().length).toBe(1);

      runE2EEval({ taskCount: 10, resetStore: true });
      // Store was reset, so only eval outcomes
      expect(getOutcomeStore().query().length).toBe(10);
    });

    it('should not reset store when resetStore is false', () => {
      getOutcomeStore().append({
        id: 'pre-existing',
        cli: 'claude',
        category: 'architecture',
        model: 'claude-default',
        success: true,
        durationMs: 1000,
        timestamp: new Date().toISOString(),
        source: 'manual',
      });

      runE2EEval({ taskCount: 10, resetStore: false });
      // Pre-existing + eval outcomes
      expect(getOutcomeStore().query().length).toBe(11);
    });

    it('should use all three CLIs', () => {
      const result = runE2EEval({ taskCount: 100 });
      const clis = Array.from(result.outcomesByCliTotal.keys());
      expect(clis).toContain('claude');
      expect(clis).toContain('gemini');
      expect(clis).toContain('codex');
    });

    it('should produce passed=true with enough tasks', () => {
      // With 100 tasks, success rate spread should be visible
      const result = runE2EEval({ taskCount: 100 });
      expect(result.passed).toBe(true);
    });
  });

  describe('formatE2EEvalResult', () => {
    it('should return formatted string', () => {
      const result = runE2EEval({ taskCount: 10 });
      const output = formatE2EEvalResult(result);
      expect(output).toContain('Outcomes recorded');
      expect(output).toContain('Convergence score');
    });
  });
});
