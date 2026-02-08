/**
 * Tests for gateway server proxy.
 * @module mcp/gateway/gateway-server-proxy.test
 * (Source: Issue #896, Epic #888)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createGatewayServerProxy } from './gateway-server-proxy.js';
import type { GatewayConfig } from './gateway-middleware.js';
import type { ILogger } from '../../core/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SdkCallback = (args: unknown, extra: unknown) => Promise<unknown>;

interface MockServerShape {
  registerTool: ReturnType<typeof vi.fn>;
  otherMethod: ReturnType<typeof vi.fn>;
}

function createMockServer(): McpServer & MockServerShape {
  const mock = {
    registerTool: vi.fn(),
    otherMethod: vi.fn().mockReturnValue('other-result'),
  };
  return mock as unknown as McpServer & MockServerShape;
}

function createSilentLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as unknown as ILogger;
}

/** Extracts the wrapped callback registered by the proxy. */
function getRegisteredCallback(mock: MockServerShape): SdkCallback {
  return mock.registerTool.mock.calls[0]?.[2] as SdkCallback;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createGatewayServerProxy', () => {
  let mockServer: McpServer & MockServerShape;
  let logger: ILogger;

  beforeEach(() => {
    mockServer = createMockServer();
    logger = createSilentLogger();
  });

  it('returns original server when gateway is disabled', () => {
    const config: GatewayConfig = { enabled: false, logger };
    const result = createGatewayServerProxy(mockServer, config);
    expect(result).toBe(mockServer);
  });

  it('returns a proxy when gateway is enabled', () => {
    const config: GatewayConfig = { enabled: true, logger };
    const result = createGatewayServerProxy(mockServer, config);
    expect(result).not.toBe(mockServer);
  });

  it('forwards non-registerTool property access', () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const proxyShape = proxy as unknown as MockServerShape;
    const result: unknown = proxyShape.otherMethod();
    expect(result).toBe('other-result');
    expect(mockServer.otherMethod).toHaveBeenCalled();
  });

  it('wraps registerTool callback with gateway', () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const originalCb = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    });

    proxy.registerTool(
      'test_tool',
      { description: 'test', inputSchema: {} },
      originalCb as unknown as Parameters<McpServer['registerTool']>[2]
    );

    expect(mockServer.registerTool).toHaveBeenCalledOnce();
    const [name, , wrappedCb] = mockServer.registerTool.mock.calls[0] as [string, unknown, unknown];
    expect(name).toBe('test_tool');
    expect(wrappedCb).not.toBe(originalCb);
    expect(typeof wrappedCb).toBe('function');
  });

  it('wrapped callback invokes original and returns result', async () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const originalCb = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
    });

    proxy.registerTool(
      'test_tool',
      { description: 'test', inputSchema: {} },
      originalCb as unknown as Parameters<McpServer['registerTool']>[2]
    );

    const wrappedCb = getRegisteredCallback(mockServer);
    const result = await wrappedCb({ task: 'foo' }, { requestId: '1' });

    expect(originalCb).toHaveBeenCalledWith({ task: 'foo' }, { requestId: '1' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'hello' }] });
  });

  it('gateway logs tier classification on invocation', async () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const originalCb = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    });

    proxy.registerTool(
      'delegate_to_model',
      { description: 'test', inputSchema: {} },
      originalCb as unknown as Parameters<McpServer['registerTool']>[2]
    );

    const wrappedCb = getRegisteredCallback(mockServer);
    await wrappedCb({ task: 'test' }, undefined);

    expect(logger.debug).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('propagates errors from original callback', async () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const error = new Error('tool failed');
    const originalCb = vi.fn().mockRejectedValue(error);

    proxy.registerTool(
      'test_tool',
      { description: 'test', inputSchema: {} },
      originalCb as unknown as Parameters<McpServer['registerTool']>[2]
    );

    const wrappedCb = getRegisteredCallback(mockServer);
    await expect(wrappedCb({}, undefined)).rejects.toThrow('tool failed');
    expect(logger.error).toHaveBeenCalled();
  });

  it('preserves extra parameter passthrough', async () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const originalCb = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    });

    proxy.registerTool(
      'test_tool',
      { description: 'test', inputSchema: {} },
      originalCb as unknown as Parameters<McpServer['registerTool']>[2]
    );

    const wrappedCb = getRegisteredCallback(mockServer);
    const extraCtx = { requestId: 'abc', signal: {} };
    await wrappedCb({ task: 'test' }, extraCtx);

    expect(originalCb).toHaveBeenCalledWith({ task: 'test' }, extraCtx);
  });

  it('handles isError results in gateway logging', async () => {
    const config: GatewayConfig = { enabled: true, logger };
    const proxy = createGatewayServerProxy(mockServer, config);
    const originalCb = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'validation failed' }],
      isError: true,
    });

    proxy.registerTool(
      'test_tool',
      { description: 'test', inputSchema: {} },
      originalCb as unknown as Parameters<McpServer['registerTool']>[2]
    );

    const wrappedCb = getRegisteredCallback(mockServer);
    const result = await wrappedCb({}, undefined);

    expect(result).toEqual({
      content: [{ type: 'text', text: 'validation failed' }],
      isError: true,
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});
