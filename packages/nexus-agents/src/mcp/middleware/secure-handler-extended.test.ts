/**
 * Tests for SecureHandler middleware.
 * (Source: Issue #185 Phase 1)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSecureHandler,
  createSecureHandlerFactory,
  type ToolHandler,
  type ContextAwareHandler,
} from './secure-handler.js';
import { createDefaultPolicyFirewall, type IPolicyFirewall } from './policy.js';
import { RateLimiter } from './rate-limiter.js';

describe('SecureHandler', () => {
  // Mock handler that returns success
  const mockSuccessHandler: ToolHandler = vi.fn(() =>
    Promise.resolve({ content: [{ type: 'text' as const, text: 'success' }] })
  );

  // Mock handler that returns error
  const mockErrorHandler: ToolHandler = vi.fn(() =>
    Promise.resolve({ isError: true, content: [{ type: 'text' as const, text: 'error' }] })
  );

  // Mock handler that throws
  const mockThrowingHandler: ToolHandler = vi.fn(() =>
    Promise.reject(new Error('Unexpected error'))
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSecureHandler', () => {
    it('should execute handler and return result', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'test_tool',
      });

      const result = await secureHandler({ input: 'test' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toBe('success');
      expect(mockSuccessHandler).toHaveBeenCalledWith({ input: 'test' });
    });

    it('should pass request context to context-aware handlers', async () => {
      const contextAwareHandler: ContextAwareHandler = vi.fn((_args, ctx) =>
        Promise.resolve({
          content: [
            {
              type: 'text' as const,
              text: `requestId: ${String(ctx.requestContext.requestId)}`,
            },
          ],
        })
      );

      const secureHandler = createSecureHandler(contextAwareHandler, {
        toolName: 'context_tool',
      });

      const result = await secureHandler({});

      expect(result.content[0]?.text).toMatch(/^requestId: req_[a-f0-9]{16}$/);
      expect(contextAwareHandler).toHaveBeenCalled();
    });

    it('should handle thrown errors gracefully', async () => {
      const secureHandler = createSecureHandler(mockThrowingHandler, {
        toolName: 'throwing_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Internal error: Unexpected error/);
      expect(result.content[0]?.text).toMatch(/request: req_/);
    });

    it('should log error handlers without marking as exception', async () => {
      const secureHandler = createSecureHandler(mockErrorHandler, {
        toolName: 'error_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe('error');
    });
  });

  describe('rate limiting integration', () => {
    it('should allow requests when under rate limit', async () => {
      const rateLimiter = new RateLimiter({ capacity: 10, refillRate: 1 });

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rate_limited_tool',
        rateLimiter,
      });

      const result = await secureHandler({});

      expect(result.isError).toBeUndefined();
    });

    it('should block requests when rate limit exceeded', async () => {
      const rateLimiter = new RateLimiter({ capacity: 0, refillRate: 0 });

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rate_limited_tool',
        rateLimiter,
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Rate limit exceeded/);
      expect(mockSuccessHandler).not.toHaveBeenCalled();
    });
  });

  describe('policy firewall integration', () => {
    let policyFirewall: IPolicyFirewall;

    beforeEach(() => {
      policyFirewall = createDefaultPolicyFirewall();
    });

    it('should allow read operations in read-only mode', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'read_file',
        policyFirewall,
        executionMode: 'read-only',
      });

      const result = await secureHandler({ path: './test.txt' });

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalled();
    });

    it('should deny write operations in read-only mode', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'write_file',
        policyFirewall,
        executionMode: 'read-only',
      });

      const result = await secureHandler({ path: './test.txt', content: 'data' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Policy denied/);
      expect(mockSuccessHandler).not.toHaveBeenCalled();
    });

    it('should allow write operations in read-write mode', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'write_file',
        policyFirewall,
        executionMode: 'read-write',
        allowedPaths: ['./'],
      });

      const result = await secureHandler({ path: './test.txt', content: 'data' });

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalled();
    });

    it('should deny path traversal attempts', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'read_file',
        policyFirewall,
        executionMode: 'read-write',
        allowedPaths: ['./src'],
      });

      const result = await secureHandler({ path: '../../../etc/passwd' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Policy denied/);
      expect(mockSuccessHandler).not.toHaveBeenCalled();
    });

    it('should include request ID in policy denial messages', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'write_file',
        policyFirewall,
        executionMode: 'read-only',
      });

      const result = await secureHandler({});

      expect(result.content[0]?.text).toMatch(/request: req_[a-f0-9]{16}/);
    });
  });

  describe('createSecureHandlerFactory', () => {
    it('should create factory with shared configuration', async () => {
      const rateLimiter = new RateLimiter({ capacity: 100, refillRate: 10 });

      // Factory without policy firewall to test rate limiter sharing
      const createHandler = createSecureHandlerFactory({
        rateLimiter,
      });

      const handler1 = createHandler('tool_a', mockSuccessHandler);
      const handler2 = createHandler('tool_b', mockSuccessHandler);

      const result1 = await handler1({});
      const result2 = await handler2({});

      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();
    });

    it('should apply shared policy to all created handlers', async () => {
      const policyFirewall = createDefaultPolicyFirewall();

      const createHandler = createSecureHandlerFactory({
        policyFirewall,
        executionMode: 'read-only',
      });

      const writeHandler = createHandler('write_file', mockSuccessHandler);

      const result = await writeHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Policy denied/);
    });
  });

  describe('combined middleware', () => {
    it('should apply rate limiting before policy check', async () => {
      const rateLimiter = new RateLimiter({ capacity: 0, refillRate: 0 });
      const policyFirewall = createDefaultPolicyFirewall();

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'write_file',
        rateLimiter,
        policyFirewall,
        executionMode: 'read-only',
      });

      const result = await secureHandler({});

      // Should fail on rate limit, not policy
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Rate limit exceeded/);
    });
  });
});
