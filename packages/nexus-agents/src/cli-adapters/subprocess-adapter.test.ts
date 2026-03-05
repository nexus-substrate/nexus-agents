/**
 * Tests for SubprocessCliAdapter
 *
 * Verifies subprocess execution, stdin handling, timeout, error handling,
 * and response parsing for CLI adapters that use child_process.spawn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';

import type { CliTask, ExecutionOptions, ICliResponseParser } from './types.js';
import type { CommandConfig } from './subprocess-adapter.js';
import { SubprocessCliAdapter } from './subprocess-adapter.js';

// Mock node:child_process
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

// Import spawn after mock setup
import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

/**
 * Mock ChildProcess factory
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockChildProcess() {
  const emitter = new EventEmitter();
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const mockChild = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
    pid: 1234,
  }) as unknown as ChildProcess;

  return { mockChild, stdin, stdout, stderr };
}

/**
 * Concrete test implementation of SubprocessCliAdapter
 */
class TestSubprocessAdapter extends SubprocessCliAdapter {
  override readonly name = 'claude' as const;
  readonly version = '1.0.0';

  protected readonly parser: ICliResponseParser = {
    name: 'test-parser',
    supportedVersionRange: '>=1.0.0',
    parse: (raw: string) => raw,
    extractResponse: (output: string) => output.trim() || null,
    extractUsage: () => null,
    extractSessionId: () => null,
  };

  private commandConfig: CommandConfig = { command: 'echo', args: [] };

  setCommandConfig(config: CommandConfig): void {
    this.commandConfig = config;
  }

  protected getCommand(_task: CliTask): CommandConfig {
    return this.commandConfig;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'test-model',
      name: 'Test Model',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 1.0,
      costPerMillionOutput: 2.0,
    };
  }
}

