/**
 * nexus-agents/mcp - Tool Wrapper Tests
 *
 * Tests for the tool wrapper helper functions.
 *
 * @module mcp/middleware/tool-wrapper.test
 * (Source: Issue #271, CVE-2026-0621 mitigation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createToolFactory,
  wrapToolWithTimeout,
  toSdkCallback,
  DEFAULT_TIMEOUT_CONFIG,
} from './tool-wrapper.js';
import { progressContextStorage } from '../mcp-notifier.js';
import type { SecurityConfig } from '../../config/schemas.js';

describe('tool-wrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DEFAULT_TIMEOUT_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_TIMEOUT_CONFIG.defaultTimeoutMs).toBe(60_000);
      expect(DEFAULT_TIMEOUT_CONFIG.maxTimeoutMs).toBe(900_000);
      expect(DEFAULT_TIMEOUT_CONFIG.enableLogging).toBe(true);
      expect(DEFAULT_TIMEOUT_CONFIG.uriValidation).toBe(true);
    });
  });

  describe('wrapToolWithTimeout', () => {
    it('should wrap a simple handler', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'success' }],
      });

      const wrapped = wrapToolWithTimeout('test_tool', handler);

      // Run wrapped handler
      const resultPromise = wrapped({});
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result.content[0]).toHaveProperty('text', 'success');
    });

    it('should timeout slow handlers', async () => {
      const slowHandler = vi.fn().mockImplementation(async () => {
        // Never resolves during the test
        return new Promise(() => {});
      });

      const wrapped = wrapToolWithTimeout('slow_tool', slowHandler, {
        timeoutMs: 100,
      });

      const resultPromise = wrapped({});

      // Fast-forward time past the timeout
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('timed out');
    });

    it('should pass arguments to the handler', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'done' }],
      });

      const wrapped = wrapToolWithTimeout('test_tool', handler);

      const args = { task: 'test task', value: 42 };
      const resultPromise = wrapped(args);
      await vi.runAllTimersAsync();
      await resultPromise;

      // Handler receives args (and potentially context for context-aware handlers)
      expect(handler).toHaveBeenCalledWith(expect.objectContaining(args));
    });
  });

  describe('createToolFactory', () => {
    it('should create a factory that wraps handlers', async () => {
      const factory = createToolFactory({});
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'factory result' }],
      });

      const wrapped = factory('factory_tool', handler);
      const resultPromise = wrapped({ input: 'test' });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(handler).toHaveBeenCalled();
      expect(result.content[0]).toHaveProperty('text', 'factory result');
    });

    it('should use security config for timeout settings', async () => {
      const security: SecurityConfig = {
        allowedPaths: ['./'],
        blockedPatterns: [],
        rateLimit: { enabled: true, requestsPerMinute: 60 },
        timeout: {
          defaultTimeoutMs: 5000,
          maxTimeoutMs: 10000,
          enableLogging: true,
          uriValidation: true,
        },
      };

      const factory = createToolFactory({ security });
      const slowHandler = vi.fn().mockImplementation(async () => {
        return new Promise(() => {});
      });

      const wrapped = factory('configured_tool', slowHandler);
      const resultPromise = wrapped({});

      // Should timeout after 5000ms (from config)
      await vi.advanceTimersByTimeAsync(6000);

      const result = await resultPromise;
      expect(result.isError).toBe(true);
    });

    it('should allow per-tool timeout override', async () => {
      const factory = createToolFactory({});
      const slowHandler = vi.fn().mockImplementation(async () => {
        return new Promise(() => {});
      });

      const wrapped = factory('override_tool', slowHandler, {
        timeoutMs: 100,
      });

      const resultPromise = wrapped({});
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result.isError).toBe(true);
    });

    it('should allow skipping timeout', async () => {
      const factory = createToolFactory({});
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'no timeout' }],
      });

      const wrapped = factory('no_timeout_tool', handler, {
        skipTimeout: true,
      });

      const resultPromise = wrapped({});
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should succeed even without timeout middleware
      expect(result.content[0]).toHaveProperty('text', 'no timeout');
    });

    it('should use shared logger', async () => {
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      const factory = createToolFactory({
        logger: logger as unknown as Parameters<typeof createToolFactory>[0]['logger'],
      });
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'logged' }],
      });

      const wrapped = factory('logged_tool', handler);
      const resultPromise = wrapped({});
      await vi.runAllTimersAsync();
      await resultPromise;

      // Logger should have been used
      expect(logger.child).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      const wrapped = wrapToolWithTimeout('error_tool', errorHandler);
      const resultPromise = wrapped({});
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Middleware wraps errors - may show generic message or specific based on config
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBeDefined();
    });

    it('should handle non-Error throws', async () => {
      const throwHandler = vi.fn().mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal -- Testing non-Error throw handling
        throw 'string error';
      });

      const wrapped = wrapToolWithTimeout('throw_tool', throwHandler);
      const resultPromise = wrapped({});
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBeDefined();
    });
  });
});

describe('toSdkCallback progress context', () => {
  it('sets progress context when extra has progressToken', async () => {
    vi.useRealTimers();
    let capturedCtx: unknown = 'not-set';
    const handler = vi.fn(() => {
      capturedCtx = progressContextStorage.getStore();
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    const callback = toSdkCallback(handler);
    const extra = {
      _meta: { progressToken: 42 },
      sendNotification: vi.fn(() => Promise.resolve()),
    };

    await callback({ input: 'test' }, extra);

    expect(capturedCtx).toBeDefined();
    const ctx = capturedCtx as { progressToken: number };
    expect(ctx.progressToken).toBe(42);
  });

  it('does not set progress context when no progressToken', async () => {
    vi.useRealTimers();
    let capturedCtx: unknown = 'not-set';
    const handler = vi.fn(() => {
      capturedCtx = progressContextStorage.getStore();
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    const callback = toSdkCallback(handler);
    await callback({ input: 'test' }, {});

    expect(capturedCtx).toBeUndefined();
  });

  it('progress sender calls sendNotification with correct params', async () => {
    vi.useRealTimers();
    const sendFn = vi.fn(() => Promise.resolve());
    let capturedSender: ((n: number) => void) | undefined;
    const handler = vi.fn(() => {
      const ctx = progressContextStorage.getStore();
      capturedSender = ctx?.sendNotification;
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    const callback = toSdkCallback(handler);
    await callback(
      {},
      {
        _meta: { progressToken: 'tok-1' },
        sendNotification: sendFn,
      }
    );

    expect(capturedSender).toBeDefined();
    capturedSender?.(5);

    expect(sendFn).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: { progressToken: 'tok-1', progress: 5 },
    });
  });
});
