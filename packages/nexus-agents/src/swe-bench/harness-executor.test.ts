/**
 * Tests for Harness Executor
 *
 * Tests the SWE-bench harness execution and result parsing.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Create hoisted mocks
const mockExecAsync = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());
const mockFsReadFile = vi.hoisted(() => vi.fn());
const mockFsStat = vi.hoisted(() => vi.fn());
const mockFsMkdir = vi.hoisted(() => vi.fn());

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: mockSpawn,
}));

// Mock node:util
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: mockFsReadFile,
  stat: mockFsStat,
  mkdir: mockFsMkdir,
}));

// Import after mocks
import {
  HarnessExecutor,
  createHarnessExecutor,
  createValidatedExecutor,
  HarnessExecutorError,
  DEFAULT_HARNESS_EXECUTION_CONFIG,
  type HarnessExecutionConfig,
} from './harness-executor.js';
import {
  buildHarnessArgs,
  buildHarnessCommand,
  parseProgressLine,
  transformTestResult,
  transformInstanceResult,
  calculateEstimatedRemaining,
  createInitialProgress,
} from './harness-executor-helpers.js';
import {
  mapTestStatus,
  mapResolutionStatus,
  type RawTestResult,
  type RawInstanceResult,
  type HarnessExecutionProgress,
} from './harness-executor-types.js';

/**
 * Creates a mock child process for testing.
 */
function createMockProcess(): {
  kill: ReturnType<typeof vi.fn>;
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
} {
  const mock = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    killed: false,
    kill: vi.fn(),
  };

  mock.kill.mockImplementation(() => {
    mock.killed = true;
    return true;
  });

  return mock;
}

/**
 * Helper to create command-based mock implementation.
 */
function createCommandMock(
  responses: Record<string, { stdout: string; stderr: string } | Error>
): (cmd: string) => Promise<{ stdout: string; stderr: string }> {
  return (cmd: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        if (response instanceof Error) {
          return Promise.reject(response);
        }
        return Promise.resolve(response);
      }
    }
    return Promise.reject(new Error(`Unexpected command: ${cmd}`));
  };
}