describe('SubprocessCliAdapter', () => {
  let adapter: TestSubprocessAdapter;

  beforeEach(() => {
    adapter = new TestSubprocessAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor and identity', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('claude');
    });

    it('should have correct version', () => {
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have subprocess transport', () => {
      expect(adapter.transport).toBe('subprocess');
    });
  });

  describe('initialize() and dispose()', () => {
    it('should set initialized flag on initialize', async () => {
      await adapter.initialize();
      // Access protected field via execute to verify initialization
      const task: CliTask = { content: 'test' };
      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.execute(task);
      stdout.push('response\n');
      stdout.push(null);
      mockChild.emit('close', 0);

      await promise;
      // If initialized was false, execute would call initialize again
      expect(mockSpawn).toHaveBeenCalledOnce();
    });

    it('should clear initialized flag on dispose', async () => {
      await adapter.initialize();
      await adapter.dispose();

      // After dispose, execute should re-initialize
      const task: CliTask = { content: 'test' };
      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.execute(task);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('response\n'));
        mockChild.emit('close', 0);
      });

      await promise;
      expect(mockSpawn).toHaveBeenCalledOnce();
    });
  });

  describe('executeTask() - success cases', () => {
    it('should spawn command and return ok result', async () => {
      adapter.setCommandConfig({ command: 'echo', args: ['hello'] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Simulate stdout data - needs to be async
      setImmediate(() => {
        stdout.emit('data', Buffer.from('hello\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('hello');
      }
      expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should handle multiple stdout chunks', async () => {
      adapter.setCommandConfig({ command: 'cat', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Simulate multiple chunks
      setImmediate(() => {
        stdout.emit('data', Buffer.from('first '));
        stdout.emit('data', Buffer.from('second '));
        stdout.emit('data', Buffer.from('third\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('first second third');
      }
    });

    it('should include durationMs in response', async () => {
      adapter.setCommandConfig({ command: 'echo', args: ['test'] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('test\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.durationMs).toBeTypeOf('number');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('executeTask() - stdin handling', () => {
    it('should write stdin when provided', async () => {
      const stdinContent = 'multi\nline\ncontent';
      adapter.setCommandConfig({
        command: 'cat',
        args: [],
        stdin: stdinContent,
      });

      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdin, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const writeSpy = vi.spyOn(stdin, 'write');
      const endSpy = vi.spyOn(stdin, 'end');

      const promise = adapter.executeTask(task, options);

      // Simulate command echoing stdin
      setImmediate(() => {
        stdout.emit('data', Buffer.from(stdinContent));
        mockChild.emit('close', 0);
      });

      await promise;

      expect(writeSpy).toHaveBeenCalledWith(stdinContent);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should close stdin even when no stdin content provided', async () => {
      adapter.setCommandConfig({ command: 'echo', args: ['test'] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdin, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const endSpy = vi.spyOn(stdin, 'end');

      const promise = adapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('test\n'));
        mockChild.emit('close', 0);
      });

      await promise;

      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('executeTask() - timeout handling', () => {
    it('should kill process on timeout', async () => {
      vi.useFakeTimers();

      adapter.setCommandConfig({ command: 'sleep', args: ['10'] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 1000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Fast-forward past timeout
      vi.advanceTimersByTime(1001);

      // Verify kill was called
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      // Simulate close after kill
      mockChild.emit('close', null);

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.message).toBe('Execution timed out');
      }

      vi.useRealTimers();
    });

    it('should clear timeout on successful completion', async () => {
      vi.useFakeTimers();

      adapter.setCommandConfig({ command: 'echo', args: ['fast'] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Complete quickly
      stdout.emit('data', Buffer.from('fast\n'));
      mockChild.emit('close', 0);

      const result = await promise;

      expect(result.ok).toBe(true);

      // Fast-forward to verify timeout was cleared
      vi.advanceTimersByTime(6000);
      expect(mockChild.kill).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('executeTask() - error handling', () => {
    it('should return NOT_FOUND error for ENOENT', async () => {
      adapter.setCommandConfig({ command: 'nonexistent', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Simulate ENOENT error
      const error = new Error('spawn nonexistent ENOENT');
      mockChild.emit('error', error);

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('claude CLI not found');
      }
    });

    it('should return EXECUTION_ERROR for non-zero exit with stderr', async () => {
      adapter.setCommandConfig({ command: 'false', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stderr } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Simulate stderr output
      setImmediate(() => {
        stderr.emit('data', Buffer.from('command failed\n'));
        // Simulate non-zero exit
        mockChild.emit('close', 1);
      });

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toBe('command failed\n');
      }
    });

    it('should return EXECUTION_ERROR for non-zero exit without stderr', async () => {
      adapter.setCommandConfig({ command: 'false', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Simulate non-zero exit without stderr
      mockChild.emit('close', 1);

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toContain('Process exited with code 1');
      }
    });

    it('should return PARSE_ERROR when parser returns null', async () => {
      // Create adapter with parser that returns null
      class FailingParserAdapter extends TestSubprocessAdapter {
        protected override readonly parser: ICliResponseParser = {
          name: 'failing-parser',
          supportedVersionRange: '>=1.0.0',
          parse: () => null,
          extractResponse: () => null,
          extractUsage: () => null,
          extractSessionId: () => null,
        };
      }

      const failingAdapter = new FailingParserAdapter();
      failingAdapter.setCommandConfig({ command: 'echo', args: ['test'] });

      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = failingAdapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('test\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
        expect(result.error.message).toContain('Failed to parse response');
        // Should include stdout snippet for diagnostics (#1320)
        expect(result.error.message).toContain('test');
      }
    });

    it('should include stderr hint in PARSE_ERROR when stderr present (#1402)', async () => {
      class FailingParserAdapter extends TestSubprocessAdapter {
        protected override readonly parser: ICliResponseParser = {
          name: 'failing-parser',
          supportedVersionRange: '>=1.0.0',
          parse: () => null,
          extractResponse: () => null,
          extractUsage: () => null,
          extractSessionId: () => null,
        };
      }

      const failingAdapter = new FailingParserAdapter();
      failingAdapter.setCommandConfig({ command: 'echo', args: ['test'] });

      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout, stderr } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = failingAdapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('garbled output\n'));
        stderr.emit('data', Buffer.from('warning: model overloaded\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
        expect(result.error.message).toContain('garbled output');
        expect(result.error.message).toContain('[stderr: warning: model overloaded]');
      }
    });

    it('should surface rate-limit errors from stdout (#1320)', async () => {
      class FailingParserAdapter extends TestSubprocessAdapter {
        protected override readonly parser: ICliResponseParser = {
          name: 'failing-parser',
          supportedVersionRange: '>=1.0.0',
          parse: () => null,
          extractResponse: () => null,
          extractUsage: () => null,
          extractSessionId: () => null,
        };
      }

      const failingAdapter = new FailingParserAdapter();
      failingAdapter.setCommandConfig({ command: 'echo', args: ['test'] });

      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = failingAdapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('Error: 429 Too Many Requests\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
        expect(result.error.message).toContain('429');
      }
    });
  });

  describe('handleSubprocessOutput()', () => {
    it('should return EXECUTION_ERROR when stderr only', async () => {
      adapter.setCommandConfig({ command: 'test', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stderr } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Only stderr, no stdout
      setImmediate(() => {
        stderr.emit('data', Buffer.from('error output\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toBe('error output\n');
      }
    });

    it('should extract usage when parser returns usage', async () => {
      // Create adapter with parser that returns usage
      class UsageParserAdapter extends TestSubprocessAdapter {
        protected override readonly parser: ICliResponseParser = {
          name: 'usage-parser',
          supportedVersionRange: '>=1.0.0',
          parse: (raw: string) => raw,
          extractResponse: (output: string) => output.trim(),
          extractUsage: () => ({
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          }),
          extractSessionId: () => null,
        };
      }

      const usageAdapter = new UsageParserAdapter();
      usageAdapter.setCommandConfig({ command: 'echo', args: ['test'] });

      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = usageAdapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('test\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toEqual({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        });
      }
    });

    it('should extract sessionId when parser returns sessionId', async () => {
      // Create adapter with parser that returns sessionId
      class SessionParserAdapter extends TestSubprocessAdapter {
        protected override readonly parser: ICliResponseParser = {
          name: 'session-parser',
          supportedVersionRange: '>=1.0.0',
          parse: (raw: string) => raw,
          extractResponse: (output: string) => output.trim(),
          extractUsage: () => null,
          extractSessionId: () => 'session-123',
        };
      }

      const sessionAdapter = new SessionParserAdapter();
      sessionAdapter.setCommandConfig({ command: 'echo', args: ['test'] });

      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = sessionAdapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('test\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('session-123');
      }
    });
  });

  describe('handleSubprocessError()', () => {
    it('should return TIMEOUT for ETIMEDOUT error', async () => {
      adapter.setCommandConfig({ command: 'test', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      const error = new Error('Connection ETIMEDOUT');
      mockChild.emit('error', error);

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.message).toBe('Execution timed out');
      }
    });

    it('should return TIMEOUT for timeout message', async () => {
      adapter.setCommandConfig({ command: 'test', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      const error = new Error('Request timeout exceeded');
      mockChild.emit('error', error);

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
      }
    });

    it('should return EXECUTION_ERROR for generic Error', async () => {
      adapter.setCommandConfig({ command: 'test', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      const error = new Error('Something went wrong');
      mockChild.emit('error', error);

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toBe('Something went wrong');
      }
    });

    it('should handle non-Error objects', async () => {
      adapter.setCommandConfig({ command: 'test', args: [] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      // Emit non-Error object
      mockChild.emit('error', 'string error');

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toBe('Unknown error');
      }
    });
  });

  describe('onProgress callback (Issue #1087)', () => {
    it('should call onProgress on stdout data', async () => {
      adapter.setCommandConfig({ command: 'echo', args: ['test'] });
      const task: CliTask = { content: 'test' };
      const onProgress = vi.fn();
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('chunk1'));
        stdout.emit('data', Buffer.from('chunk2'));
        stdout.emit('data', Buffer.from('chunk3'));
        mockChild.emit('close', 0);
      });

      await promise;

      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    it('should not throw when onProgress is undefined', async () => {
      adapter.setCommandConfig({ command: 'echo', args: ['test'] });
      const task: CliTask = { content: 'test' };
      const options: Required<ExecutionOptions> = {
        timeoutMs: 5000,
        allowRetry: true,
        maxRetries: 1,
        trackUsage: true,
        onProgress: undefined,
      };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.executeTask(task, options);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('test\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;
      expect(result.ok).toBe(true);
    });
  });

  describe('CommandConfig interface', () => {
    it('should accept command and args', () => {
      const config: CommandConfig = {
        command: 'ls',
        args: ['-la'],
      };

      expect(config.command).toBe('ls');
      expect(config.args).toEqual(['-la']);
      expect(config.stdin).toBeUndefined();
    });

    it('should accept optional stdin', () => {
      const config: CommandConfig = {
        command: 'cat',
        args: [],
        stdin: 'test content',
      };

      expect(config.stdin).toBe('test content');
    });
  });

  describe('integration with execute()', () => {
    it('should work through execute() method', async () => {
      adapter.setCommandConfig({ command: 'echo', args: ['integration'] });
      const task: CliTask = { content: 'test' };

      const { mockChild, stdout } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.execute(task);

      setImmediate(() => {
        stdout.emit('data', Buffer.from('integration\n'));
        mockChild.emit('close', 0);
      });

      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('integration');
      }
    });

    it('should handle errors through execute() method', async () => {
      adapter.setCommandConfig({ command: 'nonexistent', args: [] });
      const task: CliTask = { content: 'test' };

      const { mockChild } = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.execute(task);

      setImmediate(() => {
        const error = new Error('spawn nonexistent ENOENT');
        mockChild.emit('error', error);
      });

      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});
