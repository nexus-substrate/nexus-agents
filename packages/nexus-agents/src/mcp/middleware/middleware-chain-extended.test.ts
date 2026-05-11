/**
 * Tests for Centralized Middleware Chain.
 * (Source: Issue #189)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  createMiddlewareChain,
  withMiddleware,
  createMiddlewareFactory,
  type ContextAwareToolHandler,
  type ToolResult,
} from './middleware-chain.js';
import { createDefaultPolicyFirewall } from './policy.js';
import { RateLimiter } from './rate-limiter.js';

describe('Middleware Chain', () => {
  const successResult: ToolResult = {
    content: [{ type: 'text', text: 'success' }],
  };

  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMiddlewareChain', () => {
    it('should execute handler and return result', async () => {
      const chain = createMiddlewareChain({ toolName: 'test_tool' });
      const wrapped = chain(successHandler);

      const result = await wrapped({ input: 'test' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toBe('success');
      expect(successHandler).toHaveBeenCalled();
    });

    it('should pass middleware context to handler', async () => {
      const contextHandler: ContextAwareToolHandler = vi.fn((_args, ctx) => {
        expect(ctx.requestContext).toBeDefined();
        expect(ctx.requestContext.requestId).toMatch(/^req_[a-f0-9]{16}$/);
        expect(ctx.logger).toBeDefined();
        return Promise.resolve(successResult);
      });

      const chain = createMiddlewareChain({ toolName: 'context_tool' });
      const wrapped = chain(contextHandler);

      await wrapped({});

      expect(contextHandler).toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const throwingHandler: ContextAwareToolHandler = vi.fn(() =>
        Promise.reject(new Error('Handler error'))
      );

      const chain = createMiddlewareChain({ toolName: 'throwing_tool' });
      const wrapped = chain(throwingHandler);

      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Internal error');
      expect(result.content[0]?.text).toContain('request: req_');
    });
  });

  describe('validation middleware', () => {
    const schema = z.object({
      name: z.string().min(1),
      count: z.number().positive(),
    });

    it('should pass valid input to handler', async () => {
      const chain = createMiddlewareChain({
        toolName: 'validated_tool',
        schema,
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({ name: 'test', count: 5 });

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should reject invalid input', async () => {
      const chain = createMiddlewareChain({
        toolName: 'validated_tool',
        schema,
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({ name: '', count: -1 });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Validation error');
      expect(successHandler).not.toHaveBeenCalled();
    });

    it('should skip validation when configured', async () => {
      const chain = createMiddlewareChain({
        toolName: 'skip_validation_tool',
        schema,
        skip: { validation: true },
      });
      const wrapped = chain(successHandler);

      // Invalid input should pass through when validation is skipped
      const result = await wrapped({ invalid: 'data' });

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('policy middleware', () => {
    it('should allow read operations in read-only mode', async () => {
      const chain = createMiddlewareChain({
        toolName: 'read_file',
        policyFirewall: createDefaultPolicyFirewall(),
        executionMode: 'read-only',
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({ path: './test.txt' });

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should deny write operations in read-only mode', async () => {
      const chain = createMiddlewareChain({
        toolName: 'write_file',
        policyFirewall: createDefaultPolicyFirewall(),
        executionMode: 'read-only',
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({ path: './test.txt', content: 'data' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Policy denied');
      expect(successHandler).not.toHaveBeenCalled();
    });

    it('should allow write operations in read-write mode', async () => {
      const chain = createMiddlewareChain({
        toolName: 'write_file',
        policyFirewall: createDefaultPolicyFirewall(),
        executionMode: 'read-write',
        allowedPaths: ['./'],
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({ path: './test.txt', content: 'data' });

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should skip policy when configured', async () => {
      const chain = createMiddlewareChain({
        toolName: 'write_file',
        policyFirewall: createDefaultPolicyFirewall(),
        executionMode: 'read-only',
        skip: { policy: true },
      });
      const wrapped = chain(successHandler);

      // Write should be allowed when policy is skipped
      const result = await wrapped({ path: './test.txt', content: 'data' });

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('rate limit middleware', () => {
    it('should allow requests under rate limit', async () => {
      const chain = createMiddlewareChain({
        toolName: 'rate_limited_tool',
        rateLimiter: { capacity: 10, refillRate: 1 },
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({});

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should block requests over rate limit', async () => {
      const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
      const chain = createMiddlewareChain({
        toolName: 'rate_limited_tool',
        rateLimiter: limiter,
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
      expect(successHandler).not.toHaveBeenCalled();
    });

    it('should skip rate limiting when configured', async () => {
      const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
      const chain = createMiddlewareChain({
        toolName: 'rate_limited_tool',
        rateLimiter: limiter,
        skip: { rateLimit: true },
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({});

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('timeout middleware', () => {
    it('should complete fast operations', async () => {
      const chain = createMiddlewareChain({
        toolName: 'fast_tool',
        timeout: { defaultTimeoutMs: 5000 },
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({});

      expect(result.isError).toBeUndefined();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should timeout slow operations', async () => {
      const slowHandler: ContextAwareToolHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return successResult;
      });

      const chain = createMiddlewareChain({
        toolName: 'slow_tool',
        timeout: { defaultTimeoutMs: 50 },
      });
      const wrapped = chain(slowHandler);

      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('timed out');
    });
  });

  describe('audit middleware', () => {
    it('should include request ID in error messages', async () => {
      const chain = createMiddlewareChain({
        toolName: 'write_file',
        policyFirewall: createDefaultPolicyFirewall(),
        executionMode: 'read-only',
      });
      const wrapped = chain(successHandler);

      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/request: req_[a-f0-9]{16}/);
    });
  });

  describe('withMiddleware', () => {
    it('should wrap handler with default middleware', async () => {
      const wrapped = withMiddleware('simple_tool', successHandler);

      const result = await wrapped({});

      expect(result.isError).toBeUndefined();
    });

    it('should accept simple handlers without context', async () => {
      const simpleHandler = vi.fn(() => Promise.resolve(successResult));
      const wrapped = withMiddleware('simple_tool', simpleHandler);

      const result = await wrapped({});

      expect(result.isError).toBeUndefined();
      expect(simpleHandler).toHaveBeenCalled();
    });

    it('should apply custom options', async () => {
      const schema = z.object({ value: z.number() });
      const wrapped = withMiddleware('validated_tool', successHandler, { schema });

      const validResult = await wrapped({ value: 42 });
      expect(validResult.isError).toBeUndefined();

      const invalidResult = await wrapped({ value: 'not a number' });
      expect(invalidResult.isError).toBe(true);
    });
  });

  describe('createMiddlewareFactory', () => {
    it('should create factory with shared config', async () => {
      // Factory without policy firewall - just tests basic functionality
      const factory = createMiddlewareFactory({});

      const handler1 = factory('tool_a', successHandler);
      const handler2 = factory('tool_b', successHandler);

      const result1 = await handler1({});
      const result2 = await handler2({});

      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();
    });

    it('should allow per-tool schema', async () => {
      const factory = createMiddlewareFactory({});

      const schema = z.object({ name: z.string() });
      const handler = factory('validated_tool', successHandler, schema);

      const validResult = await handler({ name: 'test' });
      expect(validResult.isError).toBeUndefined();

      const invalidResult = await handler({ name: 123 });
      expect(invalidResult.isError).toBe(true);
    });
  });

  describe('middleware execution order', () => {
    it('should check rate limit before validation', async () => {
      const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
      const schema = z.object({ value: z.number() });

      const chain = createMiddlewareChain({
        toolName: 'ordered_tool',
        rateLimiter: limiter,
        schema,
      });
      const wrapped = chain(successHandler);

      // Invalid input should still fail with rate limit error (rate limit is first)
      const result = await wrapped({ value: 'invalid' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
      expect(result.content[0]?.text).not.toContain('Validation');
    });

    it('should check validation before policy', async () => {
      const schema = z.object({ path: z.string() });

      const chain = createMiddlewareChain({
        toolName: 'write_file',
        schema,
        policyFirewall: createDefaultPolicyFirewall(),
        executionMode: 'read-only',
      });
      const wrapped = chain(successHandler);

      // Invalid input should fail validation before policy check
      const result = await wrapped({ path: 123 });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Validation');
      expect(result.content[0]?.text).not.toContain('Policy');
    });
  });
});
