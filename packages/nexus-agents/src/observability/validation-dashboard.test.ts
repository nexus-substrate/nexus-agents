/**
 * Validation Dashboard Tests
 *
 * @module observability/validation-dashboard.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationDashboard, createValidationDashboard } from './validation-dashboard.js';
import type { DashboardOutcome } from './validation-dashboard.js';

describe('validation-dashboard', () => {
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

  describe('recordOutcome', () => {
    it('should record an outcome', () => {
      dashboard.recordOutcome(createOutcome());
      const summary = dashboard.getSummary();

      expect(summary.totalDecisions).toBe(1);
    });

    it('should record multiple outcomes', () => {
      for (let i = 0; i < 10; i++) {
        dashboard.recordOutcome(createOutcome());
      }
      const summary = dashboard.getSummary();

      expect(summary.totalDecisions).toBe(10);
    });
  });

  describe('recordExplorationRate', () => {
    it('should track exploration rate', () => {
      dashboard.recordExplorationRate(0.15);
      dashboard.recordExplorationRate(0.12);
      dashboard.recordExplorationRate(0.18);

      const summary = dashboard.getSummary();

      expect(summary.learningProgress.explorationRate).toBeGreaterThan(0);
    });
  });

  describe('recordFeatureWeights', () => {
    it('should track feature weights', () => {
      dashboard.recordFeatureWeights({ taskComplexity: 0.5, contextLength: 0.3 });
      dashboard.recordFeatureWeights({ taskComplexity: 0.6, contextLength: 0.25 });

      const summary = dashboard.getSummary();

      expect(summary.learningProgress.featureImportance.length).toBeGreaterThan(0);
    });
  });

  describe('getSummary', () => {
    it('should return empty summary for no data', () => {
      const summary = dashboard.getSummary();

      expect(summary.totalDecisions).toBe(0);
      expect(summary.overallSuccessRate).toBe(0);
      expect(summary.modelPerformance.length).toBe(0);
    });

    it('should calculate correct success rate', () => {
      // 7 successes out of 10
      for (let i = 0; i < 10; i++) {
        dashboard.recordOutcome(createOutcome({ success: i < 7 }));
      }

      const summary = dashboard.getSummary({ minSampleSize: 1 });

      expect(summary.overallSuccessRate).toBeCloseTo(0.7, 1);
    });

    it('should calculate model performance', () => {
      for (let i = 0; i < 20; i++) {
        dashboard.recordOutcome(createOutcome({ model: 'claude', success: i < 15 }));
        dashboard.recordOutcome(createOutcome({ model: 'gemini', success: i < 10 }));
      }

      const summary = dashboard.getSummary({ minSampleSize: 1 });

      expect(summary.modelPerformance.length).toBe(2);

      const claude = summary.modelPerformance.find((mp) => mp.model === 'claude');
      const gemini = summary.modelPerformance.find((mp) => mp.model === 'gemini');

      expect(claude?.successRate).toBeCloseTo(0.75, 1);
      expect(gemini?.successRate).toBeCloseTo(0.5, 1);
    });

    it('should calculate task type performance', () => {
      for (let i = 0; i < 20; i++) {
        dashboard.recordOutcome(createOutcome({ taskType: 'code-generation', success: true }));
        dashboard.recordOutcome(createOutcome({ taskType: 'reasoning', success: i < 10 }));
      }

      const summary = dashboard.getSummary({ minSampleSize: 1 });

      expect(summary.taskTypePerformance.length).toBe(2);
    });

    it('should filter by period', () => {
      const now = Date.now();
      const hourAgo = now - 2 * 60 * 60 * 1000;

      dashboard.recordOutcome(createOutcome({ timestamp: now }));
      dashboard.recordOutcome(createOutcome({ timestamp: hourAgo }));

      const summary = dashboard.getSummary({ period: '1h' });

      expect(summary.totalDecisions).toBe(1);
    });

    it('should filter by model', () => {
      dashboard.recordOutcome(createOutcome({ model: 'claude' }));
      dashboard.recordOutcome(createOutcome({ model: 'gemini' }));

      const summary = dashboard.getSummary({ models: ['claude'] });

      expect(summary.totalDecisions).toBe(1);
    });

    it('should filter by task type', () => {
      dashboard.recordOutcome(createOutcome({ taskType: 'code-generation' }));
      dashboard.recordOutcome(createOutcome({ taskType: 'reasoning' }));

      const summary = dashboard.getSummary({ taskTypes: ['code-generation'] });

      expect(summary.totalDecisions).toBe(1);
    });

    it('should respect minSampleSize filter', () => {
      for (let i = 0; i < 5; i++) {
        dashboard.recordOutcome(createOutcome({ model: 'claude' }));
      }
      for (let i = 0; i < 20; i++) {
        dashboard.recordOutcome(createOutcome({ model: 'gemini' }));
      }

      const summary = dashboard.getSummary({ minSampleSize: 10 });

      // Only gemini meets minSampleSize
      expect(summary.modelPerformance.length).toBe(1);
      expect(summary.modelPerformance[0]?.model).toBe('gemini');
    });
  });

  describe('health indicators', () => {
    it('should detect insufficient data', () => {
      for (let i = 0; i < 50; i++) {
        dashboard.recordOutcome(createOutcome());
      }

      const summary = dashboard.getSummary();

      expect(summary.healthIndicators.hasMinimumData).toBe(false);
      expect(summary.healthIndicators.warnings).toContainEqual(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should pass with sufficient data', () => {
      for (let i = 0; i < 150; i++) {
        dashboard.recordOutcome(createOutcome());
      }

      const summary = dashboard.getSummary();

      expect(summary.healthIndicators.hasMinimumData).toBe(true);
    });

    it('should detect unhealthy exploration rate', () => {
      for (let i = 0; i < 20; i++) {
        dashboard.recordExplorationRate(0.5); // Too high
      }

      const summary = dashboard.getSummary();

      expect(summary.healthIndicators.healthyExploration).toBe(false);
    });

    it('should detect healthy exploration rate', () => {
      for (let i = 0; i < 20; i++) {
        dashboard.recordExplorationRate(0.15); // In range
      }

      const summary = dashboard.getSummary();

      expect(summary.healthIndicators.healthyExploration).toBe(true);
    });

    it('reports the health score as unmeasured with no recorded outcomes (#4714)', () => {
      // This previously asserted `>= 0 && <= 1` — true of every possible
      // value, including the constant 0.8 the dashboard actually produced on
      // every real run. A check that cannot fail.
      //
      // `recordOutcome` has no production caller, so an unmeasured score is
      // the real shipped state, and saying so is the point.
      const summary = dashboard.getSummary();
      expect(summary.healthIndicators.healthScore).toBeNull();
    });
  });

  describe('learning progress', () => {
    it('should calculate exploration rate trend', () => {
      // First 10: high exploration
      for (let i = 0; i < 10; i++) {
        dashboard.recordExplorationRate(0.3);
      }
      // Next 10: lower exploration
      for (let i = 0; i < 10; i++) {
        dashboard.recordExplorationRate(0.1);
      }

      const summary = dashboard.getSummary();

      // Trend should be negative (decreasing)
      expect(summary.learningProgress.explorationRateTrend).toBeLessThan(0);
    });

    it('should calculate feature importance', () => {
      dashboard.recordFeatureWeights({
        feature1: 0.9,
        feature2: 0.3,
        feature3: 0.1,
      });

      const summary = dashboard.getSummary();
      const fi = summary.learningProgress.featureImportance;

      // Should be sorted by importance
      expect(fi.length).toBe(3);
      expect(fi[0]?.feature).toBe('feature1');
    });

    it('should calculate regret from comparable outcomes', () => {
      // Outcomes with comparison data
      dashboard.recordOutcome(
        createOutcome({
          model: 'claude',
          reward: 0.8,
          allModelRewards: { claude: 0.8, gemini: 1.0 }, // Suboptimal
        })
      );
      dashboard.recordOutcome(
        createOutcome({
          model: 'gemini',
          reward: 1.0,
          allModelRewards: { claude: 0.5, gemini: 1.0 }, // Optimal
        })
      );

      const summary = dashboard.getSummary();

      expect(summary.learningProgress.cumulativeRegret).toBeGreaterThan(0);
    });

    it('should calculate convergence score from weight stability', () => {
      // Stable weights
      for (let i = 0; i < 20; i++) {
        dashboard.recordFeatureWeights({ stable: 0.5 });
      }

      const summary = dashboard.getSummary();

      expect(summary.learningProgress.convergenceScore).toBeGreaterThan(0.5);
    });
  });

  describe('renderDashboard', () => {
    beforeEach(() => {
      // Add some test data
      for (let i = 0; i < 50; i++) {
        dashboard.recordOutcome(
          createOutcome({
            model: i % 2 === 0 ? 'claude' : 'gemini',
            taskType: i % 3 === 0 ? 'code-generation' : 'reasoning',
            success: i < 35,
            reward: 0.5 + Math.random() * 0.5,
          })
        );
      }
      for (let i = 0; i < 10; i++) {
        dashboard.recordExplorationRate(0.15);
      }
      dashboard.recordFeatureWeights({ complexity: 0.5, context: 0.3 });
    });

    it('should render ASCII dashboard', () => {
      const output = dashboard.renderDashboard();

      expect(output).toContain('Learning Validation Dashboard');
      expect(output).toContain('Model Performance');
      expect(output).toContain('Health Indicators');
    });

    it('should include model performance table', () => {
      const output = dashboard.renderDashboard({}, { showConfidenceIntervals: true });

      expect(output).toContain('claude');
      expect(output).toContain('gemini');
      expect(output).toContain('Success Rate');
    });

    it('should respect render options', () => {
      const output = dashboard.renderDashboard(
        {},
        {
          showTaskTypes: false,
          showLearningProgress: false,
          showFeatureImportance: false,
        }
      );

      expect(output).not.toContain('Task Type Performance');
      expect(output).not.toContain('Top Features');
    });

    it('should show learning progress', () => {
      const output = dashboard.renderDashboard({}, { showLearningProgress: true });

      expect(output).toContain('Learning Progress');
      expect(output).toContain('Exploration Rate');
    });

    it('should show warnings when applicable', () => {
      // Create dashboard with insufficient data
      const smallDashboard = new ValidationDashboard();
      for (let i = 0; i < 10; i++) {
        smallDashboard.recordOutcome(createOutcome());
      }

      const output = smallDashboard.renderDashboard();

      expect(output).toContain('Warnings');
      expect(output).toContain('Insufficient data');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      dashboard.recordOutcome(createOutcome());
      dashboard.recordExplorationRate(0.15);
      dashboard.recordFeatureWeights({ test: 0.5 });

      dashboard.clear();

      const summary = dashboard.getSummary();
      expect(summary.totalDecisions).toBe(0);
      // Was `toBe(0)` (#5255).
      expect(summary.learningProgress.explorationRate).toBeNull();
      expect(summary.learningProgress.featureImportance.length).toBe(0);
    });
  });

  describe('createValidationDashboard', () => {
    it('should create a dashboard instance', () => {
      const d = createValidationDashboard();

      expect(d).toBeInstanceOf(ValidationDashboard);
    });
  });
});
