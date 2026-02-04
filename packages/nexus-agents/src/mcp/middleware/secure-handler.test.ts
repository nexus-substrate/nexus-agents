/**
 * nexus-agents/mcp - Secure Handler Middleware Tests
 *
 * Comprehensive tests for the secure handler middleware.
 * Tests cover handler creation, security middleware integration,
 * rate limiting, policy firewall, error handling, and factory patterns.
 *
 * @see secure-handler.ts
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  createSecureHandler,
  createSecureHandlerFactory,
  type ToolHandler,
  type ContextAwareHandler,
  type HandlerContext,
} from './secure-handler.js';
import { type IPolicyFirewall, type PolicyDecision } from './policy-types.js';
import { createDefaultPolicyFirewall } from './policy.js';
import { RateLimiter, type RateLimiterState } from './rate-limiter.js';

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
  mock.child.mockReturnValue(mock);
  return mock;
}

/**
 * Gets the child logger from a mock logger.
 */
function getChildLogger(mockLogger: MockLogger): MockLogger {
  const result = mockLogger.child.mock.results[0]?.value as unknown;
  return result as MockLogger;
}

/**
 * Mock rate limiter for testing.
 */
interface MockRateLimiter {
  tryAcquire: Mock<(count?: number) => boolean>;
  getState: Mock<() => RateLimiterState>;
  reset: Mock<() => void>;
}

function createMockRateLimiter(allowAcquire = true): MockRateLimiter {
  return {
    tryAcquire: vi.fn(() => allowAcquire),
    getState: vi.fn(() => ({
      tokens: allowAcquire ? 10 : 0,
      capacity: 10,
      nextTokenMs: allowAcquire ? 0 : 500,
    })),
    reset: vi.fn(),
  };
}

/**
 * Mock policy firewall for testing.
 */
function createMockPolicyFirewall(allowed = true, reason = 'test'): IPolicyFirewall {
  // Build the decision object conditionally to satisfy exactOptionalPropertyTypes
  const decision: PolicyDecision = allowed
    ? { allowed, reason }
    : { allowed, reason, ruleName: 'test-rule' };

  return {
    evaluate: vi.fn((): PolicyDecision => decision),
    addRule: vi.fn(),
    removeRule: vi.fn((): boolean => true),
    getRules: vi.fn((): readonly [] => []),
    setMode: vi.fn(),
    getMode: vi.fn((): 'enforce' => 'enforce'),
  };
}

// =============================================================================
// SecureHandler Basic Tests
// =============================================================================

