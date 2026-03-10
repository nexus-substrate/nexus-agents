/**
 * Worker Failure Triage — Unit Tests (#1506)
 *
 * Tests for pattern-based failure classification and retry recommendations.
 */

import { describe, it, expect } from 'vitest';
import { triageWorkerFailure } from './worker-triage.js';
import type { WorkerResult } from './worker-dispatcher.js';

function makeFailedResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    role: 'code',
    subTask: 'Implement feature',
    output: '',
    status: 'error',
    durationMs: 5000,
    error: 'Something went wrong',
    errorType: 'logic_error',
    ...overrides,
  };
}

describe('triageWorkerFailure', () => {
  describe('transient failures → retry_same_cli', () => {
    it('triages empty response as retryable (#1506)', () => {
      const result = makeFailedResult({
        error: 'Got empty response from model',
        errorType: 'model_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages connection errors as retryable', () => {
      const result = makeFailedResult({
        error: 'ECONNRESET',
        errorType: 'logic_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages parse errors as retryable', () => {
      const result = makeFailedResult({
        error: 'Unexpected token < in JSON at position 0',
        errorType: 'logic_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages 502/503 server errors as retryable', () => {
      const result = makeFailedResult({
        error: '502 Bad Gateway',
        errorType: 'model_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages socket hang up as retryable', () => {
      const result = makeFailedResult({
        error: 'socket hang up',
        errorType: 'logic_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
    });
  });

  describe('rate limit → retry_different_cli', () => {
    it('triages rate limit errors as retry on different CLI', () => {
      const result = makeFailedResult({
        error: 'rate limit exceeded',
        errorType: 'rate_limit',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_different_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages quota exceeded as retry different CLI', () => {
      const result = makeFailedResult({
        error: 'quota exceeded for project',
        errorType: 'rate_limit',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_different_cli');
    });
  });

  describe('timeout → extend_timeout', () => {
    it('triages timeout on code tasks as extend', () => {
      const result = makeFailedResult({
        role: 'code',
        error: 'Worker timeout after 60000ms',
        errorType: 'timeout',
        durationMs: 60000,
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('extend_timeout');
      expect(triage.retryable).toBe(true);
    });

    it('triages timeout on testing tasks as extend', () => {
      const result = makeFailedResult({
        role: 'testing',
        error: 'Worker timeout after 60000ms',
        errorType: 'timeout',
        durationMs: 60000,
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('extend_timeout');
    });

    it('triages timeout on architecture as abort (planning, not execution)', () => {
      const result = makeFailedResult({
        role: 'architecture',
        error: 'Worker timeout after 60000ms',
        errorType: 'timeout',
        durationMs: 60000,
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('abort');
      expect(triage.retryable).toBe(false);
    });
  });

  describe('non-retryable → abort', () => {
    it('triages authentication errors as abort', () => {
      const result = makeFailedResult({
        error: 'Unauthorized access',
        errorType: 'model_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('abort');
      expect(triage.retryable).toBe(false);
    });

    it('triages adapter unavailable as abort', () => {
      const result = makeFailedResult({
        error: 'No model adapter configured',
        errorType: 'model_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('abort');
      expect(triage.retryable).toBe(false);
    });

    it('triages crash errors as abort', () => {
      const result = makeFailedResult({
        error: 'JavaScript heap out of memory',
        errorType: 'logic_error',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('abort');
      expect(triage.retryable).toBe(false);
    });
  });

  describe('partial output handling', () => {
    it('marks failures with substantial partial output as having useful output', () => {
      const result = makeFailedResult({
        output:
          'Here is a partial implementation of the feature:\n```typescript\nfunction foo() {\n  return 42;\n}\n```',
        error: 'Worker timeout after 60000ms',
        errorType: 'timeout',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.hasUsefulOutput).toBe(true);
    });

    it('marks failures with empty output as not having useful output', () => {
      const result = makeFailedResult({
        output: '',
        error: 'Worker timeout after 60000ms',
        errorType: 'timeout',
      });
      const triage = triageWorkerFailure(result);
      expect(triage.hasUsefulOutput).toBe(false);
    });
  });

  describe('expanded retriable patterns (#1536)', () => {
    it('triages empty error message as retry_same_cli', () => {
      const result = makeFailedResult({ error: '' });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
      expect(triage.reason).toContain('Empty error');
    });

    it('triages undefined error message as retry_same_cli', () => {
      const result = makeFailedResult({ error: undefined });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages 500 Internal Server Error as retry_same_cli', () => {
      const result = makeFailedResult({ error: '500 Internal Server Error' });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages "command failed with exit code 1" as retry_same_cli', () => {
      const result = makeFailedResult({ error: 'command failed with exit code 1' });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages ETIMEDOUT as retry_same_cli', () => {
      const result = makeFailedResult({ error: 'connect ETIMEDOUT 1.2.3.4:443' });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });

    it('triages EPIPE as retry_same_cli', () => {
      const result = makeFailedResult({ error: 'write EPIPE' });
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('retry_same_cli');
      expect(triage.retryable).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles success results (no-op)', () => {
      const result: WorkerResult = {
        role: 'code',
        subTask: 'Implement feature',
        output: 'done',
        status: 'success',
        durationMs: 5000,
      };
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('abort');
      expect(triage.retryable).toBe(false);
      expect(triage.reason).toContain('not a failure');
    });

    it('handles skipped results', () => {
      const result: WorkerResult = {
        role: 'code',
        subTask: 'Implement feature',
        output: '',
        status: 'skipped',
        durationMs: 0,
      };
      const triage = triageWorkerFailure(result);
      expect(triage.action).toBe('abort');
      expect(triage.retryable).toBe(false);
    });
  });

  describe('triage result shape', () => {
    it('returns all required fields', () => {
      const result = makeFailedResult();
      const triage = triageWorkerFailure(result);
      expect(triage).toHaveProperty('action');
      expect(triage).toHaveProperty('reason');
      expect(triage).toHaveProperty('retryable');
      expect(triage).toHaveProperty('hasUsefulOutput');
      expect(typeof triage.action).toBe('string');
      expect(typeof triage.reason).toBe('string');
      expect(typeof triage.retryable).toBe('boolean');
      expect(typeof triage.hasUsefulOutput).toBe('boolean');
    });
  });
});
