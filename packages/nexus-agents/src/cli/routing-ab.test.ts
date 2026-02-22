/**
 * Tests for routing A/B comparison framework.
 *
 * @module cli/routing-ab.test
 * (Source: Issue #1033 — Routing strategy A/B framework)
 */

import { describe, it, expect } from 'vitest';
import { runRoutingAB, formatABReport, PRESET_VARIANTS, type ABRunConfig } from './routing-ab.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';

describe('routing-ab', () => {
  describe('runRoutingAB', () => {
    it('should return comparison report with both variants', () => {
      const report = runRoutingAB();
      expect(report.variantA).toBeDefined();
      expect(report.variantB).toBeDefined();
      expect(report.taskCount).toBe(30);
    });

    it('should use default variants when no config provided', () => {
      const report = runRoutingAB();
      expect(report.variantA.name).toBe('default');
      expect(report.variantB.name).toBe('explorative');
    });

    it('should accept custom task count', () => {
      const report = runRoutingAB({ taskCount: 10 });
      expect(report.taskCount).toBe(10);
    });

    it('should accept custom variant configs', () => {
      const config: Partial<ABRunConfig> = {
        variantA: PRESET_VARIANTS['default']!,
        variantB: PRESET_VARIANTS['quality']!,
        taskCount: 20,
      };
      const report = runRoutingAB(config);
      expect(report.variantA.name).toBe('default');
      expect(report.variantB.name).toBe('quality-focused');
      expect(report.taskCount).toBe(20);
    });

    it('should produce deterministic results with same seed', () => {
      const a = runRoutingAB({ seed: 123, taskCount: 15 });
      const b = runRoutingAB({ seed: 123, taskCount: 15 });
      expect(a.variantA.successRate).toBe(b.variantA.successRate);
      expect(a.variantB.successRate).toBe(b.variantB.successRate);
    });

    it('should produce different results with different seeds', () => {
      const a = runRoutingAB({ seed: 1, taskCount: 50 });
      const b = runRoutingAB({ seed: 999, taskCount: 50 });
      // Not guaranteed to differ with small counts but should with 50 tasks
      const aSame = a.variantA.successRate === b.variantA.successRate;
      const bSame = a.variantB.successRate === b.variantB.successRate;
      expect(aSame && bSame).toBe(false);
    });

    it('should have success rates between 0 and 1', () => {
      const report = runRoutingAB({ taskCount: 50 });
      expect(report.variantA.successRate).toBeGreaterThanOrEqual(0);
      expect(report.variantA.successRate).toBeLessThanOrEqual(1);
      expect(report.variantB.successRate).toBeGreaterThanOrEqual(0);
      expect(report.variantB.successRate).toBeLessThanOrEqual(1);
    });

    it('should allocate tasks to all CLIs', () => {
      const report = runRoutingAB({ taskCount: 100 });
      for (const cli of CLI_NAMES) {
        const aCount = report.variantA.cliAllocation.get(cli) ?? 0;
        expect(aCount).toBeGreaterThan(0);
      }
    });

    it('should report allocation diffs', () => {
      const report = runRoutingAB();
      expect(report.allocationDiff.length).toBe(CLI_NAMES.length);
      for (const d of report.allocationDiff) {
        expect([...CLI_NAMES]).toContain(d.cli);
        expect(d.diff).toBe(d.variantACount - d.variantBCount);
      }
    });

    it('should declare a winner', () => {
      const report = runRoutingAB();
      expect(report.winnerBySuccessRate).toBeTruthy();
    });

    it('should include details lines', () => {
      const report = runRoutingAB();
      expect(report.details.length).toBeGreaterThan(0);
    });
  });

  describe('PRESET_VARIANTS', () => {
    it('should have three presets', () => {
      expect(Object.keys(PRESET_VARIANTS)).toHaveLength(3);
    });

    it('should have valid weight sums', () => {
      for (const variant of Object.values(PRESET_VARIANTS)) {
        const sum =
          variant.topsisQualityWeight + variant.topsisCostWeight + variant.topsisLatencyWeight;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('formatABReport', () => {
    it('should include header and winner', () => {
      const report = runRoutingAB();
      const output = formatABReport(report);
      expect(output).toContain('Routing A/B Comparison');
      expect(output).toContain('Winner');
    });

    it('should show both variant names', () => {
      const report = runRoutingAB();
      const output = formatABReport(report);
      expect(output).toContain('Variant A');
      expect(output).toContain('Variant B');
    });

    it('should show allocation diff', () => {
      const report = runRoutingAB();
      const output = formatABReport(report);
      expect(output).toContain('Allocation diff');
    });
  });
});
