/**
 * Tests for Codex CLI Adapter (Subprocess)
 *
 * Verifies subprocess-based Codex adapter functionality.
 * Now extends SubprocessCliAdapter (Issue #1140).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexCliAdapter } from './codex-adapter.js';
import type { CliTask } from '../types.js';
import { getDefaultModelForCli, getCliModelName } from '../../config/model-config-helpers.js';

/** Expected default CLI model name, derived from the canonical registry. */
const EXPECTED_DEFAULT_ID = getCliModelName(getDefaultModelForCli('codex'));

// Hoist the mock function so it's available during vi.mock()
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock child_process for subprocess execution
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

// Mock util.promisify to return our controlled async mock
vi.mock('node:util', () => ({
  promisify: vi.fn((_fn: unknown) => mockExecAsync),
}));

import { spawn } from 'node:child_process';

type EventCallback = (...args: unknown[]) => void;

function createMockProcess(
  stdout: string,
  stderr: string = '',
  exitCode: number | null = 0
): ReturnType<typeof spawn> {
  const events: Record<string, EventCallback[]> = {};

  const mockProcess = {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    stdout: {
      on: vi.fn((event: string, cb: EventCallback) => {
        const key = `stdout_${event}`;
        events[key] ??= [];
        events[key].push(cb);
        if (event === 'data') {
          setTimeout(() => {
            cb(Buffer.from(stdout));
          }, 0);
        }
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: EventCallback) => {
        const key = `stderr_${event}`;
        events[key] ??= [];
        events[key].push(cb);
        if (event === 'data' && stderr !== '') {
          setTimeout(() => {
            cb(Buffer.from(stderr));
          }, 0);
        }
      }),
    },
    on: vi.fn((event: string, cb: EventCallback) => {
      events[event] ??= [];
      events[event].push(cb);
      if (event === 'close') {
        setTimeout(() => {
          cb(exitCode);
        }, 10);
      }
    }),
    kill: vi.fn(),
  };

  return mockProcess as unknown as ReturnType<typeof spawn>;
}

