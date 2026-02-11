/**
 * Tests for MCP Notification Helper.
 *
 * @module mcp/mcp-notifier.test
 * (Source: Issue #974 — Claude Code Observability)
 */

import { describe, it, expect, vi } from 'vitest';
import { createMcpNotifier, NOOP_NOTIFIER } from './mcp-notifier.js';
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
    NOOP_NOTIFIER.info('test', {});
    NOOP_NOTIFIER.debug('test', {});
    NOOP_NOTIFIER.warn('test', {});
    // No-op: methods complete without error
    expect(true).toBe(true);
  });
});
