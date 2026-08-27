/**
 * Comprehensive Tests for Centralized Middleware Chain.
 *
 * Tests cover:
 * - createMiddlewareChain factory function
 * - withMiddleware convenience wrapper
 * - createMiddlewareFactory factory with shared config
 * - Internal middleware: validation, policy, rate-limit, timeout, audit
 * - composeMiddleware composition
 * - Error handling and context propagation
 *
 * (Source: Issue #189 - Centralized MCP middleware chain)
 *
 * @module mcp/middleware/middleware-chain.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { z } from 'zod';
import type { ILogger } from '../../core/index.js';
import {
  createMiddlewareChain,
  withMiddleware,
  createMiddlewareFactory,
  type ContextAwareToolHandler,
  type ToolHandler,
  type ToolResult,
} from './middleware-chain.js';
import { getCurrentRequestContext } from './request-context.js';
import type { RequestContext } from './request-context.js';
import type { MiddlewareContext } from './middleware-chain.js';
import { createDefaultPolicyFirewall, PolicyFirewall } from './policy.js';
import { RateLimiter } from './rate-limiter.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  // child returns a new mock logger instance
  mock.child.mockReturnValue(createChildMockLogger());
  return mock;
}

function createChildMockLogger(): MockLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

/**
 * Creates a mock policy firewall for testing.
 */
function createMockPolicyFirewall(allowDecision = true): PolicyFirewall {
  const firewall = new PolicyFirewall({ mode: 'enforce' });
  firewall.addRule({
    name: 'mock-rule',
    description: 'Mock rule for testing',
    check: () => ({
      allowed: allowDecision,
      reason: allowDecision ? 'Allowed by mock' : 'Denied by mock',
    }),
  });
  return firewall;
}

// =============================================================================
// Standard Test Results
// =============================================================================

const successResult: ToolResult = {
  content: [{ type: 'text', text: 'success' }],
};

const errorToolResult: ToolResult = {
  content: [{ type: 'text', text: 'error occurred' }],
  isError: true,
};

// =============================================================================
// createMiddlewareChain Tests
// =============================================================================

