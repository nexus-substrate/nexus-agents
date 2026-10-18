/**
 * nexus-agents/mcp/sdk-facade - Unit Tests
 *
 * Validates the MCP SDK v2 compatibility facade symbol mappings,
 * helpers, server instantiation, and client-server RPC execution.
 *
 * @module mcp/sdk-facade/sdk-facade.test
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  McpServer,
  InMemoryTransport,
  StdioServerTransport,
  serveStdio,
  Client,
  StdioClientTransport,
  getDefaultEnvironment,
  DEFAULT_INHERITED_ENV_VARS,
  isCallToolResult,
  CallToolResultSchema,
  CallToolRequestSchema,
  CompatibilityCallToolResultSchema,
  createLinkedTransports,
  createCompatibleMcpServer,
  createTextResult,
} from './index.js';

describe('MCP SDK v2 Facade', () => {
  describe('Symbol Exports', () => {
    it('exports server classes and utilities', () => {
      expect(McpServer).toBeDefined();
      expect(typeof McpServer).toBe('function');
      expect(InMemoryTransport).toBeDefined();
      expect(typeof InMemoryTransport.createLinkedPair).toBe('function');
      expect(StdioServerTransport).toBeDefined();
      expect(typeof StdioServerTransport).toBe('function');
      expect(typeof serveStdio).toBe('function');
      expect(typeof isCallToolResult).toBe('function');
    });

    it('exports client classes and utilities', () => {
      expect(Client).toBeDefined();
      expect(typeof Client).toBe('function');
      expect(StdioClientTransport).toBeDefined();
      expect(typeof StdioClientTransport).toBe('function');
      expect(typeof getDefaultEnvironment).toBe('function');
      expect(Array.isArray(DEFAULT_INHERITED_ENV_VARS)).toBe(true);
    });

    it('exports core schemas', () => {
      expect(CallToolResultSchema).toBeDefined();
      expect(CallToolRequestSchema).toBeDefined();
      expect(CompatibilityCallToolResultSchema).toBeDefined();
    });
  });

  describe('Helpers', () => {
    it('creates linked in-memory transports', () => {
      const [clientTransport, serverTransport] = createLinkedTransports();
      expect(clientTransport).toBeInstanceOf(InMemoryTransport);
      expect(serverTransport).toBeInstanceOf(InMemoryTransport);
      expect(clientTransport).not.toBe(serverTransport);
    });

    it('creates text tool results', () => {
      const okResult = createTextResult('hello world');
      expect(okResult).toEqual({
        content: [{ type: 'text', text: 'hello world' }],
      });
      expect(isCallToolResult(okResult)).toBe(true);

      const errResult = createTextResult('failure message', true);
      expect(errResult).toEqual({
        content: [{ type: 'text', text: 'failure message' }],
        isError: true,
      });
      expect(isCallToolResult(errResult)).toBe(true);
    });

    it('instantiates compatible McpServer instances', () => {
      const server = createCompatibleMcpServer({
        name: 'test-facade-server',
        version: '1.2.3',
      });
      expect(server).toBeInstanceOf(McpServer);
      expect(server.server).toBeDefined();
    });

    it('instantiates McpServer with custom capabilities and taskStore', () => {
      const mockTaskStore = { getTask: (): null => null };
      const server = createCompatibleMcpServer({
        name: 'custom-server',
        version: '2.0.0',
        capabilities: {
          prompts: { listChanged: true },
          resources: {},
          tasks: {},
        },
        taskStore: mockTaskStore,
      });
      expect(server).toBeInstanceOf(McpServer);
    });
  });

  describe('End-to-End Client-Server RPC via Facade', () => {
    it('registers tools, exchanges calls, and validates results', async () => {
      const server = createCompatibleMcpServer({
        name: 'e2e-server',
        version: '1.0.0',
      });

      // Register test tool using standard v2 schema definition
      server.registerTool(
        'add_numbers',
        {
          description: 'Adds two numbers together',
          inputSchema: z.object({
            a: z.number().describe('First number'),
            b: z.number().describe('Second number'),
          }),
        },
        async ({ a, b }) => {
          await Promise.resolve();
          const sum = a + b;
          return createTextResult(`Sum is ${String(sum)}`);
        }
      );

      const [clientTransport, serverTransport] = createLinkedTransports();
      const client = new Client({ name: 'e2e-client', version: '1.0.0' });

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      // List tools
      const list = await client.listTools();
      expect(list.tools).toHaveLength(1);
      expect(list.tools[0]?.name).toBe('add_numbers');
      expect(list.tools[0]?.description).toBe('Adds two numbers together');

      // Call tool
      const rawResult = await client.callTool({
        name: 'add_numbers',
        arguments: { a: 40, b: 2 },
      });

      expect(isCallToolResult(rawResult)).toBe(true);
      const parsed = CallToolResultSchema.parse(rawResult);
      expect(parsed.content).toEqual([{ type: 'text', text: 'Sum is 42' }]);

      // Cleanup
      await client.close();
      await server.close();
    });
  });
});
