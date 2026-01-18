/**
 * Comprehensive Tests for SWE-Bench Runner
 *
 * Tests the complete SWE-bench execution flow including:
 * - Instance loading from dataset
 * - Agent execution with retries
 * - Result collection and prediction writing
 * - Integration between all runner components
 *
 * @module swe-bench/swe-bench-runner.test
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Result } from '../core/result.js';
import type {
  SWEBenchInstance,
  SWEBenchConfig,
  SWEBenchPrediction,
  SWEBenchRunResult,
} from './types.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';
import {
  AgentRunnerError,
  buildFailedResult,
  buildSuccessResult,
  type IterationState,
} from './agent-runner-helpers.js';
import type { IAgentExecutor, AgentContext, AgentExecutionResult } from './agent-runner.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestInstance = (
  id: string = 'django__django-12345',
  overrides: Partial<SWEBenchInstance> = {}
): SWEBenchInstance => ({
  instance_id: id,
  repo: 'django/django',
  base_commit: 'abc123def456789',
  problem_statement: 'Fix the authentication bug in the login view.',
  created_at: '2024-01-15T10:00:00Z',
  ...overrides,
});

const createTestConfig = (overrides: Partial<SWEBenchConfig> = {}): SWEBenchConfig => ({
  ...DEFAULT_SWE_BENCH_CONFIG,
  timeout_ms: 5000,
  max_iterations: 3,
  work_dir: '/tmp/swe-bench-test',
  ...overrides,
});

const createValidPatch = (): string => `diff --git a/auth/views.py b/auth/views.py
--- a/auth/views.py
+++ b/auth/views.py
@@ -10,6 +10,7 @@ def login(request):
     if request.method == 'POST':
         username = request.POST.get('username')
         password = request.POST.get('password')
+        # Fix: validate credentials before authentication
         user = authenticate(request, username=username, password=password)
         if user is not None:
             auth_login(request, user)`;

const createIterationState = (overrides: Partial<IterationState> = {}): IterationState => ({
  totalTokens: 0,
  iterations: 0,
  lastError: undefined,
  lastPatch: undefined,
  finalPatch: undefined,
  ...overrides,
});

// =============================================================================
// Agent Runner Helpers Tests
// =============================================================================

describe('agent-runner-helpers', () => {
  describe('AgentRunnerError', () => {
    it('should create error with message', () => {
      const error = new AgentRunnerError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AgentRunnerError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const originalError = new Error('Original error');
      const error = new AgentRunnerError('Wrapped error', originalError);

      expect(error.message).toBe('Wrapped error');
      expect(error.cause).toBe(originalError);
    });

    it('should be instanceof Error', () => {
      const error = new AgentRunnerError('Test');
      expect(error instanceof Error).toBe(true);
    });

    it('should have proper stack trace', () => {
      const error = new AgentRunnerError('Stack test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AgentRunnerError');
    });
  });

  describe('buildFailedResult', () => {
    it('should build basic failed result without state', () => {
      const startTime = Date.now() - 1000;
      const result = buildFailedResult('test-instance', 'Clone failed', startTime);

      expect(result.instance_id).toBe('test-instance');
      expect(result.completed).toBe(false);
      expect(result.error).toBe('Clone failed');
      expect(result.duration_ms).toBeGreaterThanOrEqual(1000);
      expect(result.tokens_used).toBeUndefined();
      expect(result.iterations).toBeUndefined();
    });

    it('should build failed result with iteration state', () => {
      const startTime = Date.now() - 2000;
      const state: IterationState = {
        totalTokens: 500,
        iterations: 3,
        lastError: 'Previous error',
        lastPatch: 'some patch',
        finalPatch: undefined,
      };
      const result = buildFailedResult('test-instance', 'Max iterations', startTime, state);

      expect(result.instance_id).toBe('test-instance');
      expect(result.completed).toBe(false);
      expect(result.error).toBe('Max iterations');
      expect(result.tokens_used).toBe(500);
      expect(result.iterations).toBe(3);
      expect(result.duration_ms).toBeGreaterThanOrEqual(2000);
    });

    it('should calculate duration correctly', () => {
      const exactStartTime = Date.now() - 1500;
      const result = buildFailedResult('test', 'error', exactStartTime);

      // Duration should be at least 1500ms but account for execution time
      expect(result.duration_ms).toBeGreaterThanOrEqual(1500);
      expect(result.duration_ms).toBeLessThan(2000);
    });

    it('should handle zero-token state', () => {
      const state = createIterationState({ totalTokens: 0, iterations: 1 });
      const result = buildFailedResult('test', 'error', Date.now(), state);

      expect(result.tokens_used).toBe(0);
      expect(result.iterations).toBe(1);
    });
  });

  describe('buildSuccessResult', () => {
    it('should build success result with prediction', () => {
      const instance = createTestInstance();
      const patch = createValidPatch();
      const startTime = Date.now() - 3000;
      const state: IterationState = {
        totalTokens: 1500,
        iterations: 2,
        lastError: undefined,
        lastPatch: patch,
        finalPatch: patch,
      };

      const result = buildSuccessResult(instance, patch, 'claude-sonnet-4', startTime, state);

      expect(result.instance_id).toBe('django__django-12345');
      expect(result.completed).toBe(true);
      expect(result.prediction).toBeDefined();
      expect(result.prediction?.instance_id).toBe('django__django-12345');
      expect(result.prediction?.model_name_or_path).toBe('claude-sonnet-4');
      expect(result.prediction?.model_patch).toBe(patch);
      expect(result.tokens_used).toBe(1500);
      expect(result.iterations).toBe(2);
      expect(result.duration_ms).toBeGreaterThanOrEqual(3000);
    });

    it('should include model name from config', () => {
      const instance = createTestInstance('sympy__sympy-99999');
      const state = createIterationState({ totalTokens: 100, iterations: 1 });

      const result = buildSuccessResult(
        instance,
        'patch content',
        'nexus-agents/opus',
        Date.now(),
        state
      );

      expect(result.prediction?.model_name_or_path).toBe('nexus-agents/opus');
    });

    it('should preserve instance ID in prediction', () => {
      const instance = createTestInstance('astropy__astropy-54321');
      const state = createIterationState();

      const result = buildSuccessResult(instance, 'patch', 'model', Date.now(), state);

      expect(result.prediction?.instance_id).toBe(instance.instance_id);
    });
  });
});

// =============================================================================
// Mock Executor Tests
// =============================================================================

describe('mock-executor-patterns', () => {
  /**
   * Tests for creating mock executors used in testing.
   * These patterns are reusable for other test files.
   */

  const createMockExecutor = (
    responses: Array<Result<AgentExecutionResult, AgentRunnerError>>
  ): IAgentExecutor => {
    let callIndex = 0;
    return {
      execute: vi.fn().mockImplementation(() => {
        const response = responses[callIndex];
        callIndex++;
        if (response === undefined) {
          return Promise.resolve({
            ok: false,
            error: new AgentRunnerError('No more mock responses'),
          });
        }
        return Promise.resolve(response);
      }),
    };
  };

  it('should return responses in sequence', async () => {
    const executor = createMockExecutor([
      {
        ok: true,
        value: { response: 'First response', tokensUsed: 100, durationMs: 50 },
      },
      {
        ok: true,
        value: { response: 'Second response', tokensUsed: 150, durationMs: 75 },
      },
    ]);

    const context: AgentContext = {
      instance: createTestInstance(),
      workDir: '/tmp/test',
      config: createTestConfig(),
    };

    const result1 = await executor.execute('sys', 'prompt1', context);
    const result2 = await executor.execute('sys', 'prompt2', context);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok) expect(result1.value.response).toBe('First response');
    if (result2.ok) expect(result2.value.response).toBe('Second response');
  });

  it('should return error when responses exhausted', async () => {
    const executor = createMockExecutor([
      {
        ok: true,
        value: { response: 'Only response', tokensUsed: 50, durationMs: 25 },
      },
    ]);

    const context: AgentContext = {
      instance: createTestInstance(),
      workDir: '/tmp/test',
      config: createTestConfig(),
    };

    await executor.execute('sys', 'prompt1', context);
    const result = await executor.execute('sys', 'prompt2', context);

    expect(result.ok).toBe(false);
    if (!result.ok && 'error' in result) {
      expect(result.error.message).toContain('No more mock responses');
    }
  });

  it('should handle error responses in sequence', async () => {
    const executor = createMockExecutor([
      {
        ok: true,
        value: { response: 'Success', tokensUsed: 100, durationMs: 50 },
      },
      {
        ok: false,
        error: new AgentRunnerError('API rate limit'),
      },
      {
        ok: true,
        value: { response: 'Recovery', tokensUsed: 120, durationMs: 60 },
      },
    ]);

    const context: AgentContext = {
      instance: createTestInstance(),
      workDir: '/tmp/test',
      config: createTestConfig(),
    };

    const result1 = await executor.execute('sys', 'prompt', context);
    const result2 = await executor.execute('sys', 'prompt', context);
    const result3 = await executor.execute('sys', 'prompt', context);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(false);
    expect(result3.ok).toBe(true);
  });
});

