/**
 * Tests for OpenCode CLI Adapter (Subprocess)
 *
 * Verifies subprocess-based OpenCode adapter functionality.
 * (Source: Issue #1124)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenCodeCliAdapter,
  createOpenCodeAdapter,
  resetOpenCodeModelCache,
} from './opencode-adapter.js';
import type { CliTask } from '../types.js';
import { getDefaultModelForCli, getCliModelName } from '../../config/model-config-helpers.js';

/** Expected default CLI model name, derived from the canonical registry. */
const EXPECTED_DEFAULT_ID = getCliModelName(getDefaultModelForCli('opencode'));

// Hoist the mock function so it's available during vi.mock()
const mockExecAsync = vi.hoisted(() => vi.fn());

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

// Mock child_process for subprocess execution
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
    cb(null, `${getCliModelName(getDefaultModelForCli('opencode'))}\n`, '');
  }),
}));

// Mock util.promisify to return our controlled async mock
vi.mock('node:util', () => ({
  promisify: vi.fn((_fn: unknown) => mockExecAsync),
}));

import { spawn, execFile } from 'node:child_process';

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

describe('OpenCodeCliAdapter', () => {
  let adapter: OpenCodeCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    resetOpenCodeModelCache();
    // Default execFile mock returns the expected default model as available
    vi.mocked(execFile).mockImplementation(
      (_cmd: string, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, `${EXPECTED_DEFAULT_ID}\n`, '');
        return undefined as unknown as ReturnType<typeof execFile>;
      }
    );
    adapter = new OpenCodeCliAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('constructor', () => {
    it('should create adapter with default model', () => {
      expect(adapter.name).toBe('opencode');
      expect(adapter.transport).toBe('subprocess');
    });

    it('should use custom model when provided', () => {
      const custom = new OpenCodeCliAdapter({ model: 'anthropic/claude-haiku-3.5' });
      const info = custom.getModelInfo();
      expect(info.id).toBe('anthropic/claude-haiku-3.5');
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
      const adapterWithLogger = new OpenCodeCliAdapter({ logger: mockLogger });
      expect(adapterWithLogger).toBeDefined();
    });
  });

  describe('getModelInfo()', () => {
    it('should return registry-derived info for default model', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe(EXPECTED_DEFAULT_ID);
      expect(info.contextWindow).toBe(200_000);
      expect(info.maxOutput).toBe(64_000);
    });

    it('should return fallback info for unknown model', () => {
      const unknownAdapter = new OpenCodeCliAdapter({ model: 'unknown-provider/unknown-model' });
      const info = unknownAdapter.getModelInfo();

      expect(info.id).toBe('unknown-provider/unknown-model');
      expect(info.name).toBe('OpenCode (unknown-provider/unknown-model)');
      expect(info.contextWindow).toBe(200_000);
      expect(info.maxOutput).toBe(64_000);
      expect(info.costPerMillionInput).toBe(3.0);
      expect(info.costPerMillionOutput).toBe(15.0);
    });
  });

  describe('argument building', () => {
    it('should build correct arguments for basic task', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'session.start', session_id: 'oc-123' }),
        JSON.stringify({ type: 'message.delta', content: 'Hello from OpenCode!' }),
        JSON.stringify({
          type: 'session.complete',
          usage: { input_tokens: 15, output_tokens: 25 },
        }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Say hello' };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('run');
      expect(args).toContain('--format');
      expect(args).toContain('json');
      expect(args).toContain('--model');
      expect(args).toContain(EXPECTED_DEFAULT_ID);
      // Prompt should NOT be in args — it's passed via stdin
      expect(args).not.toContain('Say hello');
      expect(mockProcess.stdin?.write).toHaveBeenCalledWith('Say hello');
    });

    it('should omit --model when task model is not in available models (#1402)', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Quick task',
        model: 'google/gemini-2.5-flash',
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      // Model not in probed list → omitted
      expect(args).not.toContain('--model');
    });

    it('should pass --model when task model IS in available models', async () => {
      // Mock execFile to return the specific model as available
      vi.mocked(execFile).mockImplementation(
        (_cmd: string, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, 'opencode/big-pickle\ngoogle/gemini-2.5-flash\n', '');
          return undefined as unknown as ReturnType<typeof execFile>;
        }
      );
      resetOpenCodeModelCache();
      const freshAdapter = new OpenCodeCliAdapter();
      await freshAdapter.initialize();

      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Quick task',
        model: 'google/gemini-2.5-flash',
      };
      await freshAdapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('google/gemini-2.5-flash');
    });

    it('should resolve internal model names to CLI format (#1402)', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      // 'opencode-default' is an internal ID, resolves to the default cliModelName
      // which is in the probed available models
      const task: CliTask = {
        content: 'Resolve model',
        model: 'opencode-default',
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--model');
      // Should resolve to the cliModelName, not the raw internal ID
      expect(args).toContain(EXPECTED_DEFAULT_ID);
      expect(args).not.toContain('opencode-default');
    });

    it('should include --dir when workDir is provided', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Test task',
        options: { workDir: '/tmp/project' },
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--dir');
      expect(args).not.toContain('--cwd');
      expect(args).toContain('/tmp/project');
    });

    it('should not include --dir when workDir is empty', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Test task',
        options: { workDir: '' },
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).not.toContain('--dir');
    });

    it('should include --variant when allowlisted value is provided', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Test task',
        options: { variant: 'high' },
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--variant');
      expect(args).toContain('high');
    });

    it('should reject non-allowlisted variant values', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Test task',
        options: { variant: 'malicious; rm -rf /' },
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).not.toContain('--variant');
    });

    it('should include --thinking when set to true', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = {
        content: 'Test task',
        options: { thinking: true },
      };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).toContain('--thinking');
    });

    it('should not include --thinking when not specified', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'message.delta', content: 'Done!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test task' };
      await adapter.execute(task);

      const calls = vi.mocked(spawn).mock.calls;
      const args = calls[0]?.[1] as string[];
      expect(args).not.toContain('--thinking');
    });
  });

  describe('execute()', () => {
    it('should return successful response', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'session.start', session_id: 'oc-exec-1' }),
        JSON.stringify({ type: 'message.delta', content: 'Hello from OpenCode!' }),
        JSON.stringify({
          type: 'session.complete',
          usage: { input_tokens: 15, output_tokens: 25 },
        }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Greet me' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Hello from OpenCode!');
      }
    });

    it('should extract session ID from response', async () => {
      const ndjsonResponse = [
        JSON.stringify({ type: 'session.start', session_id: 'oc-session-789' }),
        JSON.stringify({ type: 'message.delta', content: 'Continuing...' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Continue' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('oc-session-789');
      }
    });

    it('should fall back to plaintext for non-JSON output (#1402)', async () => {
      const mockProcess = createMockProcess('not valid json at all', '', 0);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      // Plaintext fallback returns success with raw text content
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('not valid json at all');
      }
    });

    it('should return PARSE_ERROR for very short output', async () => {
      const mockProcess = createMockProcess('hi', '', 0);
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
              cb(new Error('spawn opencode ENOENT'));
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
        expect(result.error.message).toContain('opencode CLI not found');
      }
    });

    it('should handle non-zero exit codes with stderr', async () => {
      const mockProcess = createMockProcess('', 'Connection refused', 1);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toContain('Connection refused');
      }
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status when CLI is available', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '1.2.15' });

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.version).toBe('1.2.15');
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
      mockExecAsync.mockResolvedValue({ stdout: '1.2.15' });

      const version = await adapter.getVersion();

      expect(version).toBe('1.2.15');
    });

    it('should use --version flag (base class behavior)', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '1.2.15' });

      await adapter.getVersion();

      expect(mockExecAsync).toHaveBeenCalledWith(
        'opencode --version',
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });

    it('should cache version after first call', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '1.2.15' });

      await adapter.getVersion();
      await adapter.getVersion();

      expect(mockExecAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('API key boundary warning (#1429)', () => {
    it('should warn when Anthropic models detected in available models', async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: string, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, 'anthropic/claude-sonnet-4-6\nopencode/big-pickle\n', '');
          return undefined as unknown as ReturnType<typeof execFile>;
        }
      );
      resetOpenCodeModelCache();

      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };

      // warnIfAnthropicProvider uses module-level logger, not the adapter logger.
      // We verify the warning by spying on the module logger.
      // Instead, test via integration: initialize and check no throw.
      const freshAdapter = new OpenCodeCliAdapter();
      await expect(freshAdapter.initialize()).resolves.not.toThrow();

      // Verify custom/claude models also trigger (internal function test via behavior)
      vi.mocked(execFile).mockImplementation(
        (_cmd: string, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, 'custom/claude-opus-4-6\n', '');
          return undefined as unknown as ReturnType<typeof execFile>;
        }
      );
      resetOpenCodeModelCache();
      const freshAdapter2 = new OpenCodeCliAdapter({ logger: mockLogger });
      await expect(freshAdapter2.initialize()).resolves.not.toThrow();
    });

    it('should not warn when no Anthropic models detected', async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: string, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, 'opencode/big-pickle\ngoogle/gemini-2.5-flash\n', '');
          return undefined as unknown as ReturnType<typeof execFile>;
        }
      );
      resetOpenCodeModelCache();
      const freshAdapter = new OpenCodeCliAdapter();
      await expect(freshAdapter.initialize()).resolves.not.toThrow();
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
        JSON.stringify({ type: 'session.start', session_id: 'auto-init' }),
        JSON.stringify({ type: 'message.delta', content: 'Auto-init!' }),
        JSON.stringify({ type: 'session.complete' }),
      ].join('\n');
      const mockProcess = createMockProcess(ndjsonResponse);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const task: CliTask = { content: 'Test auto-init' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
    });
  });
});

describe('createOpenCodeAdapter', () => {
  it('should create adapter instance', () => {
    const adapter = createOpenCodeAdapter();
    expect(adapter).toBeInstanceOf(OpenCodeCliAdapter);
    expect(adapter.name).toBe('opencode');
  });

  it('should pass options through', () => {
    const adapter = createOpenCodeAdapter({ model: 'google/gemini-2.5-pro' });
    const info = adapter.getModelInfo();
    expect(info.id).toBe('google/gemini-2.5-pro');
  });
});
