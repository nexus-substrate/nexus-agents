/**
 * Tests for enriched dry-run report generation.
 */
import { describe, it, expect } from 'vitest';
import { buildDryRunReport, renderDryRunText } from './orchestrate-dry-run.js';
import type { CliTask } from '../cli-adapters/index.js';
import type { CompositeRoutingDecision } from '../cli-adapters/index.js';

function makeTask(content: string): CliTask {
  return { content };
}

function makeDecision(
  cliName: 'claude' | 'gemini' | 'codex' | 'opencode'
): CompositeRoutingDecision {
  return {
    cliName,
    reason: 'test routing',
    confidence: 0.82,
    adapter: {} as CompositeRoutingDecision['adapter'],
  } as CompositeRoutingDecision;
}

describe('buildDryRunReport', () => {
  it('analyzes a simple task and returns structured report', () => {
    const report = buildDryRunReport(
      makeTask('Write a hello world program in Python'),
      makeDecision('codex')
    );
    expect(report.analysis.taskType).toBeTruthy();
    expect(report.analysis.estimatedInputTokens).toBeGreaterThan(0);
    expect(report.analysis.estimatedOutputTokens).toBeGreaterThan(0);
    expect(report.routing.selectedCli).toBe('codex');
    expect(report.routing.confidence).toBe(0.82);
  });

  it('produces cost estimate when model is in canonical registry', () => {
    const report = buildDryRunReport(
      makeTask('Refactor the authentication middleware to use JWT'),
      makeDecision('claude')
    );
    expect(report.costEstimate).toBeDefined();
    if (report.costEstimate !== undefined) {
      expect(report.costEstimate.totalUsd).toBeGreaterThanOrEqual(0);
      expect(report.costEstimate.model).toBeTruthy();
      expect(report.costEstimate.inputUsd + report.costEstimate.outputUsd).toBeCloseTo(
        report.costEstimate.totalUsd,
        6
      );
    }
  });

  it('estimates output tokens as ~60% of input', () => {
    const report = buildDryRunReport(makeTask('x'.repeat(4000)), makeDecision('gemini'));
    const ratio = report.analysis.estimatedOutputTokens / report.analysis.estimatedInputTokens;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(0.7);
  });
});

describe('renderDryRunText', () => {
  it('renders human-readable report with all sections', () => {
    const report = buildDryRunReport(
      makeTask('Analyze this codebase for security vulnerabilities'),
      makeDecision('claude')
    );
    const text = renderDryRunText(report);
    expect(text).toContain('[DRY RUN]');
    expect(text).toContain('Task Analysis:');
    expect(text).toContain('Routing:');
    expect(text).toContain('Run without --dry-run to execute.');
  });

  it('includes cost estimate when available', () => {
    const report = buildDryRunReport(makeTask('Write a simple CLI tool'), makeDecision('claude'));
    const text = renderDryRunText(report);
    if (report.costEstimate !== undefined) {
      expect(text).toContain('Cost Estimate:');
      expect(text).toContain('Total:');
    }
  });
});