describe('createMiddlewareChain', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic chain creation and execution', () => {
    it('should create a chain that executes the handler', async () => {
      const handler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
      const chain = createMiddlewareChain({ toolName: 'test_tool', logger: mockLogger });
      const wrapped = chain(handler);

      const result = await wrapped({ input: 'test' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toBe('success');
      expect(handler).toHaveBeenCalled();
    });

    it('should pass arguments to the handler', async () => {
      const args = { input: 'test', count: 42 };
      const handler: ContextAwareToolHandler = vi.fn((receivedArgs) => {
        expect(receivedArgs).toEqual(args);
        return Promise.resolve(successResult);
      });

      const chain = createMiddlewareChain({ toolName: 'test_tool', logger: mockLogger });
      const wrapped = chain(handler);

      await wrapped(args);

      expect(handler).toHaveBeenCalledWith(args, expect.any(Object));
    });

    it('should pass middleware context to handler', async () => {
      const contextHandler: ContextAwareToolHandler = vi.fn((_args, ctx) => {
        expect(ctx).toBeDefined();
        expect(ctx.requestContext).toBeDefined();
        expect(ctx.requestContext.requestId).toMatch(/^req_[a-f0-9]{16}$/);
        expect(ctx.requestContext.toolName).toBe('context_tool');
        expect(ctx.logger).toBeDefined();
        return Promise.resolve(successResult);
      });

      const chain = createMiddlewareChain({ toolName: 'context_tool', logger: mockLogger });
      const wrapped = chain(contextHandler);

      await wrapped({});

      expect(contextHandler).toHaveBeenCalled();
    });

    it('should generate unique request IDs for each invocation', async () => {
      const requestIds: string[] = [];
      const handler = vi.fn<ContextAwareToolHandler>((_args, ctx) => {
        requestIds.push(ctx.requestContext.requestId);
        return Promise.resolve(successResult);
      });

      const chain = createMiddlewareChain({ toolName: 'unique_id_tool', logger: mockLogger });
      const wrapped = chain(handler);

      await wrapped({});
      await wrapped({});
      await wrapped({});

      expect(requestIds.length).toBe(3);
      expect(new Set(requestIds).size).toBe(3); // All unique
    });

    it('should use custom logger when provided', async () => {
      const handler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
      const chain = createMiddlewareChain({ toolName: 'logged_tool', logger: mockLogger });
      const wrapped = chain(handler);

      await wrapped({});

      // Verify child logger was created from the mock logger
      expect(mockLogger.child).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle handler errors gracefully', async () => {
      const throwingHandler: ContextAwareToolHandler = vi.fn(() =>
        Promise.reject(new Error('Handler error'))
      );

      const chain = createMiddlewareChain({ toolName: 'throwing_tool', logger: mockLogger });
      const wrapped = chain(throwingHandler);

      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Internal error');
      expect(result.content[0]?.text).toContain('Handler error');
      expect(result.content[0]?.text).toMatch(/request: req_[a-f0-9]{16}/);
    });

    it('should handle non-Error exceptions', async () => {
      const throwingHandler: ContextAwareToolHandler = vi.fn(() =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        Promise.reject('string error')
      );

      const chain = createMiddlewareChain({ toolName: 'string_error_tool', logger: mockLogger });
      const wrapped = chain(throwingHandler);

      const result = await wrapped({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown error');
    });

    it('should include request ID in all error messages', async () => {
      const throwingHandler: ContextAwareToolHandler = vi.fn(() =>
        Promise.reject(new Error('Test error'))
      );

      const chain = createMiddlewareChain({ toolName: 'error_tool', logger: mockLogger });
      const wrapped = chain(throwingHandler);

      const result = await wrapped({});

      expect(result.content[0]?.text).toMatch(/request: req_[a-f0-9]{16}/);
    });
  });
});

// =============================================================================
// Validation Middleware Tests
// =============================================================================

describe('validation middleware', () => {
  let mockLogger: MockLogger;
  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const basicSchema = z.object({
    name: z.string().min(1),
    count: z.number().positive(),
  });

  it('should pass valid input to handler', async () => {
    const chain = createMiddlewareChain({
      toolName: 'validated_tool',
      schema: basicSchema,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ name: 'test', count: 5 });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should reject input with missing required fields', async () => {
    const chain = createMiddlewareChain({
      toolName: 'validated_tool',
      schema: basicSchema,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ name: 'test' }); // missing count

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Validation error');
    expect(successHandler).not.toHaveBeenCalled();
  });

  it('should reject input with invalid field types', async () => {
    const chain = createMiddlewareChain({
      toolName: 'validated_tool',
      schema: basicSchema,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ name: 'test', count: 'not a number' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Validation error');
  });

  it('should reject input failing custom validation', async () => {
    const chain = createMiddlewareChain({
      toolName: 'validated_tool',
      schema: basicSchema,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ name: '', count: -1 }); // empty name, negative count

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Validation error');
  });

  it('should set validatedArgs in context after validation', async () => {
    const captureHandler: ContextAwareToolHandler = vi.fn((args, ctx) => {
      expect(ctx.validatedArgs).toEqual({ name: 'test', count: 5 });
      return Promise.resolve(successResult);
    });

    const chain = createMiddlewareChain({
      toolName: 'validated_tool',
      schema: basicSchema,
      logger: mockLogger,
    });
    const wrapped = chain(captureHandler);

    await wrapped({ name: 'test', count: 5 });

    expect(captureHandler).toHaveBeenCalled();
  });

  it('should skip validation when configured', async () => {
    const chain = createMiddlewareChain({
      toolName: 'skip_validation_tool',
      schema: basicSchema,
      skip: { validation: true },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    // Invalid input should pass through when validation is skipped
    const result = await wrapped({ invalid: 'data' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should work without schema (no validation)', async () => {
    const chain = createMiddlewareChain({
      toolName: 'no_schema_tool',
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ anything: 'goes' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });
});

// =============================================================================
// Policy Middleware Tests
// =============================================================================

describe('policy middleware', () => {
  let mockLogger: MockLogger;
  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow read operations in read-only mode', async () => {
    const chain = createMiddlewareChain({
      toolName: 'read_file',
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-only',
      logger: mockLogger,
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
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ path: './test.txt', content: 'data' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Policy denied');
    expect(successHandler).not.toHaveBeenCalled();
  });

  it('should allow write operations in read-write mode with allowed paths', async () => {
    const chain = createMiddlewareChain({
      toolName: 'write_file',
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-write',
      allowedPaths: ['./'],
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ path: './test.txt', content: 'data' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should deny operations outside allowed paths', async () => {
    const chain = createMiddlewareChain({
      toolName: 'write_file',
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-write',
      allowedPaths: ['./allowed/'],
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ path: '/etc/passwd', content: 'data' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Policy denied');
  });

  it('should skip policy when configured', async () => {
    const chain = createMiddlewareChain({
      toolName: 'write_file',
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-only',
      skip: { policy: true },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    // Write should be allowed when policy is skipped
    const result = await wrapped({ path: './test.txt', content: 'data' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should work without policy firewall (no policy check)', async () => {
    const chain = createMiddlewareChain({
      toolName: 'write_file',
      executionMode: 'read-only', // Mode specified but no firewall
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({ path: './test.txt', content: 'data' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should use custom policy firewall', async () => {
    const customFirewall = createMockPolicyFirewall(false); // Always deny

    const chain = createMiddlewareChain({
      toolName: 'custom_policy_tool',
      policyFirewall: customFirewall,
      executionMode: 'read-write',
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Policy denied');
  });
});

// =============================================================================
// Rate Limit Middleware Tests
// =============================================================================

describe('rate limit middleware', () => {
  let mockLogger: MockLogger;
  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests under rate limit', async () => {
    const chain = createMiddlewareChain({
      toolName: 'rate_limited_tool',
      rateLimiter: { capacity: 10, refillRate: 1 },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should block requests when rate limit exceeded', async () => {
    const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
    const chain = createMiddlewareChain({
      toolName: 'rate_limited_tool',
      rateLimiter: limiter,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Rate limit exceeded');
    expect(successHandler).not.toHaveBeenCalled();
  });

  it('should include retry time in rate limit error', async () => {
    const limiter = new RateLimiter({ capacity: 1, refillRate: 1, refillIntervalMs: 1000 });
    // Exhaust the token
    limiter.tryAcquire();

    const chain = createMiddlewareChain({
      toolName: 'rate_limited_tool',
      rateLimiter: limiter,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Try again in \d+ms/);
  });

  it('should accept RateLimiter instance', async () => {
    const limiter = new RateLimiter({ capacity: 5, refillRate: 1 });
    const chain = createMiddlewareChain({
      toolName: 'rate_limited_tool',
      rateLimiter: limiter,
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(limiter.getState().tokens).toBe(4); // One token consumed
  });

  it('should accept RateLimiterConfig', async () => {
    const chain = createMiddlewareChain({
      toolName: 'rate_limited_tool',
      rateLimiter: { capacity: 100, refillRate: 10 },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
  });

  it('should skip rate limiting when configured', async () => {
    const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
    const chain = createMiddlewareChain({
      toolName: 'rate_limited_tool',
      rateLimiter: limiter,
      skip: { rateLimit: true },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should work without rate limiter (no rate limiting)', async () => {
    const chain = createMiddlewareChain({
      toolName: 'no_rate_limit_tool',
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
  });
});

// =============================================================================
// Timeout Middleware Tests
// =============================================================================

describe('timeout middleware', () => {
  let mockLogger: MockLogger;
  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should complete fast operations within timeout', async () => {
    const chain = createMiddlewareChain({
      toolName: 'fast_tool',
      timeout: { defaultTimeoutMs: 5000 },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const resultPromise = wrapped({});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

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
      logger: mockLogger,
    });
    const wrapped = chain(slowHandler);

    const resultPromise = wrapped({});
    vi.advanceTimersByTime(60);
    const result = await resultPromise;

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('timed out');
  });

  it('should include operation name in timeout error', async () => {
    const slowHandler: ContextAwareToolHandler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return successResult;
    });

    const chain = createMiddlewareChain({
      toolName: 'named_slow_tool',
      timeout: { defaultTimeoutMs: 50 },
      logger: mockLogger,
    });
    const wrapped = chain(slowHandler);

    const resultPromise = wrapped({});
    vi.advanceTimersByTime(60);
    const result = await resultPromise;

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('named_slow_tool');
  });

  it('should skip timeout when configured', async () => {
    const slowHandler: ContextAwareToolHandler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return successResult;
    });

    const chain = createMiddlewareChain({
      toolName: 'slow_tool',
      timeout: { defaultTimeoutMs: 5 },
      skip: { timeout: true },
      logger: mockLogger,
    });
    const wrapped = chain(slowHandler);

    const resultPromise = wrapped({});
    vi.advanceTimersByTime(20);
    const result = await resultPromise;

    expect(result.isError).toBeUndefined();
    expect(slowHandler).toHaveBeenCalled();
  });

  it('should work without timeout config (no timeout)', async () => {
    const chain = createMiddlewareChain({
      toolName: 'no_timeout_tool',
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    const resultPromise = wrapped({});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.isError).toBeUndefined();
  });
});

// =============================================================================
// Audit Middleware Tests
// =============================================================================

describe('audit middleware', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should include request ID in error messages', async () => {
    const chain = createMiddlewareChain({
      toolName: 'write_file',
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-only',
      logger: mockLogger,
    });
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/request: req_[a-f0-9]{16}/);
  });

  it('should log when handler returns error result', async () => {
    const errorHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(errorToolResult));

    const chain = createMiddlewareChain({
      toolName: 'error_tool',
      logger: mockLogger,
    });
    const wrapped = chain(errorHandler);

    await wrapped({});

    // The child logger (created via mockLogger.child) should have logged
    const childLogger = mockLogger.child.mock.results[0]?.value as MockLogger;
    expect(childLogger.warn).toHaveBeenCalledWith(
      'Tool execution completed with error',
      expect.objectContaining({ durationMs: expect.any(Number) })
    );
  });

  it('should log successful execution', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

    const chain = createMiddlewareChain({
      toolName: 'success_tool',
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    await wrapped({});

    const childLogger = mockLogger.child.mock.results[0]?.value as MockLogger;
    expect(childLogger.info).toHaveBeenCalledWith('Tool invocation started');
    expect(childLogger.info).toHaveBeenCalledWith(
      'Tool execution completed',
      expect.objectContaining({ durationMs: expect.any(Number) })
    );
  });

  it('should skip audit when configured', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

    const chain = createMiddlewareChain({
      toolName: 'no_audit_tool',
      skip: { audit: true },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    await wrapped({});

    const childLogger = mockLogger.child.mock.results[0]?.value as MockLogger;
    // Should not log invocation started since audit is skipped
    expect(childLogger.info).not.toHaveBeenCalledWith('Tool invocation started');
  });
});

// =============================================================================
// Middleware Skip Configuration Tests
// =============================================================================

describe('middleware skip configuration', () => {
  let mockLogger: MockLogger;
  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should skip all middleware when all skip flags are true', async () => {
    const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
    const schema = z.object({ value: z.number() });

    const chain = createMiddlewareChain({
      toolName: 'write_file',
      schema,
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-only',
      rateLimiter: limiter,
      timeout: { defaultTimeoutMs: 1 },
      skip: {
        validation: true,
        policy: true,
        rateLimit: true,
        timeout: true,
        audit: true,
      },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    // All middleware would normally block, but skip allows through
    const result = await wrapped({ invalid: 'data' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should respect individual skip flags', async () => {
    const schema = z.object({ value: z.number() });

    // Only skip validation
    const chain = createMiddlewareChain({
      toolName: 'partial_skip_tool',
      schema,
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-write',
      allowedPaths: ['./'],
      skip: { validation: true },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    // Invalid data should pass validation but policy still applies
    const result = await wrapped({ invalid: 'data' });

    expect(result.isError).toBeUndefined();
    expect(successHandler).toHaveBeenCalled();
  });
});

// =============================================================================
// Context Propagation Tests
// =============================================================================

describe('context propagation', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should propagate validated args through chain', async () => {
    const schema = z.object({ value: z.number() });
    const contextHandler: ContextAwareToolHandler = vi.fn((args, ctx) => {
      // Args should be the validated value
      expect(args).toEqual({ value: 42 });
      // validatedArgs should also be set
      expect(ctx.validatedArgs).toEqual({ value: 42 });
      return Promise.resolve(successResult);
    });

    const chain = createMiddlewareChain({
      toolName: 'validated_tool',
      schema,
      logger: mockLogger,
    });
    const wrapped = chain(contextHandler);

    await wrapped({ value: 42 });

    expect(contextHandler).toHaveBeenCalled();
  });

  it('should maintain context through multiple middleware', async () => {
    const schema = z.object({ value: z.number() });
    const contextHandler: ContextAwareToolHandler = vi.fn((args, ctx) => {
      expect(ctx.requestContext.toolName).toBe('get_status');
      expect(ctx.requestContext.requestId).toMatch(/^req_[a-f0-9]{16}$/);
      expect(ctx.logger).toBeDefined();
      expect(ctx.validatedArgs).toEqual({ value: 10 });
      return Promise.resolve(successResult);
    });

    const chain = createMiddlewareChain({
      toolName: 'get_status', // Use a known read-only tool to pass policy in read-only mode
      schema,
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-only',
      rateLimiter: { capacity: 100, refillRate: 10 },
      timeout: { defaultTimeoutMs: 5000 },
      logger: mockLogger,
    });
    const wrapped = chain(contextHandler);

    const resultPromise = wrapped({ value: 10 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // Should pass all middleware (it's a read operation in read-only mode)
    expect(result.isError).toBeUndefined();
  });
});

// =============================================================================
// Middleware Execution Order Tests
// =============================================================================

describe('middleware execution order', () => {
  let mockLogger: MockLogger;
  const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should check rate limit before validation', async () => {
    const limiter = new RateLimiter({ capacity: 0, refillRate: 0 });
    const schema = z.object({ value: z.number() });

    const chain = createMiddlewareChain({
      toolName: 'ordered_tool',
      rateLimiter: limiter,
      schema,
      logger: mockLogger,
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
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    // Invalid input should fail validation before policy check
    const result = await wrapped({ path: 123 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Validation');
    expect(result.content[0]?.text).not.toContain('Policy');
  });

  it('should check policy before timeout', async () => {
    const chain = createMiddlewareChain({
      toolName: 'write_file',
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-only',
      timeout: { defaultTimeoutMs: 5000 },
      logger: mockLogger,
    });
    const wrapped = chain(successHandler);

    // Should fail with policy error (not timeout)
    const result = await wrapped({ path: './test.txt' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Policy denied');
    expect(result.content[0]?.text).not.toContain('timed out');
  });
});

// =============================================================================
// withMiddleware Tests
// =============================================================================

describe('withMiddleware', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should wrap handler with default middleware', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const wrapped = withMiddleware('simple_tool', successHandler, { logger: mockLogger });

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
  });

  it('should accept simple handlers without context parameter', async () => {
    const simpleHandler: ToolHandler = vi.fn(() => Promise.resolve(successResult));
    const wrapped = withMiddleware('simple_tool', simpleHandler, { logger: mockLogger });

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(simpleHandler).toHaveBeenCalled();
  });

  it('should accept context-aware handlers', async () => {
    const contextHandler: ContextAwareToolHandler = vi.fn((_args, ctx) => {
      expect(ctx.requestContext).toBeDefined();
      return Promise.resolve(successResult);
    });
    const wrapped = withMiddleware('context_tool', contextHandler, { logger: mockLogger });

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(contextHandler).toHaveBeenCalled();
  });

  it('should apply validation when schema provided', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const schema = z.object({ value: z.number() });
    const wrapped = withMiddleware('validated_tool', successHandler, {
      schema,
      logger: mockLogger,
    });

    const validResult = await wrapped({ value: 42 });
    expect(validResult.isError).toBeUndefined();

    const invalidResult = await wrapped({ value: 'not a number' });
    expect(invalidResult.isError).toBe(true);
  });

  it('should apply rate limiting when configured', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const limiter = new RateLimiter({ capacity: 1, refillRate: 0 });
    const wrapped = withMiddleware('limited_tool', successHandler, {
      rateLimiter: limiter,
      logger: mockLogger,
    });

    const firstResult = await wrapped({});
    expect(firstResult.isError).toBeUndefined();

    const secondResult = await wrapped({});
    expect(secondResult.isError).toBe(true);
    expect(secondResult.content[0]?.text).toContain('Rate limit');
  });
});

// =============================================================================
// createMiddlewareFactory Tests
// =============================================================================

describe('createMiddlewareFactory', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create factory with shared config', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const factory = createMiddlewareFactory({ logger: mockLogger });

    const handler1 = factory('tool_a', successHandler);
    const handler2 = factory('tool_b', successHandler);

    const result1 = await handler1({});
    const result2 = await handler2({});

    expect(result1.isError).toBeUndefined();
    expect(result2.isError).toBeUndefined();
  });

  it('should allow per-tool schema', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const factory = createMiddlewareFactory({ logger: mockLogger });

    const schema = z.object({ name: z.string() });
    const handler = factory('validated_tool', successHandler, schema);

    const validResult = await handler({ name: 'test' });
    expect(validResult.isError).toBeUndefined();

    const invalidResult = await handler({ name: 123 });
    expect(invalidResult.isError).toBe(true);
  });

  it('should share rate limiter across tools', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const limiter = new RateLimiter({ capacity: 2, refillRate: 0 });
    const factory = createMiddlewareFactory({ rateLimiter: limiter, logger: mockLogger });

    const handler1 = factory('tool_a', successHandler);
    const handler2 = factory('tool_b', successHandler);

    const result1 = await handler1({});
    expect(result1.isError).toBeUndefined();

    const result2 = await handler2({});
    expect(result2.isError).toBeUndefined();

    // Both tools share the same limiter, so third call should fail
    const result3 = await handler1({});
    expect(result3.isError).toBe(true);
  });

  it('should share policy firewall across tools', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const firewall = createDefaultPolicyFirewall();
    const factory = createMiddlewareFactory({
      policyFirewall: firewall,
      executionMode: 'read-only',
      logger: mockLogger,
    });

    const readHandler = factory('read_file', successHandler);
    const writeHandler = factory('write_file', successHandler);

    const readResult = await readHandler({ path: './test.txt' });
    expect(readResult.isError).toBeUndefined();

    const writeResult = await writeHandler({ path: './test.txt', content: 'data' });
    expect(writeResult.isError).toBe(true);
    expect(writeResult.content[0]?.text).toContain('Policy denied');
  });

  it('should handle simple handlers in factory', async () => {
    const simpleHandler: ToolHandler = vi.fn(() => Promise.resolve(successResult));
    const factory = createMiddlewareFactory({ logger: mockLogger });

    const handler = factory('simple_tool', simpleHandler);
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    expect(simpleHandler).toHaveBeenCalled();
  });
});

// =============================================================================
// Edge Cases and Error Scenarios
// =============================================================================

describe('edge cases', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle empty args', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const chain = createMiddlewareChain({ toolName: 'empty_args_tool', logger: mockLogger });
    const wrapped = chain(successHandler);

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
  });

  it('should handle null args', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const chain = createMiddlewareChain({ toolName: 'null_args_tool', logger: mockLogger });
    const wrapped = chain(successHandler);

    const result = await wrapped(null);

    expect(result.isError).toBeUndefined();
  });

  it('should handle undefined args', async () => {
    const successHandler: ContextAwareToolHandler = vi.fn(() => Promise.resolve(successResult));
    const chain = createMiddlewareChain({ toolName: 'undefined_args_tool', logger: mockLogger });
    const wrapped = chain(successHandler);

    const result = await wrapped(undefined);

    expect(result.isError).toBeUndefined();
  });

  it('should handle handler returning undefined content', async () => {
    const badHandler: ContextAwareToolHandler = vi.fn(() =>
      Promise.resolve({ content: [] } as unknown as ToolResult)
    );
    const chain = createMiddlewareChain({ toolName: 'bad_result_tool', logger: mockLogger });
    const wrapped = chain(badHandler);

    const result = await wrapped({});

    expect(result.content).toEqual([]);
  });

  it('should handle complex nested args', async () => {
    const complexArgs = {
      nested: {
        deep: {
          value: 42,
          array: [1, 2, 3],
        },
      },
      date: new Date(),
    };

    const captureHandler: ContextAwareToolHandler = vi.fn((args) => {
      expect(args).toEqual(complexArgs);
      return Promise.resolve(successResult);
    });

    const chain = createMiddlewareChain({ toolName: 'complex_args_tool', logger: mockLogger });
    const wrapped = chain(captureHandler);

    const result = await wrapped(complexArgs);

    expect(result.isError).toBeUndefined();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('integration tests', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle complete middleware chain with all features', async () => {
    const schema = z.object({ path: z.string(), content: z.string() });
    const contextHandler: ContextAwareToolHandler = vi.fn((args, ctx) => {
      expect(ctx.validatedArgs).toEqual({ path: './test.txt', content: 'data' });
      expect(ctx.requestContext.requestId).toMatch(/^req_[a-f0-9]{16}$/);
      return Promise.resolve(successResult);
    });

    const chain = createMiddlewareChain({
      toolName: 'write_file',
      schema,
      policyFirewall: createDefaultPolicyFirewall(),
      executionMode: 'read-write',
      allowedPaths: ['./'],
      rateLimiter: { capacity: 100, refillRate: 10 },
      timeout: { defaultTimeoutMs: 5000 },
      logger: mockLogger,
    });
    const wrapped = chain(contextHandler);

    const resultPromise = wrapped({ path: './test.txt', content: 'data' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.isError).toBeUndefined();
    expect(contextHandler).toHaveBeenCalled();
  });

  it('should properly clean up on timeout', async () => {
    const slowHandler: ContextAwareToolHandler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return successResult;
    });

    const chain = createMiddlewareChain({
      toolName: 'slow_tool',
      timeout: { defaultTimeoutMs: 50 },
      logger: mockLogger,
    });
    const wrapped = chain(slowHandler);

    const resultPromise = wrapped({});
    vi.advanceTimersByTime(60);
    const result = await resultPromise;

    expect(result.isError).toBe(true);
    // Handler was called but timed out
    expect(slowHandler).toHaveBeenCalled();
  });

  it('should handle concurrent executions with separate contexts', async () => {
    const requestIds: string[] = [];
    const contextHandler = vi.fn<ContextAwareToolHandler>((_args, ctx) => {
      requestIds.push(ctx.requestContext.requestId);
      return Promise.resolve(successResult);
    });

    const chain = createMiddlewareChain({
      toolName: 'concurrent_tool',
      logger: mockLogger,
    });
    const wrapped = chain(contextHandler);

    // Execute multiple times concurrently
    await Promise.all([wrapped({}), wrapped({}), wrapped({})]);

    expect(requestIds.length).toBe(3);
    expect(new Set(requestIds).size).toBe(3); // All unique
  });
});

describe('ambient request context (#4981)', () => {
  it('exposes the chain context to a nested layer that never receives ctx', async () => {
    let seen: RequestContext | undefined;
    let handlerCtxId: string | undefined;

    // A 1-arity handler is exactly what createSecureHandler returns, so the
    // chain's arity dispatch drops ctx and this is the only channel left.
    const wrapped = withMiddleware('probe_tool', (args: unknown) => {
      void args;
      seen = getCurrentRequestContext();
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    const contextAware = withMiddleware('probe_tool', (_args: unknown, ctx: MiddlewareContext) => {
      handlerCtxId = ctx.requestContext.requestId;
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    await wrapped({});
    await contextAware({});

    // `handlerCtxId` alone proves nothing — ctx.requestContext.requestId was
    // always defined. What is new is that a 1-arity handler, which never
    // receives ctx at all, can reach the same context.
    expect(seen).toBeDefined();
    expect(seen?.toolName).toBe('probe_tool');
    expect(seen?.requestId).toMatch(/^req_[a-f0-9]{16}$/);
    expect(handlerCtxId).toMatch(/^req_[a-f0-9]{16}$/);
    expect(handlerCtxId).not.toBe(seen?.requestId);
  });

  it('uses the same id the handler sees on its own ctx', async () => {
    let ambientId: string | undefined;
    let ctxId: string | undefined;

    const wrapped = withMiddleware('probe_tool', (_args: unknown, ctx: MiddlewareContext) => {
      ambientId = getCurrentRequestContext()?.requestId;
      ctxId = ctx.requestContext.requestId;
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    await wrapped({});

    expect(ambientId).toBe(ctxId);
  });

  it('unsets the ambient context after the call resolves', async () => {
    const wrapped = withMiddleware('probe_tool', () =>
      Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] })
    );

    await wrapped({});

    expect(getCurrentRequestContext()).toBeUndefined();
  });
});
