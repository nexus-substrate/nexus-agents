/**
 * Validation Dashboard Command Tests
 *
 * @module cli/validation-dashboard-command.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationDashboard } from '../observability/validation-dashboard.js';
import type { DashboardOutcome } from '../observability/validation-dashboard.js';
import {
  runValidationDashboard,
  formatValidationDashboardResult,
  isValidPeriod,
  isValidDashboardFormat,
  VALID_PERIODS,
} from './validation-dashboard-command.js';

describe('validation-dashboard-command', () => {
  let dashboard: ValidationDashboard;

  const createOutcome = (overrides: Partial<DashboardOutcome> = {}): DashboardOutcome => ({
    model: 'claude',
    taskType: 'code-generation',
    success: true,
    reward: 0.8,
    latencyMs: 100,
    tokensUsed: 500,
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    dashboard = new ValidationDashboard();
  });

  describe('runValidationDashboard', () => {
    it('should return success with empty dashboard', () => {
      const result = runValidationDashboard(dashboard);

      expect(result.success).toBe(true);
      expect(result.totalDecisions).toBe(0);
      expect(result.modelsShown).toEqual([]);
    });

    it('should include dashboard output', () => {
      const result = runValidationDashboard(dashboard);

      expect(result.output).toContain('Learning Validation Dashboard');
    });

    it('should show model data when present', () => {
      for (let i = 0; i < 20; i++) {
        dashboard.recordOutcome(createOutcome({ model: 'claude' }));
        dashboard.recordOutcome(createOutcome({ model: 'gemini' }));
      }

      const result = runValidationDashboard(dashboard, { minSampleSize: 1 });

      expect(result.totalDecisions).toBe(40);
      expect(result.modelsShown).toContain('claude');
      expect(result.modelsShown).toContain('gemini');
    });

    it('should filter by period', () => {
      const now = Date.now();
      const hourAgo = now - 2 * 60 * 60 * 1000;

      dashboard.recordOutcome(createOutcome({ timestamp: now }));
      dashboard.recordOutcome(createOutcome({ timestamp: hourAgo }));

      const result = runValidationDashboard(dashboard, { period: '1h' });

      expect(result.totalDecisions).toBe(1);
    });

    it('should filter by models', () => {
      dashboard.recordOutcome(createOutcome({ model: 'claude' }));
      dashboard.recordOutcome(createOutcome({ model: 'gemini' }));

      const result = runValidationDashboard(dashboard, { models: ['claude'] });

      expect(result.totalDecisions).toBe(1);
    });

    it('should filter by task types', () => {
      dashboard.recordOutcome(createOutcome({ taskType: 'code-generation' }));
      dashboard.recordOutcome(createOutcome({ taskType: 'reasoning' }));

      const result = runValidationDashboard(dashboard, { taskTypes: ['code-generation'] });

      expect(result.totalDecisions).toBe(1);
    });

    it('should output JSON format', () => {
      dashboard.recordOutcome(createOutcome());

      const result = runValidationDashboard(dashboard, { format: 'json' });

      expect(() => {
        JSON.parse(result.output);
      }).not.toThrow();
      const parsed = JSON.parse(result.output) as { totalDecisions: number };
      expect(parsed.totalDecisions).toBe(1);
    });

    it('should include warnings in result', () => {
      // Add insufficient data (< 100 decisions triggers warning)
      for (let i = 0; i < 50; i++) {
        dashboard.recordOutcome(createOutcome());
      }

      const result = runValidationDashboard(dashboard);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('Insufficient data'))).toBe(true);
    });

    it('should respect render options', () => {
      for (let i = 0; i < 20; i++) {
        dashboard.recordOutcome(createOutcome());
      }
      dashboard.recordExplorationRate(0.15);
      dashboard.recordFeatureWeights({ complexity: 0.5 });

      const result = runValidationDashboard(dashboard, {
        showTaskTypes: false,
        showLearningProgress: false,
        showFeatureImportance: false,
      });

      expect(result.output).not.toContain('Task Type Performance');
      expect(result.output).not.toContain('Top Features');
    });

    it('should respect minSampleSize filter', () => {
      for (let i = 0; i < 5; i++) {
        dashboard.recordOutcome(createOutcome({ model: 'claude' }));
      }
      for (let i = 0; i < 20; i++) {
        dashboard.recordOutcome(createOutcome({ model: 'gemini' }));
      }

      const result = runValidationDashboard(dashboard, { minSampleSize: 10 });

      // Only gemini should show (has 20 samples)
      expect(result.modelsShown).toEqual(['gemini']);
    });
  });

  describe('formatValidationDashboardResult', () => {
    it('should return output string', () => {
      const result = runValidationDashboard(dashboard);
      const formatted = formatValidationDashboardResult(result);

      expect(formatted).toBe(result.output);
    });
  });

  describe('isValidPeriod', () => {
    it('should return true for valid periods', () => {
      expect(isValidPeriod('1h')).toBe(true);
      expect(isValidPeriod('24h')).toBe(true);
      expect(isValidPeriod('7d')).toBe(true);
      expect(isValidPeriod('30d')).toBe(true);
      expect(isValidPeriod('all')).toBe(true);
    });

    it('should return false for invalid periods', () => {
      expect(isValidPeriod('invalid')).toBe(false);
      expect(isValidPeriod('1d')).toBe(false);
      expect(isValidPeriod(undefined)).toBe(false);
    });
  });

  describe('isValidDashboardFormat', () => {
    it('should return true for valid formats', () => {
      expect(isValidDashboardFormat('ascii')).toBe(true);
      expect(isValidDashboardFormat('json')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidDashboardFormat('table')).toBe(false);
      expect(isValidDashboardFormat('yaml')).toBe(false);
      expect(isValidDashboardFormat(undefined)).toBe(false);
    });
  });

  describe('VALID_PERIODS', () => {
    it('should contain all valid periods', () => {
      expect(VALID_PERIODS).toContain('1h');
      expect(VALID_PERIODS).toContain('24h');
      expect(VALID_PERIODS).toContain('7d');
      expect(VALID_PERIODS).toContain('30d');
      expect(VALID_PERIODS).toContain('all');
      expect(VALID_PERIODS.length).toBe(5);
    });
  });

  describe('combined filters', () => {
    it('should apply multiple filters together', () => {
      const now = Date.now();

      // Claude, code-gen, recent
      dashboard.recordOutcome(
        createOutcome({
          model: 'claude',
          taskType: 'code-generation',
          timestamp: now,
        })
      );

      // Gemini, code-gen, recent
      dashboard.recordOutcome(
        createOutcome({
          model: 'gemini',
          taskType: 'code-generation',
          timestamp: now,
        })
      );

      // Claude, reasoning, recent
      dashboard.recordOutcome(
        createOutcome({
          model: 'claude',
          taskType: 'reasoning',
          timestamp: now,
        })
      );

      // Claude, code-gen, old
      dashboard.recordOutcome(
        createOutcome({
          model: 'claude',
          taskType: 'code-generation',
          timestamp: now - 2 * 60 * 60 * 1000,
        })
      );

      const result = runValidationDashboard(dashboard, {
        period: '1h',
        models: ['claude'],
        taskTypes: ['code-generation'],
      });

      // Only one matches: Claude + code-gen + recent
      expect(result.totalDecisions).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty models filter', () => {
      dashboard.recordOutcome(createOutcome());

      const result = runValidationDashboard(dashboard, { models: [] });

      // Empty array should not filter
      expect(result.totalDecisions).toBe(1);
    });

    it('should handle empty task types filter', () => {
      dashboard.recordOutcome(createOutcome());

      const result = runValidationDashboard(dashboard, { taskTypes: [] });

      // Empty array should not filter
      expect(result.totalDecisions).toBe(1);
    });

    it('should handle zero minSampleSize', () => {
      dashboard.recordOutcome(createOutcome());

      const result = runValidationDashboard(dashboard, { minSampleSize: 0 });

      // Zero should not apply filter
      expect(result.totalDecisions).toBe(1);
    });

    it('should handle negative minSampleSize', () => {
      dashboard.recordOutcome(createOutcome());

      const result = runValidationDashboard(dashboard, { minSampleSize: -5 });

      // Negative should not apply filter
      expect(result.totalDecisions).toBe(1);
    });
  });
});