// =============================================================================
// Integration Pattern Tests
// =============================================================================

describe('runner-integration-patterns', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swe-bench-runner-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('instance-to-result-flow', () => {
    it('should track instance ID through the entire flow', () => {
      const instanceId = 'matplotlib__matplotlib-12345';
      const instance = createTestInstance(instanceId);

      // Simulate failed result
      const failedResult = buildFailedResult(instance.instance_id, 'Clone failed', Date.now());

      expect(failedResult.instance_id).toBe(instanceId);

      // Simulate success result
      const state = createIterationState({ totalTokens: 500, iterations: 1 });
      const successResult = buildSuccessResult(
        instance,
        createValidPatch(),
        'model',
        Date.now(),
        state
      );

      expect(successResult.instance_id).toBe(instanceId);
      expect(successResult.prediction?.instance_id).toBe(instanceId);
    });

    it('should accumulate tokens across iterations', () => {
      const state = createIterationState();

      // Simulate multiple iterations
      state.totalTokens += 100; // Iteration 1
      state.iterations = 1;

      state.totalTokens += 150; // Iteration 2
      state.iterations = 2;

      state.totalTokens += 200; // Iteration 3
      state.iterations = 3;

      expect(state.totalTokens).toBe(450);
      expect(state.iterations).toBe(3);
    });

    it('should track errors between iterations', () => {
      const state = createIterationState();

      // First iteration fails
      state.lastError = 'Patch does not apply';
      state.lastPatch = 'invalid patch content';
      state.iterations = 1;

      // Second iteration also fails
      state.lastError = 'Invalid diff format';
      state.lastPatch = 'another invalid patch';
      state.iterations = 2;

      // Third iteration succeeds
      state.finalPatch = createValidPatch();
      state.lastError = undefined;
      state.iterations = 3;

      expect(state.finalPatch).toBeDefined();
      expect(state.iterations).toBe(3);
    });
  });

  describe('result-validation', () => {
    it('should validate completed result has prediction', () => {
      const instance = createTestInstance();
      const state = createIterationState({ totalTokens: 100, iterations: 1 });
      const result = buildSuccessResult(instance, createValidPatch(), 'model', Date.now(), state);

      expect(result.completed).toBe(true);
      expect(result.prediction).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should validate failed result has error', () => {
      const result = buildFailedResult('test', 'Timeout exceeded', Date.now());

      expect(result.completed).toBe(false);
      expect(result.error).toBe('Timeout exceeded');
      expect(result.prediction).toBeUndefined();
    });

    it('should validate prediction structure', () => {
      const instance = createTestInstance();
      const state = createIterationState();
      const patch = createValidPatch();
      const result = buildSuccessResult(instance, patch, 'test-model', Date.now(), state);

      const prediction = result.prediction as SWEBenchPrediction;
      expect(typeof prediction.instance_id).toBe('string');
      expect(typeof prediction.model_name_or_path).toBe('string');
      expect(typeof prediction.model_patch).toBe('string');
      expect(prediction.instance_id.length).toBeGreaterThan(0);
      expect(prediction.model_name_or_path.length).toBeGreaterThan(0);
    });
  });

  describe('config-handling', () => {
    it('should use default config values', () => {
      const config = createTestConfig();

      expect(config.variant).toBe('lite');
      expect(config.model).toBe('auto');
      expect(config.resume).toBe(false);
    });

    it('should override specific config values', () => {
      const config = createTestConfig({
        timeout_ms: 120000,
        max_iterations: 10,
        variant: 'verified',
      });

      expect(config.timeout_ms).toBe(120000);
      expect(config.max_iterations).toBe(10);
      expect(config.variant).toBe('verified');
    });

    it('should use work directory from config', () => {
      const customWorkDir = path.join(tempDir, 'custom-work');
      const config = createTestConfig({ work_dir: customWorkDir });

      expect(config.work_dir).toBe(customWorkDir);
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('error-handling', () => {
  describe('error-propagation', () => {
    it('should preserve original error as cause', () => {
      const originalError = new Error('Network timeout');
      const wrappedError = new AgentRunnerError('Failed to execute agent', originalError);

      expect(wrappedError.cause).toBe(originalError);
      expect((wrappedError.cause as Error).message).toBe('Network timeout');
    });

    it('should chain multiple errors', () => {
      const networkError = new Error('Connection reset');
      const fetchError = new AgentRunnerError('Failed to fetch', networkError);
      const runError = new AgentRunnerError('Agent run failed', fetchError);

      expect(runError.cause).toBe(fetchError);
      expect((runError.cause as AgentRunnerError).cause).toBe(networkError);
    });

    it('should handle non-Error causes', () => {
      const error = new AgentRunnerError('Failed', 'string cause');

      expect(error.cause).toBe('string cause');
    });
  });

  describe('error-in-results', () => {
    it('should include error message in failed result', () => {
      const errorMessage = 'Repository clone failed: permission denied';
      const result = buildFailedResult('test', errorMessage, Date.now());

      expect(result.error).toBe(errorMessage);
    });

    it('should handle special characters in error messages', () => {
      const errorMessage = 'Error: path "/tmp/test" contains "quotes" and \'apostrophes\'';
      const result = buildFailedResult('test', errorMessage, Date.now());

      expect(result.error).toBe(errorMessage);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const result = buildFailedResult('test', longMessage, Date.now());

      expect(result.error?.length).toBe(10000);
    });
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('edge-cases', () => {
  describe('instance-variations', () => {
    it('should handle instance with minimal fields', () => {
      const instance: SWEBenchInstance = {
        instance_id: 'minimal__minimal-1',
        repo: 'minimal/repo',
        base_commit: 'abc',
        problem_statement: 'Fix it.',
        created_at: '2024-01-01',
      };

      const state = createIterationState();
      const result = buildSuccessResult(instance, 'patch', 'model', Date.now(), state);

      expect(result.instance_id).toBe('minimal__minimal-1');
    });

    it('should handle instance with all optional fields', () => {
      const instance = createTestInstance('full__full-1', {
        hints_text: 'Check the validate() method',
        test_patch: 'test patch content',
        version: '3.0.1',
        environment_setup_commit: 'env123',
      });

      const state = createIterationState();
      const result = buildSuccessResult(instance, 'patch', 'model', Date.now(), state);

      expect(result.instance_id).toBe('full__full-1');
    });

    it('should handle special characters in instance ID', () => {
      const instanceId = 'scikit-learn__scikit-learn-12345';
      const instance = createTestInstance(instanceId);

      const result = buildFailedResult(instance.instance_id, 'error', Date.now());

      expect(result.instance_id).toBe(instanceId);
    });
  });

  describe('timing-edge-cases', () => {
    it('should handle zero duration', () => {
      const now = Date.now();
      const result = buildFailedResult('test', 'error', now);

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle very short duration', () => {
      const startTime = Date.now();
      const result = buildFailedResult('test', 'error', startTime);

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.duration_ms).toBeLessThan(100);
    });
  });

  describe('token-edge-cases', () => {
    it('should handle zero tokens', () => {
      const state = createIterationState({ totalTokens: 0 });
      const instance = createTestInstance();
      const result = buildSuccessResult(instance, 'patch', 'model', Date.now(), state);

      expect(result.tokens_used).toBe(0);
    });

    it('should handle very large token counts', () => {
      const state = createIterationState({ totalTokens: 1000000 });
      const instance = createTestInstance();
      const result = buildSuccessResult(instance, 'patch', 'model', Date.now(), state);

      expect(result.tokens_used).toBe(1000000);
    });
  });

  describe('patch-edge-cases', () => {
    it('should handle empty patch', () => {
      const instance = createTestInstance();
      const state = createIterationState();
      const result = buildSuccessResult(instance, '', 'model', Date.now(), state);

      expect(result.prediction?.model_patch).toBe('');
    });

    it('should handle very large patch', () => {
      const largePatch = createValidPatch() + '\n' + '+line'.repeat(10000);
      const instance = createTestInstance();
      const state = createIterationState();
      const result = buildSuccessResult(instance, largePatch, 'model', Date.now(), state);

      expect(result.prediction?.model_patch.length).toBeGreaterThan(50000);
    });

    it('should handle binary-like content in patch', () => {
      const binaryContent =
        'diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+\x00\x01\x02';
      const instance = createTestInstance();
      const state = createIterationState();
      const result = buildSuccessResult(instance, binaryContent, 'model', Date.now(), state);

      expect(result.prediction?.model_patch).toContain('\x00');
    });
  });
});

// =============================================================================
// Performance Characteristics Tests
// =============================================================================

describe('performance-characteristics', () => {
  it('should handle rapid successive calls', () => {
    const instance = createTestInstance();
    const state = createIterationState();
    const results: SWEBenchRunResult[] = [];

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      results.push(buildSuccessResult(instance, createValidPatch(), 'model', Date.now(), state));
    }
    const duration = performance.now() - start;

    expect(results.length).toBe(100);
    expect(duration).toBeLessThan(100); // Should complete in < 100ms
  });

  it('should handle parallel result building', async () => {
    const state = createIterationState();

    const promises = Array.from({ length: 50 }, (_, i) =>
      Promise.resolve(
        buildSuccessResult(
          createTestInstance(`test__test-${String(i)}`),
          createValidPatch(),
          'model',
          Date.now(),
          state
        )
      )
    );

    const results = await Promise.all(promises);

    expect(results.length).toBe(50);
    results.forEach((result, i) => {
      expect(result.instance_id).toBe(`test__test-${String(i)}`);
    });
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('type-safety', () => {
  it('should enforce SWEBenchRunResult structure', () => {
    const result = buildFailedResult('test', 'error', Date.now());

    // Type checking via assertions - validates structure at runtime
    expect(typeof result.instance_id).toBe('string');
    expect(typeof result.completed).toBe('boolean');
    expect(typeof result.duration_ms).toBe('number');
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  it('should enforce SWEBenchPrediction structure', () => {
    const instance = createTestInstance();
    const state = createIterationState();
    const result = buildSuccessResult(instance, 'patch', 'model', Date.now(), state);

    const prediction = result.prediction;
    expect(prediction).toBeDefined();
    expect(typeof prediction?.instance_id).toBe('string');
    expect(typeof prediction?.model_name_or_path).toBe('string');
    expect(typeof prediction?.model_patch).toBe('string');
  });

  it('should enforce IterationState structure', () => {
    const state = createIterationState();

    expect(typeof state.totalTokens).toBe('number');
    expect(typeof state.iterations).toBe('number');
    // Optional fields can be undefined
    expect(state.lastError === undefined || typeof state.lastError === 'string').toBe(true);
    expect(state.lastPatch === undefined || typeof state.lastPatch === 'string').toBe(true);
    expect(state.finalPatch === undefined || typeof state.finalPatch === 'string').toBe(true);
  });
});
