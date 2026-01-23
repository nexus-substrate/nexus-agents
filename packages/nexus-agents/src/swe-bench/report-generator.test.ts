/**
 * nexus-agents/swe-bench - Report Generator Tests
 *
 * @module swe-bench/report-generator.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportGenerator, createReportGenerator, generateReport } from './report-generator.js';
import type { EvaluationRunResult, InstanceEvaluationResult } from './evaluation-harness-types.js';
import type { ReportConfig } from './evaluation-report-types.js';
import { DEFAULT_REPORT_CONFIG } from './evaluation-report-types.js';

// Mock fs for export tests
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('ReportGenerator', () => {
  let generator: ReportGenerator;

  const createMockResult = (overrides?: Partial<EvaluationRunResult>): EvaluationRunResult => ({
    runId: 'test-run-123',
    datasetName: 'lite',
    modelNameOrPath: 'test-model',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T01:00:00Z',
    metrics: {
      totalInstances: 10,
      predictedInstances: 10,
      resolvedInstances: 7,
      resolutionRate: 0.7,
      patchesApplied: 9,
      patchApplicationRate: 0.9,
      timeouts: 1,
      errors: 0,
      avgDurationMs: 60000,
      totalDurationMs: 600000,
    },
    repositoryMetrics: [
      { repository: 'django/django', totalInstances: 5, resolvedInstances: 4, resolutionRate: 0.8 },
      { repository: 'flask/flask', totalInstances: 5, resolvedInstances: 3, resolutionRate: 0.6 },
    ],
    instanceResults: [
      {
        instanceId: 'django__django-12345',
        modelNameOrPath: 'test-model',
        resolved: true,
        status: 'resolved',
        testResults: [],
        testsPassed: 5,
        testsFailed: 0,
        testsTotal: 5,
        patchApplied: true,
        durationMs: 50000,
      },
      {
        instanceId: 'django__django-12346',
        modelNameOrPath: 'test-model',
        resolved: false,
        status: 'unresolved',
        testResults: [],
        testsPassed: 3,
        testsFailed: 2,
        testsTotal: 5,
        patchApplied: true,
        durationMs: 70000,
      },
    ] as readonly InstanceEvaluationResult[],
    config: {
      datasetName: 'lite',
      predictionsPath: './predictions.jsonl',
      maxWorkers: 8,
      runId: 'test-run-123',
      cacheLevel: 'env',
      mode: 'docker',
      timeoutSeconds: 1800,
      outputDir: './output',
      useModal: false,
    },
    harnessVersion: '1.0.0',
    ...overrides,
  });

  beforeEach(() => {
    generator = createReportGenerator();
    vi.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate a complete report', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);

      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.repositoryBreakdown).toBeDefined();
      expect(report.failureAnalysis).toBeDefined();
      expect(report.metadata).toBeDefined();
    });

    it('should calculate correct summary values', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);

      expect(report.summary.totalCount).toBe(10);
      expect(report.summary.resolvedCount).toBe(7);
      expect(report.summary.resolutionRate).toBe(0.7);
    });

    it('should calculate repository breakdown', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);

      expect(report.repositoryBreakdown.repositories).toHaveLength(2);
      expect(report.repositoryBreakdown.bestRepository.repository).toBe('django/django');
      expect(report.repositoryBreakdown.worstRepository.repository).toBe('flask/flask');
    });

    it('should analyze failures', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);

      // 3 unresolved out of 10 in metrics
      const totalFailures = Object.values(report.failureAnalysis.byCategory).reduce(
        (a, b) => a + b,
        0
      );
      expect(totalFailures).toBe(1); // Only 1 in instanceResults
    });

    it('should calculate timing statistics', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);

      expect(report.metrics.timing.totalWallTime).toBe(600000);
      expect(report.metrics.timing.instanceDuration.mean).toBeGreaterThan(0);
    });

    it('should include instance details when configured', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG, includeInstanceDetails: true };

      const report = await generator.generate(result, config);

      expect(report.instanceDetails).toBeDefined();
      expect(report.instanceDetails?.resolved.length).toBeGreaterThan(0);
    });

    it('should exclude instance details when not configured', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG, includeInstanceDetails: false };

      const report = await generator.generate(result, config);

      expect(report.instanceDetails).toBeUndefined();
    });
  });

  describe('render', () => {
    it('should render as JSON', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);
      const rendered = await generator.render(report, 'json');

      expect((): unknown => JSON.parse(rendered) as unknown).not.toThrow();
    });

    it('should render as Markdown', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);
      const rendered = await generator.render(report, 'markdown');

      expect(rendered).toContain('# ');
      expect(rendered).toContain('## Summary');
    });

    it('should render as HTML', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);
      const rendered = await generator.render(report, 'html');

      expect(rendered).toContain('<!DOCTYPE html>');
      expect(rendered).toContain('<title>');
    });

    it('should render as CSV', async () => {
      const result = createMockResult();
      const config: ReportConfig = { ...DEFAULT_REPORT_CONFIG };

      const report = await generator.generate(result, config);
      const rendered = await generator.render(report, 'csv');

      expect(rendered).toContain('instance_id,resolved,status');
    });
  });

  describe('save', () => {
    it('should save report to file', async () => {
      const fs = await import('node:fs/promises');
      const result = createMockResult();
      const config: ReportConfig = {
        ...DEFAULT_REPORT_CONFIG,
        outputPath: '/output/report.md',
      };

      const report = await generator.generate(result, config);
      await generator.save(report, config);

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});

describe('createReportGenerator', () => {
  it('should create a report generator instance', () => {
    const generator = createReportGenerator();

    expect(generator).toBeInstanceOf(ReportGenerator);
  });
});

describe('generateReport helper', () => {
  it('should generate report with default config', async () => {
    const result: EvaluationRunResult = {
      runId: 'test',
      datasetName: 'lite',
      modelNameOrPath: 'model',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:01:00Z',
      metrics: {
        totalInstances: 1,
        predictedInstances: 1,
        resolvedInstances: 1,
        resolutionRate: 1.0,
        patchesApplied: 1,
        patchApplicationRate: 1.0,
        timeouts: 0,
        errors: 0,
        avgDurationMs: 1000,
        totalDurationMs: 1000,
      },
      repositoryMetrics: [],
      instanceResults: [],
      config: {
        datasetName: 'lite',
        predictionsPath: './predictions.jsonl',
        maxWorkers: 8,
        runId: 'test',
        cacheLevel: 'env',
        mode: 'docker',
        timeoutSeconds: 1800,
        outputDir: './output',
        useModal: false,
      },
    };

    const report = await generateReport(result);

    expect(report.summary).toBeDefined();
    expect(report.metrics).toBeDefined();
  });
});

describe('DEFAULT_REPORT_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_REPORT_CONFIG.format).toBe('markdown');
    expect(DEFAULT_REPORT_CONFIG.detailLevel).toBe('standard');
    expect(DEFAULT_REPORT_CONFIG.includeInstanceDetails).toBe(true);
  });
});
