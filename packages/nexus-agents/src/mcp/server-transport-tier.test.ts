/**
 * The transport the server connected reaches a tool's measured caller tier
 * (#6795). End to end: a real `connectTransport`, a real JSON-RPC `tools/call`
 * and the production wrapping (`createSecureHandler` inside
 * `wrapToolWithTimeout`), so the test fails if any link in between drops the
 * transport.
 */

import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';

import { connectTransport } from './server.js';
import { createSecureHandler, type HandlerContext } from './middleware/secure-handler.js';
import { wrapToolWithTimeout, toSdkCallback } from './middleware/tool-wrapper.js';
import {
  measuredTrustTier,
  recordServerTransport,
  type RequestContext,
} from './middleware/request-context.js';

const TOOL = 'probe_caller_tier';

interface Observed {
  measured: string | undefined;
  transport: string | undefined;
}

/** A server with one tool that records the caller tier its handler sees. */
function createProbeServer(): { server: McpServer; observed: Observed[] } {
  const observed: Observed[] = [];
  const server = new McpServer({ name: 'tier-probe', version: '0.0.0' });
  const secure = createSecureHandler(
    (_args: unknown, ctx?: HandlerContext) => {
      observed.push({
        measured: ctx && measuredTrustTier(ctx.requestContext),
        transport: ctx?.requestContext.caller.transport,
      });
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    },
    { toolName: TOOL }
  );
  const wrapped = wrapToolWithTimeout(TOOL, secure, { timeoutMs: 5_000 });
  server.registerTool(
    TOOL,
    { description: 'probe', inputSchema: { note: z.string().optional() } },
    toSdkCallback(wrapped)
  );
  return { server, observed };
}

/** Send newline-delimited JSON-RPC to a stdio transport and await response `id`. */
function stdioExchange(
  stdin: PassThrough,
  stdout: PassThrough,
  messages: readonly Record<string, unknown>[],
  awaitId: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`no response for id ${String(awaitId)}`));
    }, 5_000);
    stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      for (const line of buffer.split('\n').slice(0, -1)) {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg['id'] === awaitId) {
          clearTimeout(timer);
          resolve(msg);
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    });
    for (const m of messages) stdin.write(JSON.stringify(m) + '\n');
  });
}

afterEach(() => {
  recordServerTransport(undefined);
});

describe('caller transport → measured caller tier (#6795)', () => {
  it('a stdio server measures its caller at tier 1', async () => {
    const { server, observed } = createProbeServer();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const connected = await connectTransport(server, new StdioServerTransport(stdin, stdout));
    expect(connected.ok).toBe(true);

    const response = await stdioExchange(
      stdin,
      stdout,
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'probe', version: '0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: TOOL, arguments: {} } },
      ],
      2
    );
    await server.close();

    expect(response['error']).toBeUndefined();
    expect(observed).toEqual([{ measured: '1', transport: 'stdio' }]);
  });

  it('a transport the server cannot identify leaves the caller unmeasured', async () => {
    const { server, observed } = createProbeServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const connected = await connectTransport(server, serverTransport);
    expect(connected.ok).toBe(true);
    const client = new Client({ name: 'probe', version: '0' });
    await client.connect(clientTransport);

    await client.callTool({ name: TOOL, arguments: {} });
    await client.close();
    await server.close();

    expect(observed).toEqual([{ measured: undefined, transport: undefined }]);
  });

  it("the middleware chain's own context carries the recorded transport", async () => {
    // The chain's context is the one its audit/policy stages log under; the
    // secure handler derives a second one, so each needs its own check.
    recordServerTransport('stdio');
    const seen: (string | undefined)[] = [];
    const chainOnly = (
      _args: unknown,
      ctx: { requestContext: RequestContext }
    ): Promise<{ content: { type: 'text'; text: string }[] }> => {
      seen.push(measuredTrustTier(ctx.requestContext));
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    };
    await wrapToolWithTimeout(TOOL, chainOnly, { timeoutMs: 5_000 })({});
    expect(seen).toEqual(['1']);
  });

  it('no connected transport at all leaves the caller unmeasured (the fallback)', async () => {
    const { observed } = createProbeServer();
    const secure = createSecureHandler(
      (_args: unknown, ctx?: HandlerContext) => {
        observed.push({
          measured: ctx && measuredTrustTier(ctx.requestContext),
          transport: ctx?.requestContext.caller.transport,
        });
        return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
      },
      { toolName: TOOL }
    );
    await wrapToolWithTimeout(TOOL, secure, { timeoutMs: 5_000 })({});

    expect(observed).toEqual([{ measured: undefined, transport: undefined }]);
  });
});
