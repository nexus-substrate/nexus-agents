/**
 * Unit tests for orchestrate-puppeteer.ts
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fs from 'node:fs';

// Mock setup must happen before imports
const mockTimeProvider = vi.hoisted(() => ({
  now: vi.fn(() => 1000),
  nowIso: vi.fn(() => '2024-01-01T00:00:00.000Z'),
}));

const mockGetTimeProvider = vi.hoisted(() => vi.fn(() => mockTimeProvider));
const mockGetErrorMessage = vi.hoisted(() =>
  vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error)))
);

vi.mock('node:fs');
vi.mock('../core/index.js', async () => {
  const actual = await vi.importActual<typeof import('../core/index.js')>('../core/index.js');
  return {
    ...actual,
    getTimeProvider: mockGetTimeProvider,
    getErrorMessage: mockGetErrorMessage,
  };
});
vi.mock('../agents/orchestration/index.js');
vi.mock('./cli-adapter-agent.js');

import {
  loadPolicyParameters,
  savePolicyParameters,
  createAgentsFromAdapters,
  createPolicyEngine,
  createOrchestrator,
  buildPuppeteerResult,
  executeWithPuppeteer,
} from './orchestrate-puppeteer.js';
import {
  PuppeteerOrchestrator,
  createLearnablePolicy,
  createRuleBasedPolicy,
} from '../agents/orchestration/index.js';
import { CliAdapterAgent } from './cli-adapter-agent.js';
import type { ILogger } from '../core/index.js';
import type { ICliAdapter, CliName } from '../cli-adapters/index.js';
import type { OrchestrateOptions } from './orchestrate-types.js';
import type { PolicyParameters } from '../agents/orchestration/index.js';

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockAdapter(): ICliAdapter {
  return { execute: vi.fn() } as unknown as ICliAdapter;
}

function createMockPuppeteerResult(
  success: boolean,
  output: unknown,
  totalSteps: number,
  trajectoryLength: number
): { ok: boolean; value?: unknown; error?: Error } {
  if (!success) {
    return { ok: false, error: new Error('Execution failed') };
  }
  return {
    ok: true,
    value: {
      success,
      output,
      totalSteps,
      trajectory: Array.from({ length: trajectoryLength }, (_, i) => i + 1),
      totalDurationMs: 100 * totalSteps,
    },
  };
}

describe('orchestrate-puppeteer', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    mockTimeProvider.now.mockReturnValue(1000);
    mockTimeProvider.nowIso.mockReturnValue('2024-01-01T00:00:00.000Z');
  });

  describe('loadPolicyParameters', () => {
    it('should load parameters from existing file', () => {
      const params: PolicyParameters = { weights: [0.1, 0.2], bias: 0.3 };
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(JSON.stringify(params));

      const result = loadPolicyParameters('/path/to/policy.json', mockLogger);

      expect(result).toEqual(params);
      expect(mockLogger.info).toHaveBeenCalledWith('Loaded policy parameters', {
        path: '/path/to/policy.json',
      });
    });

    it('should return undefined when file does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = loadPolicyParameters('/nonexistent.json', mockLogger);

      expect(result).toBeUndefined();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should return undefined and log warning on read error', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = loadPolicyParameters('/error.json', mockLogger);

      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to load policy parameters', {
        path: '/error.json',
        error: 'Read failed',
      });
    });

    it('should return undefined and log warning on JSON parse error', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue('invalid json');

      const result = loadPolicyParameters('/invalid.json', mockLogger);

      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('savePolicyParameters', () => {
    it('should save parameters to file', () => {
      const params: PolicyParameters = { weights: [0.5, 0.6], bias: 0.7 };

      savePolicyParameters('/path/to/policy.json', params, mockLogger);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/policy.json',
        JSON.stringify(params, null, 2)
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Saved policy parameters', {
        path: '/path/to/policy.json',
      });
    });

    it('should log warning on write error', () => {
      const params: PolicyParameters = { weights: [0.5], bias: 0.1 };
      (fs.writeFileSync as Mock).mockImplementation(() => {
        throw new Error('Write failed');
      });

      savePolicyParameters('/error.json', params, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save policy parameters', {
        path: '/error.json',
        error: 'Write failed',
      });
    });
  });

  describe('createAgentsFromAdapters', () => {
    it('should create agents from adapters map', () => {
      const adapters = new Map<CliName, ICliAdapter>([
        ['claude' as CliName, createMockAdapter()],
        ['codex' as CliName, createMockAdapter()],
      ]);

      const agents = createAgentsFromAdapters(adapters);

      expect(agents).toHaveLength(2);
      expect(CliAdapterAgent).toHaveBeenCalledTimes(2);
    });

    it('should return empty array for empty adapters map', () => {
      const agents = createAgentsFromAdapters(new Map());

      expect(agents).toEqual([]);
      expect(CliAdapterAgent).not.toHaveBeenCalled();
    });
  });

  describe('createPolicyEngine', () => {
    it('should create learnable policy when learn option is true', () => {
      const mockPolicy = { loadParameters: vi.fn() };
      (createLearnablePolicy as Mock).mockReturnValue(mockPolicy);

      const engine = createPolicyEngine({ learn: true, task: 'test' }, mockLogger);

      expect(createLearnablePolicy).toHaveBeenCalledWith({ learningRate: 0.01, warmupUpdates: 5 });
      expect(engine).toBe(mockPolicy);
    });

    it('should load saved parameters for learnable policy', () => {
      const mockPolicy = { loadParameters: vi.fn() };
      (createLearnablePolicy as Mock).mockReturnValue(mockPolicy);
      const params: PolicyParameters = { weights: [0.1], bias: 0.2 };
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(JSON.stringify(params));

      createPolicyEngine({ learn: true, task: 'test', policyPath: '/policy.json' }, mockLogger);

      expect(mockPolicy.loadParameters).toHaveBeenCalledWith(params);
    });

    it('should create rule-based policy when learn option is false', () => {
      const mockPolicy = { selectAction: vi.fn() };
      (createRuleBasedPolicy as Mock).mockReturnValue(mockPolicy);

      const engine = createPolicyEngine({ learn: false, task: 'test' }, mockLogger);

      expect(createRuleBasedPolicy).toHaveBeenCalledWith();
      expect(engine).toBe(mockPolicy);
    });
  });

  describe('createOrchestrator', () => {
    it('should create orchestrator with learning enabled', () => {
      createOrchestrator({}, [{}, {}], { learn: true, task: 'test', maxSteps: 10 });

      expect(PuppeteerOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { maxSteps: 10, timeoutMs: 300_000 },
          learningConfig: { enableLearning: true, bufferCapacity: 1000, updateAfterEpisodes: 1 },
        })
      );
    });

    it('should create orchestrator without learning', () => {
      createOrchestrator({}, [{}], { learn: false, task: 'test' });

      expect(PuppeteerOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({ config: { maxSteps: 5, timeoutMs: 300_000 } })
      );
    });

    it('should use default maxSteps of 5 when not specified', () => {
      createOrchestrator({}, [{}], { task: 'test' });

      expect(PuppeteerOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({ config: { maxSteps: 5, timeoutMs: 300_000 } })
      );
    });
  });

  describe('buildPuppeteerResult', () => {
    it('should build result with string output', () => {
      const puppeteerResult = {
        success: true,
        output: 'test output',
        totalSteps: 3,
        trajectory: [1, 2, 3],
        totalDurationMs: 500,
      };
      mockTimeProvider.now.mockReturnValue(2000);

      const result = buildPuppeteerResult(puppeteerResult, 1000, {}, false);

      expect(result).toEqual({
        success: true,
        model: 'puppeteer',
        response: { text: 'test output', durationMs: 500 },
        durationMs: 1000,
        puppeteer: { totalSteps: 3, trajectoryLength: 3 },
      });
    });

    it('should stringify non-string output', () => {
      const puppeteerResult = {
        success: false,
        output: { key: 'value' },
        totalSteps: 2,
        trajectory: [1, 2],
        totalDurationMs: 300,
      };
      mockTimeProvider.now.mockReturnValue(1500);

      const result = buildPuppeteerResult(puppeteerResult, 1000, {}, false);

      expect(result.response.text).toBe('{"key":"value"}');
    });

    it('should include policy stats for learnable policy', () => {
      const puppeteerResult = {
        success: true,
        output: 'output',
        totalSteps: 4,
        trajectory: [1, 2, 3, 4],
        totalDurationMs: 600,
      };
      const mockPolicy = { getStats: vi.fn(() => ({ updates: 5, episodes: 2 })) };
      mockTimeProvider.now.mockReturnValue(2000);

      const result = buildPuppeteerResult(puppeteerResult, 1000, mockPolicy, true);

      expect(result.puppeteer?.policyStats).toEqual({ updates: 5, episodes: 2 });
      expect(mockPolicy.getStats).toHaveBeenCalled();
    });
  });

  describe('executeWithPuppeteer', () => {
    it('should execute task successfully with learnable policy', async () => {
      const adapters = new Map<CliName, ICliAdapter>([['claude' as CliName, createMockAdapter()]]);
      const options: OrchestrateOptions = { learn: true, task: 'test', policyPath: '/policy.json' };
      const mockPolicy = {
        getParameters: vi.fn(() => ({ weights: [0.1], bias: 0.2 })),
        getStats: vi.fn(() => ({ updates: 5, episodes: 2 })),
      };
      const mockOrchestrator = {
        execute: vi.fn(() => Promise.resolve(createMockPuppeteerResult(true, 'result', 2, 2))),
      };

      (CliAdapterAgent as unknown as Mock).mockReturnValue({ id: 'agent-1' });
      (createLearnablePolicy as Mock).mockReturnValue(mockPolicy);
      (PuppeteerOrchestrator as unknown as Mock).mockReturnValue(mockOrchestrator);
      (fs.writeFileSync as Mock).mockImplementation(() => undefined);
      mockTimeProvider.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1500)
        .mockReturnValueOnce(2000);

      const result = await executeWithPuppeteer('test task', adapters, options, mockLogger);

      expect(result.success).toBe(true);
      expect(result.model).toBe('puppeteer');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/policy.json',
        JSON.stringify({ weights: [0.1], bias: 0.2 }, null, 2)
      );
    });

    it('should return error when no adapters available', async () => {
      mockTimeProvider.now.mockReturnValueOnce(1000).mockReturnValueOnce(1100);

      const result = await executeWithPuppeteer(
        'test task',
        new Map(),
        { task: 'test' },
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No CLI adapters available to create agents');
      expect(result.durationMs).toBe(100);
    });

    it('should return error when orchestrator execution fails', async () => {
      const adapters = new Map<CliName, ICliAdapter>([['claude' as CliName, createMockAdapter()]]);
      const mockOrchestrator = {
        execute: vi.fn(() => Promise.resolve(createMockPuppeteerResult(false, '', 0, 0))),
      };

      (CliAdapterAgent as unknown as Mock).mockReturnValue({ id: 'agent-1' });
      (createRuleBasedPolicy as Mock).mockReturnValue({});
      (PuppeteerOrchestrator as unknown as Mock).mockReturnValue(mockOrchestrator);

      let callCount = 0;
      mockTimeProvider.now.mockImplementation(() => {
        callCount += 1;
        return callCount === 1 ? 1000 : 1500;
      });

      const result = await executeWithPuppeteer(
        'test task',
        adapters,
        { task: 'test' },
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
      expect(result.durationMs).toBe(500);
    });

    it('should not save policy when learn is false', async () => {
      const adapters = new Map<CliName, ICliAdapter>([['claude' as CliName, createMockAdapter()]]);
      const mockOrchestrator = {
        execute: vi.fn(() => Promise.resolve(createMockPuppeteerResult(true, 'result', 1, 1))),
      };

      (CliAdapterAgent as unknown as Mock).mockReturnValue({ id: 'agent-1' });
      (createRuleBasedPolicy as Mock).mockReturnValue({});
      (PuppeteerOrchestrator as unknown as Mock).mockReturnValue(mockOrchestrator);
      (fs.writeFileSync as Mock).mockClear();
      mockTimeProvider.now.mockReturnValue(1000);

      await executeWithPuppeteer(
        'test task',
        adapters,
        { learn: false, task: 'test', policyPath: '/policy.json' },
        mockLogger
      );

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should generate unique task ID using timestamp', async () => {
      const adapters = new Map<CliName, ICliAdapter>([['claude' as CliName, createMockAdapter()]]);
      const mockOrchestrator = {
        execute: vi.fn(() => Promise.resolve(createMockPuppeteerResult(true, 'result', 1, 1))),
      };

      (CliAdapterAgent as unknown as Mock).mockReturnValue({ id: 'agent-1' });
      (createRuleBasedPolicy as Mock).mockReturnValue({});
      (PuppeteerOrchestrator as unknown as Mock).mockReturnValue(mockOrchestrator);
      mockTimeProvider.now.mockReturnValue(1234567890);

      await executeWithPuppeteer('test task', adapters, { task: 'test' }, mockLogger);

      expect(mockOrchestrator.execute).toHaveBeenCalledWith({
        task: expect.objectContaining({
          id: 'cli-1234567890',
          description: 'test task',
        }),
      });
    });
  });
});
