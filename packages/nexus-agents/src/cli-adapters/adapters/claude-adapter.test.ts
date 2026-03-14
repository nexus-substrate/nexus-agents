/**
 * Tests for Claude CLI Adapter
 *
 * Verifies subprocess-based Claude adapter functionality.
 * (Source: Issue #114)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ClaudeCliAdapter } from './claude-adapter.js';
import type { CliTask } from '../types.js';

// Track captured command, args, and stdin for verification
let capturedCommand = '';
let capturedArgs: string[] = [];
let capturedStdin = '';

// Mock spawn response data
let mockStdout = '';
let mockStderr = '';
let mockExitCode = 0;
let mockError: Error | null = null;

// Create mock child process
function createMockChildProcess(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: () => void;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn((data: string) => {
      capturedStdin += data;
    }),
    end: vi.fn(),
  };
  child.kill = vi.fn();
  return child;
}

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn((cmd: string, args: string[]) => {
    capturedCommand = cmd;
    capturedArgs = args;

    const child = createMockChildProcess();

    // Emit data/events asynchronously
    setImmediate(() => {
      if (mockError !== null) {
        child.emit('error', mockError);
        return;
      }

      if (mockStdout !== '') {
        child.stdout.emit('data', Buffer.from(mockStdout));
      }
      if (mockStderr !== '') {
        child.stderr.emit('data', Buffer.from(mockStderr));
      }
      child.emit('close', mockExitCode);
    });

    return child;
  }),
  exec: vi.fn(
    (
      cmd: string,
      _options: unknown,
      callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      if (callback !== undefined) {
        // For version checks
        if (cmd.includes('--version')) {
          callback(null, { stdout: 'claude version 2.0.5', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }
      return { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn() };
    }
  ),
}));

// Mock util.promisify for version checks
vi.mock('node:util', () => ({
  promisify: (
    fn: (
      cmd: string,
      options: unknown,
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
    ) => void
  ) => {
    return (cmd: string, options?: unknown) => {
      return new Promise((resolve, reject) => {
        fn(cmd, options ?? {}, (error, result) => {
          if (error !== null) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      });
    };
  },
}));

// Helper to set up spawn mock response
function mockSpawnResponse(stdout: string, stderr = '', exitCode = 0): void {
  mockStdout = stdout;
  mockStderr = stderr;
  mockExitCode = exitCode;
  mockError = null;
}

function mockSpawnError(error: Error): void {
  mockError = error;
  mockStdout = '';
  mockStderr = '';
  mockExitCode = 1;
}

describe('ClaudeCliAdapter', () => {
  let adapter: ClaudeCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommand = '';
    capturedArgs = [];
    capturedStdin = '';
    mockStdout = '';
    mockStderr = '';
    mockExitCode = 0;
    mockError = null;
    adapter = new ClaudeCliAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('constructor', () => {
    it('should create adapter with default model', () => {
      expect(adapter.name).toBe('claude');
    });

    it('should use custom model when provided', () => {
      const customAdapter = new ClaudeCliAdapter({ model: 'claude-opus-4' });
      expect(customAdapter.getModelInfo().id).toBe('claude-opus-4');
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
      const adapterWithLogger = new ClaudeCliAdapter({ logger: mockLogger });
      expect(adapterWithLogger).toBeDefined();
    });
  });

  describe('capabilities', () => {
    it('should return correct capability profile', () => {
      const caps = adapter.capabilities;

      expect(caps.reasoning).toBe(10);
      expect(caps.contextWindow).toBe(1_000_000);
      expect(caps.codeGeneration).toBe(9);
      expect(caps.speed).toBe(5);
      expect(caps.cost).toBe(6);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model', () => {
      const info = adapter.getModelInfo();

      // Default model resolves to cliModelName from registry (Issue #1095)
      expect(info.id).toBe('claude-opus-4-6');
      expect(info.name).toBe('Claude Opus 4.6');
      expect(info.contextWindow).toBe(1_000_000);
      expect(info.maxOutput).toBe(128_000);
    });

    it('should return correct cost info for opus', () => {
      const info = adapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(5.0);
      expect(info.costPerMillionOutput).toBe(25.0);
    });

    it('should return correct info for opus model', () => {
      const opusAdapter = new ClaudeCliAdapter({ model: 'claude-opus-4' });
      const info = opusAdapter.getModelInfo();

      expect(info.id).toBe('claude-opus-4');
      expect(info.name).toBe('Claude Opus 4');
      expect(info.costPerMillionInput).toBe(15.0);
      expect(info.costPerMillionOutput).toBe(75.0);
    });

    it('should return correct info for haiku model', () => {
      const haikuAdapter = new ClaudeCliAdapter({ model: 'claude-haiku-3' });
      const info = haikuAdapter.getModelInfo();

      expect(info.id).toBe('claude-haiku-3');
      expect(info.name).toBe('Claude Haiku 3');
      expect(info.costPerMillionInput).toBe(0.25);
      expect(info.costPerMillionOutput).toBe(1.25);
    });

    it('should use default costs for unknown model', () => {
      const unknownAdapter = new ClaudeCliAdapter({ model: 'claude-unknown' });
      const info = unknownAdapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(5.0);
      expect(info.costPerMillionOutput).toBe(25.0);
    });
  });

  describe('command building', () => {
    it('should build correct command for basic task', async () => {
      mockSpawnResponse(
        JSON.stringify({
          result: 'Hello!',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 5 },
        })
      );

      const task: CliTask = {
        content: 'Say hello',
      };

      await adapter.execute(task);

      expect(capturedCommand).toBe('claude');
      expect(capturedArgs).toContain('-p');
      expect(capturedArgs).toContain('--output-format');
      expect(capturedArgs).toContain('json');
      expect(capturedArgs).toContain('--model');
      // Default model 'opus' is passed directly (CLI alias, quality-first)
      expect(capturedArgs).toContain('opus');
    });

    it('should include system prompt when provided', async () => {
      mockSpawnResponse(JSON.stringify({ result: 'Hello!', is_error: false }));

      const task: CliTask = {
        content: 'Say hello',
        systemPrompt: 'You are a helpful assistant',
      };

      await adapter.execute(task);

      expect(capturedArgs).toContain('--system-prompt');
      expect(capturedArgs).toContain('You are a helpful assistant');
    });

    it('should include session ID for continuation', async () => {
      mockSpawnResponse(JSON.stringify({ result: 'Continued!', is_error: false }));

      const task: CliTask = {
        content: 'Continue please',
        sessionId: 'session-123',
      };

      await adapter.execute(task);

      expect(capturedArgs).toContain('--resume');
      expect(capturedArgs).toContain('session-123');
    });

    it('should NOT pass maxTokens to CLI (Claude CLI does not support --max-tokens)', async () => {
      mockSpawnResponse(JSON.stringify({ result: 'Short!', is_error: false }));

      const task: CliTask = {
        content: 'Be brief',
        maxTokens: 100,
      };

      await adapter.execute(task);

      // Claude CLI does not support --max-tokens option (verified via `claude --help`)
      // The CLI handles token limits internally based on model configuration
      expect(capturedArgs).not.toContain('--max-tokens');
    });

    it('should use task model over default when provided', async () => {
      mockSpawnResponse(JSON.stringify({ result: 'From opus!', is_error: false }));

      const task: CliTask = {
        content: 'Complex task',
        model: 'claude-opus-4',
      };

      await adapter.execute(task);

      expect(capturedArgs).toContain('--model');
      // Internal model name 'claude-opus-4' is mapped to CLI alias 'opus'
      expect(capturedArgs).toContain('opus');
    });

    it('should handle multi-line content correctly', async () => {
      mockSpawnResponse(JSON.stringify({ result: 'Done!', is_error: false }));

      const task: CliTask = {
        content: 'Line 1\nLine 2\nLine 3',
        systemPrompt: 'Multi-line\nsystem\nprompt',
      };

      await adapter.execute(task);

      // Content is passed via stdin to avoid argument escaping issues with --add-dir
      expect(capturedStdin).toBe('Line 1\nLine 2\nLine 3');
      // System prompt is still passed as argument
      expect(capturedArgs).toContain('Multi-line\nsystem\nprompt');
    });
  });

  describe('execute()', () => {
    it('should return successful response', async () => {
      mockSpawnResponse(
        JSON.stringify({
          type: 'result',
          result: 'Hello, world!',
          is_error: false,
          usage: { input_tokens: 10, output_tokens: 20 },
          session_id: 'new-session',
        })
      );

      const task: CliTask = { content: 'Greet me' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Hello, world!');
      }
    });

    it('should handle parse errors gracefully', async () => {
      mockSpawnResponse('not valid json');

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('should handle CLI not found errors', async () => {
      const error = new Error('ENOENT: claude not found');
      mockSpawnError(error);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task, { allowRetry: false });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle timeout errors', async () => {
      const error = new Error('ETIMEDOUT');
      mockSpawnError(error);

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task, { allowRetry: false });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle non-zero exit code with stderr', async () => {
      mockStdout = '';
      mockStderr = 'Command failed';
      mockExitCode = 1;
      mockError = null;

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task, { allowRetry: false });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toContain('Command failed');
      }
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status when CLI is available', async () => {
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.version).toBe('2.0.5');
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
  });
});
