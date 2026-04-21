/**
 * MCP Server Lifecycle E2E Tests
 *
 * End-to-end tests for MCP server lifecycle, tool registration,
 * and tool error handling.
 *
 * @module testing/e2e/mcp/mcp-server-lifecycle
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
import type { ILogger } from '../../../core/index.js';
import { measureLatency, assertOk } from '../utils/index.js';

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

describe('MCP Server Lifecycle E2E Tests', () => {
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
      const content = callResult.content as Array<{ type: string; text?: string }>;
      expect(content).toHaveLength(1);
      const textContent = content[0];
      expect(textContent).toBeDefined();
      if (textContent?.type === 'text') {
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
      const content = result.content as Array<{ type: string; text?: string }>;
      const textContent = content[0];
      expect(textContent).toBeDefined();
      if (textContent?.type === 'text') {
        expect(textContent.text).toContain('Intentional error');
      }
    });

    it('should handle tool success', async () => {
      const result = await client.callTool({
        name: 'error_tool',
        arguments: { shouldError: false },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text?: string }>;
      const textContent = content[0];
      expect(textContent).toBeDefined();
      if (textContent?.type === 'text') {
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
      const content = result.content as Array<{ type: string; text?: string }>;
      const textContent = content[0];
      expect(textContent).toBeDefined();
      if (textContent?.type === 'text') {
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
      const content = result.content as Array<{ type: string; text?: string }>;
      const textContent = content[0];
      expect(textContent).toBeDefined();
      if (textContent?.type === 'text') {
        expect(textContent.text).toContain('not found');
      }
    });
  });
});
