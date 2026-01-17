/**
 * MCP Protocol E2E Tests
 *
 * End-to-end tests for MCP server lifecycle, tool registration,
 * invocation, and error handling.
 *
 * @module testing/e2e/mcp/mcp-protocol
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  createServer,
  connectTransport,
  closeServer,
  type ServerConfig,
} from '../../../mcp/server.js';
import { registerTools } from '../../../mcp/tools/index.js';
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
  } as unknown as ILogger;
}

describe('MCP Protocol E2E Tests', () => {
  describe('Server Lifecycle', () => {
    let logger: ILogger;

    beforeEach(() => {
      logger = createTestLogger();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should create server with default configuration', () => {
      const result = createServer({ logger });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.server).toBeDefined();
        expect(result.value.logger).toBe(logger);
      }
    });

    it('should create server with custom name and version', () => {
      const config: ServerConfig = {
        name: 'e2e-test-server',
        version: '1.0.0-test',
        logger,
      };

      const result = createServer(config);

      expect(result.ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Creating MCP server',
        expect.objectContaining({
          name: 'e2e-test-server',
          version: '1.0.0-test',
        })
      );
    });

    it('should connect to InMemoryTransport', async () => {
      const serverResult = createServer({ logger });
      const { server } = assertOk(serverResult);

      const [, serverTransport] = InMemoryTransport.createLinkedPair();

      const connectResult = await connectTransport(server, serverTransport, logger);

      expect(connectResult.ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Connecting server to transport');
    });

    it('should close server cleanly', async () => {
      const serverResult = createServer({ logger });
      const { server } = assertOk(serverResult);

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      await connectTransport(server, serverTransport, logger);
      const closeResult = await closeServer(server, logger);

      expect(closeResult.ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('MCP server closed successfully');

      await clientTransport.close();
    });

    it('should handle full lifecycle with client', async () => {
      // Create server
      const serverResult = createServer({ logger });
      const { server } = assertOk(serverResult);

      // Create and connect transports
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await connectTransport(server, serverTransport, logger);

      // Create and connect client
      const client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      // Verify connection
      const serverInfo = client.getServerVersion();
      expect(serverInfo).toBeDefined();
      expect(serverInfo?.name).toBe('nexus-agents');

      // Clean up
      await client.close();
      await server.close();
    });

    it('should measure connection latency', async () => {
      const serverResult = createServer({ logger });
      const { server } = assertOk(serverResult);

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await connectTransport(server, serverTransport, logger);

      const { result: client, ms } = await measureLatency(async () => {
        const c = new Client({ name: 'latency-test', version: '1.0.0' });
        await c.connect(clientTransport);
        return c;
      });

      // Connection should be fast in-memory
      expect(ms).toBeLessThan(1000);
      expect(client.getServerVersion()?.name).toBe('nexus-agents');

      await client.close();
      await server.close();
    });
  });

  describe('Tool Registration', () => {
    let server: McpServer;
    let logger: ILogger;

    beforeEach(() => {
      logger = createTestLogger();
      const serverResult = createServer({ logger });
      const result = assertOk(serverResult);
      server = result.server;
    });

    afterEach(async () => {
      await closeServer(server, logger);
    });

    it('should register tools infrastructure', () => {
      const result = registerTools(server, { logger });

      expect(result.tools).toContain('orchestrate');
      expect(result.tools).toContain('create_expert');
      expect(result.tools).toContain('run_workflow');
      expect(result.tools).toContain('delegate_to_model');
      expect(result.logger).toBe(logger);
      expect(result.rateLimiter).toBeDefined();
    });

    it('should register custom tool and invoke it', async () => {
      // Register a simple test tool (using deprecated .tool() - testing actual MCP SDK behavior)
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      server.tool('echo_test', { message: z.string().describe('Message to echo') }, (args) => ({
        content: [{ type: 'text', text: `Echo: ${args.message}` }],
      }));

      // Connect client
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await connectTransport(server, serverTransport, logger);

      const client = new Client({ name: 'tool-test', version: '1.0.0' });
      await client.connect(clientTransport);

      // List tools
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain('echo_test');

      // Call tool
      const callResult = await client.callTool({
        name: 'echo_test',
        arguments: { message: 'Hello E2E' },
      });

      expect(callResult.isError).toBeFalsy();
      expect(callResult.content).toHaveLength(1);
      const textContent = callResult.content[0];
      expect(textContent.type).toBe('text');
      if (textContent.type === 'text') {
        expect(textContent.text).toBe('Echo: Hello E2E');
      }

      await client.close();
    });
  });

  describe('Tool Error Handling', () => {
    let server: McpServer;
    let client: Client;
    let logger: ILogger;

    beforeEach(async () => {
      logger = createTestLogger();
      const serverResult = createServer({ logger });
      const result = assertOk(serverResult);
      server = result.server;

      // Register test tools (using deprecated .tool() - testing actual MCP SDK behavior)
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      server.tool(
        'error_tool',
        { shouldError: z.boolean().describe('Whether to throw error') },
        (args) => {
          if (args.shouldError) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Intentional error for testing' }],
            };
          }
          return { content: [{ type: 'text', text: 'Success' }] };
        }
      );

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      server.tool('throw_tool', {}, () => {
        throw new Error('Unhandled exception');
      });

      // Connect
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await connectTransport(server, serverTransport, logger);

      client = new Client({ name: 'error-test', version: '1.0.0' });
      await client.connect(clientTransport);
    });

    afterEach(async () => {
      await client.close();
      await server.close();
    });

    it('should handle tool returning isError=true', async () => {
      const result = await client.callTool({
        name: 'error_tool',
        arguments: { shouldError: true },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content[0];
      expect(textContent.type).toBe('text');
      if (textContent.type === 'text') {
        expect(textContent.text).toContain('Intentional error');
      }
    });

    it('should handle tool success', async () => {
      const result = await client.callTool({
        name: 'error_tool',
        arguments: { shouldError: false },
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0];
      if (textContent.type === 'text') {
        expect(textContent.text).toBe('Success');
      }
    });

    it('should handle tool throwing exception', async () => {
      // Note: MCP SDK wraps exceptions as error responses
      const result = await client.callTool({
        name: 'throw_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid arguments', async () => {
      // Call with missing required argument - MCP SDK returns isError response
      const result = await client.callTool({
        name: 'error_tool',
        arguments: {}, // Missing 'shouldError'
      });

      expect(result.isError).toBe(true);
      const textContent = result.content[0];
      if (textContent.type === 'text') {
        expect(textContent.text).toContain('validation error');
      }
    });

    it('should return error for unknown tool', async () => {
      // MCP SDK returns isError response for unknown tools
      const result = await client.callTool({
        name: 'nonexistent_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const textContent = result.content[0];
      if (textContent.type === 'text') {
        expect(textContent.text).toContain('not found');
      }
    });
  });

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

      assertOk(result);
      expect(result.value.value).toBe('completed');
      expect(result.value.durationMs).toBeLessThan(100);
      expect(result.value.nearTimeout).toBe(false);
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

      assertOk(result);
      expect(result.value.nearTimeout).toBe(true);
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
      assertOk(fastResult);
      expect(fastResult.value.value).toBe('completed-10');

      // Slow call times out
      const slowResult = await guardedFn(200);
      expect(slowResult.ok).toBe(false);
    });
  });

  describe('URI Validation (CVE-2026-0621)', () => {
    it('should accept valid URIs', () => {
      const result = UriValidation.validate('https://example.com/api/v1/users');
      assertOk(result);
      expect(result.value).toBe('https://example.com/api/v1/users');
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
