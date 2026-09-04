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
      expect(caps.contextWindow).toBe(1_050_000);
      expect(caps.codeGeneration).toBe(10);
      expect(caps.speed).toBe(7);
      // gpt-5.5 (frontier codex default, #4176) is pricier than codex-5.3: cost 4.
      expect(caps.cost).toBe(4);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model (from registry)', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe(EXPECTED_DEFAULT_ID);
      expect(info.contextWindow).toBe(1_050_000);
      expect(info.maxOutput).toBe(128_000);
    });

    it('should return registry-derived cost info for default model', () => {
      const info = adapter.getModelInfo();

      // Default gpt-5.5 in registry (#4176): pricing {5.0, 30.0}
      expect(info.costPerMillionInput).toBe(5.0);
      expect(info.costPerMillionOutput).toBe(30.0);
    });

    it('should return correct info for gpt-5.4-mini model (from registry)', () => {
      const miniAdapter = new CodexMcpAdapter({ model: 'gpt-5.4-mini' });
      const info = miniAdapter.getModelInfo();

      expect(info.id).toBe('gpt-5.4-mini');
      // gpt-5.4-mini is codex-5.1-mini's cliModelName since #5091 (o3-mini is no
      // longer served by codex): models.dev pricing {0.75, 4.5}, 400K context.
      expect(info.costPerMillionInput).toBe(0.75);
      expect(info.costPerMillionOutput).toBe(4.5);
      expect(info.contextWindow).toBe(400_000);
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

    describe('recursion guard (#3350)', () => {
      const prev = process.env.NEXUS_MCP_DEPTH;
      afterEach(() => {
        if (prev === undefined) delete process.env.NEXUS_MCP_DEPTH;
        else process.env.NEXUS_MCP_DEPTH = prev;
      });

      it('stamps the spawned codex child with NEXUS_MCP_DEPTH=1 at top level', async () => {
        delete process.env.NEXUS_MCP_DEPTH;
        await adapter.initialize();

        expect(mocks.mockTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            command: 'codex',
            args: ['mcp-server'],
            env: { NEXUS_MCP_DEPTH: '1' },
          })
        );
      });

      it('refuses to spawn codex mcp-server when already nested (breaks the loop)', async () => {
        process.env.NEXUS_MCP_DEPTH = '1';
        const nested = new CodexMcpAdapter();

        await expect(nested.initialize()).rejects.toThrow(
          /recursive codex.*nexus MCP spawn loop|#3350/i
        );
        // No transport spawned — the cycle is cut before any `codex mcp-server`.
        expect(mocks.mockTransport).not.toHaveBeenCalled();
        await nested.dispose();
      });
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
          'approval-policy': 'never',
        },
      });
    });

    it('translates a registry id in task.model to the codex slug (#5091)', async () => {
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
      await newAdapter.execute({ content: 'Test task', model: 'codex-5.3' });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'codex',
        arguments: expect.objectContaining({ model: 'gpt-5.4' }),
      });
    });

    it('passes a model unknown to the registry through verbatim and warns (#5091)', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
        }),
      };
      vi.mocked(Client).mockImplementationOnce(function () {
        return mockClient as never;
      });
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };

      const newAdapter = new CodexMcpAdapter({ logger: mockLogger });
      await newAdapter.execute({ content: 'Test task', model: 'codex-unknown-xyz' });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'codex',
        arguments: expect.objectContaining({ model: 'codex-unknown-xyz' }),
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not in the model registry'),
        expect.objectContaining({ model: 'codex-unknown-xyz' })
      );
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
    it('should return real codex capacity status (#2714)', async () => {
      // Pre-#2714 asserted 100k (the DEFAULT_CAPACITY_FALLBACK). Now
      // lazy-init returns codex's real DEFAULT_TOKEN_LIMIT.
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(500_000); // codex DEFAULT_TOKEN_LIMIT
      expect(capacity.rateLimited).toBe(false);
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
