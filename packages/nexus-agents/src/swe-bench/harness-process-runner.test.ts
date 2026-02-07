/**
 * nexus-agents/swe-bench - Harness Process Runner Tests
 *
 * @module swe-bench/harness-process-runner.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { ILogger } from '../core/logger.js';
import type { HarnessExecutionConfig, HarnessExecutionProgress } from './harness-executor-types.js';
import { HarnessExecutorError } from './harness-executor-types.js';
import type { HarnessProcessContext, ProcessCloseOptions } from './harness-process-runner.js';
import {
  setupProcessHandlers,
  handleStdoutChunk,
  handleProcessClose,
  handleProcessExitAsync,
  parseResultsFile,
} from './harness-process-runner.js';

// ============================================================================
// Mock Dependencies
// ============================================================================

vi.mock('./harness-executor-helpers.js', () => ({
  spawnHarnessProcess: vi.fn(),
  parseProgressLine: vi.fn(() => null),
  parseHarnessLogFile: vi.fn(() => Promise.resolve(null)),
  transformHarnessOutput: vi.fn(() => ({ instanceResults: [], resolvedCount: 0, totalCount: 0 })),
  calculateEstimatedRemaining: vi.fn(() => undefined),
  createInitialProgress: vi.fn((total: number) => ({
    state: 'idle' as const,
    completedCount: 0,
    totalCount: total,
    resolvedCount: 0,
    elapsedMs: 0,
  })),
  getResultsFilePath: vi.fn(() => '/tmp/results.json'),
}));

import {
  parseProgressLine,
  parseHarnessLogFile,
  transformHarnessOutput,
  calculateEstimatedRemaining,
  getResultsFilePath,
} from './harness-executor-helpers.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

function createMockChildProcess(): {
  mock: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  return {
    mock: {
      stdout,
      stderr,
      on: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
    } as unknown as ChildProcess,
    stdout,
    stderr,
  };
}

function createMockConfig(): HarnessExecutionConfig {
  return {
    predictionsPath: '/tmp/predictions.jsonl',
    datasetName: 'lite',
    maxWorkers: 4,
    runId: 'test-run',
    timeoutSeconds: 30,
    outputDir: '/tmp/output',
    useDocker: true,
    cacheLevel: 'env',
  };
}

function createMockContext(logger: ILogger): HarnessProcessContext {
  return {
    logger,
    currentProcess: null,
    isCancelled: false,
  };
}

function createMockProgress(): HarnessExecutionProgress {
  return {
    state: 'idle',
    completedCount: 0,
    totalCount: 10,
    resolvedCount: 0,
    elapsedMs: 0,
  };
}

// ============================================================================
// Tests: handleStdoutChunk
// ============================================================================

describe('handleStdoutChunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call parseProgressLine for each non-empty line', () => {
    const progress = createMockProgress();
    const onProgress = vi.fn();

    handleStdoutChunk('line1\nline2\nline3\n', progress, 1000, onProgress);

    expect(parseProgressLine).toHaveBeenCalledTimes(3);
    expect(parseProgressLine).toHaveBeenCalledWith('line1', expect.any(Object));
    expect(parseProgressLine).toHaveBeenCalledWith('line2', expect.any(Object));
    expect(parseProgressLine).toHaveBeenCalledWith('line3', expect.any(Object));
  });

  it('should call onProgress callback with updated progress', () => {
    const progress = createMockProgress();
    const onProgress = vi.fn();

    (parseProgressLine as Mock).mockReturnValueOnce({ completedCount: 5 });

    handleStdoutChunk('line1\n', progress, 1000, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'running',
        completedCount: 5,
        elapsedMs: expect.any(Number),
      })
    );
  });

  it('should include estimatedRemainingMs when calculateEstimatedRemaining returns a value', () => {
    const progress = createMockProgress();
    const onProgress = vi.fn();

    (calculateEstimatedRemaining as Mock).mockReturnValueOnce(5000);

    handleStdoutChunk('line1\n', progress, 1000, onProgress);

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedRemainingMs: 5000,
      })
    );
  });

  it('should not include estimatedRemainingMs when calculateEstimatedRemaining returns undefined', () => {
    const progress = createMockProgress();
    const onProgress = vi.fn();

    (calculateEstimatedRemaining as Mock).mockReturnValueOnce(undefined);

    handleStdoutChunk('line1\n', progress, 1000, onProgress);

    const callArg = onProgress.mock.calls[0][0] as HarnessExecutionProgress;
    expect(callArg).not.toHaveProperty('estimatedRemainingMs');
  });

  it('should not throw when onProgress is undefined', () => {
    const progress = createMockProgress();

    expect(() => {
      handleStdoutChunk('line1\nline2\n', progress, 1000, undefined);
    }).not.toThrow();

    expect(parseProgressLine).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Tests: handleProcessClose
// ============================================================================

describe('handleProcessClose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject with CANCELLED error when context.isCancelled is true', () => {
    const config = createMockConfig();
    const logger = createMockLogger();
    const context = createMockContext(logger);
    context.isCancelled = true;

    const resolve = vi.fn();
    const reject = vi.fn();

    const options: ProcessCloseOptions = {
      code: 0,
      config,
      stderr: '',
      context,
      resolve,
      reject,
    };

    handleProcessClose(options);

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Execution cancelled',
        code: 'CANCELLED',
      })
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('should call handleProcessExitAsync when not cancelled', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();
    const context = createMockContext(logger);

    const resolve = vi.fn();
    const reject = vi.fn();

    // Mock parseHarnessLogFile to return valid data
    (parseHarnessLogFile as Mock).mockResolvedValueOnce({
      run_id: 'test-run',
      dataset_name: 'lite',
      model_name_or_path: 'test-model',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:30:00Z',
      total_instances: 10,
      predicted_instances: 10,
      resolved_instances: 5,
      instance_results: [],
    });

    const options: ProcessCloseOptions = {
      code: 0,
      config,
      stderr: '',
      context,
      resolve,
      reject,
    };

    handleProcessClose(options);

    // Wait for async handling to complete
    await new Promise((r) => {
      setTimeout(r, 10);
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(reject).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Tests: handleProcessExitAsync
// ============================================================================

describe('handleProcessExitAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw HarnessExecutorError with EXECUTION_FAILED when code !== 0', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    await expect(handleProcessExitAsync(1, config, 'stderr output', logger)).rejects.toThrow(
      HarnessExecutorError
    );

    await expect(handleProcessExitAsync(1, config, 'stderr output', logger)).rejects.toThrow(
      'Harness process exited with code 1'
    );

    await expect(handleProcessExitAsync(1, config, 'stderr output', logger)).rejects.toMatchObject({
      code: 'EXECUTION_FAILED',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Harness process failed',
      expect.any(Error),
      expect.objectContaining({ exitCode: 1 })
    );
  });

  it('should call parseResultsFile when code === 0', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    (parseHarnessLogFile as Mock).mockResolvedValueOnce({
      run_id: 'test-run',
      dataset_name: 'lite',
      model_name_or_path: 'test-model',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:30:00Z',
      total_instances: 10,
      predicted_instances: 10,
      resolved_instances: 5,
      instance_results: [],
    });

    const result = await handleProcessExitAsync(0, config, '', logger);

    expect(getResultsFilePath).toHaveBeenCalledWith(config);
    expect(parseHarnessLogFile).toHaveBeenCalledWith('/tmp/results.json', logger);
    expect(result).toMatchObject({
      success: true,
      runId: 'test-run',
      datasetName: 'lite',
    });
  });
});

// ============================================================================
// Tests: parseResultsFile
// ============================================================================

describe('parseResultsFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw PARSE_ERROR when parseHarnessLogFile returns null', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    (parseHarnessLogFile as Mock).mockResolvedValueOnce(null);

    await expect(parseResultsFile(config, logger)).rejects.toThrow(HarnessExecutorError);
    await expect(parseResultsFile(config, logger)).rejects.toThrow(
      'Failed to parse results from: /tmp/results.json'
    );
    await expect(parseResultsFile(config, logger)).rejects.toMatchObject({
      code: 'PARSE_ERROR',
    });
  });

  it('should return result with correct fields when parsing succeeds', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    const mockRawOutput = {
      run_id: 'test-run-123',
      dataset_name: 'lite',
      model_name_or_path: 'gpt-4o',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:30:00Z',
      total_instances: 20,
      predicted_instances: 20,
      resolved_instances: 15,
      instance_results: [],
    };

    (parseHarnessLogFile as Mock).mockResolvedValueOnce(mockRawOutput);
    (transformHarnessOutput as Mock).mockReturnValueOnce({
      instanceResults: [{ instanceId: 'test-1' }],
      resolvedCount: 15,
      totalCount: 20,
    });

    const result = await parseResultsFile(config, logger);

    expect(result).toMatchObject({
      success: true,
      runId: config.runId,
      datasetName: 'lite',
      modelNameOrPath: 'gpt-4o',
      totalInstances: 20,
      resolvedInstances: 15,
      resolutionRate: 0.75,
      instanceResults: [{ instanceId: 'test-1' }],
      logPath: '/tmp/results.json',
    });
  });

  it('should calculate resolutionRate as 0 when totalCount is 0', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    const mockRawOutput = {
      run_id: 'test-run-empty',
      dataset_name: 'lite',
      model_name_or_path: 'test-model',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:00:01Z',
      total_instances: 0,
      predicted_instances: 0,
      resolved_instances: 0,
      instance_results: [],
    };

    (parseHarnessLogFile as Mock).mockResolvedValueOnce(mockRawOutput);
    (transformHarnessOutput as Mock).mockReturnValueOnce({
      instanceResults: [],
      resolvedCount: 0,
      totalCount: 0,
    });

    const result = await parseResultsFile(config, logger);

    expect(result.resolutionRate).toBe(0);
    expect(result.totalInstances).toBe(0);
    expect(result.resolvedInstances).toBe(0);
  });
});

// ============================================================================
// Tests: setupProcessHandlers
// ============================================================================

describe('setupProcessHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should attach stdout and stderr handlers', () => {
    const { mock: proc, stdout, stderr } = createMockChildProcess();
    const config = createMockConfig();
    const progress = createMockProgress();
    const onProgress = vi.fn();

    setupProcessHandlers(proc, config, progress, 1000, onProgress);

    expect(stdout.listenerCount('data')).toBe(1);
    expect(stderr.listenerCount('data')).toBe(1);
  });

  it('should return stderrCollector and timeoutId', () => {
    const { mock: proc } = createMockChildProcess();
    const config = createMockConfig();
    const progress = createMockProgress();
    const onProgress = vi.fn();

    const result = setupProcessHandlers(proc, config, progress, 1000, onProgress);

    expect(result).toHaveProperty('stderrCollector');
    expect(result.stderrCollector).toHaveProperty('value');
    expect(result.stderrCollector.value).toBe('');
    expect(result).toHaveProperty('timeoutId');
  });

  it('should collect stderr data', () => {
    const { mock: proc, stderr } = createMockChildProcess();
    const config = createMockConfig();
    const progress = createMockProgress();
    const onProgress = vi.fn();

    const { stderrCollector } = setupProcessHandlers(proc, config, progress, 1000, onProgress);

    stderr.emit('data', Buffer.from('error line 1\n'));
    stderr.emit('data', Buffer.from('error line 2\n'));

    expect(stderrCollector.value).toBe('error line 1\nerror line 2\n');
  });

  it('should set timeout and kill process when timeout expires', () => {
    const { mock: proc } = createMockChildProcess();
    const config = createMockConfig();
    const progress = createMockProgress();
    const onProgress = vi.fn();

    setupProcessHandlers(proc, config, progress, 1000, onProgress);

    vi.advanceTimersByTime(config.timeoutSeconds * 1000);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('should use DEFAULT_HARNESS_TIMEOUT_MS when config.timeoutSeconds is 0', () => {
    const { mock: proc } = createMockChildProcess();
    const config = { ...createMockConfig(), timeoutSeconds: 0 };
    const progress = createMockProgress();
    const onProgress = vi.fn();

    setupProcessHandlers(proc, config, progress, 1000, onProgress);

    // Should not kill before DEFAULT_HARNESS_TIMEOUT_MS
    vi.advanceTimersByTime(1000);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('should call handleStdoutChunk when stdout data is emitted', () => {
    const { mock: proc, stdout } = createMockChildProcess();
    const config = createMockConfig();
    const progress = createMockProgress();
    const onProgress = vi.fn();

    setupProcessHandlers(proc, config, progress, 1000, onProgress);

    stdout.emit('data', Buffer.from('stdout line\n'));

    expect(parseProgressLine).toHaveBeenCalled();
  });
});
