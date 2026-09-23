/**
 * Tests for deep diagnostics.
 *
 * @module cli/doctor-deep.test
 * (Source: Issue #1031 — Enhanced doctor --deep diagnostics)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDeepDiagnostics, formatDeepDiagnostics } from './doctor-deep.js';
import { resetOutcomeStore, getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';
import type { OutcomeCli } from '../orchestration/outcomes/outcome-types.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

let seedCounter = 0;

/** Append `total` outcome rows for `cli`, the first `successes` of them successful. */
function seed(cli: OutcomeCli, total: number, successes: number): void {
  const store = getOutcomeStore();
  for (let i = 0; i < total; i++) {
    seedCounter++;
    store.append({
      id: `seed-${String(seedCounter)}`,
      cli,
      category: 'code_generation',
      model: 'seed-model',
      success: i < successes,
      durationMs: 1000,
      timestamp: new Date().toISOString(),
      source: 'manual',
    });
  }
}

describe('doctor-deep', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  describe('runDeepDiagnostics', () => {
    it('should return all three diagnostic sections', () => {
      const diag = runDeepDiagnostics();
      expect(diag.learningLoop).toBeDefined();
      expect(diag.dataSufficiency).toBeDefined();
      expect(diag.routingConvergence).toBeDefined();
    });

    it('should report zero outcomes on empty store', () => {
      const diag = runDeepDiagnostics();
      expect(diag.learningLoop.totalOutcomes).toBe(0);
      expect(diag.learningLoop.latestTimestamp).toBeNull();
      expect(diag.learningLoop.activeBonuses).toBe(0);
    });

    it('should report all categories as missing on empty store', () => {
      const diag = runDeepDiagnostics();
      expect(diag.dataSufficiency.missingCategories.length).toBe(TASK_CATEGORIES.length);
    });

    it('should report all CLIs below threshold on empty store', () => {
      const diag = runDeepDiagnostics();
      for (const cs of diag.dataSufficiency.cliStatus) {
        expect(cs.taskCount).toBe(0);
        expect(cs.aboveThreshold).toBe(false);
      }
    });

    it('should detect outcomes after seeding', () => {
      const store = getOutcomeStore();
      for (let i = 0; i < 15; i++) {
        store.append({
          id: `test-${String(i)}`,
          cli: 'claude',
          category: 'architecture',
          model: 'claude-default',
          success: true,
          durationMs: 1000,
          timestamp: new Date().toISOString(),
          source: 'manual',
        });
      }

      const diag = runDeepDiagnostics();
      expect(diag.learningLoop.totalOutcomes).toBe(15);
      expect(diag.learningLoop.latestTimestamp).not.toBeNull();
    });

    it('should mark CLI above threshold when enough outcomes', () => {
      const store = getOutcomeStore();
      for (let i = 0; i < 12; i++) {
        store.append({
          id: `test-${String(i)}`,
          cli: 'codex',
          category: 'code_generation',
          model: 'codex-default',
          success: i % 2 === 0,
          durationMs: 1000,
          timestamp: new Date().toISOString(),
          source: 'manual',
        });
      }

      const diag = runDeepDiagnostics();
      const codexStatus = diag.dataSufficiency.cliStatus.find((c) => c.cli === 'codex');
      expect(codexStatus?.aboveThreshold).toBe(true);
      expect(codexStatus?.taskCount).toBe(12);
    });

    it('should compute success rates correctly', () => {
      const store = getOutcomeStore();
      // 8 successes out of 10
      for (let i = 0; i < 10; i++) {
        store.append({
          id: `test-${String(i)}`,
          cli: 'gemini',
          category: 'research',
          model: 'gemini-default',
          success: i < 8,
          durationMs: 1000,
          timestamp: new Date().toISOString(),
          source: 'manual',
        });
      }

      const diag = runDeepDiagnostics();
      const geminiRate = diag.routingConvergence.armSuccessRates.get('gemini');
      expect(geminiRate).toEqual({ status: 'measured', rate: 0.8, sampleCount: 10 });
    });

    it('should report not converged when below threshold', () => {
      const diag = runDeepDiagnostics();
      expect(diag.routingConvergence.converged).toBe(false);
    });

    it('should report coldStartThreshold as 3', () => {
      const diag = runDeepDiagnostics();
      expect(diag.dataSufficiency.coldStartThreshold).toBe(3);
    });
  });

  // #6557: convergence iterated CLI_NAMES only, wrote 0 for a CLI with no
  // rows and divided by CLI_NAMES.length — an absent arm read as a measured 0%
  // and api:* arms (recorded under their own id since #6554) were invisible.
  describe('routing convergence over observed arms (#6557)', () => {
    it('measures an api-only workspace from its api arm, not as four zeroes', () => {
      seed('api:anthropic', 4, 3);

      const rc = runDeepDiagnostics().routingConvergence;

      expect(rc.armSuccessRates.get('api:anthropic')).toEqual({
        status: 'measured',
        rate: 0.75,
        sampleCount: 4,
      });
      expect(rc.armSuccessRates.get('claude')).toEqual({ status: 'unmeasured' });
      expect(rc.avgSuccessRate).toBe(0.75);
      expect(rc.measuredArmCount).toBe(1);
    });

    it('averages a mixed workspace over its measured arms only', () => {
      seed('claude', 10, 8); // 0.8
      seed('api:anthropic', 4, 1); // 0.25

      const rc = runDeepDiagnostics().routingConvergence;

      // Over the 2 measured arms: (0.8 + 0.25) / 2. Divided by the 4 CLI
      // names it would read 0.2625; by all 8 routed arms, 0.13125.
      expect(rc.avgSuccessRate).toBe(0.525);
      expect(rc.measuredArmCount).toBe(2);
    });

    it('reports an arm with no rows as unmeasured, never 0', () => {
      seed('claude', 5, 5);

      const rc = runDeepDiagnostics().routingConvergence;

      for (const arm of ['gemini', 'codex', 'opencode', 'api:openai']) {
        expect(rc.armSuccessRates.get(arm)).toEqual({ status: 'unmeasured' });
      }
    });

    it('reads a measured 0% arm as 0, distinct from an unmeasured one', () => {
      seed('codex', 3, 0);

      const rc = runDeepDiagnostics().routingConvergence;

      expect(rc.armSuccessRates.get('codex')).toEqual({
        status: 'measured',
        rate: 0,
        sampleCount: 3,
      });
      expect(rc.avgSuccessRate).toBe(0);
    });

    it('excludes unattributed rows from every arm and from the average', () => {
      seed('unknown', 6, 0);
      seed('gemini', 2, 2);

      const rc = runDeepDiagnostics().routingConvergence;

      expect(rc.armSuccessRates.has('unknown')).toBe(false);
      expect(rc.avgSuccessRate).toBe(1);
      expect(rc.measuredArmCount).toBe(1);
    });

    it('names the empty case: no measured arm is unmeasured, not 0 and not NaN', () => {
      const rc = runDeepDiagnostics().routingConvergence;

      expect(rc.avgSuccessRate).toBe('unmeasured');
      expect(rc.measuredArmCount).toBe(0);
      expect(rc.converged).toBe(false);
    });

    it('converges on the arms actually used once each clears the cold-start threshold', () => {
      seed('api:anthropic', 3, 3);
      expect(runDeepDiagnostics().routingConvergence.converged).toBe(true);

      seed('codex', 2, 2); // a second measured arm, still below threshold
      expect(runDeepDiagnostics().routingConvergence.converged).toBe(false);
    });
  });

  describe('formatDeepDiagnostics', () => {
    it('renders the empty case as unmeasured, not a 0% or NaN rate', () => {
      const output = formatDeepDiagnostics(runDeepDiagnostics());
      expect(output).toContain('Avg success rate: unmeasured (no arm has outcome rows)');
      expect(output).not.toContain('NaN');
      expect(output).not.toMatch(/Avg success rate: 0\.0%/);
    });

    it('renders measured arms with their sample count and lists unmeasured arms', () => {
      seed('claude', 10, 8);
      seed('api:anthropic', 4, 1);
      const output = formatDeepDiagnostics(runDeepDiagnostics());
      expect(output).toContain('Avg success rate: 52.5% over 2 measured arms');
      expect(output).toContain('claude: 80.0% (10 runs)');
      expect(output).toContain('api:anthropic: 25.0% (4 runs)');
      expect(output).toMatch(/Unmeasured \(no rows\): .*gemini/);
      expect(output).not.toContain('gemini: 0.0%');
    });

    it('should return formatted string with sections', () => {
      const diag = runDeepDiagnostics();
      const output = formatDeepDiagnostics(diag);
      expect(output).toContain('Deep Diagnostics');
      expect(output).toContain('Learning Loop');
      expect(output).toContain('Data Sufficiency');
      expect(output).toContain('Routing Convergence');
    });

    it('should show missing categories on empty store', () => {
      const diag = runDeepDiagnostics();
      const output = formatDeepDiagnostics(diag);
      expect(output).toContain('Missing categories');
    });
  });
});
