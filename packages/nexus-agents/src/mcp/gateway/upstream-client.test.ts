/**
 * Tests for UpstreamClient and UpstreamClientManager.
 * @module mcp/gateway/upstream-client.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpstreamClientManager } from './upstream-client.js';
import type { UpstreamServerConfig } from '../../config/schemas-gateway.js';
import type { ILogger } from '../../core/index.js';

// Hoist mock implementations for sdk-facade
const mocks = vi.hoisted(() => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockListTools = vi.fn().mockResolvedValue({
    tools: [
      { name: 'fetch', description: 'Fetch URL content', inputSchema: {} },
      { name: 'search', description: 'Search web', inputSchema: {} },
    ],
  });
  const mockCallTool = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'tool response' }],
  });
  const mockPing = vi.fn().mockResolvedValue(undefined);

  const mockClientInstance = {
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    callTool: mockCallTool,
    ping: mockPing,
  };

  const mockClient = vi.fn().mockImplementation(function () {
    return mockClientInstance;
  });

  const mockTransportInstance = {
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockTransport = vi.fn().mockImplementation(function () {
    return mockTransportInstance;
  });

  return {
    mockClient,
    mockClientInstance,
    mockTransport,
    mockTransportInstance,
    mockConnect,
    mockClose,
    mockListTools,
    mockCallTool,
    mockPing,
  };
});

vi.mock('../sdk-facade/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sdk-facade/index.js')>()),
  Client: mocks.mockClient,
  StdioClientTransport: mocks.mockTransport,
}));

function createMockLogger(): ILogger {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockImplementation(() => logger),
    setLevel: vi.fn(),
  };
  return logger;
}

describe('UpstreamClientManager', () => {
  let manager: UpstreamClientManager;
  let logger: ILogger;

  const sampleConfig: UpstreamServerConfig = {
    name: 'github',
    command: 'node',
    args: ['server.js'],
    env: { GITHUB_API: 'https://api.github.com' },
    lazy: false,
    timeoutMs: 5000,
  };

  const lazyConfig: UpstreamServerConfig = {
    name: 'fetcher',
    command: 'python3',
    args: ['app.py'],
    lazy: true,
    timeoutMs: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    manager = new UpstreamClientManager(logger);
  });

  afterEach(async () => {
    await manager.shutdownAll();
  });

  describe('registration and identification', () => {
    it('registers upstream servers', () => {
      manager.registerServers([sampleConfig, lazyConfig]);
      const status = manager.getStatus();
      expect(status).toHaveLength(2);
      expect(status).toEqual([
        { name: 'github', state: 'disconnected' },
        { name: 'fetcher', state: 'disconnected' },
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        'Registered upstream server',
        expect.objectContaining({ name: 'github', command: 'node' })
      );
    });

    it('skips and warns on duplicate server names', () => {
      manager.registerServers([sampleConfig, { ...sampleConfig, command: 'python' }]);
      expect(manager.getStatus()).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Duplicate upstream server name',
        expect.objectContaining({ name: 'github' })
      );
    });

    it('correctly identifies upstream tool names', () => {
      manager.registerServers([sampleConfig]);
      expect(manager.isUpstreamTool('github.fetch')).toBe(true);
      expect(manager.isUpstreamTool('github.search')).toBe(true);
      expect(manager.isUpstreamTool('unknown.tool')).toBe(false);
      expect(manager.isUpstreamTool('noDotTool')).toBe(false);
    });
  });

  describe('connection and tool discovery', () => {
    it('eagerly connects non-lazy servers and discovers tools', async () => {
      manager.registerServers([sampleConfig]);
      await manager.connectEager();

      expect(mocks.mockClient).toHaveBeenCalled();
      expect(mocks.mockTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'node',
          args: ['server.js'],
        })
      );
      expect(mocks.mockConnect).toHaveBeenCalled();
      expect(mocks.mockListTools).toHaveBeenCalled();

      const tools = manager.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 'github.fetch',
        description: '[github] Fetch URL content',
        inputSchema: {},
      });
      expect(tools[1]).toEqual({
        name: 'github.search',
        description: '[github] Search web',
        inputSchema: {},
      });
    });

    it('handles connection failure during connectEager without throwing', async () => {
      mocks.mockConnect.mockRejectedValueOnce(new Error('Spawn failed'));
      manager.registerServers([sampleConfig]);

      await expect(manager.connectEager()).resolves.toBeUndefined();
      const status = manager.getStatus();
      expect(status).toEqual([{ name: 'github', state: 'failed' }]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Upstream server connection failed',
        expect.objectContaining({ name: 'github', error: 'Spawn failed' })
      );
    });

    it('returns empty tool array if servers are not connected', () => {
      manager.registerServers([sampleConfig]);
      expect(manager.getAllTools()).toEqual([]);
    });
  });

  describe('tool execution', () => {
    it('routes tool calls to connected server', async () => {
      manager.registerServers([sampleConfig]);
      await manager.connectEager();

      const res = await manager.callTool('github.fetch', { url: 'https://example.com' });
      expect(res).toEqual({ content: [{ type: 'text', text: 'tool response' }] });
      expect(mocks.mockCallTool).toHaveBeenCalledWith({
        name: 'fetch',
        arguments: { url: 'https://example.com' },
      });
    });

    it('returns null for unregistered or invalid tool names', async () => {
      manager.registerServers([sampleConfig]);
      const res1 = await manager.callTool('noDot', {});
      const res2 = await manager.callTool('other.fetch', {});
      expect(res1).toBeNull();
      expect(res2).toBeNull();
    });

    it('connects lazily on first tool call when lazy is enabled', async () => {
      manager.registerServers([lazyConfig]);
      expect(manager.getStatus()).toEqual([{ name: 'fetcher', state: 'disconnected' }]);

      const res = await manager.callTool('fetcher.fetch', { url: 'https://example.com' });
      expect(res).toEqual({ content: [{ type: 'text', text: 'tool response' }] });
      expect(mocks.mockConnect).toHaveBeenCalled();
      expect(manager.getStatus()).toEqual([{ name: 'fetcher', state: 'connected' }]);
    });

    it('throws error when non-lazy server is disconnected and called', async () => {
      manager.registerServers([sampleConfig]);
      // not connected eagerly
      await expect(manager.callTool('github.fetch', {})).rejects.toThrow(
        'Upstream server github not connected'
      );
    });
  });

  describe('shutdown', () => {
    it('gracefully shuts down all clients and transports', async () => {
      manager.registerServers([sampleConfig]);
      await manager.connectEager();

      await manager.shutdownAll();
      expect(mocks.mockClose).toHaveBeenCalled();
      expect(mocks.mockTransportInstance.close).toHaveBeenCalled();
      expect(manager.getStatus()).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith('All upstream servers shut down');
    });
  });

  describe('environment resolution', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, TEST_SECRET: 'super-secret-key' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('resolves {env:VAR} references and preserves baseline environment variables', async () => {
      const envConfig: UpstreamServerConfig = {
        name: 'secureserver',
        command: 'node',
        args: ['index.js'],
        env: {
          API_KEY: '{env:TEST_SECRET}',
          STATIC_KEY: 'literal-value',
        },
        lazy: false,
        timeoutMs: 5000,
      };

      manager.registerServers([envConfig]);
      await manager.connectEager();

      expect(mocks.mockTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            API_KEY: 'super-secret-key',
            STATIC_KEY: 'literal-value',
          }),
        })
      );
    });
  });
});
