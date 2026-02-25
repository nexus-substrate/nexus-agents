/**
 * Tests for MCP Notification Helper.
 *
 * @module mcp/mcp-notifier.test
 * (Source: Issue #974 — Claude Code Observability)
 */

import { describe, it, expect, vi } from 'vitest';
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
  it('sends info-level notification', () => {
    const sendFn = vi.fn(() => Promise.resolve());
    const server = createMockServer(sendFn);
    const notifier = createMcpNotifier(server);

    notifier.info('delegate', { event: 'model_selected', model: 'claude-opus' });

    expect(sendFn).toHaveBeenCalledWith({
      level: 'info',
      logger: 'delegate',
      data: { event: 'model_selected', model: 'claude-opus' },
    });
  });

  it('sends debug-level notification', () => {
    const sendFn = vi.fn(() => Promise.resolve());
    const server = createMockServer(sendFn);
    const notifier = createMcpNotifier(server);

    notifier.debug('consensus', { event: 'vote_collected', role: 'architect' });

    expect(sendFn).toHaveBeenCalledWith({
      level: 'debug',
      logger: 'consensus',
      data: { event: 'vote_collected', role: 'architect' },
    });
  });

  it('sends warning-level notification', () => {
    const sendFn = vi.fn(() => Promise.resolve());
    const server = createMockServer(sendFn);
    const notifier = createMcpNotifier(server);

    notifier.warn('workflow', { event: 'step_failed', step: 'analyze' });

    expect(sendFn).toHaveBeenCalledWith({
      level: 'warning',
      logger: 'workflow',
      data: { event: 'step_failed', step: 'analyze' },
    });
  });

  it('does not throw when sendLoggingMessage rejects', () => {
    const sendFn = vi.fn(() => Promise.reject(new Error('not connected')));
    const server = createMockServer(sendFn);
    const notifier = createMcpNotifier(server);

    // Should not throw
    expect(() => {
      notifier.info('test', { event: 'test' });
    }).not.toThrow();
  });

  it('does not throw when sendLoggingMessage throws synchronously', () => {
    const sendFn = vi.fn(() => {
      throw new Error('server not initialized');
    });
    const server = createMockServer(sendFn);
    const notifier = createMcpNotifier(server);

    // Should not throw — caught by try/catch wrapper
    expect(() => {
      notifier.info('test', { event: 'test' });
    }).not.toThrow();
  });

  it('does not throw when server lacks sendLoggingMessage', () => {
    const server = {} as unknown as McpServer;
    const notifier = createMcpNotifier(server);

    // Should not throw
    expect(() => {
      notifier.info('test', { event: 'test' });
    }).not.toThrow();
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
