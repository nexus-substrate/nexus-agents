/**
 * Tests for voter-execution utilities
 *
 * Verifies vote execution helpers including result creation,
 * timeout handling, retry logic, and simulation fallback.
 * (Source: Issue #285, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_VOTE_TIMEOUT_MS,
  MAX_VOTE_TIMEOUT_MS,
  MIN_VOTE_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  createErrorVoteResult,
  createSimulationVoteResult,
  createSimulatedVotes,
  simulateVote,
  withTimeout,
  delay,
  extractTextFromResponse,
  executeSingleVoteAttempt,
  executeWithRetries,
  validateTimeout,
  resolveVoteTimeout,
  isRateLimitError,
  RATE_LIMIT_RETRY_DELAY_MS,
} from './voter-execution.js';
import type { VoterRole } from './vote-types.js';
import type { IModelAdapter, CompletionResponse, ILogger, Result } from '../core/index.js';
import { ModelError } from '../core/index.js';

// Mock delay to resolve instantly — avoids 1000ms+ exponential backoff waits (perf: saves ~3s)
vi.mock('../utils/async-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/async-utils.js')>();
  return {
    ...actual,
    delay: vi.fn(() => Promise.resolve()),
  };
});

type MockCompletionResult = Result<CompletionResponse, ModelError>;

describe('voter-execution', () => {
  describe('constants', () => {
    it('should have reasonable timeout value', () => {
      expect(DEFAULT_VOTE_TIMEOUT_MS).toBe(300_000);
    });

    it('should have 10 minute max timeout', () => {
      expect(MAX_VOTE_TIMEOUT_MS).toBe(600_000);
    });

    it('should have 30 second min timeout', () => {
      // Lower bound to ensure agents have adequate time
      expect(MIN_VOTE_TIMEOUT_MS).toBe(30_000);
    });

    it('should have reasonable retry count', () => {
      expect(DEFAULT_MAX_RETRIES).toBe(2);
    });
  });

  describe('validateTimeout', () => {
    it('should accept values within range', () => {
      const result = validateTimeout(60_000);
      expect(result.value).toBe(60_000);
      expect(result.clamped).toBe(false);
    });

    it('should clamp values below minimum', () => {
      const result = validateTimeout(10_000);
      expect(result.value).toBe(MIN_VOTE_TIMEOUT_MS);
      expect(result.clamped).toBe(true);
    });

    it('should clamp values above maximum', () => {
      const result = validateTimeout(900_000);
      expect(result.value).toBe(MAX_VOTE_TIMEOUT_MS);
      expect(result.clamped).toBe(true);
    });

    it('should accept exact boundary values', () => {
      const minResult = validateTimeout(MIN_VOTE_TIMEOUT_MS);
      expect(minResult.value).toBe(MIN_VOTE_TIMEOUT_MS);
      expect(minResult.clamped).toBe(false);

      const maxResult = validateTimeout(MAX_VOTE_TIMEOUT_MS);
      expect(maxResult.value).toBe(MAX_VOTE_TIMEOUT_MS);
      expect(maxResult.clamped).toBe(false);
    });
  });

  describe('resolveVoteTimeout (Issue #983)', () => {
    const originalEnv = process.env['NEXUS_VOTE_TIMEOUT_MS'];

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env['NEXUS_VOTE_TIMEOUT_MS'] = originalEnv;
      } else {
        delete process.env['NEXUS_VOTE_TIMEOUT_MS'];
      }
    });

    it('should return default when env var is not set', () => {
      delete process.env['NEXUS_VOTE_TIMEOUT_MS'];
      expect(resolveVoteTimeout()).toBe(DEFAULT_VOTE_TIMEOUT_MS);
    });

    it('should use env var value when set', () => {
      process.env['NEXUS_VOTE_TIMEOUT_MS'] = '180000';
      expect(resolveVoteTimeout()).toBe(180_000);
    });

    it('should clamp env var to min', () => {
      process.env['NEXUS_VOTE_TIMEOUT_MS'] = '5000';
      expect(resolveVoteTimeout()).toBe(MIN_VOTE_TIMEOUT_MS);
    });

    it('should clamp env var to max', () => {
      process.env['NEXUS_VOTE_TIMEOUT_MS'] = '999999';
      expect(resolveVoteTimeout()).toBe(MAX_VOTE_TIMEOUT_MS);
    });

    it('should ignore invalid env var values', () => {
      process.env['NEXUS_VOTE_TIMEOUT_MS'] = 'not-a-number';
      expect(resolveVoteTimeout()).toBe(DEFAULT_VOTE_TIMEOUT_MS);
    });
  });

  describe('createErrorVoteResult', () => {
    it('should create error result with abstain decision', () => {
      const result = createErrorVoteResult('devex', 'Network error', 100);

      expect(result.vote.decision).toBe('abstain');
      expect(result.vote.confidence).toBe(0);
      expect(result.error).toBe('Network error');
    });

    it('should include error message in reasoning', () => {
      const result = createErrorVoteResult('security', 'Timeout', 500);

      expect(result.vote.reasoning).toContain('Error');
      expect(result.vote.reasoning).toContain('Timeout');
    });

    it('should set source to error', () => {
      const result = createErrorVoteResult('architect', 'Error', 100);

      // Error votes should have source 'error', not 'llm' (Issue #532)
      expect(result.source).toBe('error');
    });

    it('should preserve processing time', () => {
      const result = createErrorVoteResult('devex', 'Error', 1234);

      expect(result.processingTimeMs).toBe(1234);
    });

    it('should set the role', () => {
      const result = createErrorVoteResult('pm', 'Error', 100);

      expect(result.role).toBe('pm');
    });
  });

  describe('createSimulationVoteResult', () => {
    it('should create simulation result', () => {
      const result = createSimulationVoteResult('devex', 'Test proposal', 50);

      expect(result.source).toBe('simulation');
      expect(result.role).toBe('devex');
      expect(result.processingTimeMs).toBe(50);
    });

    it('should include vote with valid decision', () => {
      const result = createSimulationVoteResult('security', 'Proposal', 100);

      expect(['approve', 'reject', 'abstain']).toContain(result.vote.decision);
    });

    it('should include optional error', () => {
      const result = createSimulationVoteResult('architect', 'Proposal', 100, 'Fallback reason');

      expect(result.error).toBe('Fallback reason');
    });

    it('should not include error when not provided', () => {
      const result = createSimulationVoteResult('devex', 'Proposal', 100);

      expect(result.error).toBeUndefined();
    });
  });

  describe('createSimulatedVotes', () => {
    it('should create votes for all roles', () => {
      const roles: VoterRole[] = ['devex', 'security', 'architect'];
      const votes = createSimulatedVotes(roles, 'Test proposal');

      expect(votes).toHaveLength(3);
      expect(votes.map((v) => v.role)).toEqual(roles);
    });

    it('should set simulation source for all votes', () => {
      const roles: VoterRole[] = ['pm'];
      const votes = createSimulatedVotes(roles, 'Proposal');

      for (const vote of votes) {
        expect(vote.source).toBe('simulation');
      }
    });

    it('should include error when provided', () => {
      const roles: VoterRole[] = ['devex'];
      const votes = createSimulatedVotes(roles, 'Proposal', 'LLM unavailable');

      expect(votes[0]?.error).toBe('LLM unavailable');
    });
  });

  describe('simulateVote', () => {
    it('should return a valid vote', () => {
      const vote = simulateVote('devex', 'Test proposal');

      expect(vote).toHaveProperty('decision');
      expect(vote).toHaveProperty('reasoning');
      expect(vote).toHaveProperty('confidence');
    });

    it('should return valid decision types', () => {
      // Run multiple times to catch different random outcomes
      for (let i = 0; i < 10; i++) {
        const vote = simulateVote('security', 'Proposal');
        expect(['approve', 'reject', 'abstain']).toContain(vote.decision);
      }
    });

    it('should include simulated marker in reasoning', () => {
      const vote = simulateVote('architect', 'Proposal');

      expect(vote.reasoning).toContain('[Simulated');
    });

    it('should include proposal snippet in reasoning', () => {
      const vote = simulateVote('devex', 'This is the proposal text');

      expect(vote.reasoning).toContain('This is the proposal');
    });

    it('should have confidence between 0.3 and 0.9 (varies by decision type)', () => {
      // Confidence varies by decision: abstain 0.3-0.5, approve 0.5-0.8, reject 0.6-0.9
      for (let i = 0; i < 10; i++) {
        const vote = simulateVote('pm', 'Proposal');
        expect(vote.confidence).toBeGreaterThanOrEqual(0.3);
        expect(vote.confidence).toBeLessThanOrEqual(0.9);
      }
    });
  });

  describe('withTimeout', () => {
    it('should resolve successfully within timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000, 'Timeout error');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should timeout and return error', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 100));
      const result = await withTimeout(slowPromise, 10, 'Timed out');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Timed out');
      }
    });

    it('should handle promise rejection', async () => {
      const failingPromise = Promise.reject(new Error('Failed'));
      const result = await withTimeout(failingPromise, 1000, 'Timeout');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Failed');
      }
    });

    it('should clean up timeout on success', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('done');

      await withTimeout(promise, 1000, 'Timeout');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('delay', () => {
    it('should resolve (mocked for perf)', async () => {
      await expect(delay(50)).resolves.toBeUndefined();
    });

    it('should resolve without value', async () => {
      await expect(delay(1)).resolves.toBeUndefined();
    });
  });

  describe('extractTextFromResponse', () => {
    it('should extract string content directly', () => {
      const text = extractTextFromResponse('Hello world');
      expect(text).toBe('Hello world');
    });

    it('should extract text from content blocks', () => {
      const content = [
        { type: 'text', text: 'First part' },
        { type: 'text', text: ' second part' },
      ];
      const text = extractTextFromResponse(content);

      expect(text).toBe('First part second part');
    });

    it('should handle mixed content blocks', () => {
      const content = [
        { type: 'text', text: 'Text content' },
        { type: 'image', data: 'base64' },
        { type: 'text', text: ' more text' },
      ];
      const text = extractTextFromResponse(content);

      expect(text).toBe('Text content more text');
    });

    it('should convert other types to string', () => {
      const text = extractTextFromResponse(123);
      expect(text).toBe('123');
    });

    it('should handle null content', () => {
      const text = extractTextFromResponse(null);
      expect(text).toBe('null');
    });

    it('should handle empty array', () => {
      const text = extractTextFromResponse([]);
      expect(text).toBe('');
    });
  });

  describe('isRateLimitError', () => {
    it('should detect "rate limit" in error message', () => {
      expect(isRateLimitError('Rate limited: too many requests')).toBe(true);
    });

    it('should detect "429" status code', () => {
      expect(isRateLimitError('HTTP 429 Too Many Requests')).toBe(true);
    });

    it('should detect "too many requests"', () => {
      expect(isRateLimitError('Error: too many requests, please retry later')).toBe(true);
    });

    it('should detect "quota exceeded"', () => {
      expect(isRateLimitError('API quota exceeded for this model')).toBe(true);
    });

    it('should not match unrelated errors', () => {
      expect(isRateLimitError('Model unavailable')).toBe(false);
      expect(isRateLimitError('Timeout after 5000ms')).toBe(false);
      expect(isRateLimitError('Vote parsing failed')).toBe(false);
    });
  });

  describe('executeSingleVoteAttempt', () => {
    const mockAdapter = {
      complete: vi.fn(),
    } as unknown as IModelAdapter;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    // Valid JSON vote response for tests
    const VALID_VOTE_JSON = JSON.stringify({
      decision: 'approve',
      reasoning: 'This is a good proposal that meets all requirements',
      confidence: 0.9,
    });

    it('should return vote on successful completion', async () => {
      const mockResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(mockResponse);

      const result = await executeSingleVoteAttempt('devex', 'Test proposal', mockAdapter, 5000);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.vote).toBeDefined();
      }
    });

    // Pin the maxTokens to prevent regression to the truncated value (#2245).
    // The v3 retest showed JSON parse failures at character positions 267 and
    // 791 — caused by 500-token output cap cutting the JSON envelope mid-string.
    // Lower bound = 1500 leaves headroom; upper bound prevents accidental
    // unbounded growth.
    it('should configure maxTokens large enough to fit JSON envelope + reasoning + YAML findings (#2245)', async () => {
      const mockResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(mockResponse);

      await executeSingleVoteAttempt('devex', 'Test proposal', mockAdapter, 5000);

      const calls = vi.mocked(mockAdapter.complete).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const request = calls[0]?.[0] as { maxTokens?: number };
      expect(request.maxTokens).toBeGreaterThanOrEqual(1500);
      expect(request.maxTokens).toBeLessThanOrEqual(8000);
    });

    it('requests native structured output via responseFormat=json_schema (#3433)', async () => {
      const mockResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(mockResponse);

      await executeSingleVoteAttempt('devex', 'Test proposal', mockAdapter, 5000);

      const request = vi.mocked(mockAdapter.complete).mock.calls[0]?.[0] as {
        responseFormat?: { type?: string; schema?: unknown };
      };
      expect(request.responseFormat?.type).toBe('json_schema');
      expect(request.responseFormat?.schema).toBeDefined();
    });

    it('still parses a structured-output vote object the same as prose JSON (fallback parity)', async () => {
      // Whether the vote arrives via native structured output or the regex
      // fallback, the content is JSON text and parses identically (#3433).
      const mockResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          stopReason: 'tool_use',
          model: 'test-model',
        },
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(mockResponse);

      const result = await executeSingleVoteAttempt(
        'architect',
        'Test proposal',
        mockAdapter,
        5000
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.vote.decision).toBe('approve');
      }
    });

    it('should return error on adapter failure', async () => {
      const mockResponse: MockCompletionResult = {
        ok: false,
        error: new ModelError('API unavailable'),
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(mockResponse);

      const result = await executeSingleVoteAttempt('security', 'Proposal', mockAdapter, 5000);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('API unavailable');
      }
    });

    it('should handle timeout', async () => {
      vi.mocked(mockAdapter.complete).mockImplementation(
        () =>
          new Promise<MockCompletionResult>((resolve) =>
            setTimeout(() => {
              resolve({ ok: true, value: {} as CompletionResponse });
            }, 100)
          )
      );

      const result = await executeSingleVoteAttempt(
        'architect',
        'Proposal',
        mockAdapter,
        10 // Very short timeout
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('timeout');
      }
    });
  });

  describe('executeWithRetries', () => {
    const mockAdapter = {
      complete: vi.fn(),
    } as unknown as IModelAdapter;

    const mockLogger: ILogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Valid JSON vote response that matches VoteResponseSchema
    const VALID_VOTE_JSON = JSON.stringify({
      decision: 'approve',
      reasoning: 'This looks good and reasonable to implement',
      confidence: 0.8,
    });

    it('should succeed on first attempt', async () => {
      const mockResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(mockResponse);

      const result = await executeWithRetries({
        role: 'devex',
        proposal: 'Proposal',
        adapter: mockAdapter,
        logger: mockLogger,
        timeoutMs: 5000,
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      expect(mockAdapter.complete).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const failResponse: MockCompletionResult = {
        ok: false,
        error: new ModelError('Temporary failure'),
      };
      const successResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };

      vi.mocked(mockAdapter.complete)
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await executeWithRetries({
        role: 'devex',
        proposal: 'Proposal',
        adapter: mockAdapter,
        logger: mockLogger,
        timeoutMs: 5000,
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      expect(mockAdapter.complete).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const failResponse: MockCompletionResult = {
        ok: false,
        error: new ModelError('Persistent failure'),
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(failResponse);

      const result = await executeWithRetries({
        role: 'devex',
        proposal: 'Proposal',
        adapter: mockAdapter,
        logger: mockLogger,
        timeoutMs: 5000,
        maxRetries: 1,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Persistent failure');
      }
      // Initial attempt + 1 retry = 2 calls
      expect(mockAdapter.complete).toHaveBeenCalledTimes(2);
    });

    it('should use longer delay for rate-limit errors', async () => {
      const rateLimitResponse: MockCompletionResult = {
        ok: false,
        error: new ModelError('Rate limited: too many requests'),
      };
      const successResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };

      vi.mocked(mockAdapter.complete)
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await executeWithRetries({
        role: 'devex',
        proposal: 'Proposal',
        adapter: mockAdapter,
        logger: mockLogger,
        timeoutMs: 5000,
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      // Should have called delay with the rate-limit delay (longer than standard)
      const delayCalls = vi.mocked(delay).mock.calls;
      expect(delayCalls.length).toBeGreaterThan(0);
      const retryDelay = delayCalls[0]?.[0] ?? 0;
      expect(retryDelay).toBeGreaterThanOrEqual(RATE_LIMIT_RETRY_DELAY_MS);
    });

    it('should preserve rate-limit context in error message', async () => {
      const rateLimitResponse: MockCompletionResult = {
        ok: false,
        error: new ModelError('429 Too Many Requests'),
      };
      vi.mocked(mockAdapter.complete).mockResolvedValue(rateLimitResponse);

      const result = await executeWithRetries({
        role: 'ai_ml',
        proposal: 'Proposal',
        adapter: mockAdapter,
        logger: mockLogger,
        timeoutMs: 5000,
        maxRetries: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Should preserve the original rate-limit error, not mask it
        expect(result.error).toContain('429');
      }
    });

    it('should log retry attempts', async () => {
      const failResponse: MockCompletionResult = {
        ok: false,
        error: new ModelError('Failure'),
      };
      const successResponse: MockCompletionResult = {
        ok: true,
        value: {
          content: [{ type: 'text', text: VALID_VOTE_JSON }],
          usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
          stopReason: 'end_turn',
          model: 'test-model',
        },
      };

      vi.mocked(mockAdapter.complete)
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      await executeWithRetries({
        role: 'devex',
        proposal: 'Proposal',
        adapter: mockAdapter,
        logger: mockLogger,
        timeoutMs: 5000,
        maxRetries: 2,
      });

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
