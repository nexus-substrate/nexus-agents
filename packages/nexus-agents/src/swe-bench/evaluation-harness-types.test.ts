/**
 * Tests for Evaluation Harness Types
 *
 * Validates type definitions and default values for SWE-bench evaluation.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVALUATION_CONFIG,
  EvaluationHarnessError,
  type EvaluationHarnessConfig,
  type EvaluationCacheLevel,
  type EvaluationMode,
  type TestStatus,
  type ResolutionStatus,
  type InstanceEvaluationResult,
  type EvaluationMetrics,
  type EvaluationRunResult,
  type CompetitorSystem,
  type CompetitorResult,
  type EvaluationProgress,
  type EvaluationPhase,
  type EvaluationErrorCode,
  type EvaluationValidationResult,
  type LeaderboardEntry,
} from './evaluation-harness-types.js';

describe('evaluation-harness-types', () => {
  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('EvaluationHarnessConfig', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_EVALUATION_CONFIG.datasetName).toBe('lite');
      expect(DEFAULT_EVALUATION_CONFIG.maxWorkers).toBe(8);
      expect(DEFAULT_EVALUATION_CONFIG.cacheLevel).toBe('env');
      expect(DEFAULT_EVALUATION_CONFIG.mode).toBe('docker');
      expect(DEFAULT_EVALUATION_CONFIG.timeoutSeconds).toBe(1800);
      expect(DEFAULT_EVALUATION_CONFIG.useModal).toBe(false);
    });

    it('should allow creating custom configurations', () => {
      const config: EvaluationHarnessConfig = {
        datasetName: 'verified',
        predictionsPath: './my-predictions.jsonl',
        maxWorkers: 12,
        runId: 'test-run-1',
        cacheLevel: 'instance',
        mode: 'modal',
        timeoutSeconds: 3600,
        outputDir: './custom-logs',
        useModal: true,
        instanceIds: ['django__django-12345', 'flask__flask-67890'],
        dockerNamespace: '',
      };

      expect(config.datasetName).toBe('verified');
      expect(config.maxWorkers).toBe(12);
      expect(config.instanceIds).toHaveLength(2);
    });
  });

  describe('EvaluationCacheLevel', () => {
    it('should support all cache levels', () => {
      const levels: EvaluationCacheLevel[] = ['none', 'base', 'env', 'instance'];
      expect(levels).toHaveLength(4);
    });
  });

  describe('EvaluationMode', () => {
    it('should support all execution modes', () => {
      const modes: EvaluationMode[] = ['local', 'docker', 'modal'];
      expect(modes).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Result Types Tests
  // ==========================================================================

  describe('TestStatus', () => {
    it('should support all test statuses', () => {
      const statuses: TestStatus[] = ['passed', 'failed', 'error', 'skipped', 'timeout'];
      expect(statuses).toHaveLength(5);
    });
  });

  describe('ResolutionStatus', () => {
    it('should support all resolution statuses', () => {
      const statuses: ResolutionStatus[] = ['resolved', 'unresolved', 'error', 'timeout'];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('InstanceEvaluationResult', () => {
    it('should represent a resolved instance', () => {
      const result: InstanceEvaluationResult = {
        instanceId: 'django__django-12345',
        modelNameOrPath: 'nexus-agents/claude-sonnet-4',
        resolved: true,
        status: 'resolved',
        testResults: [
          { testName: 'test_fix', status: 'passed', durationMs: 100 },
          { testName: 'test_regression', status: 'passed', durationMs: 150 },
        ],
        testsPassed: 2,
        testsFailed: 0,
        testsTotal: 2,
        patchApplied: true,
        durationMs: 5000,
        containerId: 'abc123',
        logPath: './logs/django__django-12345.log',
      };

      expect(result.resolved).toBe(true);
      expect(result.testsPassed).toBe(2);
      expect(result.patchApplied).toBe(true);
    });

    it('should represent a failed instance', () => {
      const result: InstanceEvaluationResult = {
        instanceId: 'flask__flask-67890',
        modelNameOrPath: 'nexus-agents/claude-sonnet-4',
        resolved: false,
        status: 'unresolved',
        testResults: [
          {
            testName: 'test_fix',
            status: 'failed',
            durationMs: 100,
            errorMessage: 'AssertionError',
          },
        ],
        testsPassed: 0,
        testsFailed: 1,
        testsTotal: 1,
        patchApplied: true,
        durationMs: 3000,
      };

      expect(result.resolved).toBe(false);
      expect(result.testsFailed).toBe(1);
    });

    it('should represent a patch application failure', () => {
      const result: InstanceEvaluationResult = {
        instanceId: 'sympy__sympy-11111',
        modelNameOrPath: 'nexus-agents/claude-sonnet-4',
        resolved: false,
        status: 'error',
        testResults: [],
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
        patchApplied: false,
        patchError: 'error: patch failed: sympy/core/expr.py:123',
        durationMs: 500,
      };

      expect(result.patchApplied).toBe(false);
      expect(result.patchError).toContain('patch failed');
    });
  });

  describe('EvaluationMetrics', () => {
    it('should correctly calculate resolution rate', () => {
      const metrics: EvaluationMetrics = {
        totalInstances: 300,
        predictedInstances: 280,
        resolvedInstances: 140,
        resolutionRate: 0.5, // 140 / 280
        patchesApplied: 260,
        patchApplicationRate: 260 / 280,
        timeouts: 5,
        errors: 15,
        avgDurationMs: 120000,
        totalDurationMs: 33600000,
      };

      expect(metrics.resolutionRate).toBe(0.5);
      expect(metrics.patchApplicationRate).toBeCloseTo(0.929, 2);
    });
  });

  describe('EvaluationRunResult', () => {
    it('should contain all required fields', () => {
      const result: EvaluationRunResult = {
        runId: 'eval-2026-01-17',
        datasetName: 'lite',
        modelNameOrPath: 'nexus-agents/claude-sonnet-4',
        startedAt: '2026-01-17T10:00:00Z',
        completedAt: '2026-01-17T18:00:00Z',
        metrics: {
          totalInstances: 300,
          predictedInstances: 300,
          resolvedInstances: 150,
          resolutionRate: 0.5,
          patchesApplied: 280,
          patchApplicationRate: 280 / 300,
          timeouts: 10,
          errors: 10,
          avgDurationMs: 96000,
          totalDurationMs: 28800000,
        },
        repositoryMetrics: [
          {
            repository: 'django/django',
            totalInstances: 50,
            resolvedInstances: 30,
            resolutionRate: 0.6,
          },
          {
            repository: 'flask/flask',
            totalInstances: 20,
            resolvedInstances: 8,
            resolutionRate: 0.4,
          },
        ],
        instanceResults: [],
        config: DEFAULT_EVALUATION_CONFIG,
        harnessVersion: '3.0.0',
      };

      expect(result.runId).toBe('eval-2026-01-17');
      expect(result.repositoryMetrics).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Competitor Comparison Tests
  // ==========================================================================

  describe('CompetitorSystem', () => {
    it('should support all known competitor systems', () => {
      const systems: CompetitorSystem[] = [
        'devin',
        'aider',
        'claude-code',
        'cursor',
        'codex',
        'gpt-engineer',
        'auto-gpt',
        'other',
      ];
      expect(systems).toHaveLength(8);
    });
  });

  describe('CompetitorResult', () => {
    it('should represent competitor benchmark data', () => {
      const result: CompetitorResult = {
        system: 'devin',
        displayName: 'Devin by Cognition',
        variant: 'lite',
        resolutionRate: 0.49,
        resolvedInstances: 147,
        totalInstances: 300,
        avgTokensPerInstance: 50000,
        avgCostPerInstance: 0.5,
        sourceUrl: 'https://devin.ai/benchmark',
        resultDate: '2026-01-01',
      };

      expect(result.system).toBe('devin');
      expect(result.resolutionRate).toBe(0.49);
    });
  });

  // ==========================================================================
  // Progress Tracking Tests
  // ==========================================================================

  describe('EvaluationProgress', () => {
    it('should track evaluation progress', () => {
      const progress: EvaluationProgress = {
        currentInstanceId: 'django__django-12345',
        currentIndex: 50,
        totalInstances: 300,
        completedInstances: 49,
        resolvedSoFar: 25,
        currentResolutionRate: 25 / 49,
        estimatedRemainingMs: 3600000,
        phase: 'evaluating',
      };

      expect(progress.currentResolutionRate).toBeCloseTo(0.51, 2);
    });
  });

  describe('EvaluationPhase', () => {
    it('should support all evaluation phases', () => {
      const phases: EvaluationPhase[] = [
        'initializing',
        'loading_predictions',
        'building_containers',
        'evaluating',
        'aggregating',
        'complete',
      ];
      expect(phases).toHaveLength(6);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('EvaluationHarnessError', () => {
    it('should create error with code', () => {
      const error = new EvaluationHarnessError('Docker not available', 'DOCKER_NOT_AVAILABLE');

      expect(error.name).toBe('EvaluationHarnessError');
      expect(error.message).toBe('Docker not available');
      expect(error.code).toBe('DOCKER_NOT_AVAILABLE');
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new EvaluationHarnessError('Wrapper error', 'UNKNOWN', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('EvaluationErrorCode', () => {
    it('should support all error codes', () => {
      const codes: EvaluationErrorCode[] = [
        'DOCKER_NOT_AVAILABLE',
        'PREDICTIONS_NOT_FOUND',
        'INVALID_PREDICTIONS_FORMAT',
        'HARNESS_NOT_INSTALLED',
        'INSTANCE_TIMEOUT',
        'CONTAINER_FAILED',
        'NETWORK_ERROR',
        'INSUFFICIENT_RESOURCES',
        'UNKNOWN',
      ];
      expect(codes).toHaveLength(9);
    });
  });

  // ==========================================================================
  // Validation Result Tests
  // ==========================================================================

  describe('EvaluationValidationResult', () => {
    it('should represent a ready system', () => {
      const result: EvaluationValidationResult = {
        ready: true,
        dockerAvailable: true,
        dockerVersion: '24.0.7',
        harnessInstalled: true,
        harnessVersion: '3.0.0',
        availableDiskSpace: 200 * 1024 * 1024 * 1024, // 200GB
        availableMemory: 32 * 1024 * 1024 * 1024, // 32GB
        cpuCores: 16,
        errors: [],
        warnings: [],
      };

      expect(result.ready).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should represent an unready system', () => {
      const result: EvaluationValidationResult = {
        ready: false,
        dockerAvailable: false,
        harnessInstalled: false,
        availableDiskSpace: 50 * 1024 * 1024 * 1024, // 50GB
        availableMemory: 8 * 1024 * 1024 * 1024, // 8GB
        cpuCores: 4,
        errors: ['Docker not found', 'swebench package not installed'],
        warnings: ['Low disk space - 50GB available, 120GB recommended'],
      };

      expect(result.ready).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.warnings).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Leaderboard Tests
  // ==========================================================================

  describe('LeaderboardEntry', () => {
    it('should represent a leaderboard entry', () => {
      const entry: LeaderboardEntry = {
        rank: 1,
        modelName: 'OpenHands + CodeAct + Claude 3.5 Sonnet',
        organization: 'All Hands AI',
        liteResolutionRate: 0.53,
        verifiedResolutionRate: 0.49,
        submissionDate: '2026-01-15',
        isAgentSystem: true,
        sourceUrl: 'https://openhands.ai/benchmark',
      };

      expect(entry.rank).toBe(1);
      expect(entry.isAgentSystem).toBe(true);
    });
  });
});
