/**
 * Tests for SWE-bench CLI Command
 *
 * Comprehensive tests covering the CLI command handler, subcommands,
 * and integration with benchmark execution.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { SWEBenchInstance } from './types.js';

// Mock the swe-bench module
vi.mock('./index.js', () => ({
  loadDataset: vi.fn(),
  getDatasetInfo: vi.fn(),
  getCompletedInstanceIds: vi.fn(),
  createExecutor: vi.fn(),
  runBenchmarkInstances: vi.fn(),
  DEFAULT_SWE_BENCH_CONFIG: {
    variant: 'lite',
    model: 'auto',
    output_path: './swe-bench-predictions.jsonl',
    resume: false,
    timeout_ms: 600000,
    max_iterations: 20,
    work_dir: '/tmp/swe-bench',
  },
  DatasetLoadError: class DatasetLoadError extends Error {
    override readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
      super(message);
      this.name = 'DatasetLoadError';
      this.cause = cause;
    }
  },
}));

// Import the command module after mocking
import { sweBenchCommand, parseSweBenchArgs, printSweBenchHelp } from '../cli/swe-bench-command.js';

import {
  loadDataset,
  getDatasetInfo,
  getCompletedInstanceIds,
  createExecutor,
  runBenchmarkInstances,
  DatasetLoadError,
} from './index.js';

const mockLoadDataset = vi.mocked(loadDataset);
const mockGetDatasetInfo = vi.mocked(getDatasetInfo);
const mockGetCompletedInstanceIds = vi.mocked(getCompletedInstanceIds);
const mockCreateExecutor = vi.mocked(createExecutor);
const mockRunBenchmarkInstances = vi.mocked(runBenchmarkInstances);

describe('swe-bench-command', () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ==========================================================================
  // Help Command Tests
  // ==========================================================================

  describe('help command', () => {
    it('should print help and return 0 for --help flag', async () => {
      const exitCode = await sweBenchCommand(['--help']);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Usage: nexus-agents swe-bench');
      expect(output).toContain('Subcommands:');
    });

    it('should print help and return 0 for -h flag', async () => {
      const exitCode = await sweBenchCommand(['-h']);

      expect(exitCode).toBe(0);
    });

    it('should print help and return 0 for empty args', async () => {
      const exitCode = await sweBenchCommand([]);

      expect(exitCode).toBe(0);
    });

    it('printSweBenchHelp should display all subcommands', () => {
      printSweBenchHelp();

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('run');
      expect(output).toContain('status');
      expect(output).toContain('info');
      expect(output).toContain('evaluate');
    });

    it('printSweBenchHelp should display all options', () => {
      printSweBenchHelp();

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('--variant');
      expect(output).toContain('--limit');
      expect(output).toContain('--output');
      expect(output).toContain('--resume');
      expect(output).toContain('--instance');
      expect(output).toContain('--verbose');
    });
  });

  // ==========================================================================
  // Info Subcommand Tests
  // ==========================================================================

  describe('info subcommand', () => {
    it('should display dataset info for lite variant', async () => {
      mockGetDatasetInfo.mockReturnValue({
        variant: 'lite',
        num_instances: 300,
        repositories: ['django/django', 'flask/flask'],
        hf_dataset_id: 'princeton-nlp/SWE-bench_Lite',
      });

      const exitCode = await sweBenchCommand(['info']);

      expect(exitCode).toBe(0);
      expect(mockGetDatasetInfo).toHaveBeenCalledWith('lite');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('SWE-bench Dataset:'));
    });

    it('should display repository list with --verbose flag', async () => {
      mockGetDatasetInfo.mockReturnValue({
        variant: 'lite',
        num_instances: 300,
        repositories: ['django/django', 'flask/flask'],
        hf_dataset_id: 'princeton-nlp/SWE-bench_Lite',
      });

      const exitCode = await sweBenchCommand(['info', '--verbose']);

      expect(exitCode).toBe(0);
      // The verbose flag triggers printing the repository list
      expect(consoleLogSpy).toHaveBeenCalledWith('\nRepositories:');
    });

    it('should display verified variant info', async () => {
      mockGetDatasetInfo.mockReturnValue({
        variant: 'verified',
        num_instances: 500,
        repositories: ['django/django'],
        hf_dataset_id: 'princeton-nlp/SWE-bench_Verified',
      });

      const exitCode = await sweBenchCommand(['info', '--variant=verified']);

      expect(exitCode).toBe(0);
      expect(mockGetDatasetInfo).toHaveBeenCalledWith('verified');
    });
  });

  // ==========================================================================
  // Status Subcommand Tests
  // ==========================================================================

  describe('status subcommand', () => {
    it('should show zero predictions when file does not exist', async () => {
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });

      const exitCode = await sweBenchCommand(['status']);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith('Completed predictions: 0');
    });

    it('should show completed prediction count', async () => {
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: true,
        value: new Set(['instance-1', 'instance-2', 'instance-3']),
      });

      const exitCode = await sweBenchCommand(['status']);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith('Completed predictions: 3');
    });

    it('should use custom output path', async () => {
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: true,
        value: new Set(['instance-1']),
      });

      await sweBenchCommand(['status', '--output=custom.jsonl']);

      expect(consoleLogSpy).toHaveBeenCalledWith('Output file: custom.jsonl');
    });
  });

  // ==========================================================================
  // Run Subcommand Tests
  // ==========================================================================

  describe('run subcommand', () => {
    const createMockInstance = (id: string): SWEBenchInstance => ({
      instance_id: id,
      repo: 'django/django',
      base_commit: 'abc123',
      problem_statement: 'Fix bug',
      created_at: '2024-01-01',
    });

    const createMockExecutorWithModel = (): {
      execute: ReturnType<typeof vi.fn>;
      getModelId: () => string;
    } => ({
      execute: vi.fn().mockResolvedValue({ ok: true, value: { response: 'test' } }),
      getModelId: () => 'claude-sonnet-4',
    });

    it('should return 1 when executor creation fails', async () => {
      mockCreateExecutor.mockResolvedValue({
        ok: false,
        error: new Error('No executor available'),
      });

      const exitCode = await sweBenchCommand(['run', '--limit=1']);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    });

    it('should return 1 when dataset loading fails', async () => {
      const mockExecutor = createMockExecutorWithModel();
      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });
      mockLoadDataset.mockResolvedValue({
        ok: false,
        error: new DatasetLoadError('Network error', new Error('fetch failed')),
      });

      const exitCode = await sweBenchCommand(['run', '--limit=1']);

      expect(exitCode).toBe(1);
    });

    it('should return 0 when no instances to run', async () => {
      const mockExecutor = createMockExecutorWithModel();
      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });
      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances: [],
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 0,
          filtered: 0,
          durationMs: 100,
        },
      });
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });

      const exitCode = await sweBenchCommand(['run', '--limit=1']);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith('\nNo instances to run.');
    });

    it('should run benchmark with specified limit', async () => {
      const mockExecutor = createMockExecutorWithModel();
      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });
      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances: [createMockInstance('test-1'), createMockInstance('test-2')],
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 2,
          filtered: 0,
          durationMs: 100,
        },
      });
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });
      mockRunBenchmarkInstances.mockResolvedValue({
        success: true,
        message: 'Completed 2/2 instances',
        total: 2,
        completed: 2,
        failed: 0,
        tokensUsed: 1000,
        outputPath: 'predictions.jsonl',
      });

      const exitCode = await sweBenchCommand(['run', '--limit=2']);

      expect(exitCode).toBe(0);
      expect(mockRunBenchmarkInstances).toHaveBeenCalled();
    });

    it('should filter instances when --instance is specified', async () => {
      const mockExecutor = createMockExecutorWithModel();
      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });
      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances: [
            createMockInstance('django__django-12345'),
            createMockInstance('flask__flask-67890'),
          ],
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 2,
          filtered: 0,
          durationMs: 100,
        },
      });
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });
      mockRunBenchmarkInstances.mockResolvedValue({
        success: true,
        message: 'Completed 1/1 instances',
        total: 1,
        completed: 1,
        failed: 0,
        tokensUsed: 500,
        outputPath: 'predictions.jsonl',
      });

      const exitCode = await sweBenchCommand(['run', '--instance=django__django-12345']);

      expect(exitCode).toBe(0);
      const callArgs = mockRunBenchmarkInstances.mock.calls[0];
      const options = callArgs?.[1] as { instances: readonly SWEBenchInstance[] };
      expect(options?.instances).toHaveLength(1);
      expect(options?.instances[0]?.instance_id).toBe('django__django-12345');
    });

    it('should resume from checkpoint when --resume is specified', async () => {
      const mockExecutor = createMockExecutorWithModel();
      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });
      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances: [
            createMockInstance('test-1'),
            createMockInstance('test-2'),
            createMockInstance('test-3'),
          ],
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 3,
          filtered: 0,
          durationMs: 100,
        },
      });
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: true,
        value: new Set(['test-1']),
      });
      mockRunBenchmarkInstances.mockResolvedValue({
        success: true,
        message: 'Completed 2/2 instances',
        total: 2,
        completed: 2,
        failed: 0,
        tokensUsed: 800,
        outputPath: 'predictions.jsonl',
      });

      const exitCode = await sweBenchCommand(['run', '--resume']);

      expect(exitCode).toBe(0);
      const callArgs = mockRunBenchmarkInstances.mock.calls[0];
      const options = callArgs?.[1] as { instances: readonly SWEBenchInstance[]; append: boolean };
      // Should have filtered out test-1 which was already completed
      expect(options?.instances).toHaveLength(2);
      expect(options?.append).toBe(true);
    });

    it('should handle benchmark failure gracefully', async () => {
      const mockExecutor = createMockExecutorWithModel();
      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });
      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances: [createMockInstance('test-1')],
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 1,
          filtered: 0,
          durationMs: 100,
        },
      });
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });
      mockRunBenchmarkInstances.mockResolvedValue({
        success: false,
        message: 'Failed to run benchmark',
        total: 1,
        completed: 0,
        failed: 1,
        tokensUsed: 0,
        outputPath: 'predictions.jsonl',
      });

      const exitCode = await sweBenchCommand(['run', '--limit=1']);

      expect(exitCode).toBe(1);
    });
  });

  // ==========================================================================
  // Evaluate Subcommand Tests
  // ==========================================================================

  describe('evaluate subcommand', () => {
    it('should return 1 when no predictions file exists', async () => {
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });

      const exitCode = await sweBenchCommand(['evaluate']);

      expect(exitCode).toBe(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'No predictions file. Run "nexus-agents swe-bench run" first.'
      );
    });

    it('should return 1 when predictions file is empty', async () => {
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: true,
        value: new Set(),
      });

      const exitCode = await sweBenchCommand(['evaluate']);

      expect(exitCode).toBe(1);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should catch and report unexpected errors', async () => {
      mockGetDatasetInfo.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const exitCode = await sweBenchCommand(['info']);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Unexpected error');
    });

    it('should handle non-Error exceptions', async () => {
      mockGetDatasetInfo.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal -- Testing non-Error throw handling
        throw 'string error'; // NOSONAR
      });

      const exitCode = await sweBenchCommand(['info']);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: string error');
    });
  });

  // ==========================================================================
  // Argument Parsing Tests (Extended)
  // ==========================================================================

  describe('parseSweBenchArgs (extended)', () => {
    it('should handle arguments after subcommand', () => {
      const options = parseSweBenchArgs(['run', '--variant=full', '--limit=100', '--verbose']);

      expect(options.subcommand).toBe('run');
      expect(options.variant).toBe('full');
      expect(options.limit).toBe(100);
      expect(options.verbose).toBe(true);
    });

    it('should parse NaN limit as NaN', () => {
      const options = parseSweBenchArgs(['run', '--limit=invalid']);

      expect(Number.isNaN(options.limit)).toBe(true);
    });

    it('should handle empty --instance value', () => {
      const options = parseSweBenchArgs(['run', '--instance=']);

      expect(options.instances).toEqual(['']);
    });

    it('should preserve order of multiple instances', () => {
      const options = parseSweBenchArgs([
        'run',
        '--instance=first',
        '--instance=second',
        '--instance=third',
      ]);

      expect(options.instances).toEqual(['first', 'second', 'third']);
    });

    it('should handle mixed flag ordering', () => {
      const options = parseSweBenchArgs([
        'run',
        '-v',
        '--output=test.jsonl',
        '--resume',
        '--variant=verified',
      ]);

      expect(options.verbose).toBe(true);
      expect(options.output).toBe('test.jsonl');
      expect(options.resume).toBe(true);
      expect(options.variant).toBe('verified');
    });
  });
});

// =============================================================================
// Integration Tests for Dataset Loading
// =============================================================================

describe('swe-bench dataset integration', () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('dataset filtering', () => {
    const createMockInstance = (id: string): SWEBenchInstance => ({
      instance_id: id,
      repo: 'django/django',
      base_commit: 'abc123',
      problem_statement: 'Fix bug',
      created_at: '2024-01-01',
    });

    it('should filter by repository pattern', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({ ok: true, value: { response: 'test' } }),
        getModelId: () => 'claude-sonnet-4',
      };

      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });

      const instances = [
        createMockInstance('django__django-12345'),
        createMockInstance('flask__flask-67890'),
        createMockInstance('django__django-11111'),
      ];

      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances,
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 3,
          filtered: 0,
          durationMs: 100,
        },
      });

      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });

      mockRunBenchmarkInstances.mockResolvedValue({
        success: true,
        message: 'Completed',
        total: 2,
        completed: 2,
        failed: 0,
        tokensUsed: 1000,
        outputPath: 'predictions.jsonl',
      });

      await sweBenchCommand([
        'run',
        '--instance=django__django-12345',
        '--instance=django__django-11111',
      ]);

      const callArgs = mockRunBenchmarkInstances.mock.calls[0];
      const options = callArgs?.[1] as { instances: readonly SWEBenchInstance[] };
      expect(options?.instances).toHaveLength(2);
      const instanceIds = options?.instances.map((i) => i.instance_id);
      expect(instanceIds).toContain('django__django-12345');
      expect(instanceIds).toContain('django__django-11111');
      expect(instanceIds).not.toContain('flask__flask-67890');
    });

    it('should apply limit after filtering', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({ ok: true, value: { response: 'test' } }),
        getModelId: () => 'claude-sonnet-4',
      };

      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });

      const instances = [
        createMockInstance('test-1'),
        createMockInstance('test-2'),
        createMockInstance('test-3'),
        createMockInstance('test-4'),
        createMockInstance('test-5'),
      ];

      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances,
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 5,
          filtered: 0,
          durationMs: 100,
        },
      });

      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: false,
        error: new Error('File not found'),
      });

      mockRunBenchmarkInstances.mockResolvedValue({
        success: true,
        message: 'Completed',
        total: 2,
        completed: 2,
        failed: 0,
        tokensUsed: 1000,
        outputPath: 'predictions.jsonl',
      });

      await sweBenchCommand(['run', '--limit=2']);

      const callArgs = mockRunBenchmarkInstances.mock.calls[0];
      const options = callArgs?.[1] as { instances: readonly SWEBenchInstance[] };
      expect(options?.instances).toHaveLength(2);
    });

    it('should combine resume and limit correctly', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({ ok: true, value: { response: 'test' } }),
        getModelId: () => 'claude-sonnet-4',
      };

      mockCreateExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });

      const instances = [
        createMockInstance('test-1'),
        createMockInstance('test-2'),
        createMockInstance('test-3'),
        createMockInstance('test-4'),
      ];

      mockLoadDataset.mockResolvedValue({
        ok: true,
        value: {
          instances,
          info: {
            variant: 'lite',
            num_instances: 300,
            repositories: [],
            hf_dataset_id: 'test',
          },
          count: 4,
          filtered: 0,
          durationMs: 100,
        },
      });

      // test-1 and test-2 are already completed
      mockGetCompletedInstanceIds.mockResolvedValue({
        ok: true,
        value: new Set(['test-1', 'test-2']),
      });

      mockRunBenchmarkInstances.mockResolvedValue({
        success: true,
        message: 'Completed',
        total: 1,
        completed: 1,
        failed: 0,
        tokensUsed: 500,
        outputPath: 'predictions.jsonl',
      });

      // With resume, should filter out completed, then apply limit
      await sweBenchCommand(['run', '--resume', '--limit=1']);

      const callArgs = mockRunBenchmarkInstances.mock.calls[0];
      const options = callArgs?.[1] as { instances: readonly SWEBenchInstance[] };
      // After filtering completed (2), we have test-3 and test-4, limit=1 -> test-3
      expect(options?.instances).toHaveLength(1);
      expect(options?.instances[0]?.instance_id).toBe('test-3');
    });
  });
});

// =============================================================================
// Config Builder Tests
// =============================================================================

describe('config building', () => {
  it('should use default config values', () => {
    const options = parseSweBenchArgs(['run']);

    expect(options.variant).toBe('lite');
    expect(options.output).toBe('predictions.jsonl');
    expect(options.resume).toBe(false);
  });

  it('should override defaults with command line options', () => {
    const options = parseSweBenchArgs([
      'run',
      '--variant=verified',
      '--output=custom.jsonl',
      '--resume',
      '--limit=50',
    ]);

    expect(options.variant).toBe('verified');
    expect(options.output).toBe('custom.jsonl');
    expect(options.resume).toBe(true);
    expect(options.limit).toBe(50);
  });
});
