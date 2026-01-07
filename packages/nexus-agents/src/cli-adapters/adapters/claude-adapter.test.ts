/**
 * Tests for Claude CLI Adapter
 *
 * Verifies subprocess-based Claude adapter functionality.
 * (Source: Issue #114)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCliAdapter } from './claude-adapter.js';
import type { CliTask } from '../types.js';

// Track captured command for verification
let capturedCommand = '';

// Callback type for exec
type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

// Mock child_process exec for subprocess execution
vi.mock('node:child_process', () => ({
  exec: vi.fn((cmd: string, _options: unknown, callback?: ExecCallback) => {
    capturedCommand = cmd;
    if (callback) {
      // Default: return version info (must be >= 2.0.0 for Claude)
      if (cmd.includes('--version')) {
        callback(null, { stdout: 'claude version 2.0.5', stderr: '' });
      } else {
        callback(null, { stdout: '', stderr: '' });
      }
    }
    return {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
  }),
}));

// Mock util.promisify to create a promise-returning version
vi.mock('node:util', () => ({
  promisify: (fn: typeof import('node:child_process').exec) => {
    return (cmd: string, options?: unknown) => {
      return new Promise((resolve, reject) => {
        fn(cmd, options ?? {}, (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      });
    };
  },
}));

import { exec } from 'node:child_process';

// Helper to mock exec for specific responses
function mockExecResponse(stdout: string, stderr: string = ''): void {
  vi.mocked(exec).mockImplementation((cmd: string, _options: unknown, callback?: ExecCallback) => {
    capturedCommand = cmd;
    if (callback) {
      if (cmd.includes('--version')) {
        callback(null, { stdout: 'claude version 2.0.5', stderr: '' });
      } else {
        callback(null, { stdout, stderr });
      }
    }
    return {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    } as ReturnType<typeof exec>;
  });
}

function mockExecError(errorMessage: string): void {
  vi.mocked(exec).mockImplementation((cmd: string, _options: unknown, callback?: ExecCallback) => {
    capturedCommand = cmd;
    if (callback) {
      const error = new Error(errorMessage);
      callback(error, { stdout: '', stderr: '' });
    }
    return {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    } as ReturnType<typeof exec>;
  });
}

describe('ClaudeCliAdapter', () => {
  let adapter: ClaudeCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommand = '';
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
      };
      const adapterWithLogger = new ClaudeCliAdapter({ logger: mockLogger });
      expect(adapterWithLogger).toBeDefined();
    });
  });

  describe('capabilities', () => {
    it('should return correct capability profile', () => {
      const caps = adapter.capabilities;

      expect(caps.reasoning).toBe(10);
      expect(caps.contextWindow).toBe(200_000);
      expect(caps.codeGeneration).toBe(9);
      expect(caps.speed).toBe(7);
      expect(caps.cost).toBe(5);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe('claude-sonnet-4');
      expect(info.name).toBe('Claude Sonnet 4');
      expect(info.contextWindow).toBe(200_000);
      expect(info.maxOutput).toBe(64_000);
    });

    it('should return correct cost info for sonnet', () => {
      const info = adapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(3.0);
      expect(info.costPerMillionOutput).toBe(15.0);
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

      expect(info.costPerMillionInput).toBe(3.0);
      expect(info.costPerMillionOutput).toBe(15.0);
    });
  });

  describe('command building', () => {
    it('should build correct command for basic task', async () => {
      mockExecResponse(
        JSON.stringify({
          text: 'Hello!',
          usage: { input_tokens: 10, output_tokens: 5 },
        })
      );

      const task: CliTask = {
        content: 'Say hello',
      };

      await adapter.execute(task);

      expect(capturedCommand).toContain('claude');
      expect(capturedCommand).toContain('-p');
      expect(capturedCommand).toContain('--output-format json');
      expect(capturedCommand).toContain('--model claude-sonnet-4');
    });

    it('should include system prompt when provided', async () => {
      mockExecResponse(JSON.stringify({ text: 'Hello!' }));

      const task: CliTask = {
        content: 'Say hello',
        systemPrompt: 'You are a helpful assistant',
      };

      await adapter.execute(task);

      expect(capturedCommand).toContain('--system-prompt');
      expect(capturedCommand).toContain('You are a helpful assistant');
    });

    it('should include session ID for continuation', async () => {
      mockExecResponse(JSON.stringify({ text: 'Continued!' }));

      const task: CliTask = {
        content: 'Continue please',
        sessionId: 'session-123',
      };

      await adapter.execute(task);

      expect(capturedCommand).toContain('--resume');
      expect(capturedCommand).toContain('session-123');
    });

    it('should include max tokens when specified', async () => {
      mockExecResponse(JSON.stringify({ text: 'Short!' }));

      const task: CliTask = {
        content: 'Be brief',
        maxTokens: 100,
      };

      await adapter.execute(task);

      expect(capturedCommand).toContain('--max-tokens');
      expect(capturedCommand).toContain('100');
    });

    it('should use task model over default when provided', async () => {
      mockExecResponse(JSON.stringify({ text: 'From opus!' }));

      const task: CliTask = {
        content: 'Complex task',
        model: 'claude-opus-4',
      };

      await adapter.execute(task);

      expect(capturedCommand).toContain('--model claude-opus-4');
    });
  });

  describe('execute()', () => {
    it('should return successful response', async () => {
      mockExecResponse(
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
      mockExecResponse('not valid json');

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('should handle CLI not found errors', async () => {
      mockExecError('ENOENT: claude not found');

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task, { allowRetry: false });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle timeout errors', async () => {
      mockExecError('ETIMEDOUT');

      const task: CliTask = { content: 'Test' };
      const result = await adapter.execute(task, { allowRetry: false });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status when CLI is available', async () => {
      mockExecResponse('claude version 2.0.5');

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.version).toBe('2.0.5');
    });

    it('should return unhealthy status when CLI is not found', async () => {
      mockExecError('ENOENT');

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.message).toBeDefined();
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
