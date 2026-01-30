/**
 * Tests for Codex MCP Adapter
 *
 * Verifies MCP-based Codex adapter functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockClient = vi.fn();
  const mockTransport = vi.fn();
  const mockSpawn = vi.fn();
  return { mockClient, mockTransport, mockSpawn };
});

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: mocks.mockClient,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mocks.mockTransport,
}));

// Mock child_process for version check
vi.mock('node:child_process', () => ({
  spawn: mocks.mockSpawn,
}));

// Re-export for test access
const Client = mocks.mockClient;

import { CodexMcpAdapter } from './codex-mcp-adapter.js';

describe('CodexMcpAdapter', () => {
  let adapter: CodexMcpAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default MCP Client mock (Issue #582)
    Client.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn(),
    }));

    // Set up default transport mock
    mocks.mockTransport.mockImplementation(() => ({
      close: vi.fn().mockResolvedValue(undefined),
    }));

    // Set up default spawn mock for version check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type EventCallback = (...args: any[]) => void;
    mocks.mockSpawn.mockImplementation(() => {
      const events: Record<string, EventCallback[]> = {};

      return {
        stdout: {
          on: vi.fn((event: string, cb: EventCallback) => {
            const key = `stdout_${event}`;
            events[key] ??= [];
            events[key].push(cb);
            if (event === 'data') {
              setTimeout(() => {
                cb(Buffer.from('codex version 0.77.0'));
              }, 0);
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event: string, cb: EventCallback) => {
          events[event] ??= [];
          events[event].push(cb);
          if (event === 'close') {
            setTimeout(() => {
              cb(0);
            }, 10);
          }
        }),
      };
    });

    adapter = new CodexMcpAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('constructor', () => {
    it('should create adapter with default model', () => {
      expect(adapter.name).toBe('codex');
      expect(adapter.transport).toBe('mcp');
    });

    it('should use custom model when provided', () => {
      const customAdapter = new CodexMcpAdapter({ model: 'o3-mini' });
      expect(customAdapter.getModelInfo().id).toBe('o3-mini');
    });
  });

  describe('capabilities', () => {
    it('should return correct capability profile', () => {
      const caps = adapter.capabilities;

      expect(caps.reasoning).toBe(9);
      expect(caps.contextWindow).toBe(400_000);
      expect(caps.codeGeneration).toBe(10);
      expect(caps.speed).toBe(8);
      expect(caps.cost).toBe(7);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe('o3');
      expect(info.name).toBe('O3');
      expect(info.contextWindow).toBe(400_000);
      expect(info.maxOutput).toBe(100_000);
    });

    it('should return correct cost info', () => {
      const info = adapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(10.0);
      expect(info.costPerMillionOutput).toBe(40.0);
    });

    it('should return correct info for o3-mini model', () => {
      const miniAdapter = new CodexMcpAdapter({ model: 'o3-mini' });
      const info = miniAdapter.getModelInfo();

      expect(info.id).toBe('o3-mini');
      expect(info.name).toBe('O3 Mini');
      expect(info.costPerMillionInput).toBe(1.1);
      expect(info.costPerMillionOutput).toBe(4.4);
    });
  });

  describe('initialize()', () => {
    it('should create MCP client and transport', async () => {
      await adapter.initialize();

      expect(Client).toHaveBeenCalledWith(
        { name: 'nexus-agents', version: '2.0.0' },
        { capabilities: {} }
      );
    });

    it('should not reinitialize if already connected', async () => {
      await adapter.initialize();
      await adapter.initialize();

      // Client should only be created once
      expect(Client).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute()', () => {
    it('should call MCP tool and return response', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello from Codex!' }],
          isError: false,
        }),
      };
      vi.mocked(Client).mockImplementationOnce(() => mockClient as never);

      const newAdapter = new CodexMcpAdapter();
      const result = await newAdapter.execute({ content: 'Say hello' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Hello from Codex!');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle tool execution errors', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Error message' }],
          isError: true,
        }),
      };
      vi.mocked(Client).mockImplementationOnce(() => mockClient as never);

      const newAdapter = new CodexMcpAdapter();
      const result = await newAdapter.execute({ content: 'This will fail' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toBe('Error message');
      }
    });

    it('should handle empty response', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [],
          isError: false,
        }),
      };
      vi.mocked(Client).mockImplementationOnce(() => mockClient as never);

      const newAdapter = new CodexMcpAdapter();
      const result = await newAdapter.execute({ content: 'Empty response' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('should call codex tool with correct arguments', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
        }),
      };
      vi.mocked(Client).mockImplementationOnce(() => mockClient as never);

      const newAdapter = new CodexMcpAdapter();
      await newAdapter.execute({
        content: 'Test task',
        model: 'o3-mini',
      });

      // Codex MCP server exposes 'codex' tool with these arguments
      // @see https://developers.openai.com/codex/mcp/
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'codex',
        arguments: {
          prompt: 'Test task',
          model: 'o3-mini',
          sandbox: 'read-only',
          'approval-policy': 'on-failure',
        },
      });
    });

    it('should use codex-reply tool for session continuation', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
        }),
      };
      vi.mocked(Client).mockImplementationOnce(() => mockClient as never);

      const newAdapter = new CodexMcpAdapter();
      await newAdapter.execute({
        content: 'Follow up question',
        sessionId: 'thread-123',
      });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'codex-reply',
        arguments: {
          prompt: 'Follow up question',
          threadId: 'thread-123',
        },
      });
    });
  });

  describe('getVersion()', () => {
    it('should return version string', async () => {
      const version = await adapter.getVersion();

      expect(version).toBe('0.77.0');
    });

    it('should cache version after first call', async () => {
      const version1 = await adapter.getVersion();
      const version2 = await adapter.getVersion();

      expect(version1).toBe(version2);
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status when connected', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.version).toBe('0.77.0');
      expect(health.versionStatus).toBe('supported');
    });
  });

  describe('getCapacity()', () => {
    it('should return capacity status', async () => {
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(Number.MAX_SAFE_INTEGER);
      expect(capacity.exhausted).toBe(false);
      expect(capacity.utilizationPercent).toBe(0);
    });
  });

  describe('dispose()', () => {
    it('should close MCP connection', async () => {
      await adapter.initialize();
      await adapter.dispose();

      // After dispose, next execute should reinitialize
      expect(adapter.transport).toBe('mcp');
    });
  });
});
