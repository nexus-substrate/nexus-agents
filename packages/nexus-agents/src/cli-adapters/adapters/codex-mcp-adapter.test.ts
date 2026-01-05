/**
 * Tests for Codex MCP Adapter
 *
 * Verifies MCP-based Codex adapter functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexMcpAdapter } from './codex-mcp-adapter.js';

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock child_process for version check
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockImplementation(() => {
    const events: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      stdout: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          events[`stdout_${event}`] = events[`stdout_${event}`] ?? [];
          events[`stdout_${event}`].push(cb);
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
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        events[event] = events[event] ?? [];
        events[event].push(cb);
        if (event === 'close') {
          setTimeout(() => {
            cb(0);
          }, 10);
        }
      }),
    };
  }),
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('CodexMcpAdapter', () => {
  let adapter: CodexMcpAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
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

    it('should pass optional parameters to tool', async () => {
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
        systemPrompt: 'Be helpful',
        maxTokens: 1000,
      });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'execute',
        arguments: {
          prompt: 'Test task',
          model: 'o3-mini',
          system: 'Be helpful',
          max_tokens: 1000,
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
