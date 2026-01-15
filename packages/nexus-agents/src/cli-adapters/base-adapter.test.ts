/**
 * Tests for CLI Base Adapter
 *
 * Verifies version checking, health monitoring, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CliName, CliTransport, CliTask, ModelInfo } from './types.js';
import { BaseCliAdapter } from './base-adapter.js';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { CliResponse, CliError, ExecutionOptions } from './types.js';

/**
 * Concrete test implementation of BaseCliAdapter
 */
class TestCliAdapter extends BaseCliAdapter {
  readonly name: CliName = 'claude';
  readonly transport: CliTransport = 'subprocess';

  private mockResult: Result<CliResponse, CliError> | null = null;
  public executeCalled = 0;

  setMockResult(result: Result<CliResponse, CliError>): void {
    this.mockResult = result;
  }

  executeTask(
    _task: CliTask,
    _options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    this.executeCalled++;
    if (this.mockResult) {
      return Promise.resolve(this.mockResult);
    }
    return Promise.resolve(ok({ text: 'test response' }));
  }

  getModelInfo(): ModelInfo {
    return {
      id: 'test-model',
      name: 'Test Model',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 1.0,
      costPerMillionOutput: 2.0,
    };
  }

  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }

  // Expose protected methods for testing
  public testParseVersion(output: string): string {
    return this.parseVersion(output);
  }

  public testCheckVersionCompatibility(version: string): string {
    return this.checkVersionCompatibility(version);
  }

  public testCreateError(code: CliError['code'], message: string): CliError {
    return this.createError(code, message);
  }
}

describe('BaseCliAdapter', () => {
  let adapter: TestCliAdapter;

  beforeEach(() => {
    adapter = new TestCliAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseVersion()', () => {
    it('should parse simple version number', () => {
      expect(adapter.testParseVersion('2.0.76')).toBe('2.0.76');
    });

    it('should parse version from Claude CLI format', () => {
      expect(adapter.testParseVersion('2.0.76 (Claude Code)')).toBe('2.0.76');
    });

    it('should parse version from Gemini CLI format', () => {
      expect(adapter.testParseVersion('gemini-cli 0.22.5')).toBe('0.22.5');
    });

    it('should parse version from Codex CLI format', () => {
      expect(adapter.testParseVersion('codex-cli 0.77.0')).toBe('0.77.0');
    });

    it('should return 0.0.0 for unparseable version', () => {
      expect(adapter.testParseVersion('no version here')).toBe('0.0.0');
      expect(adapter.testParseVersion('')).toBe('0.0.0');
    });
  });

  describe('checkVersionCompatibility()', () => {
    it('should return supported for valid version', () => {
      expect(adapter.testCheckVersionCompatibility('2.0.76')).toBe('supported');
    });

    it('should return unsupported for invalid semver', () => {
      expect(adapter.testCheckVersionCompatibility('invalid')).toBe('unsupported');
    });

    it('should return unsupported for version below minimum', () => {
      expect(adapter.testCheckVersionCompatibility('1.0.0')).toBe('unsupported');
    });

    it('should return outdated for version below recommended', () => {
      expect(adapter.testCheckVersionCompatibility('2.0.1')).toBe('outdated');
    });
  });

  describe('createError()', () => {
    it('should create error with correct fields', () => {
      const error = adapter.testCreateError('TIMEOUT', 'Request timed out');

      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('Request timed out');
      expect(error.cli).toBe('claude');
      expect(error.retryable).toBe(true);
    });

    it('should mark RATE_LIMITED as retryable', () => {
      const error = adapter.testCreateError('RATE_LIMITED', 'Rate limit exceeded');
      expect(error.retryable).toBe(true);
    });

    it('should mark CONNECTION_ERROR as retryable', () => {
      const error = adapter.testCreateError('CONNECTION_ERROR', 'Connection failed');
      expect(error.retryable).toBe(true);
    });

    it('should mark PARSE_ERROR as not retryable', () => {
      const error = adapter.testCreateError('PARSE_ERROR', 'Failed to parse');
      expect(error.retryable).toBe(false);
    });

    it('should mark NOT_FOUND as not retryable', () => {
      const error = adapter.testCreateError('NOT_FOUND', 'CLI not found');
      expect(error.retryable).toBe(false);
    });
  });

  describe('execute()', () => {
    it('should initialize adapter if not initialized', async () => {
      adapter.setMockResult(ok({ text: 'response' }));

      await adapter.execute({ content: 'test' });

      expect(adapter.executeCalled).toBe(1);
    });

    it('should return success result', async () => {
      adapter.setMockResult(ok({ text: 'success', durationMs: 100 }));

      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('success');
      }
    });

    it('should return error result without retry for non-retryable errors', async () => {
      adapter.setMockResult(
        err({
          code: 'PARSE_ERROR',
          message: 'Parse failed',
          cli: 'claude',
          retryable: false,
        })
      );

      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(false);
      expect(adapter.executeCalled).toBe(1); // No retry
    });

    it('should retry for retryable errors', async () => {
      // Use fake timers to avoid actual delays
      vi.useFakeTimers();

      let callCount = 0;

      // Override executeTask to track calls and eventually succeed
      // Default maxRetries is 1 (per Issue #280), so succeed on 2nd attempt
      adapter.executeTask = () => {
        callCount++;
        if (callCount >= 2) {
          return Promise.resolve(ok({ text: 'success after retry' }));
        }
        return Promise.resolve(
          err({
            code: 'TIMEOUT',
            message: 'Timeout',
            cli: 'claude',
            retryable: true,
          })
        );
      };

      const executePromise = adapter.execute({ content: 'test' });

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();

      const result = await executePromise;

      expect(result.ok).toBe(true);
      // Default maxRetries: 1, so 2 total attempts (initial + 1 retry)
      expect(callCount).toBe(2);

      vi.useRealTimers();
    });

    it('should respect maxRetries option', async () => {
      vi.useFakeTimers();

      adapter.setMockResult(
        err({
          code: 'TIMEOUT',
          message: 'Timeout',
          cli: 'claude',
          retryable: true,
        })
      );

      const executePromise = adapter.execute({ content: 'test' }, { maxRetries: 1 });
      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(false);
      expect(adapter.executeCalled).toBe(2); // Initial + 1 retry

      vi.useRealTimers();
    });

    it('should not retry when allowRetry is false', async () => {
      adapter.setMockResult(
        err({
          code: 'TIMEOUT',
          message: 'Timeout',
          cli: 'claude',
          retryable: true,
        })
      );

      const result = await adapter.execute({ content: 'test' }, { allowRetry: false });

      expect(result.ok).toBe(false);
      expect(adapter.executeCalled).toBe(1);
    });
  });

  describe('getCapacity()', () => {
    it('should return full capacity by default', async () => {
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(Number.MAX_SAFE_INTEGER);
      expect(capacity.remainingRequests).toBe(Number.MAX_SAFE_INTEGER);
      expect(capacity.utilizationPercent).toBe(0);
      expect(capacity.exhausted).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('should return capabilities for the CLI', () => {
      const caps = adapter.capabilities;

      expect(caps).toBeDefined();
      expect(caps.reasoning).toBeTypeOf('number');
      expect(caps.contextWindow).toBeTypeOf('number');
    });
  });
});

describe('version status messages', () => {
  let adapter: TestCliAdapter;

  beforeEach(() => {
    adapter = new TestCliAdapter();
  });

  it('should have correct status for supported version', () => {
    const status = adapter.testCheckVersionCompatibility('2.1.0');
    expect(status).toBe('supported');
  });
});
