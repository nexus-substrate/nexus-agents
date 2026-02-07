/**
 * Tests for HarnessExecutor implementation.
 * @module swe-bench/harness-executor-impl.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '../core/logger.js';
import { HarnessExecutorError } from './harness-executor-types.js';
import { HarnessExecutor } from './harness-executor-impl.js';

vi.mock('./harness-executor-helpers.js', () => ({
  getPythonVersion: vi.fn(() => Promise.resolve('3.11.0')),
  getSwebenchVersion: vi.fn(() => Promise.resolve('2.1.0')),
  getDockerVersion: vi.fn(() => Promise.resolve('24.0.6')),
  validatePredictionsFile: vi.fn(() => Promise.resolve({ valid: true, lineCount: 10 })),
  ensureOutputDir: vi.fn(() => Promise.resolve()),
}));

vi.mock('./harness-process-runner.js', () => ({
  runHarnessProcess: vi.fn(() =>
    Promise.resolve({
      success: true,
      runId: 'test-run',
      datasetName: 'lite',
      modelNameOrPath: 'test-model',
      totalInstances: 10,
      resolvedInstances: 5,
      resolutionRate: 0.5,
      instanceResults: [],
      logPath: '/tmp/results.json',
    })
  ),
}));

vi.mock('../core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

function createMockLogger(): ILogger {
  const mock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
  return mock;
}

describe('HarnessExecutor', () => {
  let executor: HarnessExecutor;
  let logger: ILogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    executor = new HarnessExecutor(logger);
  });

  describe('validate', () => {
    it('should return ready when all tools available', async () => {
      const result = await executor.validate();

      expect(result.ready).toBe(true);
      expect(result.pythonAvailable).toBe(true);
      expect(result.swebenchInstalled).toBe(true);
      expect(result.dockerAvailable).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return not ready when python missing', async () => {
      const { getPythonVersion } = await import('./harness-executor-helpers.js');
      vi.mocked(getPythonVersion).mockResolvedValueOnce(null);

      const result = await executor.validate();

      expect(result.ready).toBe(false);
      expect(result.pythonAvailable).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return not ready when swebench missing', async () => {
      const { getSwebenchVersion } = await import('./harness-executor-helpers.js');
      vi.mocked(getSwebenchVersion).mockResolvedValueOnce(null);

      const result = await executor.validate();

      expect(result.ready).toBe(false);
      expect(result.swebenchInstalled).toBe(false);
    });

    it('should return not ready when docker missing', async () => {
      const { getDockerVersion } = await import('./harness-executor-helpers.js');
      vi.mocked(getDockerVersion).mockResolvedValueOnce(null);

      const result = await executor.validate();

      expect(result.ready).toBe(false);
      expect(result.dockerAvailable).toBe(false);
    });

    it('should include python version when available', async () => {
      const result = await executor.validate();
      expect(result.pythonVersion).toBe('3.11.0');
    });

    it('should collect all errors when multiple tools missing', async () => {
      const helpers = await import('./harness-executor-helpers.js');
      vi.mocked(helpers.getPythonVersion).mockResolvedValueOnce(null);
      vi.mocked(helpers.getSwebenchVersion).mockResolvedValueOnce(null);
      vi.mocked(helpers.getDockerVersion).mockResolvedValueOnce(null);

      const result = await executor.validate();

      expect(result.ready).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('execute', () => {
    it('should return execution result on success', async () => {
      const config = {
        predictionsPath: '/tmp/preds.jsonl',
        datasetName: 'lite' as const,
        maxWorkers: 4,
        runId: 'test-run',
        timeoutSeconds: 30,
        outputDir: '/tmp/output',
        useDocker: true,
        cacheLevel: 'env' as const,
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should throw HARNESS_NOT_FOUND when env not ready', async () => {
      const helpers = await import('./harness-executor-helpers.js');
      vi.mocked(helpers.getPythonVersion).mockResolvedValueOnce(null);
      vi.mocked(helpers.getSwebenchVersion).mockResolvedValueOnce(null);
      vi.mocked(helpers.getDockerVersion).mockResolvedValueOnce(null);

      const config = {
        predictionsPath: '/tmp/preds.jsonl',
        datasetName: 'lite' as const,
        maxWorkers: 4,
        runId: 'test-run',
        timeoutSeconds: 30,
        outputDir: '/tmp/output',
        useDocker: true,
        cacheLevel: 'env' as const,
      };

      await expect(executor.execute(config)).rejects.toThrow(HarnessExecutorError);
    });

    it('should throw INVALID_PREDICTIONS when file invalid', async () => {
      const helpers = await import('./harness-executor-helpers.js');
      vi.mocked(helpers.validatePredictionsFile).mockResolvedValueOnce({
        valid: false,
        error: 'empty file',
        lineCount: 0,
      });

      const config = {
        predictionsPath: '/tmp/preds.jsonl',
        datasetName: 'lite' as const,
        maxWorkers: 4,
        runId: 'test-run',
        timeoutSeconds: 30,
        outputDir: '/tmp/output',
        useDocker: true,
        cacheLevel: 'env' as const,
      };

      await expect(executor.execute(config)).rejects.toThrow('Invalid predictions file');
    });
  });

  describe('cancel', () => {
    it('should set isCancelled flag', async () => {
      await executor.cancel();
      // Verify by checking that logger was called
      expect(logger.info).toHaveBeenCalledWith('Cancelling harness execution');
    });
  });

  describe('getVersion', () => {
    it('should return swebench version', async () => {
      const version = await executor.getVersion();
      expect(version).toBe('2.1.0');
    });

    it('should return unknown when version not available', async () => {
      const { getSwebenchVersion } = await import('./harness-executor-helpers.js');
      vi.mocked(getSwebenchVersion).mockResolvedValueOnce(null);

      const version = await executor.getVersion();
      expect(version).toBe('unknown');
    });
  });
});
