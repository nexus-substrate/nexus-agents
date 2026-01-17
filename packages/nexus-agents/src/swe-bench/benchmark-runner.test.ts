/**
 * Tests for Benchmark Runner
 *
 * Tests the benchmark execution loop for SWE-bench.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SWEBenchInstance, SWEBenchConfig } from './types.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';
import { AgentRunnerError } from './agent-runner.js';

// Mock the executors
vi.mock('./cli-agent-executor.js', () => ({
  createCliExecutor: vi.fn(),
  isCliAvailable: vi.fn(),
  CliAgentExecutor: vi.fn(),
}));

vi.mock('./nexus-agent-executor.js', () => ({
  createNexusExecutorFromEnv: vi.fn(),
  NexusAgentExecutor: vi.fn(),
}));

// Mock the agent runner
vi.mock('./agent-runner.js', () => ({
  runAgentOnInstance: vi.fn(),
  AgentRunnerError: class AgentRunnerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AgentRunnerError';
    }
  },
}));

// Mock the prediction writer
vi.mock('./prediction-writer.js', () => ({
  PredictionWriter: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    write: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    writeResult: vi.fn().mockResolvedValue({ ok: true, value: true }),
    close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    getPredictionCount: vi.fn().mockReturnValue(0),
    getOutputPath: vi.fn().mockReturnValue('predictions.jsonl'),
  })),
}));

import {
  createExecutor,
  runBenchmarkInstances,
  type BenchmarkRunOptions,
  type ExecutorWithModel,
} from './benchmark-runner.js';
import { createCliExecutor } from './cli-agent-executor.js';
import { createNexusExecutorFromEnv } from './nexus-agent-executor.js';
import { runAgentOnInstance } from './agent-runner.js';
import { PredictionWriter } from './prediction-writer.js';

const mockCreateCliExecutor = vi.mocked(createCliExecutor);
const mockCreateNexusExecutorFromEnv = vi.mocked(createNexusExecutorFromEnv);
const mockRunAgentOnInstance = vi.mocked(runAgentOnInstance);
const MockPredictionWriter = vi.mocked(PredictionWriter);

describe('benchmark-runner', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  const createMockInstance = (id: string): SWEBenchInstance => ({
    instance_id: id,
    repo: 'django/django',
    base_commit: 'abc123',
    problem_statement: 'Fix the bug',
    created_at: '2024-01-01',
  });

  const createMockExecutor = (): ExecutorWithModel => ({
    execute: vi.fn(),
    getModelId: () => 'claude-sonnet-4',
  });

  // ==========================================================================
  // createExecutor Tests
  // ==========================================================================

  describe('createExecutor', () => {
    it('should return CLI executor when available', async () => {
      const mockExecutor = createMockExecutor();
      mockCreateCliExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });

      const result = await createExecutor(false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getModelId()).toBe('claude-sonnet-4');
      }
      expect(mockCreateCliExecutor).toHaveBeenCalled();
    });

    it('should fall back to API executor when CLI not available', async () => {
      mockCreateCliExecutor.mockResolvedValue({
        ok: false,
        error: new AgentRunnerError('CLI not available'),
      });
      const mockExecutor = createMockExecutor();
      mockCreateNexusExecutorFromEnv.mockReturnValue({
        ok: true,
        value: mockExecutor as never,
      });

      const result = await createExecutor(false);

      expect(result.ok).toBe(true);
      expect(mockCreateNexusExecutorFromEnv).toHaveBeenCalled();
    });

    it('should return error when neither CLI nor API available', async () => {
      mockCreateCliExecutor.mockResolvedValue({
        ok: false,
        error: new AgentRunnerError('CLI not available'),
      });
      mockCreateNexusExecutorFromEnv.mockReturnValue({
        ok: false,
        error: new AgentRunnerError('API key not set'),
      });

      const result = await createExecutor(false);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No executor available');
      }
    });

    it('should pass verbose flag to CLI executor', async () => {
      const mockExecutor = createMockExecutor();
      mockCreateCliExecutor.mockResolvedValue({
        ok: true,
        value: mockExecutor as never,
      });

      await createExecutor(true);

      expect(mockCreateCliExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          onMessage: expect.any(Function),
        })
      );
    });
  });

  // ==========================================================================
  // runBenchmarkInstances Tests
  // ==========================================================================

  describe('runBenchmarkInstances', () => {
    const testConfig: SWEBenchConfig = {
      ...DEFAULT_SWE_BENCH_CONFIG,
      timeout_ms: 5000,
      max_iterations: 3,
    };

    it('should run all instances and return success', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1'), createMockInstance('test-2')];

      mockRunAgentOnInstance.mockResolvedValue({
        ok: true,
        value: {
          instance_id: 'test-1',
          completed: true,
          prediction: {
            instance_id: 'test-1',
            model_name_or_path: 'test-model',
            model_patch: 'patch content',
          },
          duration_ms: 1000,
          tokens_used: 500,
        },
      });

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: false,
        verbose: false,
      };

      const result = await runBenchmarkInstances(executor, options);

      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle failed instances', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1')];

      mockRunAgentOnInstance.mockResolvedValue({
        ok: true,
        value: {
          instance_id: 'test-1',
          completed: false,
          error: 'Patch failed to apply',
          duration_ms: 500,
        },
      });

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: false,
        verbose: false,
      };

      const result = await runBenchmarkInstances(executor, options);

      expect(result.success).toBe(true);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should handle agent runner errors', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1')];

      mockRunAgentOnInstance.mockResolvedValue({
        ok: false,
        error: new AgentRunnerError('Clone failed'),
      });

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: false,
        verbose: false,
      };

      const result = await runBenchmarkInstances(executor, options);

      expect(result.failed).toBe(1);
    });

    it('should return failure when writer fails to open', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1')];

      MockPredictionWriter.mockImplementation(
        () =>
          ({
            open: vi.fn().mockResolvedValue({
              ok: false,
              error: new Error('Cannot write to file'),
            }),
            close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
          }) as never
      );

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: '/invalid/path.jsonl',
        append: false,
        verbose: false,
      };

      const result = await runBenchmarkInstances(executor, options);

      expect(result.success).toBe(false);
      expect(result.completed).toBe(0);
    });

    it('should track total tokens used', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1'), createMockInstance('test-2')];

      let callCount = 0;
      mockRunAgentOnInstance.mockImplementation(() => {
        callCount++;
        const currentCall = callCount;
        return Promise.resolve({
          ok: true,
          value: {
            instance_id: `test-${String(currentCall)}`,
            completed: true,
            prediction: {
              instance_id: `test-${String(currentCall)}`,
              model_name_or_path: 'test',
              model_patch: 'patch',
            },
            duration_ms: 1000,
            tokens_used: currentCall === 1 ? 500 : 300,
          },
        });
      });

      // Reset mock for PredictionWriter to default
      MockPredictionWriter.mockImplementation(
        () =>
          ({
            open: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
            writeResult: vi.fn().mockResolvedValue({ ok: true, value: true }),
            close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
          }) as never
      );

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: false,
        verbose: false,
      };

      const result = await runBenchmarkInstances(executor, options);

      expect(result.tokensUsed).toBe(800);
    });

    it('should use append mode when specified', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1')];

      mockRunAgentOnInstance.mockResolvedValue({
        ok: true,
        value: {
          instance_id: 'test-1',
          completed: true,
          prediction: {
            instance_id: 'test-1',
            model_name_or_path: 'test',
            model_patch: 'patch',
          },
          duration_ms: 1000,
        },
      });

      MockPredictionWriter.mockImplementation(
        () =>
          ({
            open: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
            writeResult: vi.fn().mockResolvedValue({ ok: true, value: true }),
            close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
          }) as never
      );

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: true,
        verbose: false,
      };

      await runBenchmarkInstances(executor, options);

      expect(MockPredictionWriter).toHaveBeenCalledWith(
        expect.objectContaining({
          append: true,
        })
      );
    });

    it('should log progress in verbose mode', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1')];

      mockRunAgentOnInstance.mockResolvedValue({
        ok: true,
        value: {
          instance_id: 'test-1',
          completed: true,
          prediction: {
            instance_id: 'test-1',
            model_name_or_path: 'test',
            model_patch: 'patch',
          },
          duration_ms: 1000,
          tokens_used: 500,
        },
      });

      MockPredictionWriter.mockImplementation(
        () =>
          ({
            open: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
            writeResult: vi.fn().mockResolvedValue({ ok: true, value: true }),
            close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
          }) as never
      );

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: false,
        verbose: true,
      };

      await runBenchmarkInstances(executor, options);

      // Should log instance progress
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test-1'));
    });

    it('should include model name in prediction writer config', async () => {
      const executor = createMockExecutor();
      const instances = [createMockInstance('test-1')];

      mockRunAgentOnInstance.mockResolvedValue({
        ok: true,
        value: {
          instance_id: 'test-1',
          completed: true,
          prediction: {
            instance_id: 'test-1',
            model_name_or_path: 'test',
            model_patch: 'patch',
          },
          duration_ms: 1000,
        },
      });

      MockPredictionWriter.mockImplementation(
        () =>
          ({
            open: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
            writeResult: vi.fn().mockResolvedValue({ ok: true, value: true }),
            close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
          }) as never
      );

      const options: BenchmarkRunOptions = {
        instances,
        config: testConfig,
        outputPath: 'predictions.jsonl',
        append: false,
        verbose: false,
      };

      await runBenchmarkInstances(executor, options);

      expect(MockPredictionWriter).toHaveBeenCalledWith(
        expect.objectContaining({
          modelName: 'nexus-agents/claude-sonnet-4',
        })
      );
    });
  });
});
