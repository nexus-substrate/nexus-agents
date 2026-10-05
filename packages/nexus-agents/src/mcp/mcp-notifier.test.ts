/**
 * Tests for MCP Notification Helper.
 *
 * @module mcp/mcp-notifier.test
 * (Source: Issue #974 — Claude Code Observability)
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { getGlobalLogLevel, setGlobalLogLevel } from '../core/logger.js';
import { createMcpNotifier, NOOP_NOTIFIER, withProgressHeartbeat } from './mcp-notifier.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockServer(sendFn?: (...args: unknown[]) => Promise<void>) {
  return {
    sendLoggingMessage: sendFn ?? vi.fn(() => Promise.resolve()),
  } as unknown as McpServer;
}

// ============================================================================
// Tests
// ============================================================================

describe('createMcpNotifier', () => {
  const originalLevel = getGlobalLogLevel();

  beforeEach(() => {
    setGlobalLogLevel('debug');
  });

  afterEach(() => {
    setGlobalLogLevel(originalLevel);
    vi.restoreAllMocks();
  });

  it.each(['info', 'debug', 'warn'] as const)('writes %s operator events to stderr', (level) => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const notifier = createMcpNotifier(createMockServer());

    notifier[level]('workflow', { event: 'step_started', step: 'analyze' });

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      level,
      message: 'workflow',
      context: { event: 'step_started', step: 'analyze' },
    });
    expect(stdout).not.toHaveBeenCalled();
  });

  it.each(['info', 'debug', 'warn'] as const)('never sends %s through MCP Logging', (level) => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const sendFn = vi.fn(() => Promise.resolve());
    const notifier = createMcpNotifier(createMockServer(sendFn));

    notifier[level]('workflow', { event: 'step_started' });

    expect(sendFn).not.toHaveBeenCalled();
  });

  it('logs empty context as an operator message', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    createMcpNotifier(createMockServer()).info('workflow', {});
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({ message: 'workflow' });
  });

  it('uses logger redaction for sensitive event fields', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    createMcpNotifier(createMockServer()).warn('workflow', { password: 'TEST_FAKE_PASSWORD' });
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      context: { password: '[REDACTED]' },
    });
  });

  it('respects the operator log level', () => {
    setGlobalLogLevel('info');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const notifier = createMcpNotifier(createMockServer());
    notifier.debug('workflow', { event: 'heartbeat' });
    notifier.info('workflow', { event: 'completed' });
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('completed');
  });

  it('does not break tool execution when stderr is unavailable', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('stderr unavailable');
    });
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const notifier = createMcpNotifier(createMockServer());
    expect(() => {
      notifier.info('workflow', { event: 'started' });
    }).not.toThrow();
    expect(stdout).not.toHaveBeenCalled();
  });

  it('reports an event serialization failure through the logger', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const data = {
      get event(): string {
        throw new Error('unreadable event');
      },
    };
    const notifier = createMcpNotifier(createMockServer());
    expect(() => {
      notifier.info('workflow', data);
    }).not.toThrow();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('unreadable event');
  });

  it('works without a connected MCP server', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const notifier = createMcpNotifier({} as unknown as McpServer);
    expect(() => {
      notifier.info('workflow', { event: 'started' });
    }).not.toThrow();
    expect(stderr).toHaveBeenCalledTimes(1);
  });
});

describe('NOOP_NOTIFIER', () => {
  it('has info/debug/warn methods that do nothing', () => {
    expect(() => {
      NOOP_NOTIFIER.info('test', {});
    }).not.toThrow();
    expect(() => {
      NOOP_NOTIFIER.debug('test', {});
    }).not.toThrow();
    expect(() => {
      NOOP_NOTIFIER.warn('test', {});
    }).not.toThrow();
  });
});

describe('withProgressHeartbeat', () => {
  it('returns the operation result', async () => {
    const result = await withProgressHeartbeat('test_tool', NOOP_NOTIFIER, () =>
      Promise.resolve(42)
    );
    expect(result).toBe(42);
  });

  it('sends heartbeat notifications during long operations', async () => {
    vi.useFakeTimers();
    const debugCalls: Record<string, unknown>[] = [];
    const notifier = {
      info: vi.fn(),
      debug: vi.fn((_logger: string, data: Record<string, unknown>) => {
        debugCalls.push(data);
      }),
      warn: vi.fn(),
    };

    // Start a long operation
    let resolve: (v: string) => void = () => undefined;
    const promise = withProgressHeartbeat(
      'test_tool',
      notifier,
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
      100 // 100ms interval for test speed
    );

    // Advance past 3 heartbeats
    await vi.advanceTimersByTimeAsync(350);
    expect(debugCalls.length).toBe(3);
    expect(debugCalls[0]).toEqual(
      expect.objectContaining({
        event: 'heartbeat',
        beatCount: 1,
      })
    );
    expect(debugCalls[2]).toEqual(
      expect.objectContaining({
        event: 'heartbeat',
        beatCount: 3,
      })
    );

    // Resolve and verify cleanup
    resolve('done');
    const result = await promise;
    expect(result).toBe('done');

    // No more heartbeats after resolution
    await vi.advanceTimersByTimeAsync(200);
    expect(debugCalls.length).toBe(3);

    vi.useRealTimers();
  });

  it('cleans up timer on operation error', async () => {
    vi.useFakeTimers();
    const notifier = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };

    const promise = withProgressHeartbeat(
      'test_tool',
      notifier,
      () => Promise.reject(new Error('boom')),
      100
    );

    await expect(promise).rejects.toThrow('boom');

    // Timer cleaned up — no heartbeats after error
    await vi.advanceTimersByTimeAsync(500);
    expect(notifier.debug).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
