/**
 * Tests for deep diagnostics.
 *
 * @module cli/doctor-deep.test
 * (Source: Issue #1031 — Enhanced doctor --deep diagnostics)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runDeepDiagnostics, formatDeepDiagnostics } from './doctor-deep.js';
import { resetOutcomeStore, getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';

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
      const geminiRate = diag.routingConvergence.cliSuccessRates.get('gemini');
      expect(geminiRate).toBe(0.8);
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

  describe('formatDeepDiagnostics', () => {
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