describe('SecureHandler', () => {
  let mockLogger: MockLogger;

  // Mock handler that returns success
  const mockSuccessHandler: ToolHandler = vi.fn(() =>
    Promise.resolve({ content: [{ type: 'text' as const, text: 'success' }] })
  );

  // Mock handler that returns error
  const mockErrorHandler: ToolHandler = vi.fn(() =>
    Promise.resolve({ isError: true, content: [{ type: 'text' as const, text: 'error' }] })
  );

  // Mock handler that throws an Error
  const mockThrowingHandler: ToolHandler = vi.fn(() =>
    Promise.reject(new Error('Unexpected error'))
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
  });

  // ===========================================================================
  // createSecureHandler Tests
  // ===========================================================================

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

    it('should pass arguments to handler unchanged', async () => {
      const complexArgs = {
        path: '/path/to/file',
        options: { recursive: true, force: false },
        filters: ['*.ts', '*.js'],
      };

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'complex_tool',
      });

      await secureHandler(complexArgs);

      expect(mockSuccessHandler).toHaveBeenCalledWith(complexArgs);
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

    it('should detect ToolHandler by function length (0 or 1 parameter)', async () => {
      // ToolHandler has length 1 (only args parameter)
      const toolHandler: ToolHandler = vi.fn((args: unknown) =>
        Promise.resolve({
          content: [{ type: 'text' as const, text: JSON.stringify(args) }],
        })
      );

      expect(toolHandler.length).toBe(1);

      const secureHandler = createSecureHandler(toolHandler, {
        toolName: 'tool_handler',
      });

      await secureHandler({ test: true });

      // Should be called with just args, not context
      expect(toolHandler).toHaveBeenCalledWith({ test: true });
    });

    it('should detect ContextAwareHandler by function length (2+ parameters)', async () => {
      // ContextAwareHandler has length 2 (args and ctx parameters)
      const contextHandler: ContextAwareHandler = vi.fn((args: unknown, ctx: HandlerContext) =>
        Promise.resolve({
          content: [
            {
              type: 'text' as const,
              text: `${JSON.stringify(args)}-${ctx.requestContext.toolName}`,
            },
          ],
        })
      );

      expect(contextHandler.length).toBe(2);

      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'context_handler',
      });

      const result = await secureHandler({ test: true });

      // Should include context info in result
      expect(result.content[0]?.text).toContain('context_handler');
    });

    it('should provide logger in handler context', async () => {
      let capturedLogger: ILogger | undefined;

      const contextHandler: ContextAwareHandler = vi.fn((_args, ctx) => {
        capturedLogger = ctx.logger;
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'logger_test',
        logger: mockLogger,
      });

      await secureHandler({});

      expect(capturedLogger).toBeDefined();
      // Logger should be a child logger with request context
      expect(mockLogger.child).toHaveBeenCalled();
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

    it('should handle non-Error thrown values', async () => {
      // Note: This tests handling of non-Error rejections (legacy code patterns)
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      const stringThrowHandler: ToolHandler = vi.fn(() => Promise.reject('string error'));

      const secureHandler = createSecureHandler(stringThrowHandler, {
        toolName: 'string_throw_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Internal error: Unknown error/);
    });

    it('should log error handlers without marking as exception', async () => {
      const secureHandler = createSecureHandler(mockErrorHandler, {
        toolName: 'error_tool',
        logger: mockLogger,
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe('error');
      // Should log as warning, not error
      expect(mockLogger.child).toHaveBeenCalled();
    });

    it('should use default execution mode of read-only', async () => {
      const policyFirewall = createMockPolicyFirewall(true);

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'default_mode_tool',
        policyFirewall,
      });

      await secureHandler({});

      // Verify policy was evaluated with read-only mode
      expect(policyFirewall.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'read-only',
        })
      );
    });

    it('should use provided execution mode', async () => {
      const policyFirewall = createMockPolicyFirewall(true);

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'custom_mode_tool',
        policyFirewall,
        executionMode: 'read-write',
      });

      await secureHandler({});

      expect(policyFirewall.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'read-write',
        })
      );
    });

    it('should pass allowed paths to policy context', async () => {
      const policyFirewall = createMockPolicyFirewall(true);
      const allowedPaths = ['/home/user/project', '/tmp'];

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'paths_tool',
        policyFirewall,
        allowedPaths,
      });

      await secureHandler({ path: '/home/user/project/file.ts' });

      expect(policyFirewall.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedPaths,
        })
      );
    });

    it('should pass caller info to request context', async () => {
      let capturedContext: HandlerContext | undefined;

      const contextHandler: ContextAwareHandler = vi.fn((_args, ctx) => {
        capturedContext = ctx;
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const callerInfo = {
        clientId: 'claude-cli',
        sessionId: 'sess_abc123',
      };

      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'caller_info_tool',
        callerInfo,
      });

      await secureHandler({});

      expect(capturedContext?.requestContext.caller).toEqual(callerInfo);
    });
  });

  // ===========================================================================
  // Request Context Tests
  // ===========================================================================

  describe('request context creation', () => {
    it('should create unique request ID for each invocation', async () => {
      const requestIds: string[] = [];

      const contextHandler: ContextAwareHandler = vi.fn((_args: unknown, ctx: HandlerContext) => {
        requestIds.push(ctx.requestContext.requestId);
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'unique_id_tool',
      });

      // Multiple invocations
      await secureHandler({});
      await secureHandler({});
      await secureHandler({});

      // All request IDs should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(3);

      // All should match the request ID format
      for (const id of requestIds) {
        expect(id).toMatch(/^req_[a-f0-9]{16}$/);
      }
    });

    it('should include tool name in request context', async () => {
      let capturedToolName: string | undefined;

      const contextHandler: ContextAwareHandler = vi.fn((_args, ctx) => {
        capturedToolName = ctx.requestContext.toolName;
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'my_special_tool',
      });

      await secureHandler({});

      expect(capturedToolName).toBe('my_special_tool');
    });

    it('should include timestamp in request context', async () => {
      let capturedTimestamp: string | undefined;

      const contextHandler: ContextAwareHandler = vi.fn((_args, ctx) => {
        capturedTimestamp = ctx.requestContext.timestamp;
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'timestamp_tool',
      });

      await secureHandler({});

      expect(capturedTimestamp).toBeDefined();
      // Should be a valid ISO-ish timestamp
      expect(capturedTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ===========================================================================
  // Logging Behavior Tests
  // ===========================================================================

  describe('logging behavior', () => {
    it('should log tool invocation started', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'log_start_tool',
        logger: mockLogger,
      });

      await secureHandler({});

      // The child logger should have been called with 'Tool invocation started'
      expect(mockLogger.child).toHaveBeenCalled();
      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.info).toHaveBeenCalledWith('Tool invocation started');
    });

    it('should log tool execution completed with duration', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'log_complete_tool',
        logger: mockLogger,
      });

      await secureHandler({});

      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.info).toHaveBeenCalledWith(
        'Tool execution completed',
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );
    });

    it('should log warning for handler returning error result', async () => {
      const secureHandler = createSecureHandler(mockErrorHandler, {
        toolName: 'log_error_result_tool',
        logger: mockLogger,
      });

      await secureHandler({});

      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.warn).toHaveBeenCalledWith(
        'Tool execution completed with error',
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );
    });

    it('should log error for thrown exceptions', async () => {
      const secureHandler = createSecureHandler(mockThrowingHandler, {
        toolName: 'log_exception_tool',
        logger: mockLogger,
      });

      await secureHandler({});

      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.error).toHaveBeenCalledWith('Tool execution failed', expect.any(Error));
    });

    it('should create child logger with request context', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'child_logger_tool',
        logger: mockLogger,
      });

      await secureHandler({});

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.stringMatching(/^req_[a-f0-9]{16}$/),
          toolName: 'child_logger_tool',
        })
      );
    });
  });

  // ===========================================================================
  // Rate Limiting Integration Tests
  // ===========================================================================

  describe('rate limiting integration', () => {
    it('should allow requests when under rate limit', async () => {
      const rateLimiter = new RateLimiter({ capacity: 10, refillRate: 1 });

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rate_limited_tool',
        rateLimiter,
      });

      const result = await secureHandler({});

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalled();
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

    it('should include wait time in rate limit error', async () => {
      const mockRateLimiter = createMockRateLimiter(false);
      mockRateLimiter.getState.mockReturnValue({
        tokens: 0,
        capacity: 10,
        nextTokenMs: 750,
      });

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rate_limit_wait_tool',
        rateLimiter: mockRateLimiter as unknown as RateLimiter,
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('750');
    });

    it('should log rate limit exceeded warning', async () => {
      const mockRateLimiter = createMockRateLimiter(false);

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rate_limit_log_tool',
        rateLimiter: mockRateLimiter as unknown as RateLimiter,
        logger: mockLogger,
      });

      await secureHandler({});

      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.warn).toHaveBeenCalledWith('Rate limit exceeded');
    });

    it('should skip rate limit check when no rate limiter configured', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'no_rate_limit_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Policy Firewall Integration Tests
  // ===========================================================================

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

    it('should include denial reason in policy error', async () => {
      const mockFirewall = createMockPolicyFirewall(
        false,
        'Operation not permitted in read-only mode'
      );

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'denied_tool',
        policyFirewall: mockFirewall,
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Operation not permitted in read-only mode');
    });

    it('should log policy denial with rule name', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'write_file',
        policyFirewall,
        executionMode: 'read-only',
        logger: mockLogger,
      });

      await secureHandler({});

      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.warn).toHaveBeenCalledWith(
        'Policy denied tool execution',
        expect.objectContaining({
          reason: expect.any(String),
        })
      );
    });

    it('should log policy check passed on success', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'read_file',
        policyFirewall,
        executionMode: 'read-only',
        logger: mockLogger,
      });

      await secureHandler({ path: './test.txt' });

      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.debug).toHaveBeenCalledWith(
        'Policy check passed',
        expect.objectContaining({
          reason: expect.any(String),
        })
      );
    });

    it('should skip policy check when no firewall configured', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'no_policy_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalled();
    });

    it('should pass tool arguments to policy evaluation', async () => {
      const mockFirewall = createMockPolicyFirewall(true);
      const testArgs = { path: '/home/user/file.txt', content: 'test' };

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'args_check_tool',
        policyFirewall: mockFirewall,
      });

      await secureHandler(testArgs);

      expect(mockFirewall.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'args_check_tool',
          args: testArgs,
        })
      );
    });
  });

  // ===========================================================================
  // createSecureHandlerFactory Tests
  // ===========================================================================

  describe('createSecureHandlerFactory', () => {
    it('should create factory with shared configuration', async () => {
      const rateLimiter = new RateLimiter({ capacity: 100, refillRate: 10 });

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

    it('should share rate limiter across all handlers', async () => {
      const rateLimiter = new RateLimiter({ capacity: 2, refillRate: 0 });

      const createHandler = createSecureHandlerFactory({
        rateLimiter,
      });

      const handler1 = createHandler('tool_a', mockSuccessHandler);
      const handler2 = createHandler('tool_b', mockSuccessHandler);

      // First two calls should succeed (capacity = 2)
      const result1 = await handler1({});
      const result2 = await handler2({});
      // Third call should fail (rate limit exceeded)
      const result3 = await handler1({});

      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();
      expect(result3.isError).toBe(true);
      expect(result3.content[0]?.text).toMatch(/Rate limit exceeded/);
    });

    it('should use tool-specific names for each handler', async () => {
      const toolNames: string[] = [];

      const contextHandler: ContextAwareHandler = vi.fn((_args: unknown, ctx: HandlerContext) => {
        toolNames.push(ctx.requestContext.toolName);
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const createHandler = createSecureHandlerFactory({});

      const handlerA = createHandler('tool_alpha', contextHandler);
      const handlerB = createHandler('tool_beta', contextHandler);

      await handlerA({});
      await handlerB({});

      expect(toolNames).toEqual(['tool_alpha', 'tool_beta']);
    });

    it('should share logger across all handlers', async () => {
      const createHandler = createSecureHandlerFactory({
        logger: mockLogger,
      });

      const handler1 = createHandler('tool_a', mockSuccessHandler);
      const handler2 = createHandler('tool_b', mockSuccessHandler);

      await handler1({});
      await handler2({});

      // Logger should have been used twice (once per handler invocation)
      expect(mockLogger.child).toHaveBeenCalledTimes(2);
    });

    it('should share execution mode across all handlers', async () => {
      const mockFirewall = createMockPolicyFirewall(true);

      const createHandler = createSecureHandlerFactory({
        policyFirewall: mockFirewall,
        executionMode: 'read-write',
      });

      const handler1 = createHandler('tool_a', mockSuccessHandler);
      const handler2 = createHandler('tool_b', mockSuccessHandler);

      await handler1({});
      await handler2({});

      // Both should use read-write mode
      expect(mockFirewall.evaluate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ mode: 'read-write' })
      );
      expect(mockFirewall.evaluate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ mode: 'read-write' })
      );
    });

    it('should share allowed paths across all handlers', async () => {
      const mockFirewall = createMockPolicyFirewall(true);
      const allowedPaths = ['/home/project'];

      const createHandler = createSecureHandlerFactory({
        policyFirewall: mockFirewall,
        allowedPaths,
      });

      const handler1 = createHandler('tool_a', mockSuccessHandler);
      const handler2 = createHandler('tool_b', mockSuccessHandler);

      await handler1({});
      await handler2({});

      expect(mockFirewall.evaluate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ allowedPaths })
      );
      expect(mockFirewall.evaluate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ allowedPaths })
      );
    });

    it('should share caller info across all handlers', async () => {
      const contexts: HandlerContext[] = [];

      const contextHandler: ContextAwareHandler = vi.fn((_args: unknown, ctx: HandlerContext) => {
        contexts.push(ctx);
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      const callerInfo = { clientId: 'test-client' };

      const createHandler = createSecureHandlerFactory({
        callerInfo,
      });

      const handler1 = createHandler('tool_a', contextHandler);
      const handler2 = createHandler('tool_b', contextHandler);

      await handler1({});
      await handler2({});

      expect(contexts[0]?.requestContext.caller).toEqual(callerInfo);
      expect(contexts[1]?.requestContext.caller).toEqual(callerInfo);
    });
  });

  // ===========================================================================
  // Combined Middleware Tests
  // ===========================================================================

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

    it('should apply policy check before handler execution', async () => {
      const policyFirewall = createDefaultPolicyFirewall();

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'write_file',
        policyFirewall,
        executionMode: 'read-only',
      });

      const result = await secureHandler({});

      // Should fail on policy, handler should not be called
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Policy denied/);
      expect(mockSuccessHandler).not.toHaveBeenCalled();
    });

    it('should execute handler after rate limit and policy pass', async () => {
      const rateLimiter = new RateLimiter({ capacity: 10, refillRate: 1 });
      const policyFirewall = createDefaultPolicyFirewall();

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'read_file',
        rateLimiter,
        policyFirewall,
        executionMode: 'read-only',
      });

      const result = await secureHandler({ path: './test.txt' });

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalled();
    });

    it('should handle all middleware components with full config', async () => {
      const rateLimiter = new RateLimiter({ capacity: 10, refillRate: 1 });
      const policyFirewall = createDefaultPolicyFirewall();
      const callerInfo = { clientId: 'full-test' };

      let capturedContext: HandlerContext | undefined;

      const contextHandler: ContextAwareHandler = vi.fn((_args, ctx) => {
        capturedContext = ctx;
        return Promise.resolve({
          content: [{ type: 'text' as const, text: 'success' }],
        });
      });

      // Use read_file tool (read operation) in read-only mode to pass policy
      const secureHandler = createSecureHandler(contextHandler, {
        toolName: 'read_file',
        rateLimiter,
        policyFirewall,
        executionMode: 'read-only',
        allowedPaths: ['./'],
        logger: mockLogger,
        callerInfo,
      });

      const result = await secureHandler({ path: './file.txt' });

      expect(result.isError).toBeUndefined();
      expect(capturedContext?.requestContext.caller).toEqual(callerInfo);
      expect(capturedContext?.requestContext.toolName).toBe('read_file');
    });
  });

  // ===========================================================================
  // Error Response Format Tests
  // ===========================================================================

  describe('error response format', () => {
    it('should format rate limit error correctly', async () => {
      const mockRateLimiter = createMockRateLimiter(false);
      mockRateLimiter.getState.mockReturnValue({
        tokens: 0,
        capacity: 10,
        nextTokenMs: 1234,
      });

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rate_error_format_tool',
        rateLimiter: mockRateLimiter as unknown as RateLimiter,
      });

      const result = await secureHandler({});

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Rate limit exceeded. Try again in 1234ms.',
          },
        ],
      });
    });

    it('should format policy denial error correctly', async () => {
      const mockFirewall = createMockPolicyFirewall(false, 'Write operations not allowed');

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'policy_error_format_tool',
        policyFirewall: mockFirewall,
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toMatch(/^Policy denied: Write operations not allowed/);
      expect(result.content[0]?.text).toMatch(/\(request: req_[a-f0-9]{16}\)$/);
    });

    it('should format internal error correctly', async () => {
      const secureHandler = createSecureHandler(mockThrowingHandler, {
        toolName: 'internal_error_format_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toMatch(/^Internal error: Unexpected error/);
      expect(result.content[0]?.text).toMatch(/\(request: req_[a-f0-9]{16}\)$/);
    });
  });

  // ===========================================================================
  // Edge Cases Tests
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle undefined args', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'undefined_args_tool',
      });

      const result = await secureHandler(undefined);

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalledWith(undefined);
    });

    it('should handle null args', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'null_args_tool',
      });

      const result = await secureHandler(null);

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalledWith(null);
    });

    it('should handle empty object args', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'empty_args_tool',
      });

      const result = await secureHandler({});

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalledWith({});
    });

    it('should handle deeply nested args', async () => {
      const deepArgs = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
              array: [1, 2, { nested: true }],
            },
          },
        },
      };

      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'deep_args_tool',
      });

      const result = await secureHandler(deepArgs);

      expect(result.isError).toBeUndefined();
      expect(mockSuccessHandler).toHaveBeenCalledWith(deepArgs);
    });

    it('should handle handler that returns empty content array', async () => {
      const emptyContentHandler: ToolHandler = vi.fn(() => Promise.resolve({ content: [] }));

      const secureHandler = createSecureHandler(emptyContentHandler, {
        toolName: 'empty_content_tool',
      });

      const result = await secureHandler({});

      expect(result.content).toEqual([]);
    });

    it('should handle multiple rapid invocations', async () => {
      const secureHandler = createSecureHandler(mockSuccessHandler, {
        toolName: 'rapid_tool',
      });

      // Fire 10 requests in parallel
      const promises = Array.from({ length: 10 }, () => secureHandler({}));
      const results = await Promise.all(promises);

      // All should succeed
      for (const result of results) {
        expect(result.isError).toBeUndefined();
      }

      expect(mockSuccessHandler).toHaveBeenCalledTimes(10);
    });

    it('should redact secrets in tool output', async () => {
      const secretHandler: ToolHandler = vi.fn(() =>
        Promise.resolve({
          content: [
            { type: 'text' as const, text: 'API key is sk-abc123def456ghi789jkl012mno345pqr678' },
          ],
        })
      );

      const secureHandler = createSecureHandler(secretHandler, {
        toolName: 'secret_tool',
      });

      const result = await secureHandler({});
      expect(result.content[0]?.text).toContain('[REDACTED]');
      expect(result.content[0]?.text).not.toContain('sk-abc123');
    });

    it('should redact password= patterns in output', async () => {
      const pwHandler: ToolHandler = vi.fn(() =>
        Promise.resolve({
          content: [{ type: 'text' as const, text: 'Config: password=MyS3cretP@ss!' }],
        })
      );

      const secureHandler = createSecureHandler(pwHandler, { toolName: 'pw_tool' });
      const result = await secureHandler({});
      expect(result.content[0]?.text).toContain('[REDACTED]');
      expect(result.content[0]?.text).not.toContain('MyS3cretP@ss');
    });

    it('should handle slow handler execution', async () => {
      const slowHandler: ToolHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { content: [{ type: 'text' as const, text: 'slow' }] };
      });

      const secureHandler = createSecureHandler(slowHandler, {
        toolName: 'slow_tool',
        logger: mockLogger,
      });

      const result = await secureHandler({});

      expect(result.content[0]?.text).toBe('slow');

      // Duration should be logged
      const childLogger = getChildLogger(mockLogger);
      expect(childLogger.info).toHaveBeenCalledWith(
        'Tool execution completed',
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );
    });
  });
});
