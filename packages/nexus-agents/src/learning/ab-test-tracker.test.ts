/**
 * A/B Test Tracker Tests
 *
 * @module learning/ab-test-tracker.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AbTestTracker, createAbTestTracker } from './ab-test-tracker.js';
import type { ExperimentOutcome } from './ab-test-types.js';

describe('ab-test-tracker', () => {
  let tracker: AbTestTracker;

  const validExperiment = {
    id: 'exp-001',
    name: 'Routing Strategy Test',
    description: 'Compare LinUCB vs random routing',
    variants: [
      {
        id: 'control',
        name: 'Random Routing',
        description: 'Random model selection',
        trafficPercent: 50,
        isControl: true,
      },
      {
        id: 'treatment',
        name: 'LinUCB Routing',
        description: 'LinUCB bandit selection',
        trafficPercent: 50,
        isControl: false,
      },
    ],
    minSampleSize: 30,
    primaryMetric: 'successRate' as const,
    minimumDetectableEffect: 0.1,
    tags: ['routing', 'ml'],
  };

  beforeEach(() => {
    tracker = new AbTestTracker();
  });

  describe('createExperiment', () => {
    it('should create a valid experiment', () => {
      const exp = tracker.createExperiment(validExperiment);

      expect(exp.id).toBe('exp-001');
      expect(exp.status).toBe('draft');
      expect(exp.startedAt).toBeNull();
      expect(exp.endedAt).toBeNull();
    });

    it('should reject duplicate experiment IDs', () => {
      tracker.createExperiment(validExperiment);

      expect(() => tracker.createExperiment(validExperiment)).toThrow('already exists');
    });

    it('should reject experiment without control variant', () => {
      const noControl = {
        ...validExperiment,
        id: 'exp-no-control',
        variants: [
          { ...validExperiment.variants[0]!, isControl: false },
          { ...validExperiment.variants[1]!, isControl: false },
        ],
      };

      expect(() => tracker.createExperiment(noControl)).toThrow('exactly 1 control');
    });

    it('should reject experiment with traffic not summing to 100', () => {
      const badTraffic = {
        ...validExperiment,
        id: 'exp-bad-traffic',
        variants: [
          { ...validExperiment.variants[0]!, trafficPercent: 40 },
          { ...validExperiment.variants[1]!, trafficPercent: 40 },
        ],
      };

      expect(() => tracker.createExperiment(badTraffic)).toThrow('must sum to 100');
    });

    it('should reject experiment with too few variants', () => {
      const oneVariant = {
        ...validExperiment,
        id: 'exp-one-variant',
        variants: [validExperiment.variants[0]!],
      };

      expect(() => tracker.createExperiment(oneVariant)).toThrow('at least 2 variants');
    });

    it('should reject experiment with small minSampleSize', () => {
      const smallSample = {
        ...validExperiment,
        id: 'exp-small-sample',
        minSampleSize: 5,
      };

      expect(() => tracker.createExperiment(smallSample)).toThrow('at least 10');
    });
  });

  describe('experiment lifecycle', () => {
    beforeEach(() => {
      tracker.createExperiment(validExperiment);
    });

    it('should start a draft experiment', () => {
      tracker.startExperiment('exp-001');
      const exp = tracker.getExperiment('exp-001');

      expect(exp?.status).toBe('running');
      expect(exp?.startedAt).not.toBeNull();
    });

    it('should not start a completed experiment', () => {
      tracker.startExperiment('exp-001');
      tracker.completeExperiment('exp-001');

      expect(() => {
        tracker.startExperiment('exp-001');
      }).toThrow('Cannot start experiment');
    });

    it('should pause a running experiment', () => {
      tracker.startExperiment('exp-001');
      tracker.pauseExperiment('exp-001');
      const exp = tracker.getExperiment('exp-001');

      expect(exp?.status).toBe('paused');
    });

    it('should resume a paused experiment', () => {
      tracker.startExperiment('exp-001');
      tracker.pauseExperiment('exp-001');
      tracker.startExperiment('exp-001');
      const exp = tracker.getExperiment('exp-001');

      expect(exp?.status).toBe('running');
    });

    it('should complete a running experiment', () => {
      tracker.startExperiment('exp-001');
      tracker.completeExperiment('exp-001');
      const exp = tracker.getExperiment('exp-001');

      expect(exp?.status).toBe('completed');
      expect(exp?.endedAt).not.toBeNull();
    });
  });

  describe('assignVariant', () => {
    beforeEach(() => {
      tracker.createExperiment(validExperiment);
      tracker.startExperiment('exp-001');
    });

    it('should assign variant for running experiment', () => {
      const variant = tracker.assignVariant('exp-001', 'trace-123');

      expect(variant).not.toBeNull();
      expect(['control', 'treatment']).toContain(variant?.id);
    });

    it('should return null for non-existent experiment', () => {
      const variant = tracker.assignVariant('exp-unknown', 'trace-123');

      expect(variant).toBeNull();
    });

    it('should return null for non-running experiment', () => {
      tracker.pauseExperiment('exp-001');
      const variant = tracker.assignVariant('exp-001', 'trace-123');

      expect(variant).toBeNull();
    });

    it('should be deterministic for same trace ID', () => {
      const variant1 = tracker.assignVariant('exp-001', 'trace-abc');
      const variant2 = tracker.assignVariant('exp-001', 'trace-abc');

      expect(variant1?.id).toBe(variant2?.id);
    });

    it('should distribute traffic roughly according to percentages', () => {
      const assignments: Record<string, number> = { control: 0, treatment: 0 };

      for (let i = 0; i < 1000; i++) {
        const variant = tracker.assignVariant('exp-001', `trace-${String(i)}`);
        if (variant) {
          assignments[variant.id]!++;
        }
      }

      // With 50/50 split, each should be roughly 500 (allow ±10%)
      expect(assignments['control']).toBeGreaterThan(400);
      expect(assignments['control']).toBeLessThan(600);
      expect(assignments['treatment']).toBeGreaterThan(400);
      expect(assignments['treatment']).toBeLessThan(600);
    });
  });

  describe('recordOutcome', () => {
    beforeEach(() => {
      tracker.createExperiment(validExperiment);
      tracker.startExperiment('exp-001');
    });

    it('should record a valid outcome', () => {
      const outcome: ExperimentOutcome = {
        experimentId: 'exp-001',
        variantId: 'control',
        traceId: 'trace-123',
        success: true,
        reward: 0.8,
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      };

      expect(() => {
        tracker.recordOutcome(outcome);
      }).not.toThrow();
    });

    it('should reject outcome for non-existent experiment', () => {
      const outcome: ExperimentOutcome = {
        experimentId: 'exp-unknown',
        variantId: 'control',
        traceId: 'trace-123',
        success: true,
        reward: 0.8,
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      };

      expect(() => {
        tracker.recordOutcome(outcome);
      }).toThrow('not found');
    });

    it('should reject outcome for non-existent variant', () => {
      const outcome: ExperimentOutcome = {
        experimentId: 'exp-001',
        variantId: 'unknown-variant',
        traceId: 'trace-123',
        success: true,
        reward: 0.8,
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      };

      expect(() => {
        tracker.recordOutcome(outcome);
      }).toThrow('not found');
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      tracker.createExperiment(validExperiment);
      tracker.startExperiment('exp-001');
    });

    it('should return null for non-existent experiment', () => {
      expect(tracker.getSummary('exp-unknown')).toBeNull();
    });

    it('should return summary with empty stats for no outcomes', () => {
      const summary = tracker.getSummary('exp-001');

      expect(summary).not.toBeNull();
      expect(summary?.variantStats.length).toBe(2);
      expect(summary?.variantStats[0]?.n).toBe(0);
      expect(summary?.hasMinimumSampleSize).toBe(false);
    });

    it('should calculate correct statistics', () => {
      // Record 50 successes in control, 30 in treatment
      for (let i = 0; i < 60; i++) {
        tracker.recordOutcome({
          experimentId: 'exp-001',
          variantId: 'control',
          traceId: `ctrl-${String(i)}`,
          success: i < 50,
          reward: i < 50 ? 1.0 : 0.0,
          latencyMs: 100,
          timestamp: new Date().toISOString(),
        });
      }

      for (let i = 0; i < 60; i++) {
        tracker.recordOutcome({
          experimentId: 'exp-001',
          variantId: 'treatment',
          traceId: `treat-${String(i)}`,
          success: i < 30,
          reward: i < 30 ? 1.0 : 0.0,
          latencyMs: 100,
          timestamp: new Date().toISOString(),
        });
      }

      const summary = tracker.getSummary('exp-001');

      expect(summary?.hasMinimumSampleSize).toBe(true);

      const controlStats = summary?.variantStats.find((vs) => vs.variantId === 'control');
      expect(controlStats?.n).toBe(60);
      expect(controlStats?.successes).toBe(50);
      expect(controlStats?.successRate).toBeCloseTo(50 / 60, 2);
    });

    it('should detect significant difference', () => {
      // Control: 80% success, Treatment: 50% success
      for (let i = 0; i < 100; i++) {
        tracker.recordOutcome({
          experimentId: 'exp-001',
          variantId: 'control',
          traceId: `ctrl-${String(i)}`,
          success: i < 80,
          reward: i < 80 ? 1.0 : 0.0,
          latencyMs: 100,
          timestamp: new Date().toISOString(),
        });

        tracker.recordOutcome({
          experimentId: 'exp-001',
          variantId: 'treatment',
          traceId: `treat-${String(i)}`,
          success: i < 50,
          reward: i < 50 ? 1.0 : 0.0,
          latencyMs: 100,
          timestamp: new Date().toISOString(),
        });
      }

      const summary = tracker.getSummary('exp-001');

      expect(summary?.result?.comparison.significant).toBe(true);
      expect(summary?.recommendation).toBe('stop_winner');
    });

    it('should recommend continue when sample size not reached', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome({
          experimentId: 'exp-001',
          variantId: 'control',
          traceId: `ctrl-${String(i)}`,
          success: true,
          reward: 1.0,
          latencyMs: 100,
          timestamp: new Date().toISOString(),
        });
      }

      const summary = tracker.getSummary('exp-001');

      expect(summary?.hasMinimumSampleSize).toBe(false);
      expect(summary?.recommendation).toBe('continue');
    });
  });

  describe('listExperiments', () => {
    beforeEach(() => {
      tracker.createExperiment(validExperiment);
      tracker.createExperiment({
        ...validExperiment,
        id: 'exp-002',
        tags: ['routing'],
      });
    });

    it('should list all experiments', () => {
      const experiments = tracker.listExperiments();

      expect(experiments.length).toBe(2);
    });

    it('should filter by status', () => {
      tracker.startExperiment('exp-001');

      const running = tracker.listExperiments({ status: 'running' });
      const draft = tracker.listExperiments({ status: 'draft' });

      expect(running.length).toBe(1);
      expect(draft.length).toBe(1);
    });

    it('should filter by tags', () => {
      const mlExperiments = tracker.listExperiments({ tags: ['ml'] });

      expect(mlExperiments.length).toBe(1);
      expect(mlExperiments[0]?.id).toBe('exp-001');
    });
  });

  describe('exportData', () => {
    it('should export all experiment data', () => {
      tracker.createExperiment(validExperiment);
      tracker.startExperiment('exp-001');
      tracker.recordOutcome({
        experimentId: 'exp-001',
        variantId: 'control',
        traceId: 'trace-1',
        success: true,
        reward: 1.0,
        latencyMs: 100,
        timestamp: new Date().toISOString(),
      });

      const exportData = tracker.exportData();

      expect(exportData.experiments.length).toBe(1);
      expect(exportData.outcomes.length).toBe(1);
      expect(exportData.exportedAt).toBeDefined();
    });

    it('should include summaries for completed experiments', () => {
      tracker.createExperiment(validExperiment);
      tracker.startExperiment('exp-001');
      tracker.completeExperiment('exp-001');

      const exportData = tracker.exportData();

      expect(exportData.summaries.length).toBe(1);
    });
  });

  describe('createAbTestTracker', () => {
    it('should create a tracker instance', () => {
      const t = createAbTestTracker();

      expect(t).toBeDefined();
      expect(typeof t.createExperiment).toBe('function');
    });
  });
});
