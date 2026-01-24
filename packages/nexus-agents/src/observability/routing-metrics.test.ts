/**
 * Routing Metrics Collector Tests
 *
 * @module observability/routing-metrics.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoutingMetricsCollector,
  createRoutingMetricsCollector,
  type RoutingRecord,
  type OutcomeRecord,
} from './routing-metrics.js';

describe('RoutingMetricsCollector', () => {
  let collector: RoutingMetricsCollector;

  const createDecision = (overrides?: Partial<RoutingRecord>): RoutingRecord => ({
    timestamp: new Date().toISOString(),
    traceId: `trace-${String(Math.random()).slice(2, 10)}`,
    selectedModel: 'claude',
    alternativeModels: ['gemini', 'codex'],
    isExploration: false,
    ...overrides,
  });

  const createOutcome = (overrides?: Partial<OutcomeRecord>): OutcomeRecord => ({
    timestamp: new Date().toISOString(),
    traceId: `trace-${String(Math.random()).slice(2, 10)}`,
    model: 'claude',
    success: true,
    reward: 0.8,
    ...overrides,
  });

  beforeEach(() => {
    collector = new RoutingMetricsCollector();
  });

  describe('recordDecision', () => {
    it('records a routing decision', () => {
      const decision = createDecision();
      collector.recordDecision(decision);

      const metrics = collector.getMetrics();
      expect(metrics.totalDecisions).toBe(1);
    });

    it('tracks exploration decisions', () => {
      collector.recordDecision(createDecision({ isExploration: true }));
      collector.recordDecision(createDecision({ isExploration: false }));
      collector.recordDecision(createDecision({ isExploration: false }));

      const metrics = collector.getMetrics();
      expect(metrics.explorationRate).toBeCloseTo(1 / 3, 2);
    });

    it('aggregates by model', () => {
      collector.recordDecision(createDecision({ selectedModel: 'claude' }));
      collector.recordDecision(createDecision({ selectedModel: 'claude' }));
      collector.recordDecision(createDecision({ selectedModel: 'gemini' }));

      const metrics = collector.getMetrics();
      expect(metrics.modelMetrics).toHaveLength(2);

      const claudeMetrics = metrics.modelMetrics.find((m) => m.model === 'claude');
      expect(claudeMetrics?.selectionCount).toBe(2);
      expect(claudeMetrics?.selectionPercent).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('recordOutcome', () => {
    it('records task outcomes', () => {
      collector.recordOutcome(createOutcome());

      const metrics = collector.getMetrics();
      expect(metrics.totalOutcomes).toBe(1);
    });

    it('calculates average reward', () => {
      collector.recordOutcome(createOutcome({ reward: 0.9 }));
      collector.recordOutcome(createOutcome({ reward: 0.7 }));
      collector.recordOutcome(createOutcome({ reward: 0.8 }));

      const metrics = collector.getMetrics();
      expect(metrics.avgReward).toBeCloseTo(0.8, 2);
    });

    it('calculates success rate per model', () => {
      collector.recordOutcome(createOutcome({ model: 'claude', success: true }));
      collector.recordOutcome(createOutcome({ model: 'claude', success: true }));
      collector.recordOutcome(createOutcome({ model: 'claude', success: false }));

      const metrics = collector.getMetrics();
      const claudeMetrics = metrics.modelMetrics.find((m) => m.model === 'claude');
      expect(claudeMetrics?.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('calculates average quality when provided', () => {
      collector.recordOutcome(createOutcome({ model: 'claude', qualityScore: 0.9 }));
      collector.recordOutcome(createOutcome({ model: 'claude', qualityScore: 0.8 }));

      const metrics = collector.getMetrics();
      const claudeMetrics = metrics.modelMetrics.find((m) => m.model === 'claude');
      expect(claudeMetrics?.avgQuality).toBeCloseTo(0.85, 2);
    });

    it('calculates average latency when provided', () => {
      collector.recordOutcome(createOutcome({ model: 'gemini', latencyMs: 100 }));
      collector.recordOutcome(createOutcome({ model: 'gemini', latencyMs: 200 }));

      const metrics = collector.getMetrics();
      const geminiMetrics = metrics.modelMetrics.find((m) => m.model === 'gemini');
      expect(geminiMetrics?.avgLatencyMs).toBe(150);
    });

    it('calculates average routing latency from decisions', () => {
      collector.recordDecision(createDecision({ routingLatencyMs: 5 }));
      collector.recordDecision(createDecision({ routingLatencyMs: 15 }));
      collector.recordDecision(createDecision({ routingLatencyMs: 10 }));

      const metrics = collector.getMetrics();
      expect(metrics.avgRoutingLatencyMs).toBe(10);
    });

    it('ignores decisions without routing latency', () => {
      collector.recordDecision(createDecision({ routingLatencyMs: 8 }));
      collector.recordDecision(createDecision()); // No routingLatencyMs
      collector.recordDecision(createDecision({ routingLatencyMs: 12 }));

      const metrics = collector.getMetrics();
      expect(metrics.avgRoutingLatencyMs).toBe(10);
    });

    it('returns zero routing latency when no latency data', () => {
      collector.recordDecision(createDecision());
      collector.recordDecision(createDecision());

      const metrics = collector.getMetrics();
      expect(metrics.avgRoutingLatencyMs).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('returns empty metrics when no data', () => {
      const metrics = collector.getMetrics();

      expect(metrics.totalDecisions).toBe(0);
      expect(metrics.totalOutcomes).toBe(0);
      expect(metrics.modelMetrics).toHaveLength(0);
      expect(metrics.explorationRate).toBe(0);
      expect(metrics.avgReward).toBe(0);
    });

    it('filters by time period', () => {
      // Add decision from 48 hours ago
      const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      collector.recordDecision(createDecision({ timestamp: oldTimestamp }));

      // Add recent decision
      collector.recordDecision(createDecision());

      const metrics24h = collector.getMetrics(24);
      expect(metrics24h.totalDecisions).toBe(1);

      const metrics72h = collector.getMetrics(72);
      expect(metrics72h.totalDecisions).toBe(2);
    });

    it('includes period timestamps', () => {
      const metrics = collector.getMetrics(24);

      expect(metrics.periodStart).toBeDefined();
      expect(metrics.periodEnd).toBeDefined();
      expect(new Date(metrics.periodEnd).getTime()).toBeGreaterThan(
        new Date(metrics.periodStart).getTime()
      );
    });
  });

  describe('renderDashboard', () => {
    it('renders ASCII dashboard', () => {
      collector.recordDecision(createDecision({ selectedModel: 'claude' }));
      collector.recordDecision(createDecision({ selectedModel: 'gemini' }));
      collector.recordOutcome(createOutcome({ model: 'claude', reward: 0.85 }));

      const dashboard = collector.renderDashboard();

      expect(dashboard).toContain('Routing Effectiveness Dashboard');
      expect(dashboard).toContain('Model Selection Distribution');
      expect(dashboard).toContain('claude');
      expect(dashboard).toContain('Learning Progress');
      expect(dashboard).toContain('Performance');
    });

    it('shows exploration rate status', () => {
      // 15% exploration (healthy range)
      for (let i = 0; i < 85; i++) {
        collector.recordDecision(createDecision({ isExploration: false }));
      }
      for (let i = 0; i < 15; i++) {
        collector.recordDecision(createDecision({ isExploration: true }));
      }

      const dashboard = collector.renderDashboard();
      expect(dashboard).toContain('(healthy)');
    });

    it('handles empty data gracefully', () => {
      const dashboard = collector.renderDashboard();

      expect(dashboard).toContain('No routing data available');
      expect(dashboard).toContain('Routing decisions: 0');
    });

    it('respects custom width', () => {
      const dashboard = collector.renderDashboard({ width: 80 });
      const lines = dashboard.split('\n');

      // All lines should be 80 characters
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(80);
      }
    });
  });

  describe('toJSON', () => {
    it('returns valid JSON', () => {
      collector.recordDecision(createDecision());
      collector.recordOutcome(createOutcome());

      const json = collector.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.totalDecisions).toBe(1);
      expect(parsed.totalOutcomes).toBe(1);
      expect(parsed.modelMetrics).toBeDefined();
    });
  });

  describe('reset', () => {
    it('clears all data', () => {
      collector.recordDecision(createDecision());
      collector.recordOutcome(createOutcome());

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalDecisions).toBe(0);
      expect(metrics.totalOutcomes).toBe(0);
    });
  });

  describe('retention', () => {
    it('enforces max records limit', () => {
      const smallCollector = new RoutingMetricsCollector({ maxRecords: 5 });

      // Add more than max records
      for (let i = 0; i < 10; i++) {
        smallCollector.recordDecision(createDecision({ traceId: `trace-${String(i)}` }));
      }

      const metrics = smallCollector.getMetrics();
      // Retention happens on insert, so we may have maxRecords + 1
      // The important thing is we don't have unbounded growth
      expect(metrics.totalDecisions).toBeLessThanOrEqual(6);
      expect(metrics.totalDecisions).toBeGreaterThan(0);
    });
  });

  describe('createRoutingMetricsCollector', () => {
    it('creates collector with defaults', () => {
      const c = createRoutingMetricsCollector();
      expect(c).toBeInstanceOf(RoutingMetricsCollector);
    });

    it('creates collector with custom config', () => {
      const c = createRoutingMetricsCollector({ maxRecords: 100 });
      expect(c).toBeInstanceOf(RoutingMetricsCollector);
    });
  });
});
