/**
 * Tests for Codex CLI Adapter (Subprocess)
 *
 * Verifies subprocess-based Codex adapter functionality.
 * (Source: Issue #114)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexCliAdapter } from './codex-adapter.js';
import type { CliTask } from '../types.js';

// Mock child_process for subprocess execution
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';

function createMockProcess(
  stdout: string,
  stderr: string = '',
  exitCode: number | null = 0
): ReturnType<typeof spawn> {
  type EventCallback = (...args: unknown[]) => void;
  const events: Record<string, EventCallback[]> = {};

  const mockProcess = {
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

      expect(caps.reasoning).toBe(9);
      expect(caps.contextWindow).toBe(400_000);
      expect(caps.codeGeneration).toBe(10);
      expect(caps.speed).toBe(8);
      expect(caps.cost).toBe(7);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe('o3');
      expect(info.name).toBe('O3');
      expect(info.contextWindow).toBe(400_000);
      expect(info.maxOutput).toBe(100_000);
    });

    it('should return correct cost info for o3', () => {
      const info = adapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(10.0);
      expect(info.costPerMillionOutput).toBe(40.0);
    });

    it('should return correct info for o3-mini model', () => {
      const miniAdapter = new CodexCliAdapter({ model: 'o3-mini' });
      const info = miniAdapter.getModelInfo();

      expect(info.id).toBe('o3-mini');
      expect(info.name).toBe('O3 Mini');
      expect(info.costPerMillionInput).toBe(1.1);
      expect(info.costPerMillionOutput).toBe(4.4);
    });

    it('should return correct info for o4-mini model', () => {
      const o4Adapter = new CodexCliAdapter({ model: 'o4-mini' });
      const info = o4Adapter.getModelInfo();

      expect(info.id).toBe('o4-mini');
      expect(info.name).toBe('O4 Mini');
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
      const mockProcess = createMockProcess(
        JSON.stringify({
          message: 'Hello from Codex!',
          usage: { input_tokens: 10, output_tokens: 5 },
        })
      );
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Say hello',
      };

      await adapter.execute(task);

      expect(spawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['exec', '--json', '-m', 'o3', '-s', 'read-only']),
        expect.any(Object)
      );
    });

    it('should include task content as JSON string', async () => {
      const mockProcess = createMockProcess(JSON.stringify({ message: 'Done!' }));
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Complex "task" with quotes',
      };

      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain(JSON.stringify('Complex "task" with quotes'));
    });

    it('should always skip git repo check', async () => {
      const mockProcess = createMockProcess(JSON.stringify({ message: 'Done!' }));
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--skip-git-repo-check');
    });

    it('should use task model over default when provided', async () => {
      const mockProcess = createMockProcess(JSON.stringify({ message: 'From mini!' }));
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

    it('should always include sandbox mode for safety', async () => {
      const mockProcess = createMockProcess(JSON.stringify({ message: 'Safe!' }));
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('-s');
      expect(args).toContain('read-only');
    });
  });

  describe('execute()', () => {
    it('should return successful response', async () => {
      // Codex uses NDJSON format with specific event types
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
      type EventCallback = (...args: unknown[]) => void;

      const errorProcess = {
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
      const mockProcess = createMockProcess('codex version 0.77.0');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.version).toBe('0.77.0');
      expect(status.versionStatus).toBe('supported');
    });

    it('should return unhealthy status when CLI is not found', async () => {
      type EventCallback = (...args: unknown[]) => void;
      const errorProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: EventCallback) => {
          if (event === 'error') {
            setTimeout(() => {
              cb(new Error('ENOENT'));
            }, 0);
          }
        }),
        kill: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;

      vi.mocked(spawn).mockReturnValue(errorProcess);

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.versionStatus).toBe('unsupported');
      expect(status.message).toBeDefined();
    });
  });

  describe('getVersion()', () => {
    it('should extract version from CLI output', async () => {
      const mockProcess = createMockProcess('codex version 0.77.0');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const version = await adapter.getVersion();

      expect(version).toBe('0.77.0');
    });

    it('should cache version after first call', async () => {
      const mockProcess = createMockProcess('codex version 0.77.0');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await adapter.getVersion();
      await adapter.getVersion();

      // spawn should only be called once due to caching
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCapacity()', () => {
    it('should return unlimited capacity', async () => {
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(Number.MAX_SAFE_INTEGER);
      expect(capacity.remainingRequests).toBe(Number.MAX_SAFE_INTEGER);
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
      // Use NDJSON format for successful response
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