describe('CodexCliAdapter (Subprocess)', () => {
  let adapter: CodexCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CodexCliAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('constructor', () => {
    it('should create adapter with default model', () => {
      expect(adapter.name).toBe('codex');
      expect(adapter.transport).toBe('subprocess');
    });

    it('should use custom model when provided', () => {
      const customAdapter = new CodexCliAdapter({ model: 'o3-mini' });
      expect(customAdapter.getModelInfo().id).toBe('o3-mini');
    });

    it('should accept custom logger', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };
      const adapterWithLogger = new CodexCliAdapter({ logger: mockLogger });
      expect(adapterWithLogger).toBeDefined();
    });
  });

  describe('capabilities', () => {
    it('should return correct capability profile', () => {
      const caps = adapter.capabilities;

      expect(caps.reasoning).toBe(10);
      expect(caps.contextWindow).toBe(400_000);
      expect(caps.codeGeneration).toBe(10);
      expect(caps.speed).toBe(7);
      expect(caps.cost).toBe(5);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model (from registry)', () => {
      const info = adapter.getModelInfo();

      // Default model is derived from canonical registry (codex-5.3 → 'o3')
      expect(info.id).toBe(EXPECTED_DEFAULT_ID);
      expect(info.contextWindow).toBe(400_000);
      expect(info.maxOutput).toBe(100_000);
    });

    it('should return registry-derived cost info for default model', () => {
      const info = adapter.getModelInfo();

      // o3 maps to codex-5.3 in registry: pricing {2.0, 8.0}
      expect(info.costPerMillionInput).toBe(2.0);
      expect(info.costPerMillionOutput).toBe(8.0);
    });

    it('should return correct info for o3-mini model (from registry)', () => {
      const miniAdapter = new CodexCliAdapter({ model: 'o3-mini' });
      const info = miniAdapter.getModelInfo();

      expect(info.id).toBe('o3-mini');
      // o3-mini maps to codex-5.1-mini in registry: pricing {0.5, 2.0}
      expect(info.costPerMillionInput).toBe(0.5);
      expect(info.costPerMillionOutput).toBe(2.0);
    });

    it('should return legacy costs for non-canonical model', () => {
      const o4Adapter = new CodexCliAdapter({ model: 'o4-mini' });
      const info = o4Adapter.getModelInfo();

      expect(info.id).toBe('o4-mini');
      expect(info.name).toBe('O4 Mini');
      // o4-mini not in registry — uses legacy fallback
      expect(info.costPerMillionInput).toBe(1.1);
      expect(info.costPerMillionOutput).toBe(4.4);
    });

    it('should use default costs for unknown model', () => {
      const unknownAdapter = new CodexCliAdapter({ model: 'codex-unknown' });
      const info = unknownAdapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(1.1);
      expect(info.costPerMillionOutput).toBe(4.4);
    });
  });

  describe('argument building', () => {
    it('should build correct arguments for basic task', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Hello from Codex!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Say hello',
      };

      await adapter.execute(task);

      // Default model from registry is always passed via -m flag
      expect(spawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining([
          'exec',
          '--json',
          '-m',
          EXPECTED_DEFAULT_ID,
          '--skip-git-repo-check',
        ]),
        expect.any(Object)
      );
    });

    it('should include task content directly (not JSON-stringified)', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Done!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Complex "task" with quotes',
      };

      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      // Task content is passed directly without JSON.stringify (shell: false)
      expect(args).toContain('Complex "task" with quotes');
    });

    it('should always skip git repo check', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Done!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--skip-git-repo-check');
    });

    it('should use task model over default when provided', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'From mini!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Quick task',
        model: 'o3-mini',
      };

      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('-m');
      expect(args).toContain('o3-mini');
    });

    it('should include -m flag with model when model is specified', async () => {
      const customAdapter = new CodexCliAdapter({ model: 'o3-mini' });
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Safe!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      await customAdapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('-m');
      expect(args).toContain('o3-mini');
    });

    it('should always include -m flag with registry default model', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Default!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      // Default model from registry is always passed
      expect(args).toContain('-m');
      expect(args).toContain(EXPECTED_DEFAULT_ID);
    });
  });

  describe('execute()', () => {
    it('should return successful response', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Hello from Codex!' },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 15, output_tokens: 25 },
        }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Greet me' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Hello from Codex!');
      }
    });

    it('should extract session ID from response', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'codex-session-789' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Continuing...' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Continue' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('codex-session-789');
      }
    });

    it('should handle parse errors gracefully', async () => {
      const mockProcess = createMockProcess('not valid json', '', 0);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('should handle ENOENT errors', async () => {
      const errorProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: EventCallback) => {
          if (event === 'error') {
            setTimeout(() => {
              cb(new Error('spawn codex ENOENT'));
            }, 0);
          }
        }),
        kill: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;

      vi.mocked(spawn).mockReturnValue(errorProcess);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('codex CLI not found');
      }
    });

    it('should handle non-zero exit codes with stderr', async () => {
      const mockProcess = createMockProcess('', 'API rate limit exceeded', 1);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toContain('API rate limit exceeded');
      }
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status when CLI is available', async () => {
      // BaseCliAdapter.getVersion() uses execAsync (promisified exec)
      mockExecAsync.mockResolvedValue({ stdout: 'codex version 0.77.0' });

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.version).toBe('0.77.0');
    });

    it('should return unhealthy status when CLI is not found', async () => {
      mockExecAsync.mockRejectedValue(new Error('ENOENT'));

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.message).toBeDefined();
    });
  });

  describe('getVersion()', () => {
    it('should extract version from CLI output', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'codex version 0.77.0' });

      const version = await adapter.getVersion();

      expect(version).toBe('0.77.0');
    });

    it('should cache version after first call', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'codex version 0.77.0' });

      await adapter.getVersion();
      await adapter.getVersion();

      // execAsync should only be called once due to caching
      expect(mockExecAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCapacity()', () => {
    it('should return default fallback capacity when tracker uninitialized', async () => {
      const capacity = await adapter.getCapacity();

      // Before initialize(), tracker is null so fallback is used (Issue #1463)
      expect(capacity.remainingTokens).toBe(100_000);
      expect(capacity.remainingRequests).toBe(100_000);
      expect(capacity.exhausted).toBe(false);
      expect(capacity.utilizationPercent).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it('should dispose successfully', async () => {
      await adapter.initialize();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });

    it('should auto-initialize on first execute', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'auto-init-thread' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'Auto-init!' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      // Don't call initialize explicitly
      const task: CliTask = { content: 'Test auto-init' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
    });
  });
});