describe('harness-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecAsync.mockReset();
    mockSpawn.mockReset();
    mockFsReadFile.mockReset();
    mockFsStat.mockReset();
    mockFsMkdir.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Type Mapping Tests
  // ==========================================================================

  describe('mapTestStatus', () => {
    it('should map PASSED to passed', () => {
      expect(mapTestStatus('PASSED')).toBe('passed');
    });

    it('should map FAILED to failed', () => {
      expect(mapTestStatus('FAILED')).toBe('failed');
    });

    it('should map ERROR to error', () => {
      expect(mapTestStatus('ERROR')).toBe('error');
    });

    it('should map SKIPPED to skipped', () => {
      expect(mapTestStatus('SKIPPED')).toBe('skipped');
    });

    it('should map TIMEOUT to timeout', () => {
      expect(mapTestStatus('TIMEOUT')).toBe('timeout');
    });

    it('should default to error for unknown status', () => {
      expect(mapTestStatus('UNKNOWN')).toBe('error');
    });
  });

  describe('mapResolutionStatus', () => {
    it('should return resolved when resolved is true', () => {
      const raw: RawInstanceResult = {
        instance_id: 'test-1',
        model_name_or_path: 'test-model',
        resolved: true,
        patch_applied: true,
        tests_passed: 5,
        tests_failed: 0,
        tests_total: 5,
        duration_ms: 1000,
      };
      expect(mapResolutionStatus(raw)).toBe('resolved');
    });

    it('should return error when patch_error is present', () => {
      const raw: RawInstanceResult = {
        instance_id: 'test-1',
        model_name_or_path: 'test-model',
        resolved: false,
        patch_applied: false,
        patch_error: 'Failed to apply patch',
        tests_passed: 0,
        tests_failed: 0,
        tests_total: 0,
        duration_ms: 500,
      };
      expect(mapResolutionStatus(raw)).toBe('error');
    });

    it('should return unresolved when not resolved and no error', () => {
      const raw: RawInstanceResult = {
        instance_id: 'test-1',
        model_name_or_path: 'test-model',
        resolved: false,
        patch_applied: true,
        tests_passed: 3,
        tests_failed: 2,
        tests_total: 5,
        duration_ms: 1000,
      };
      expect(mapResolutionStatus(raw)).toBe('unresolved');
    });
  });

  // ==========================================================================
  // Command Building Tests
  // ==========================================================================

  describe('buildHarnessArgs', () => {
    it('should build basic args', () => {
      const config: HarnessExecutionConfig = {
        predictionsPath: '/path/to/predictions.jsonl',
        datasetName: 'lite',
        maxWorkers: 8,
        runId: 'test-run',
        timeoutSeconds: 1800,
        outputDir: '/output',
        useDocker: true,
        cacheLevel: 'env',
      };

      const args = buildHarnessArgs(config);

      expect(args).toContain('--predictions_path');
      expect(args).toContain('/path/to/predictions.jsonl');
      expect(args).toContain('--dataset_name');
      expect(args).toContain('princeton-nlp/SWE-bench_Lite');
      expect(args).toContain('--max_workers');
      expect(args).toContain('8');
      expect(args).toContain('--run_id');
      expect(args).toContain('test-run');
    });

    it('should include instance_ids when provided', () => {
      const config: HarnessExecutionConfig = {
        ...DEFAULT_HARNESS_EXECUTION_CONFIG,
        instanceIds: ['instance-1', 'instance-2'],
      };

      const args = buildHarnessArgs(config);

      expect(args).toContain('--instance_ids');
      expect(args).toContain('instance-1,instance-2');
    });

    it('should not include instance_ids when empty', () => {
      const config: HarnessExecutionConfig = {
        ...DEFAULT_HARNESS_EXECUTION_CONFIG,
        instanceIds: [],
      };

      const args = buildHarnessArgs(config);

      expect(args).not.toContain('--instance_ids');
    });
  });

  describe('buildHarnessCommand', () => {
    it('should build full command string', () => {
      const config: HarnessExecutionConfig = {
        predictionsPath: '/path/to/predictions.jsonl',
        datasetName: 'verified',
        maxWorkers: 4,
        runId: 'test-run',
        timeoutSeconds: 900,
        outputDir: '/output',
        useDocker: true,
        cacheLevel: 'base',
      };

      const command = buildHarnessCommand(config);

      expect(command).toContain('python3');
      expect(command).toContain('-m swebench.harness.run_evaluation');
      expect(command).toContain('princeton-nlp/SWE-bench_Verified');
    });
  });

  // ==========================================================================
  // Progress Parsing Tests
  // ==========================================================================

  describe('parseProgressLine', () => {
    const baseProgress: HarnessExecutionProgress = {
      state: 'running',
      completedCount: 0,
      totalCount: 100,
      resolvedCount: 0,
      elapsedMs: 0,
    };

    it('should parse progress pattern [X/Y] instance_id', () => {
      const result = parseProgressLine('[5/100] django__django-12345 - evaluating', baseProgress);

      expect(result).not.toBeNull();
      expect(result?.completedCount).toBe(5);
      expect(result?.totalCount).toBe(100);
      expect(result?.currentInstanceId).toBe('django__django-12345');
    });

    it('should parse resolved pattern', () => {
      const result = parseProgressLine('Resolved: 25/50', baseProgress);

      expect(result).not.toBeNull();
      expect(result?.resolvedCount).toBe(25);
    });

    it('should return null for unrecognized lines', () => {
      const result = parseProgressLine('Building container...', baseProgress);

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Result Transformation Tests
  // ==========================================================================

  describe('transformTestResult', () => {
    it('should transform passed test', () => {
      const raw: RawTestResult = {
        test_name: 'test_example',
        status: 'PASSED',
        duration_ms: 100,
      };

      const result = transformTestResult(raw);

      expect(result.testName).toBe('test_example');
      expect(result.status).toBe('passed');
      expect(result.durationMs).toBe(100);
    });

    it('should transform failed test with error', () => {
      const raw: RawTestResult = {
        test_name: 'test_failing',
        status: 'FAILED',
        duration_ms: 50,
        error_message: 'AssertionError: expected 1 to equal 2',
      };

      const result = transformTestResult(raw);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('AssertionError: expected 1 to equal 2');
    });

    it('should handle missing duration', () => {
      const raw: RawTestResult = {
        test_name: 'test_no_duration',
        status: 'PASSED',
      };

      const result = transformTestResult(raw);

      expect(result.durationMs).toBe(0);
    });
  });

  describe('transformInstanceResult', () => {
    it('should transform resolved instance', () => {
      const raw: RawInstanceResult = {
        instance_id: 'django__django-12345',
        model_name_or_path: 'nexus-agents/claude',
        resolved: true,
        patch_applied: true,
        tests_passed: 10,
        tests_failed: 0,
        tests_total: 10,
        duration_ms: 5000,
        test_results: [
          { test_name: 'test_1', status: 'PASSED', duration_ms: 100 },
          { test_name: 'test_2', status: 'PASSED', duration_ms: 200 },
        ],
      };

      const result = transformInstanceResult(raw);

      expect(result.instanceId).toBe('django__django-12345');
      expect(result.resolved).toBe(true);
      expect(result.status).toBe('resolved');
      expect(result.testsPassed).toBe(10);
      expect(result.testResults).toHaveLength(2);
    });

    it('should transform unresolved instance', () => {
      const raw: RawInstanceResult = {
        instance_id: 'flask__flask-1234',
        model_name_or_path: 'nexus-agents/claude',
        resolved: false,
        patch_applied: true,
        tests_passed: 5,
        tests_failed: 3,
        tests_total: 8,
        duration_ms: 3000,
      };

      const result = transformInstanceResult(raw);

      expect(result.resolved).toBe(false);
      expect(result.status).toBe('unresolved');
    });
  });

  // ==========================================================================
  // Utility Function Tests
  // ==========================================================================

  describe('calculateEstimatedRemaining', () => {
    it('should calculate remaining time', () => {
      const remaining = calculateEstimatedRemaining(10, 100, 60000);

      expect(remaining).toBe(540000); // 90 * 6000
    });

    it('should return undefined for zero completed', () => {
      const remaining = calculateEstimatedRemaining(0, 100, 0);

      expect(remaining).toBeUndefined();
    });

    it('should return undefined for zero total', () => {
      const remaining = calculateEstimatedRemaining(10, 0, 60000);

      expect(remaining).toBeUndefined();
    });
  });

  describe('createInitialProgress', () => {
    it('should create initial progress state', () => {
      const progress = createInitialProgress(50);

      expect(progress.state).toBe('idle');
      expect(progress.completedCount).toBe(0);
      expect(progress.totalCount).toBe(50);
      expect(progress.resolvedCount).toBe(0);
      expect(progress.elapsedMs).toBe(0);
    });
  });

  // ==========================================================================
  // HarnessExecutor Tests
  // ==========================================================================

  describe('HarnessExecutor', () => {
    describe('validate', () => {
      it('should return ready=true when all tools available', async () => {
        mockExecAsync.mockImplementation(
          createCommandMock({
            'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
            'import swebench': { stdout: '2.1.0\n', stderr: '' },
            'docker version': { stdout: '24.0.5\n', stderr: '' },
          })
        );

        const executor = createHarnessExecutor();
        const result = await executor.validate();

        expect(result.ready).toBe(true);
        expect(result.pythonAvailable).toBe(true);
        expect(result.swebenchInstalled).toBe(true);
        expect(result.dockerAvailable).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return ready=false when Python missing', async () => {
        mockExecAsync.mockImplementation(
          createCommandMock({
            'python3 --version': new Error('not found'),
            'import swebench': { stdout: '2.1.0\n', stderr: '' },
            'docker version': { stdout: '24.0.5\n', stderr: '' },
          })
        );

        const executor = createHarnessExecutor();
        const result = await executor.validate();

        expect(result.ready).toBe(false);
        expect(result.pythonAvailable).toBe(false);
        expect(result.errors).toContain('Python 3 is not available');
      });

      it('should return ready=false when swebench missing', async () => {
        mockExecAsync.mockImplementation(
          createCommandMock({
            'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
            'import swebench': new Error('ModuleNotFoundError'),
            'pip3 show swebench': { stdout: '', stderr: '' },
            'docker version': { stdout: '24.0.5\n', stderr: '' },
          })
        );

        const executor = createHarnessExecutor();
        const result = await executor.validate();

        expect(result.ready).toBe(false);
        expect(result.swebenchInstalled).toBe(false);
        expect(result.errors).toContain(
          'swebench package is not installed. Install with: pip install swebench'
        );
      });

      it('should return ready=false when Docker not running', async () => {
        mockExecAsync.mockImplementation(
          createCommandMock({
            'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
            'import swebench': { stdout: '2.1.0\n', stderr: '' },
            'docker version': new Error('not running'),
          })
        );

        const executor = createHarnessExecutor();
        const result = await executor.validate();

        expect(result.ready).toBe(false);
        expect(result.dockerAvailable).toBe(false);
      });
    });

    describe('getVersion', () => {
      it('should return swebench version', async () => {
        mockExecAsync.mockResolvedValueOnce({ stdout: '2.1.0\n', stderr: '' });

        const executor = createHarnessExecutor();
        const version = await executor.getVersion();

        expect(version).toBe('2.1.0');
      });

      it('should return unknown when version unavailable', async () => {
        mockExecAsync.mockRejectedValue(new Error('not found'));

        const executor = createHarnessExecutor();
        const version = await executor.getVersion();

        expect(version).toBe('unknown');
      });
    });

    describe('cancel', () => {
      it('should kill the process when cancelled', async () => {
        const executor = createHarnessExecutor();

        // Access private field for testing
        const mockProcess = createMockProcess();
        (executor as unknown as { currentProcess: unknown }).currentProcess = mockProcess;

        await executor.cancel();

        expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      });
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('createHarnessExecutor', () => {
    it('should create an executor instance', () => {
      const executor = createHarnessExecutor();

      expect(executor).toBeInstanceOf(HarnessExecutor);
    });
  });

  describe('createValidatedExecutor', () => {
    it('should return executor and validation result', async () => {
      mockExecAsync.mockImplementation(
        createCommandMock({
          'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
          'import swebench': { stdout: '2.1.0\n', stderr: '' },
          'docker version': { stdout: '24.0.5\n', stderr: '' },
        })
      );

      const { executor, validation } = await createValidatedExecutor();

      expect(executor).toBeInstanceOf(HarnessExecutor);
      expect(validation.ready).toBe(true);
    });
  });

  // ==========================================================================
  // Error Type Tests
  // ==========================================================================

  describe('HarnessExecutorError', () => {
    it('should create error with code', () => {
      const error = new HarnessExecutorError('Test error', 'HARNESS_NOT_FOUND');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('HARNESS_NOT_FOUND');
      expect(error.name).toBe('HarnessExecutorError');
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new HarnessExecutorError('Wrapper error', 'EXECUTION_FAILED', cause);

      expect(error.cause).toBe(cause);
    });
  });

  // ==========================================================================
  // Default Config Tests
  // ==========================================================================

  describe('DEFAULT_HARNESS_EXECUTION_CONFIG', () => {
    it('should have expected defaults', () => {
      expect(DEFAULT_HARNESS_EXECUTION_CONFIG.datasetName).toBe('lite');
      expect(DEFAULT_HARNESS_EXECUTION_CONFIG.maxWorkers).toBe(8);
      expect(DEFAULT_HARNESS_EXECUTION_CONFIG.useDocker).toBe(true);
      expect(DEFAULT_HARNESS_EXECUTION_CONFIG.cacheLevel).toBe('env');
      expect(DEFAULT_HARNESS_EXECUTION_CONFIG.timeoutSeconds).toBe(1800);
    });
  });
});
