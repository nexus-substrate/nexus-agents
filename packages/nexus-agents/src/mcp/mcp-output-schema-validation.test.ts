import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerListExpertsTool } from './tools/list-experts.js';
import { RateLimiter } from './middleware/rate-limiter.js';

describe('server output-schema validation', () => {
  it('rejects an undeclared handler key on the server before client validation', async () => {
    const server = new McpServer({ name: 'strict-output-test', version: '1.0.0' });
    const registration = vi.spyOn(server, 'registerTool');
    registerListExpertsTool(server, {
      rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }),
    });
    const tool = registration.mock.results[0]?.value as RegisteredTool;
    // Retain the production schema, injecting a single bad handler field.
    tool.update({
      callback: () => ({
        content: [{ type: 'text', text: 'injected leak' }],
        structuredContent: { experts: [], count: 0, undeclared: true },
      }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'raw-output-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      // request(), unlike callTool(), never validates output with client Ajv.
      const result = await client.request(
        { method: 'tools/call', params: { name: 'list_experts', arguments: {} } },
        CallToolResultSchema
      );
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: expect.stringContaining('Output validation error') },
      ]);
      expect(result.structuredContent).toBeUndefined();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
