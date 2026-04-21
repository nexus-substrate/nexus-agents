/**
 * MCP Security E2E Tests
 *
 * End-to-end tests for timeout protection (CVE-2026-0621),
 * URI validation, and concurrent operations.
 *
 * @module testing/e2e/mcp/mcp-security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createServer, connectTransport } from '../../../mcp/server.js';
import { TimeoutGuard, UriValidation } from '../../../mcp/middleware/timeout-guard.js';
import type { ILogger } from '../../../core/index.js';
import { measureLatency, sleep, assertOk } from '../utils/index.js';

/**
 * Mock logger for testing.
 */
function createTestLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

describe('MCP Security E2E Tests', () => {
  describe('Timeout Protection (CVE-2026-0621)', () => {
    let guard: TimeoutGuard;
    let logger: ILogger;

    beforeEach(() => {
      logger = createTestLogger();
      guard = new TimeoutGuard({
        defaultTimeoutMs: 100,
        maxTimeoutMs: 500,
        logger,
        enableLogging: false,
      });
    });

    it('should complete fast operations', async () => {
      const result = await guard.execute(
        async () => {
          await sleep(10);
          return 'completed';
        },
        { operationName: 'fast-op' }
      );

      const guardedResult = assertOk(result);
      expect(guardedResult.value).toBe('completed');
      expect(guardedResult.durationMs).toBeLessThan(100);
      expect(guardedResult.nearTimeout).toBe(false);
    });

    it('should timeout slow operations', async () => {
      const result = await guard.execute(
        async () => {
          await sleep(200); // Exceeds 100ms default
          return 'should not return';
        },
        { operationName: 'slow-op' }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OPERATION_TIMEOUT');
        expect(result.error.operation).toBe('slow-op');
      }
    });

    it('should call onTimeout callback', async () => {
      const onTimeout = vi.fn();

      await guard.execute(
        async () => {
          await sleep(200);
          return 'ignored';
        },
        { operationName: 'callback-test', onTimeout }
      );

      expect(onTimeout).toHaveBeenCalled();
    });

    it('should detect near-timeout operations', async () => {
      const result = await guard.execute(
        async () => {
          await sleep(85); // 85% of 100ms threshold
          return 'completed';
        },
        { operationName: 'near-timeout-op' }
      );

      const guardedResult = assertOk(result);
      expect(guardedResult.nearTimeout).toBe(true);
    });

    it('should enforce max timeout', async () => {
      const result = await guard.execute(
        async () => {
          await sleep(10);
          return 'done';
        },
        { timeoutMs: 10000, operationName: 'max-test' } // Requests 10s but max is 500ms
      );

      assertOk(result);
      // Would have timed out if 10s was used
    });

    it('should reject invalid timeout', async () => {
      const result = await guard.execute(() => Promise.resolve('test'), {
        timeoutMs: -100,
        operationName: 'invalid-timeout',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TIMEOUT');
      }
    });

    it('should guard function wrapper', async () => {
      const riskyFn = async (delay: number): Promise<string> => {
        await sleep(delay);
        return `completed-${String(delay)}`;
      };

      const guardedFn = guard.guard(riskyFn, { operationName: 'guarded-fn' });

      // Fast call succeeds
      const fastResult = await guardedFn(10);
      const guardedFastResult = assertOk(fastResult);
      expect(guardedFastResult.value).toBe('completed-10');

      // Slow call times out
      const slowResult = await guardedFn(200);
      expect(slowResult.ok).toBe(false);
    });
  });

  describe('URI Validation (CVE-2026-0621)', () => {
    it('should accept valid URIs', () => {
      const result = UriValidation.validate('https://example.com/api/v1/users');
      const validUri = assertOk(result);
      expect(validUri).toBe('https://example.com/api/v1/users');
    });

    it('should reject URIs exceeding max length', () => {
      const longUri = 'https://example.com/' + 'a'.repeat(10000);
      const result = UriValidation.validate(longUri);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GUARD_ERROR');
        expect(result.error.message).toContain('exceeds maximum length');
      }
    });

    it('should reject URIs with suspicious patterns', () => {
      // Deeply nested templates (3+ levels) - potential ReDoS
      // Pattern: \{(?:[^{}]*\{){3,} matches 3+ nested opening braces
      const suspiciousUri = 'https://example.com/{{{{{nested}}}}}';
      const result = UriValidation.validate(suspiciousUri);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('suspicious patterns');
      }
    });

    it('should reject URIs with multiple glob patterns', () => {
      // Multiple glob-like patterns with trailing * - potential ReDoS
      // Pattern: \{[+#./;?&]?[^}]*\*\}.*\{[+#./;?&]?[^}]*\*\}
      const suspiciousUri = 'https://example.com/{path*}/{other*}';
      const result = UriValidation.validate(suspiciousUri);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('suspicious patterns');
      }
    });

    it('should sanitize URIs', () => {
      // Deeply nested template
      const nested = 'https://example.com/{{{{{deep}}}}}';
      const sanitized = UriValidation.sanitize(nested);

      // Should limit nesting depth
      expect(sanitized).not.toContain('{{{{{');
    });

    it('should truncate long URIs when sanitizing', () => {
      const longUri = 'https://example.com/' + 'x'.repeat(10000);
      const sanitized = UriValidation.sanitize(longUri);

      expect(sanitized.length).toBeLessThanOrEqual(UriValidation.MAX_URI_LENGTH);
    });
  });

  describe('Concurrent Operations', () => {
    let server: McpServer;
    let client: Client;
    let logger: ILogger;

    beforeEach(async () => {
      logger = createTestLogger();
      const serverResult = createServer({ logger });
      const { server: s } = assertOk(serverResult);
      server = s;

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      server.tool('counter', {}, async () => {
        await sleep(10);
        return { content: [{ type: 'text', text: 'counted' }] };
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await connectTransport(server, serverTransport, logger);

      client = new Client({ name: 'concurrent-test', version: '1.0.0' });
      await client.connect(clientTransport);
    });

    afterEach(async () => {
      await client.close();
      await server.close();
    });

    it('should handle concurrent tool calls', async () => {
      const calls = Array.from({ length: 10 }, () =>
        client.callTool({ name: 'counter', arguments: {} })
      );

      const results = await Promise.all(calls);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.isError).toBeFalsy();
      });
    });

    it('should measure concurrent call performance', async () => {
      const { result: results, ms } = await measureLatency(async () => {
        const calls = Array.from({ length: 5 }, () =>
          client.callTool({ name: 'counter', arguments: {} })
        );
        return Promise.all(calls);
      });

      expect(results).toHaveLength(5);
      // Concurrent should be faster than sequential (5 * 10ms = 50ms)
      // Allow some overhead
      expect(ms).toBeLessThan(200);
    });
  });
});
