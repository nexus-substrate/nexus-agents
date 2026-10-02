/** Regression coverage for operator output on the real stdio transport (#5167). */
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

import { createServer, connectTransport } from './server.js';
import { createMcpNotifier, withProgressHeartbeat } from './mcp-notifier.js';
import { toSdkCallback } from './middleware/tool-wrapper.js';
import { getGlobalLogLevel, setGlobalLogLevel } from '../core/logger.js';
import { recordServerTransport } from './middleware/request-context.js';

const TOOL = 'probe_operator_output';
const originalLevel = getGlobalLogLevel();

/** Capture all frames, resolving only after the tool response arrives. */
function collectResponse(stdout: PassThrough): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error('No operator probe response'));
    }, 5_000);
    stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.includes('"id":2')) {
        clearTimeout(timer);
        resolve(output);
      }
    });
  });
}

/** A tool that emits operator events and a genuine progress heartbeat. */
function registerProbe(server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer): void {
  const notifier = createMcpNotifier(server);
  server.registerTool(
    TOOL,
    { description: 'Exercise operator output', inputSchema: {} },
    toSdkCallback(async () => {
      notifier.info(TOOL, { event: 'started' });
      notifier.debug(TOOL, { event: 'selected' });
      notifier.warn(TOOL, { event: 'fallback' });
      await withProgressHeartbeat(
        TOOL,
        notifier,
        () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
        10
      );
      return { content: [{ type: 'text' as const, text: 'complete' }] };
    })
  );
}

afterEach(() => {
  setGlobalLogLevel(originalLevel);
  recordServerTransport(undefined);
  vi.restoreAllMocks();
});

describe('operator output over stdio', () => {
  it('keeps stdout JSON-RPC only while preserving progress and logging to stderr', async () => {
    setGlobalLogLevel('debug');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const processStdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const created = createServer();
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error.message);
    const { server } = created.value;
    registerProbe(server);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    try {
      const connected = await connectTransport(server, new StdioServerTransport(stdin, stdout));
      expect(connected.ok).toBe(true);
      const response = collectResponse(stdout);
      stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'operator-probe', version: '1' },
          },
        }) + '\n'
      );
      stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: TOOL, arguments: {}, _meta: { progressToken: 'probe-progress' } },
        }) + '\n'
      );
      const output = await response;
      const frames = output
        .trim()
        .split('\n')
        .map((line) => JSONRPCMessageSchema.parse(JSON.parse(line)));
      expect(frames.length).toBeGreaterThan(2);
      expect(output).not.toContain('notifications/message');
      expect(output).toContain('notifications/progress');
      expect(output).toContain('probe-progress');
      expect(frames.at(-1)).toMatchObject({ id: 2, result: { content: [{ text: 'complete' }] } });
      expect(processStdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls.map((call) => String(call[0])).join('')).toContain('started');
    } finally {
      await server.close();
      stdin.destroy();
      stdout.destroy();
    }
  });
});
