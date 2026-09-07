/**
 * Tests for orchestrate-command CLI
 *
 * (Source: Issue #249 - CLI test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { orchestrateCommand, type OrchestrateOptions } from './orchestrate-command.js';

// Mock the cli-adapters module
vi.mock('../cli-adapters/index.js', () => ({
  getAvailableClis: vi.fn(),
  createAllAdapters: vi.fn(),
  createCompositeRouter: vi.fn(),
  // #3422: orchestrate-dry-run collapses routing arms to display slots; this is
  // a pure mapping (identity for CLI slots), so a real passthrough is correct.
  routingArmDisplaySlot: (arm: string): string =>
    arm.startsWith('api:')
      ? ({
          'api:anthropic': 'claude',
          'api:openai': 'codex',
          'api:google': 'gemini',
          'api:custom-openai': 'opencode',
        }[arm] ?? arm)
      : arm,
}));

// Import mocked modules
import {
  getAvailableClis,
  createAllAdapters,
  createCompositeRouter,
} from '../cli-adapters/index.js';

const mockGetAvailableClis = vi.mocked(getAvailableClis);
const mockCreateAllAdapters = vi.mocked(createAllAdapters);
const mockCreateCompositeRouter = vi.mocked(createCompositeRouter);

describe('orchestrate-command', () => {
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

  describe('when NO routing arm is usable (#5910)', () => {
    // The gate used to be `getAvailableClis().length === 0`, which probes for
    // BINARIES and never consults a credential — so it refused to start even
    // when createAllAdapters would have produced usable `api:*` arms from a
    // provider key under NEXUS_BILLING_MODE=api (#3422).
    const cliOnlyAdapters = (): Map<string, never> => new Map([['claude', {} as never]]);

    it('returns 1 and names BOTH routes when there are no CLIs and no api arms', async () => {
      mockGetAvailableClis.mockResolvedValue([]);
      mockCreateAllAdapters.mockReturnValue(cliOnlyAdapters() as never);

      const exitCode = await orchestrateCommand({ task: 'test task' });

      expect(exitCode).toBe(1);
      const msg = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(msg).toContain('No routing arms available');
      expect(msg).toContain('claude, gemini, codex');
      expect(msg).toContain('ANTHROPIC_API_KEY');
    });

    it('does NOT refuse when a CLI is absent but an api arm exists', async () => {
      // The defect, stated as a test: no binary on PATH, but NEXUS_BILLING_MODE=api
      // plus a provider key produced an `api:anthropic` arm. The old gate
      // returned 1 here before any adapter was consulted.
      const apiAdapter = {
        name: 'api:anthropic',
        healthCheck: vi.fn().mockResolvedValue(true),
        execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'OK' } }),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAvailableClis.mockResolvedValue([]);
      mockCreateAllAdapters.mockReturnValue(
        new Map([['api:anthropic', apiAdapter as never]]) as never
      );
      mockCreateCompositeRouter.mockReturnValue({
        route: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            cliName: 'api:anthropic',
            adapter: apiAdapter,
            confidence: 0.9,
            reason: 'only arm',
          },
        }),
      } as never);

      const exitCode = await orchestrateCommand({ task: 'test task' });

      expect(exitCode).not.toBe(1);
      const msg = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(msg).not.toContain('No routing arms available');
    });

    it('still refuses when construction itself failed', async () => {
      // A DIFFERENT failure, deliberately kept distinct: an empty adapter map
      // is an engine fault, not an operator configuration problem.
      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map());

      const exitCode = await orchestrateCommand({ task: 'test task' });

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create CLI adapters.');
    });
  });

  describe('when adapters cannot be created', () => {
    it('should return exit code 1', async () => {
      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map());

      const options: OrchestrateOptions = { task: 'test task' };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create CLI adapters.');
    });
  });

  describe('with routing (no specific model)', () => {
    const createMockAdapter = (
      name: string
    ): {
      name: string;
      healthCheck: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    } => ({
      name,
      healthCheck: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    });

    it('should route and execute task successfully', async () => {
      const mockAdapter = createMockAdapter('claude');
      mockAdapter.execute.mockResolvedValue({
        ok: true,
        value: {
          text: 'Task response',
          usage: { totalTokens: 100 },
          costUsd: 0.01,
        },
      });

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));
      mockCreateCompositeRouter.mockReturnValue({
        route: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            cliName: 'claude',
            adapter: mockAdapter,
            confidence: 0.9,
            reason: 'Best match',
          },
        }),
      } as never);

      const options: OrchestrateOptions = { task: 'test task' };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(0);
      expect(mockAdapter.execute).toHaveBeenCalled();
      expect(mockAdapter.dispose).toHaveBeenCalled();
    });

    it('should return exit code 1 on routing failure', async () => {
      const mockAdapter = createMockAdapter('claude');

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));
      mockCreateCompositeRouter.mockReturnValue({
        route: vi.fn().mockResolvedValue({
          ok: false,
          error: { message: 'No suitable model found' },
        }),
      } as never);

      const options: OrchestrateOptions = { task: 'test task' };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(1);
    });

    it('should handle dry run without executing', async () => {
      const mockAdapter = createMockAdapter('claude');

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));
      mockCreateCompositeRouter.mockReturnValue({
        route: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            cliName: 'claude',
            adapter: mockAdapter,
            confidence: 0.9,
            reason: 'Best match',
          },
        }),
      } as never);

      const options: OrchestrateOptions = { task: 'test task', dryRun: true };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(0);
      expect(mockAdapter.execute).not.toHaveBeenCalled();
    });
  });

  describe('with specific model', () => {
    const createMockAdapter = (
      name: string
    ): {
      name: string;
      healthCheck: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    } => ({
      name,
      healthCheck: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    });

    it('should use specified model directly', async () => {
      const mockAdapter = createMockAdapter('gemini');
      mockAdapter.execute.mockResolvedValue({
        ok: true,
        value: { text: 'Gemini response' },
      });

      mockGetAvailableClis.mockResolvedValue(['claude', 'gemini']);
      mockCreateAllAdapters.mockReturnValue(
        new Map([
          ['claude', createMockAdapter('claude') as never],
          ['gemini', mockAdapter as never],
        ])
      );

      const options: OrchestrateOptions = { task: 'test task', model: 'gemini' };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(0);
      expect(mockAdapter.execute).toHaveBeenCalled();
    });

    it('should return exit code 1 if specified model unavailable', async () => {
      const mockAdapter = createMockAdapter('claude');

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));

      const options: OrchestrateOptions = { task: 'test task', model: 'codex' };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(1);
    });

    it('should return exit code 1 on execution failure', async () => {
      const mockAdapter = createMockAdapter('claude');
      mockAdapter.execute.mockResolvedValue({
        ok: false,
        error: { message: 'Execution failed' },
      });

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));

      const options: OrchestrateOptions = { task: 'test task', model: 'claude' };
      const exitCode = await orchestrateCommand(options);

      expect(exitCode).toBe(1);
    });
  });

  describe('output formatting', () => {
    const createMockAdapter = (
      name: string
    ): {
      name: string;
      healthCheck: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    } => ({
      name,
      healthCheck: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    });

    it('should output JSON format when specified', async () => {
      const mockAdapter = createMockAdapter('claude');
      mockAdapter.execute.mockResolvedValue({
        ok: true,
        value: {
          text: 'Response text',
          usage: { totalTokens: 50 },
          costUsd: 0.005,
        },
      });

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));

      const options: OrchestrateOptions = { task: 'test', model: 'claude', format: 'json' };
      await orchestrateCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect((): unknown => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output) as { success: boolean; model: string; text: string };
      expect(parsed.success).toBe(true);
      expect(parsed.model).toBe('claude');
      expect(parsed.text).toBe('Response text');
    });

    it('should output text format by default', async () => {
      const mockAdapter = createMockAdapter('claude');
      mockAdapter.execute.mockResolvedValue({
        ok: true,
        value: { text: 'Response text' },
      });

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));

      const options: OrchestrateOptions = { task: 'test', model: 'claude' };
      await orchestrateCommand(options);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Task completed using claude');
      expect(output).toContain('Response text');
    });
  });

  describe('verbose output', () => {
    it('should show available CLIs when verbose', async () => {
      const mockAdapter = {
        name: 'claude',
        healthCheck: vi.fn().mockResolvedValue(true),
        execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'OK' } }),
        dispose: vi.fn().mockResolvedValue(undefined),
      };

      mockGetAvailableClis.mockResolvedValue(['claude', 'gemini']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));

      const options: OrchestrateOptions = { task: 'test', model: 'claude', verbose: true };
      await orchestrateCommand(options);

      expect(consoleLogSpy).toHaveBeenCalledWith('Available routing arms: claude, gemini');
    });
  });

  describe('budget constraints', () => {
    it('should pass budget constraints to router', async () => {
      const mockAdapter = {
        name: 'claude',
        healthCheck: vi.fn().mockResolvedValue(true),
        execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'OK' } }),
        dispose: vi.fn().mockResolvedValue(undefined),
      };

      mockGetAvailableClis.mockResolvedValue(['claude']);
      mockCreateAllAdapters.mockReturnValue(new Map([['claude', mockAdapter as never]]));
      mockCreateCompositeRouter.mockReturnValue({
        route: vi.fn().mockResolvedValue({
          ok: true,
          value: { cliName: 'claude', adapter: mockAdapter, confidence: 0.9, reason: 'OK' },
        }),
      } as never);

      const options: OrchestrateOptions = {
        task: 'test',
        maxTokens: 50000,
        maxCostUsd: 5,
      };
      await orchestrateCommand(options);

      expect(mockCreateCompositeRouter).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          budgetConstraints: {
            maxTokens: 50000,
            maxCostUsd: 5,
          },
        })
      );
    });
  });
});
