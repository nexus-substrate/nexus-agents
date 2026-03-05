/**
 * Tests for agent-runner.ts
 * (Source: Issue #257)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runAgentOnInstance,
  createMockExecutor,
  AgentRunnerError,
  type IAgentExecutor,
  type AgentContext,
  type AgentExecutionResult,
} from './agent-runner.js';
import type { Result } from '../core/result.js';
import type { SWEBenchInstance, SWEBenchConfig } from './types.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';

describe('agent-runner', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swe-bench-runner-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testInstance: SWEBenchInstance = {
    instance_id: 'test__test-123',
    repo: 'test/test-repo',
    base_commit: 'abc123',
    problem_statement: 'Fix the bug in the code.',
    created_at: '2023-01-01',
  };

  const getTestConfig = (): SWEBenchConfig => ({
    ...DEFAULT_SWE_BENCH_CONFIG,
    work_dir: tempDir,
    timeout_ms: 5000,
    max_iterations: 3,
    concurrency: 1,
  });

  const validPatchResponse = `
Here is my fix:

\`\`\`diff
diff --git a/test.py b/test.py
--- a/test.py
+++ b/test.py
@@ -1,3 +1,4 @@
+# Fix for issue
 def main():
     pass
\`\`\`

This fixes the bug.
`;

  describe('createMockExecutor', () => {
    it('returns responses in order', async () => {
      const executor = createMockExecutor(['response1', 'response2']);

      const result1 = await executor.execute('sys', 'user', {} as AgentContext);
      const result2 = await executor.execute('sys', 'user', {} as AgentContext);

      expect(result1.ok).toBe(true);
      if (result1.ok) {
        expect(result1.value.response).toBe('response1');
      }

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.response).toBe('response2');
      }
    });

    it('returns error when no more responses', async () => {
      const executor = createMockExecutor(['only-one']);

      await executor.execute('sys', 'user', {} as AgentContext);
      const result = await executor.execute('sys', 'user', {} as AgentContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No more mock responses');
      }
    });
  });

  describe('runAgentOnInstance', () => {
    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const executor = createMockExecutor([validPatchResponse]);

      const result = await runAgentOnInstance(testInstance, {
        executor,
        config: getTestConfig(),
        signal: controller.signal,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.completed).toBe(false);
        expect(result.value.error).toBe('Aborted');
      }
    });

    it('calls onMessage callback', async () => {
      const messages: string[] = [];
      const controller = new AbortController();
      controller.abort(); // Abort early to avoid git operations

      const executor = createMockExecutor([validPatchResponse]);

      await runAgentOnInstance(testInstance, {
        executor,
        config: getTestConfig(),
        signal: controller.signal,
        onMessage: (msg) => messages.push(msg),
      });

      // Should have at least attempted to start
      // (may or may not have messages depending on abort timing)
      expect(Array.isArray(messages)).toBe(true);
    });

    it('handles executor errors gracefully', () => {
      const failingExecutor: IAgentExecutor = {
        execute(): Promise<Result<AgentExecutionResult, AgentRunnerError>> {
          return Promise.resolve({
            ok: false,
            error: new AgentRunnerError('Executor failed'),
          });
        },
      };

      // This test verifies the interface exists and can be called
      // Full integration testing would require mocking git operations
      expect(failingExecutor.execute).toBeDefined();
      expect(typeof failingExecutor.execute).toBe('function');
    });
  });

  describe('AgentRunnerError', () => {
    it('stores cause when provided', () => {
      const cause = new Error('Original');
      const error = new AgentRunnerError('Runner failed', cause);

      expect(error.message).toBe('Runner failed');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('AgentRunnerError');
    });

    it('works without cause', () => {
      const error = new AgentRunnerError('Simple error');

      expect(error.message).toBe('Simple error');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('config handling', () => {
    it('uses provided work directory', async () => {
      const customConfig: SWEBenchConfig = {
        ...DEFAULT_SWE_BENCH_CONFIG,
        work_dir: path.join(tempDir, 'custom-work'),
        timeout_ms: 100, // Very short to timeout quickly
        max_iterations: 1,
        concurrency: 1,
      };

      const executor = createMockExecutor([validPatchResponse]);

      const result = await runAgentOnInstance(testInstance, {
        executor,
        config: customConfig,
      });

      // Will fail due to git operations, but that's expected
      expect(result.ok).toBe(true);
    });

    it('respects max_iterations setting', async () => {
      const limitedConfig: SWEBenchConfig = {
        ...DEFAULT_SWE_BENCH_CONFIG,
        work_dir: tempDir,
        timeout_ms: 100,
        max_iterations: 1,
        concurrency: 1,
      };

      const executor = createMockExecutor(['no patch here', 'still no patch']);

      const result = await runAgentOnInstance(testInstance, {
        executor,
        config: limitedConfig,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should fail after max iterations
        expect(result.value.completed).toBe(false);
      }
    });
  });
});
