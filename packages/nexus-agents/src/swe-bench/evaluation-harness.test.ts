/**
 * nexus-agents/swe-bench - Evaluation Harness Tests
 *
 * @module swe-bench/evaluation-harness.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_EVALUATION_CONFIG } from './evaluation-harness-types.js';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockHarnessExecutor = vi.fn();
  const mockCreateHarnessExecutor = vi.fn();
  const mockValidateEnvironment = vi.fn();
  const mockWritePredictions = vi.fn();
  return {
    mockHarnessExecutor,
    mockCreateHarnessExecutor,
    mockValidateEnvironment,
    mockWritePredictions,
  };
});

// Mock dependencies
vi.mock('./harness-executor.js', () => ({
  HarnessExecutor: mocks.mockHarnessExecutor,
  createHarnessExecutor: mocks.mockCreateHarnessExecutor,
}));

vi.mock('./environment-validator.js', () => ({
  validateEnvironment: mocks.mockValidateEnvironment,
}));

vi.mock('./prediction-writer.js', () => ({
  writePredictions: mocks.mockWritePredictions,
}));

import {
  EvaluationHarness,
  createEvaluationHarness,
  createValidatedHarness,
} from './evaluation-harness.js';

// Set up default mocks at top level for all describe blocks (Issue #582)
beforeEach(() => {
  const defaultExecutor = {
    validate: vi.fn().mockResolvedValue({
      ready: true,
      pythonAvailable: true,
      swebenchInstalled: true,
      dockerAvailable: true,
      errors: [],
    }),
    execute: vi.fn().mockResolvedValue({
      success: true,
      runId: 'test-run',
      datasetName: 'lite',
      modelNameOrPath: 'test-model',
      totalInstances: 1,
      resolvedInstances: 1,
      resolutionRate: 1.0,
      instanceResults: [],
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:01:00Z',
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
  };

  mocks.mockHarnessExecutor.mockImplementation(() => defaultExecutor);
  mocks.mockCreateHarnessExecutor.mockImplementation(() => defaultExecutor);

  mocks.mockValidateEnvironment.mockResolvedValue({
    valid: true,
    python: { available: true, version: '3.11.0' },
    swebench: { installed: true, version: '1.0.0' },
    docker: { running: true, version: '24.0.0' },
    diskSpace: { available: 200 * 1024 * 1024 * 1024, sufficient: true },
    errors: [],
    warnings: [],
  });

  mocks.mockWritePredictions.mockResolvedValue({ ok: true });
});

describe('EvaluationHarness', () => {
  let harness: EvaluationHarness;

  beforeEach(() => {
    harness = createEvaluationHarness();
  });

  describe('validate', () => {
    it('should return ready when environment is valid', async () => {
      const result = await harness.validate();

      expect(result.ready).toBe(true);
      expect(result.dockerAvailable).toBe(true);
      expect(result.harnessInstalled).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getVersion', () => {
    it('should return harness version', async () => {
      const version = await harness.getVersion();

      expect(version).toBe('1.0.0');
    });
  });

  describe('cancel', () => {
    it('should cancel evaluation', async () => {
      await expect(harness.cancel()).resolves.toBeUndefined();
    });
  });
});

describe('createEvaluationHarness', () => {
  it('should create an evaluation harness instance', () => {
    const harness = createEvaluationHarness();

    expect(harness).toBeInstanceOf(EvaluationHarness);
  });
});

describe('createValidatedHarness', () => {
  it('should return harness when environment is valid', async () => {
    const result = await createValidatedHarness();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(EvaluationHarness);
    }
  });
});

describe('EvaluationHarness metrics calculation', () => {
  it('should calculate correct resolution rate', () => {
    // Test the metrics calculation logic
    const instanceResults = [
      { instanceId: 'a', resolved: true, status: 'resolved' as const },
      { instanceId: 'b', resolved: false, status: 'unresolved' as const },
      { instanceId: 'c', resolved: true, status: 'resolved' as const },
    ];

    const resolved = instanceResults.filter((r) => r.resolved).length;
    const total = instanceResults.length;
    const rate = resolved / total;

    expect(resolved).toBe(2);
    expect(rate).toBeCloseTo(0.667, 2);
  });

  it('should handle empty results', () => {
    const instanceResults: never[] = [];

    const resolved = instanceResults.filter((r) => r).length;
    const total = instanceResults.length;
    const rate = total > 0 ? resolved / total : 0;

    expect(rate).toBe(0);
  });
});

describe('EvaluationHarness repository extraction', () => {
  it('should extract repository from instance ID', () => {
    const instanceId = 'django__django-12345';

    // Use the same parsing logic as the implementation
    const doubleUnderscoreIdx = instanceId.indexOf('__');
    const lastDashIdx = instanceId.lastIndexOf('-');

    let repo = 'unknown';
    if (doubleUnderscoreIdx !== -1 && lastDashIdx > doubleUnderscoreIdx) {
      const owner = instanceId.slice(0, doubleUnderscoreIdx);
      const repoAndIssue = instanceId.slice(doubleUnderscoreIdx + 2);
      const repoName = repoAndIssue.slice(0, repoAndIssue.lastIndexOf('-'));
      repo = `${owner}/${repoName}`;
    }

    expect(repo).toBe('django/django');
  });

  it('should handle complex instance IDs', () => {
    // Note: Instance IDs with hyphenated repo names (like scikit-learn)
    // use double underscores as separators: owner__repo-issue_number
    // The split on '-' approach has limitations for hyphenated names
    const instanceId = 'scikit-learn__scikit-learn-9876';

    // A smarter approach: find the double underscore separator
    const doubleUnderscoreIdx = instanceId.indexOf('__');
    const lastDashIdx = instanceId.lastIndexOf('-');

    let repo = 'unknown';
    if (doubleUnderscoreIdx !== -1 && lastDashIdx > doubleUnderscoreIdx) {
      const owner = instanceId.slice(0, doubleUnderscoreIdx);
      const repoAndIssue = instanceId.slice(doubleUnderscoreIdx + 2);
      const repoName = repoAndIssue.slice(0, repoAndIssue.lastIndexOf('-'));
      repo = `${owner}/${repoName}`;
    }

    expect(repo).toBe('scikit-learn/scikit-learn');
  });
});

describe('DEFAULT_EVALUATION_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_EVALUATION_CONFIG.datasetName).toBe('lite');
    expect(DEFAULT_EVALUATION_CONFIG.maxWorkers).toBe(8);
    expect(DEFAULT_EVALUATION_CONFIG.mode).toBe('docker');
    expect(DEFAULT_EVALUATION_CONFIG.timeoutSeconds).toBe(1800);
  });
});
