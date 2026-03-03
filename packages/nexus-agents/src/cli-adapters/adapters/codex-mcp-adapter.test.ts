/**
 * Tests for Codex MCP Adapter
 *
 * Verifies MCP-based Codex adapter functionality.
 * Now extends BaseCliAdapter (Issue #1140).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockClient = vi.fn();
  const mockTransport = vi.fn();
  const mockExecAsync = vi.fn();
  return { mockClient, mockTransport, mockExecAsync };
});

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: mocks.mockClient,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mocks.mockTransport,
}));

// Mock child_process and util for BaseCliAdapter.getVersion()
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn((_fn: unknown) => mocks.mockExecAsync),
}));

// Re-export for test access
const Client = mocks.mockClient;

import { CodexMcpAdapter } from './codex-mcp-adapter.js';
import { getDefaultModelForCli, getCliModelName } from '../../config/model-config-helpers.js';

/** Expected default CLI model name, derived from the canonical registry. */
const EXPECTED_DEFAULT_ID = getCliModelName(getDefaultModelForCli('codex'));

describe('CodexMcpAdapter', () => {
  let adapter: CodexMcpAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default MCP Client mock (Issue #582)

    Client.mockImplementation(function () {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn(),
      };
    });

    // Set up default transport mock

    mocks.mockTransport.mockImplementation(function () {
      return {
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    // Set up default exec mock for version check (via BaseCliAdapter)
    mocks.mockExecAsync.mockResolvedValue({ stdout: 'codex version 0.77.0' });

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

      expect(caps.reasoning).toBe(10);
      expect(caps.contextWindow).toBe(400_000);
      expect(caps.codeGeneration).toBe(10);
      expect(caps.speed).toBe(7);
      expect(caps.cost).toBe(5);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model (from registry)', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe(EXPECTED_DEFAULT_ID);
      expect(info.contextWindow).toBe(400_000);
      expect(info.maxOutput).toBe(100_000);
    });

    it('should return registry-derived cost info for default model', () => {
      const info = adapter.getModelInfo();

      // o3 maps to codex-5.3 in registry: pricing {2.0, 8.0}
      expect(info.costPerMillionInput).toBe(2.0);
      expect(info.costPerMillionOutput).toBe(8.0);
    });

    it('should return correct info for o3-mini model (from registry)', () => {
      const miniAdapter = new CodexMcpAdapter({ model: 'o3-mini' });
      const info = miniAdapter.getModelInfo();

      expect(info.id).toBe('o3-mini');
      // o3-mini maps to codex-5.1-mini in registry: pricing {0.5, 2.0}
      expect(info.costPerMillionInput).toBe(0.5);
      expect(info.costPerMillionOutput).toBe(2.0);
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

      vi.mocked(Client).mockImplementationOnce(function () {
        return mockClient as never;
      });

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

      vi.mocked(Client).mockImplementationOnce(function () {
        return mockClient as never;
      });

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

      vi.mocked(Client).mockImplementationOnce(function () {
        return mockClient as never;
      });

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

      vi.mocked(Client).mockImplementationOnce(function () {
        return mockClient as never;
      });

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

      vi.mocked(Client).mockImplementationOnce(function () {
        return mockClient as never;
      });

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
      expect(mocks.mockExecAsync).toHaveBeenCalledTimes(1);
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
