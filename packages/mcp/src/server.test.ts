/**
 * @nexus-agents/mcp - Server Tests
 *
 * Tests for MCP server creation and transport connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { createServer, connectTransport, closeServer, type ServerConfig } from './server.js';

/**
 * Mock logger interface for testing.
 */
interface MockLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

/**
 * Creates a mock logger for testing.
 */
function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

describe('MCP Server', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createServer', () => {
    it('should create server with default configuration', () => {
      const result = createServer({ logger: mockLogger });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.server).toBeDefined();
        expect(result.value.logger).toBe(mockLogger);
      }
    });

    it('should create server with custom name', () => {
      const config: ServerConfig = {
        name: 'custom-server',
        logger: mockLogger,
      };

      const result = createServer(config);

      expect(result.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating MCP server',
        expect.objectContaining({ name: 'custom-server' })
      );
    });

    it('should create server with custom version', () => {
      const config: ServerConfig = {
        version: '2.0.0',
        logger: mockLogger,
      };

      const result = createServer(config);

      expect(result.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating MCP server',
        expect.objectContaining({ version: '2.0.0' })
      );
    });

    it('should use default logger if none provided', () => {
      const result = createServer();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.logger).toBeDefined();
      }
    });
  });

  describe('connectTransport', () => {
    it('should connect server to InMemoryTransport', async () => {
      const serverResult = createServer({ logger: mockLogger });
      expect(serverResult.ok).toBe(true);
      if (!serverResult.ok) return;

      const { server, logger } = serverResult.value;

      // Create linked transport pair
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      // Connect server to transport
      const connectResult = await connectTransport(server, serverTransport, logger);

      expect(connectResult.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Connecting server to transport');

      // Clean up
      await clientTransport.close();
      await serverTransport.close();
    });

    it('should create client-server connection', async () => {
      const serverResult = createServer({ logger: mockLogger });
      expect(serverResult.ok).toBe(true);
      if (!serverResult.ok) return;

      const { server, logger } = serverResult.value;

      // Create linked transport pair
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      // Connect server to transport
      await connectTransport(server, serverTransport, logger);

      // Create and connect client
      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });
      await client.connect(clientTransport);

      // Verify connection by checking server version (this is set during initialization)
      const serverInfo = client.getServerVersion();
      expect(serverInfo).toBeDefined();
      expect(serverInfo?.name).toBe('nexus-agents');

      // Clean up
      await client.close();
      await server.close();
    });
  });

  describe('closeServer', () => {
    it('should close server successfully', async () => {
      const serverResult = createServer({ logger: mockLogger });
      expect(serverResult.ok).toBe(true);
      if (!serverResult.ok) return;

      const { server, logger } = serverResult.value;

      // Create and connect transport
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await connectTransport(server, serverTransport, logger);

      // Close server
      const closeResult = await closeServer(server, logger);

      expect(closeResult.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Closing MCP server');
      expect(mockLogger.info).toHaveBeenCalledWith('MCP server closed successfully');

      // Clean up transport
      await clientTransport.close();
    });
  });
});

describe('Server Integration', () => {
  it('should handle full server lifecycle', async () => {
    // Create server
    const serverResult = createServer();
    expect(serverResult.ok).toBe(true);
    if (!serverResult.ok) return;

    const { server, logger } = serverResult.value;

    // Create transports
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Connect server
    const connectResult = await connectTransport(server, serverTransport, logger);
    expect(connectResult.ok).toBe(true);

    // Connect client
    const client = new Client({
      name: 'lifecycle-test',
      version: '1.0.0',
    });
    await client.connect(clientTransport);

    // Verify server info - getServerVersion returns sync
    const serverInfo = client.getServerVersion();
    expect(serverInfo).toBeDefined();
    expect(serverInfo?.name).toBe('nexus-agents');

    // Clean up
    await client.close();
    await server.close();
  });
});
