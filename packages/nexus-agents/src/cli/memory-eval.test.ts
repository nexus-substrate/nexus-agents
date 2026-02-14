/**
 * Tests for comparative memory evaluation benchmark.
 *
 * @module cli/memory-eval.test
 * (Source: Issue #1034 — Comparative memory evaluation benchmark)
 */

import { describe, it, expect } from 'vitest';
import { runMemoryEval, formatMemoryEvalReport, generateEvalDataset } from './memory-eval.js';

describe('memory-eval', () => {
  describe('generateEvalDataset', () => {
    it('should generate default 50 pairs', () => {
      const dataset = generateEvalDataset();
      expect(dataset.length).toBe(50);
    });

    it('should generate custom count', () => {
      const dataset = generateEvalDataset(20);
      expect(dataset.length).toBe(20);
    });

    it('should include all source types', () => {
      const dataset = generateEvalDataset(40);
      const sources = new Set(dataset.map((p) => p.source));
      expect(sources.has('session')).toBe(true);
      expect(sources.has('belief')).toBe(true);
      expect(sources.has('agentic')).toBe(true);
      expect(sources.has('typed')).toBe(true);
    });

    it('should include both relevant and irrelevant pairs', () => {
      const dataset = generateEvalDataset(30);
      const relevant = dataset.filter((p) => p.expectedRelevant);
      const irrelevant = dataset.filter((p) => !p.expectedRelevant);
      expect(relevant.length).toBeGreaterThan(0);
      expect(irrelevant.length).toBeGreaterThan(0);
    });

    it('should have unique memory keys', () => {
      const dataset = generateEvalDataset(50);
      const keys = new Set(dataset.map((p) => p.memoryKey));
      expect(keys.size).toBe(50);
    });
  });

  describe('runMemoryEval', () => {
    it('should return report with baseline and reflective metrics', () => {
      const report = runMemoryEval(30);
      expect(report.baseline).toBeDefined();
      expect(report.reflective).toBeDefined();
      expect(report.improvement).toBeDefined();
    });

    it('should have valid metric ranges', () => {
      const report = runMemoryEval(30);
      for (const metrics of [report.baseline, report.reflective]) {
        expect(metrics.recallAt5).toBeGreaterThanOrEqual(0);
        expect(metrics.recallAt5).toBeLessThanOrEqual(1);
        expect(metrics.precisionAt5).toBeGreaterThanOrEqual(0);
        expect(metrics.precisionAt5).toBeLessThanOrEqual(1);
        expect(metrics.mrr).toBeGreaterThanOrEqual(0);
        expect(metrics.mrr).toBeLessThanOrEqual(1);
        expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should show reflective improvement over baseline', () => {
      // Reflective scoring adds keyword expansion bonus,
      // so it should generally score equal or better
      const report = runMemoryEval(50);
      expect(report.improvement.recallDelta).toBeGreaterThanOrEqual(0);
    });

    it('should track dataset size', () => {
      const report = runMemoryEval(25);
      expect(report.datasetSize).toBe(25);
    });

    it('should include detail lines', () => {
      const report = runMemoryEval(20);
      expect(report.details.length).toBeGreaterThan(0);
    });

    it('should report total queries', () => {
      const report = runMemoryEval(30);
      expect(report.baseline.totalQueries).toBeGreaterThan(0);
      expect(report.reflective.totalQueries).toBeGreaterThan(0);
    });

    it('should compute improvement deltas correctly', () => {
      const report = runMemoryEval(30);
      const expectedRecallDelta =
        Math.round((report.reflective.recallAt5 - report.baseline.recallAt5) * 1000) / 1000;
      expect(report.improvement.recallDelta).toBe(expectedRecallDelta);
    });
  });

  describe('formatMemoryEvalReport', () => {
    it('should include header', () => {
      const report = runMemoryEval(20);
      const output = formatMemoryEvalReport(report);
      expect(output).toContain('Comparative Memory Evaluation');
    });

    it('should include baseline and reflective sections', () => {
      const report = runMemoryEval(20);
      const output = formatMemoryEvalReport(report);
      expect(output).toContain('Baseline');
      expect(output).toContain('Reflective');
      expect(output).toContain('Improvement');
    });

    it('should include metric names', () => {
      const report = runMemoryEval(20);
      const output = formatMemoryEvalReport(report);
      expect(output).toContain('Recall@5');
      expect(output).toContain('Precision@5');
      expect(output).toContain('MRR');
    });
  });
});
