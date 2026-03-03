/**
 * Tests for CLI Agent Executor
 *
 * Tests the subprocess-based CLI executor for SWE-bench.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SWEBenchInstance, SWEBenchConfig } from './types.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';
import type { AgentContext } from './agent-runner.js';

// Mock the ClaudeCliAdapter
vi.mock('../cli-adapters/adapters/claude-adapter.js', () => ({
  ClaudeCliAdapter: vi.fn().mockImplementation(function () {
    return {
      healthCheck: vi.fn(),
      execute: vi.fn(),
    };
  }),
}));

import {
  CliAgentExecutor,
  createCliExecutor,
  isCliAvailable,
  type CliAgentExecutorConfig,
} from './cli-agent-executor.js';
import { ClaudeCliAdapter } from '../cli-adapters/adapters/claude-adapter.js';

const MockClaudeCliAdapter = vi.mocked(ClaudeCliAdapter);

describe('cli-agent-executor', () => {
  const testInstance: SWEBenchInstance = {
    instance_id: 'django__django-12345',
    repo: 'django/django',
    base_commit: 'abc123def456',
    problem_statement: 'Fix the authentication bug',
    created_at: '2024-01-15',
  };

  const testConfig: SWEBenchConfig = {
    ...DEFAULT_SWE_BENCH_CONFIG,
    timeout_ms: 60000,
    max_iterations: 5,
  };

  const testContext: AgentContext = {
    instance: testInstance,
    config: testConfig,
    workDir: '/tmp/swe-bench/django__django',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CliAgentExecutor Tests
  // ==========================================================================

  describe('CliAgentExecutor', () => {
    describe('constructor', () => {
      it('should use default model ID when not provided', () => {
        const executor = new CliAgentExecutor();
        expect(executor.getModelId()).toBe('sonnet');
      });

      it('should use custom model ID when provided', () => {
        const executor = new CliAgentExecutor({ modelId: 'opus' });
        expect(executor.getModelId()).toBe('opus');
      });

      it('should use default timeout when not provided', () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Instantiate to verify adapter creation
        const _executor = new CliAgentExecutor();
        // Verify by checking the adapter was created
        expect(MockClaudeCliAdapter).toHaveBeenCalledWith({ model: 'sonnet' });
      });

      it('should store message callback when provided', () => {
        const messages: string[] = [];
        const onMessage = (msg: string): void => {
          messages.push(msg);
        };
        const executor = new CliAgentExecutor({ onMessage });
        expect(executor).toBeInstanceOf(CliAgentExecutor);
      });
    });

    describe('execute', () => {
      it('should return successful result when CLI succeeds', async () => {
        const mockAdapter = {
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          execute: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              text: 'Here is the patch:\n```diff\n+fixed\n```',
              usage: { totalTokens: 250 },
              durationMs: 1500,
            },
          }),
        };

        MockClaudeCliAdapter.mockImplementation(function () {
          return mockAdapter as never;
        });

        const executor = new CliAgentExecutor();
        const result = await executor.execute(
          'You are a coding assistant',
          'Fix the bug in auth.py',
          testContext
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.response).toContain('Here is the patch');
          expect(result.value.tokensUsed).toBe(250);
          expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
        }
      });

      it('should call adapter with correct parameters', async () => {
        const mockExecute = vi.fn().mockResolvedValue({
          ok: true,
          value: {
            text: 'response',
            usage: { totalTokens: 100 },
          },
        });
        const mockAdapter = {
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          execute: mockExecute,
        };

        MockClaudeCliAdapter.mockImplementation(function () {
          return mockAdapter as never;
        });

        const executor = new CliAgentExecutor({ modelId: 'sonnet', timeoutMs: 300000 });
        await executor.execute('system prompt', 'user prompt', testContext);

        expect(mockExecute).toHaveBeenCalledWith(
          {
            content: 'user prompt',
            systemPrompt: 'system prompt',
            model: 'sonnet',
            options: { workDir: testContext.workDir },
          },
          { timeoutMs: 300000 }
        );
      });

      it('should return error when CLI returns error', async () => {
        const mockAdapter = {
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          execute: vi.fn().mockResolvedValue({
            ok: false,
            error: { message: 'CLI execution failed' },
          }),
        };

        MockClaudeCliAdapter.mockImplementation(function () {
          return mockAdapter as never;
        });

        const executor = new CliAgentExecutor();
        const result = await executor.execute('system', 'user', testContext);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('CLI error');
        }
      });

      it('should return error when CLI throws exception', async () => {
        const mockAdapter = {
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          execute: vi.fn().mockRejectedValue(new Error('Network timeout')),
        };

        MockClaudeCliAdapter.mockImplementation(function () {
          return mockAdapter as never;
        });

        const executor = new CliAgentExecutor();
        const result = await executor.execute('system', 'user', testContext);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('CLI execution failed');
          expect(result.error.message).toContain('Network timeout');
        }
      });

      it('should estimate tokens when usage not provided', async () => {
        const mockAdapter = {
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          execute: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              text: 'Short response',
              // No usage field
            },
          }),
        };

        MockClaudeCliAdapter.mockImplementation(function () {
          return mockAdapter as never;
        });

        const executor = new CliAgentExecutor();
        const result = await executor.execute('system', 'user prompt', testContext);

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Should estimate based on input + output length / 4
          expect(result.value.tokensUsed).toBeGreaterThan(0);
        }
      });

      it('should call onMessage callback during execution', async () => {
        const messages: string[] = [];
        const mockAdapter = {
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          execute: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              text: 'response',
              usage: { totalTokens: 100 },
              durationMs: 500,
            },
          }),
        };

        MockClaudeCliAdapter.mockImplementation(function () {
          return mockAdapter as never;
        });

        const executor = new CliAgentExecutor({
          onMessage: (msg) => messages.push(msg),
        });
        await executor.execute('system', 'user', testContext);

        expect(messages.length).toBeGreaterThan(0);
        expect(messages.some((m) => m.includes('django__django-12345'))).toBe(true);
      });
    });

    describe('getModelId', () => {
      it('should return configured model ID', () => {
        const executor = new CliAgentExecutor({ modelId: 'opus' });
        expect(executor.getModelId()).toBe('opus');
      });
    });
  });

  // ==========================================================================
  // isCliAvailable Tests
  // ==========================================================================

  describe('isCliAvailable', () => {
    it('should return true when CLI is healthy', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
        execute: vi.fn(),
      };

      MockClaudeCliAdapter.mockImplementation(function () {
        return mockAdapter as never;
      });

      const available = await isCliAvailable();

      expect(available).toBe(true);
    });

    it('should return false when CLI is not healthy', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({ healthy: false }),
        execute: vi.fn(),
      };

      MockClaudeCliAdapter.mockImplementation(function () {
        return mockAdapter as never;
      });

      const available = await isCliAvailable();

      expect(available).toBe(false);
    });

    it('should return false when health check throws', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockRejectedValue(new Error('CLI not found')),
        execute: vi.fn(),
      };

      MockClaudeCliAdapter.mockImplementation(function () {
        return mockAdapter as never;
      });

      const available = await isCliAvailable();

      expect(available).toBe(false);
    });
  });

  // ==========================================================================
  // createCliExecutor Tests
  // ==========================================================================

  describe('createCliExecutor', () => {
    it('should return executor when CLI is available', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
        execute: vi.fn(),
      };

      MockClaudeCliAdapter.mockImplementation(function () {
        return mockAdapter as never;
      });

      const result = await createCliExecutor();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(CliAgentExecutor);
      }
    });

    it('should return error when CLI is not available', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({ healthy: false }),
        execute: vi.fn(),
      };

      MockClaudeCliAdapter.mockImplementation(function () {
        return mockAdapter as never;
      });

      const result = await createCliExecutor();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not available');
      }
    });

    it('should apply config to created executor', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
        execute: vi.fn(),
      };

      MockClaudeCliAdapter.mockImplementation(function () {
        return mockAdapter as never;
      });

      const config: CliAgentExecutorConfig = {
        modelId: 'opus',
        timeoutMs: 120000,
      };
      const result = await createCliExecutor(config);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getModelId()).toBe('opus');
      }
    });
  });
});
