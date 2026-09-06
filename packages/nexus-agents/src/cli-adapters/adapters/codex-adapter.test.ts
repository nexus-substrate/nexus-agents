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

/** A minimal successful `codex exec --json` stream. */
const COMPLETED_NDJSON = [
  JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
  JSON.stringify({
    type: 'item.completed',
    item: { id: 'item-1', type: 'agent_message', text: 'Done!' },
  }),
  JSON.stringify({ type: 'turn.completed' }),
].join('\n');

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
      expect(caps.contextWindow).toBe(1_050_000);
      expect(caps.codeGeneration).toBe(10);
      expect(caps.speed).toBe(7);
      // gpt-5.5 (frontier codex default, #4176) is pricier than codex-5.3: cost 4.
      expect(caps.cost).toBe(4);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model (from registry)', () => {
      const info = adapter.getModelInfo();

      // Default model is derived from canonical registry (gpt-5.5 → 'gpt-5.5', #4176)
      expect(info.id).toBe(EXPECTED_DEFAULT_ID);
      expect(info.contextWindow).toBe(1_050_000);
      expect(info.maxOutput).toBe(128_000);
    });

    it('should return registry-derived cost info for default model', () => {
      const info = adapter.getModelInfo();

      // Default gpt-5.5 in registry (#4176): pricing {5.0, 30.0}
      expect(info.costPerMillionInput).toBe(5.0);
      expect(info.costPerMillionOutput).toBe(30.0);
    });

    it('should return correct info for gpt-5.4-mini model (from registry)', () => {
      const miniAdapter = new CodexCliAdapter({ model: 'gpt-5.4-mini' });
      const info = miniAdapter.getModelInfo();

      expect(info.id).toBe('gpt-5.4-mini');
      // gpt-5.4-mini is codex-5.1-mini's cliModelName since #5091 (o3-mini is no
      // longer served by codex): models.dev pricing {0.75, 4.5}, 400K context.
      expect(info.costPerMillionInput).toBe(0.75);
      expect(info.costPerMillionOutput).toBe(4.5);
      expect(info.contextWindow).toBe(400_000);
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

    // #5091: task.model carries the canonical registry id (resolve-model-for-tier →
    // composite-router → orchestrate-command), which the codex binary rejects.
    it('translates a registry id in task.model to the codex slug (#5091)', async () => {
      const mockProcess = createMockProcess(COMPLETED_NDJSON);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await adapter.execute({ content: 'Task', model: 'codex-5.3' });

      const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
      expect(args[args.indexOf('-m') + 1]).toBe('gpt-5.6-terra');
      expect(args).not.toContain('codex-5.3');
    });

    it('passes a task.model that is already a codex slug through unchanged (#5091)', async () => {
      const mockProcess = createMockProcess(COMPLETED_NDJSON);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await adapter.execute({ content: 'Task', model: 'gpt-5.6-terra' });

      const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
      expect(args[args.indexOf('-m') + 1]).toBe('gpt-5.6-terra');
    });

    it('passes a model unknown to the registry through verbatim and warns (#5091)', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };
      const loggedAdapter = new CodexCliAdapter({ logger: mockLogger });
      const mockProcess = createMockProcess(COMPLETED_NDJSON);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await loggedAdapter.execute({ content: 'Task', model: 'codex-unknown-xyz' });

      const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
      expect(args[args.indexOf('-m') + 1]).toBe('codex-unknown-xyz');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not in the model registry'),
        expect.objectContaining({ model: 'codex-unknown-xyz' })
      );
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

    it('honors task.systemPrompt via model_instructions_file (#1886)', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'ok' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'do the thing',
        systemPrompt: 'You are a strict reviewer.',
      };
      await adapter.execute(task);

      const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
      const cIdx = args.indexOf('-c');
      expect(cIdx).toBeGreaterThanOrEqual(0);
      const cVal = args[cIdx + 1];
      expect(cVal).toMatch(/^model_instructions_file=.+instructions\.md$/);
    });

    it('cleans up tempdir parent after systemPrompt run (#2824 — file + dir, not just file)', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-tempdir' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'ok' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'whatever',
        systemPrompt: 'You are a strict reviewer.',
      };
      await adapter.execute(task);

      // Locate the tempdir from the spawned args, then confirm BOTH the
      // file AND the parent dir are gone post-cleanup. Pre-fix the file
      // was unlinked but the empty parent dir was leaked.
      const args = vi.mocked(spawn).mock.calls.at(-1)?.[1] as string[];
      const cIdx = args.indexOf('-c');
      const cVal = args[cIdx + 1] as string;
      const match = cVal.match(/^model_instructions_file=(.+\/instructions\.md)$/);
      expect(match).not.toBeNull();
      const file = match![1] as string;
      const dir = file.replace(/\/instructions\.md$/, '');
      const { existsSync } = await import('node:fs');
      expect(existsSync(file)).toBe(false);
      expect(existsSync(dir)).toBe(false);
    });

    it('omits -c model_instructions_file when systemPrompt is empty', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item-1', type: 'agent_message', text: 'ok' },
        }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'do the thing' };
      await adapter.execute(task);

      const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
      expect(args).not.toContain('-c');
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

    it('should handle non-zero exit codes with stderr', { timeout: 15_000 }, async () => {
      const mockProcess = createMockProcess('', 'API rate limit exceeded', 1);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Stderr "rate limit" classified as RATE_LIMITED (#1401)
        expect(result.error.code).toBe('RATE_LIMITED');
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
    it('should lazy-init the tracker and return real codex defaults (#2714)', async () => {
      // Pre-#2714 this test asserted the 100k DEFAULT_CAPACITY_FALLBACK
      // because getCapacity() bailed when tracker was null without ever
      // initializing it (Issue #1463 framed that as intentional, but
      // doctor never called initialize() before getCapacity() so the
      // fallback fired every time and produced fictional "100%" output).
      // getCapacity() now lazy-inits — assert the real codex defaults.
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(500_000); // codex DEFAULT_TOKEN_LIMIT
      expect(capacity.remainingRequests).toBe(500); // codex DEFAULT_REQUEST_LIMIT
      expect(capacity.rateLimited).toBe(false);
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
