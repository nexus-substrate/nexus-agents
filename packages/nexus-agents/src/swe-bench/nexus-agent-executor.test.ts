/**
 * Tests for nexus-agent-executor.ts
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AgentContext } from './agent-runner.js';
import type { SWEBenchInstance, SWEBenchConfig } from './types.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockComplete = vi.fn();
  return { mockComplete };
});

// Mock the ClaudeAdapter - use class-based mock
vi.mock('../adapters/claude-adapter.js', () => ({
  ClaudeAdapter: class MockClaudeAdapter {
    modelId: string;
    complete = mocks.mockComplete;
    constructor(config: { apiKey: string; modelId: string }) {
      this.modelId = config.modelId;
    }
  },
}));

import {
  NexusAgentExecutor,
  createNexusExecutorFromEnv,
  type NexusAgentExecutorConfig,
} from './nexus-agent-executor.js';

describe('nexus-agent-executor', () => {
  const testInstance: SWEBenchInstance = {
    instance_id: 'test__test-123',
    repo: 'test/test-repo',
    base_commit: 'abc123',
    problem_statement: 'Fix the bug.',
    created_at: '2023-01-01',
  };

  const testConfig: SWEBenchConfig = {
    ...DEFAULT_SWE_BENCH_CONFIG,
    timeout_ms: 5000,
    max_iterations: 3,
  };

  const testContext: AgentContext = {
    instance: testInstance,
    config: testConfig,
    workDir: '/tmp/test',
  };

  describe('NexusAgentExecutor', () => {
    describe('constructor', () => {
      it('uses default values when optional config not provided', () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
        };

        const executor = new NexusAgentExecutor(config);

        // Default model derived from canonical registry (DEFAULT_MODEL_PER_CLI['claude'])
        expect(executor.getModelId()).toBe('claude-opus-4-6');
      });

      it('uses custom modelId when provided', () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
          modelId: 'claude-opus-4',
        };

        const executor = new NexusAgentExecutor(config);

        expect(executor.getModelId()).toBe('claude-opus-4');
      });

      it('stores message callback when provided', async () => {
        const messages: string[] = [];
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
          onMessage: (msg) => messages.push(msg),
        };

        const executor = new NexusAgentExecutor(config);

        // Mock the adapter's complete method
        const mockComplete = vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: [{ type: 'text', text: 'response' }],
            usage: { totalTokens: 100 },
          },
        });
        (executor as unknown as { adapter: { complete: typeof mockComplete } }).adapter.complete =
          mockComplete;

        await executor.execute('system', 'user', testContext);

        expect(messages.length).toBeGreaterThan(0);
        expect(messages[0]).toContain('test__test-123');
      });
    });

    describe('execute', () => {
      it('returns successful result with extracted response', async () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
        };

        const executor = new NexusAgentExecutor(config);

        const mockComplete = vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: [
              { type: 'text', text: 'Here is the fix:' },
              { type: 'text', text: '```diff\n+fixed\n```' },
            ],
            usage: { totalTokens: 150 },
          },
        });
        (executor as unknown as { adapter: { complete: typeof mockComplete } }).adapter.complete =
          mockComplete;

        const result = await executor.execute('system prompt', 'user prompt', testContext);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.response).toBe('Here is the fix:\n```diff\n+fixed\n```');
          expect(result.value.tokensUsed).toBe(150);
          expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
        }
      });

      it('handles non-text content blocks', async () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
        };

        const executor = new NexusAgentExecutor(config);

        const mockComplete = vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: [
              { type: 'text', text: 'response text' },
              { type: 'tool_use', name: 'some_tool' },
              { type: 'text', text: 'more text' },
            ],
            usage: { totalTokens: 100 },
          },
        });
        (executor as unknown as { adapter: { complete: typeof mockComplete } }).adapter.complete =
          mockComplete;

        const result = await executor.execute('system', 'user', testContext);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.response).toBe('response text\nmore text');
        }
      });

      it('returns error when adapter returns error', async () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
        };

        const executor = new NexusAgentExecutor(config);

        const mockComplete = vi.fn().mockResolvedValue({
          ok: false,
          error: { message: 'API rate limit exceeded' },
        });
        (executor as unknown as { adapter: { complete: typeof mockComplete } }).adapter.complete =
          mockComplete;

        const result = await executor.execute('system', 'user', testContext);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('Model error');
          expect(result.error.message).toContain('rate limit');
        }
      });

      it('returns error when adapter throws exception', async () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
        };

        const executor = new NexusAgentExecutor(config);

        const mockComplete = vi.fn().mockRejectedValue(new Error('Network timeout'));
        (executor as unknown as { adapter: { complete: typeof mockComplete } }).adapter.complete =
          mockComplete;

        const result = await executor.execute('system', 'user', testContext);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('Execution failed');
          expect(result.error.message).toContain('Network timeout');
        }
      });

      it('passes correct parameters to adapter', async () => {
        const config: NexusAgentExecutorConfig = {
          apiKey: 'test-api-key',
          maxTokens: 8192,
          temperature: 0.5,
        };

        const executor = new NexusAgentExecutor(config);

        const mockComplete = vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: [{ type: 'text', text: 'response' }],
            usage: { totalTokens: 50 },
          },
        });
        (executor as unknown as { adapter: { complete: typeof mockComplete } }).adapter.complete =
          mockComplete;

        await executor.execute('system prompt', 'user prompt', testContext);

        expect(mockComplete).toHaveBeenCalledWith({
          messages: [{ role: 'user', content: 'user prompt' }],
          systemPrompt: 'system prompt',
          maxTokens: 8192,
          temperature: 0.5,
        });
      });
    });

    describe('getModelId', () => {
      it('returns the configured model ID', () => {
        const executor = new NexusAgentExecutor({
          apiKey: 'test-key',
          modelId: 'claude-opus-4',
        });

        expect(executor.getModelId()).toBe('claude-opus-4');
      });
    });
  });

  describe('createNexusExecutorFromEnv', () => {
    const originalEnv = process.env.ANTHROPIC_API_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('returns error when ANTHROPIC_API_KEY is not set', () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = createNexusExecutorFromEnv();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('ANTHROPIC_API_KEY');
      }
    });

    it('returns error when ANTHROPIC_API_KEY is empty', () => {
      process.env.ANTHROPIC_API_KEY = '   ';

      const result = createNexusExecutorFromEnv();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('ANTHROPIC_API_KEY');
      }
    });

    it('returns executor when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      const result = createNexusExecutorFromEnv();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(NexusAgentExecutor);
      }
    });

    it('applies overrides to executor', () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      const result = createNexusExecutorFromEnv({
        modelId: 'claude-opus-4',
        maxTokens: 4096,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getModelId()).toBe('claude-opus-4');
      }
    });

    it('applies onMessage callback override', () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      const messages: string[] = [];

      const result = createNexusExecutorFromEnv({
        onMessage: (msg) => messages.push(msg),
      });

      expect(result.ok).toBe(true);
    });
  });
});
