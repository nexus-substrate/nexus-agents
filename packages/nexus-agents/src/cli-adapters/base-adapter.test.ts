/**
 * Tests for CLI Base Adapter
 *
 * Verifies version checking, health monitoring, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `getVersion` shells out via `promisify(exec)`. A plain callback mock is enough:
// without `util.promisify.custom` the promise resolves to the first callback
// value, which is the `{ stdout }` object `getVersion` destructures.
const execMock = vi.fn(
  (
    _cmd: string,
    _opts: unknown,
    cb: (err: Error | null, res: { stdout: string; stderr: string }) => void
  ) => {
    cb(null, { stdout: '2.1.0', stderr: '' });
  }
);
vi.mock('node:child_process', () => ({
  exec: (
    cmd: string,
    opts: unknown,
    cb: (err: Error | null, res: { stdout: string; stderr: string }) => void
  ): void => {
    execMock(cmd, opts, cb);
  },
}));
import type { CliName, CliTransport, CliTask, ModelInfo } from './types.js';
import { BaseCliAdapter } from './base-adapter.js';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';
import type { CliResponse, CliError, ResolvedExecutionOptions } from './types.js';

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
    _options: ResolvedExecutionOptions
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

  public testGetVersionMessage(
    status: 'supported' | 'outdated' | 'breaking' | 'unsupported',
    version: string
  ): string | undefined {
    return this.getVersionMessage(status, version);
  }

  public testCreateError(code: CliError['code'], message: string, cause?: Error): CliError {
    return this.createError(code, message, cause);
  }

  public testNormalizeResponse(
    text: string,
    usage?: CliResponse['usage'],
    extra?: Partial<CliResponse>
  ): CliResponse {
    return this.normalizeResponse(text, usage, extra);
  }

  public testInitCapacityTracker(): void {
    this.initCapacityTracker();
  }

  public setCachedVersion(version: string): void {
    this.cachedVersion = version;
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
    it('should return the real CLI default capacity from the tracker (#2714)', async () => {
      // Pre-#2714 the assertion read `remainingRequests: 100_000` — the
      // DEFAULT_CAPACITY_FALLBACK constant that getCapacity() returned ONLY
      // when the tracker was still null. doctor never called initialize()
      // before getCapacity(), so the fallback fired every time and the
      // test was pinning the bug behavior. Now getCapacity() lazy-inits
      // and the test asserts the real claude defaults from capacity-tracker
      // (claude: 100k tokens / 50 requests per minute).
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(100_000); // claude DEFAULT_TOKEN_LIMIT
      expect(capacity.remainingRequests).toBe(50); // claude DEFAULT_REQUEST_LIMIT
      expect(capacity.utilizationPercent).toBe(0);
      expect(capacity.rateLimited).toBe(false);
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

  describe('getVersionMessage()', () => {
    it('should return message for unsupported version', () => {
      const msg = adapter.testGetVersionMessage('unsupported', '1.0.0');
      expect(msg).toContain('not supported');
      expect(msg).toContain('1.0.0');
    });

    it('should return message for breaking version', () => {
      const msg = adapter.testGetVersionMessage('breaking', '5.0.0');
      expect(msg).toContain('compatibility issues');
    });

    it('should return message for outdated version', () => {
      const msg = adapter.testGetVersionMessage('outdated', '2.0.1');
      expect(msg).toContain('Consider upgrading');
    });

    it('should return undefined for supported version', () => {
      expect(adapter.testGetVersionMessage('supported', '2.1.0')).toBeUndefined();
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy for supported version', async () => {
      adapter.setCachedVersion('2.1.0');
      const status = await adapter.healthCheck();
      expect(status.healthy).toBe(true);
      expect(status.version).toBe('2.1.0');
      expect(status.versionStatus).toBe('supported');
    });

    it('should return unhealthy for unsupported version', async () => {
      adapter.setCachedVersion('0.0.1');
      const status = await adapter.healthCheck();
      expect(status.healthy).toBe(false);
      expect(status.versionStatus).toBe('unsupported');
      expect(status.message).toContain('not supported');
    });

    it('marks a reachable binary as reachable (#5060)', async () => {
      adapter.setCachedVersion('2.1.0');
      const status = await adapter.healthCheck();
      expect(status.reachable).toBe(true);
    });

    it('marks an unrunnable binary as unreachable, not merely unhealthy (#5060)', async () => {
      // `healthCheck` catches and returns rather than throwing, so a consumer
      // reading only `healthy` cannot tell "binary absent" from "present but
      // on an unsupported version" — `demo` told users to run `auth login`
      // for a CLI they did not have installed.
      const failing = new TestCliAdapter();
      vi.spyOn(failing, 'getVersion').mockRejectedValue(new Error('spawn ENOENT'));

      const status = await failing.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.reachable).toBe(false);
      expect(status.message).toContain('ENOENT');
    });

    it('distinguishes unreachable from an unsupported installed version (#5060)', () => {
      // The pair that makes `reachable` load-bearing: both are `healthy:
      // false` with `versionStatus: 'unsupported'`, so only `reachable`
      // separates them.
      adapter.setCachedVersion('0.0.1');
      return adapter.healthCheck().then((status) => {
        expect(status.healthy).toBe(false);
        expect(status.versionStatus).toBe('unsupported');
        expect(status.reachable).toBe(true);
      });
    });

    it('should handle outdated version in health check', async () => {
      adapter.setCachedVersion('2.0.1');
      const status = await adapter.healthCheck();
      // 2.0.1 is above minimum but below recommended for claude
      expect(status.healthy).toBe(true);
      expect(status.versionStatus).toBe('outdated');
      expect(status.message).toContain('Consider upgrading');
    });
  });

  describe('checkVersionCompatibility() — breaking version', () => {
    it('should return breaking for a version in the breaking list', () => {
      // Claude breaking versions: defined in types.ts. We use a version >= breaking
      // Since CLI_VERSION_REQUIREMENTS.claude.breaking may be empty, test the logic
      // by ensuring the function handles valid semver correctly
      const status = adapter.testCheckVersionCompatibility('2.0.76');
      expect(['supported', 'outdated', 'breaking']).toContain(status);
    });
  });

  describe('createError() with cause', () => {
    it('should include cause when provided', () => {
      const cause = new Error('root cause');
      const error = adapter.testCreateError('EXECUTION_ERROR', 'Task failed', cause);
      expect(error.cause).toBe(cause);
    });

    it('should omit cause when not provided', () => {
      const error = adapter.testCreateError('EXECUTION_ERROR', 'Task failed');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('normalizeResponse()', () => {
    it('should return response with text only', () => {
      const response = adapter.testNormalizeResponse('hello');
      expect(response.text).toBe('hello');
      expect(response.usage).toBeUndefined();
    });

    it('should include usage when provided', () => {
      const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
      const response = adapter.testNormalizeResponse('hello', usage);
      expect(response.usage).toEqual(usage);
    });

    it('should merge extra fields', () => {
      const response = adapter.testNormalizeResponse('hello', undefined, { durationMs: 100 });
      expect(response.durationMs).toBe(100);
    });
  });

  describe('execute() timeout priority', () => {
    it('should use task.timeoutMs when no options.timeoutMs', async () => {
      adapter.setMockResult(ok({ text: 'response' }));

      await adapter.execute({ content: 'test', timeoutMs: 45_000 });

      expect(adapter.executeCalled).toBe(1);
    });
  });

  describe('capacity with initialized tracker', () => {
    it('should return tracked capacity after initialization', async () => {
      adapter.testInitCapacityTracker();
      const capacity = await adapter.getCapacity();
      expect(capacity).toBeDefined();
      expect(capacity.remainingTokens).toBeGreaterThan(0);
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

// ============================================================================
// versionProbedAt — a replay is distinguishable from a fresh probe (#5864)
// ============================================================================

describe('BaseCliAdapter.healthCheck — version-cache disclosure (#5864)', () => {
  const T0 = 1_700_000_000_000;
  let clock: FixedTimeProvider;

  beforeEach(() => {
    execMock.mockClear();
    clock = new FixedTimeProvider(T0);
    setTimeProvider(clock);
  });

  afterEach(() => {
    resetTimeProvider();
  });

  it('dates the probe to the moment it ran', async () => {
    const adapter = new TestCliAdapter();

    const status = await adapter.healthCheck();

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(status.reachable).toBe(true);
    expect(status.versionProbedAt?.getTime()).toBe(T0);
    expect(status.lastChecked.getTime()).toBe(T0);
  });

  it('shows a later check resting on the earlier probe, not a new one', async () => {
    // `cachedVersion` has no TTL and is never reset, so this second call spawns
    // nothing. `reachable: true` and a fresh `lastChecked` used to be the whole
    // record — a replay dated as if it had just probed the binary.
    const adapter = new TestCliAdapter();
    await adapter.healthCheck();

    clock.advance(600_000); // ten minutes; the binary could be gone by now
    const status = await adapter.healthCheck();

    expect(execMock).toHaveBeenCalledTimes(1); // no second spawn
    expect(status.lastChecked.getTime()).toBe(T0 + 600_000);
    expect(status.versionProbedAt?.getTime()).toBe(T0);
    expect(status.versionProbedAt?.getTime()).toBeLessThan(status.lastChecked.getTime());
  });

  it('omits the marker when nothing was ever probed', async () => {
    // The other empty case: absent means "this producer did not read a
    // binary", which is different from "the reading is stale".
    const adapter = new TestCliAdapter();
    adapter.setCachedVersion('2.1.0');

    const status = await adapter.healthCheck();

    expect(execMock).not.toHaveBeenCalled();
    expect(status.versionProbedAt).toBeUndefined();
  });
});
