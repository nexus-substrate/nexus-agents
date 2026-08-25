/**
 * Tests for comparative memory evaluation benchmark.
 *
 * @module cli/memory-eval.test
 * (Source: Issue #1034 — Comparative memory evaluation benchmark)
 */

import { describe, it, expect } from 'vitest';
import type { EvalPair } from './memory-eval.js';
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

// ============================================================================
// The eval must be able to tell its two scorers apart (#4850)
// ============================================================================

describe('the dataset can measure a scorer (#4850)', () => {
  const K = 5;

  function groupByQuery(dataset: readonly EvalPair[]): Map<string, EvalPair[]> {
    const groups = new Map<string, EvalPair[]>();
    for (const p of dataset) groups.set(p.query, [...(groups.get(p.query) ?? []), p]);
    return groups;
  }

  it('gives every query both relevant and irrelevant memories', () => {
    // A scorer's only influence is the ORDER within a query group. When every
    // item in a group carries the same relevance label, order cannot move any
    // metric and the scorer is dead input.
    for (const [query, pairs] of groupByQuery(generateEvalDataset(50))) {
      const relevant = pairs.filter((p) => p.expectedRelevant).length;
      expect(
        relevant,
        `query "${query}" has ${String(relevant)}/${String(pairs.length)} relevant`
      ).toBeGreaterThan(0);
      expect(relevant).toBeLessThan(pairs.length);
    }
  });

  it('gives every query more memories than the top-k cut', () => {
    // If a group fits entirely inside the top 5, the cut selects everything
    // and ranking is irrelevant a second way.
    for (const [query, pairs] of groupByQuery(generateEvalDataset(50))) {
      expect(pairs.length, `query "${query}"`).toBeGreaterThan(K);
    }
  });

  it('never pairs an irrelevant memory with its own matching content', () => {
    // Otherwise "irrelevant" is only a label, and no scorer could be expected
    // to rank the pair down.
    const dataset = generateEvalDataset(50);
    const contentForQuery = new Map<string, string>();
    for (const p of dataset) {
      if (p.expectedRelevant) contentForQuery.set(p.query, p.memoryContent);
    }
    for (const p of dataset) {
      if (!p.expectedRelevant) {
        const matching = contentForQuery.get(p.query);
        // Without this the assertion below is vacuous: today's irrelevant
        // pairs have queries no relevant pair shares, so the lookup misses
        // and `not.toBe(undefined)` passes for the wrong reason.
        expect(matching, `no relevant pair shares query "${p.query}"`).toBeDefined();
        expect(p.memoryContent).not.toBe(matching);
      }
    }
  });
});

describe('the metrics respond to the scorer (#4850)', () => {
  it('does not report an identical result for both scorers', () => {
    // The whole point of the report. This asserted nothing before: the deltas
    // were exactly 0 at every dataset size because no query group was mixed.
    const r = runMemoryEval(50);
    const identical =
      r.improvement.recallDelta === 0 &&
      r.improvement.precisionDelta === 0 &&
      r.improvement.mrrDelta === 0;

    expect(identical).toBe(false);
  });

  it('does not credit perfect recall to a query with nothing to recall', () => {
    // size 1 yields a single irrelevant pair — a group where recall is
    // undefined. Scoring it 1.0 put a free 17/27 into the mean at size 50.
    const r = runMemoryEval(1);

    expect(r.baseline.recallAt5).not.toBe(1);
  });

  it('says so in the report when recall covered fewer queries than were run', () => {
    // The field alone is not disclosure — the CLI prints `details`, and a
    // Recall@5 describing a subset of the queries has to say which subset.
    const covered = formatMemoryEvalReport(runMemoryEval(50));
    const partial = formatMemoryEvalReport(runMemoryEval(1));

    expect(partial).toContain('0 of 1');
    expect(covered).not.toContain(' of ');
  });

  it('reports how many queries the recall mean was actually taken over', () => {
    // Absence has to be visible, not averaged away.
    const r = runMemoryEval(50);

    expect(r.baseline.recallQueries).toBe(r.baseline.totalQueries);
    expect(runMemoryEval(1).baseline.recallQueries).toBe(0);
  });
});
