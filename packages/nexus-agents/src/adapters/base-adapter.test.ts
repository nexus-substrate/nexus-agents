/**
 * nexus-agents/adapters - Base Adapter Tests
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Result,
  ILogger,
} from '../core/index.js';
import { ok, err, ModelError, ErrorCode, ModelCapability, NexusError } from '../core/index.js';
import { BaseAdapter, type BaseAdapterConfig } from './base-adapter.js';

/** Concrete test implementation of BaseAdapter for testing. */
class TestAdapter extends BaseAdapter {
  completeCallCount = 0;
  streamCallCount = 0;
  mockCompleteResult: Result<CompletionResponse, ModelError> | null = null;
  mockStreamChunks: StreamChunk[] = [];

  constructor(config: Partial<BaseAdapterConfig> = {}) {
    super({
      providerId: config.providerId ?? 'test-provider',
      modelId: config.modelId ?? 'test-model',
      capabilities: config.capabilities ?? [ModelCapability.COMPLETION],
      ...config,
    });
  }

  complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    this.completeCallCount++;
    this.logRequest(request);
    if (this.mockCompleteResult) {
      if (this.mockCompleteResult.ok) this.logResponse(this.mockCompleteResult.value);
      return Promise.resolve(this.mockCompleteResult);
    }
    const response: CompletionResponse = {
      content: [{ type: 'text', text: 'Test response' }],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      stopReason: 'end_turn',
      model: this.modelId,
    };
    this.logResponse(response);
    return Promise.resolve(ok(response));
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    this.streamCallCount++;
    this.logRequest(request);
    await Promise.resolve();
    if (this.mockStreamChunks.length > 0) {
      for (const chunk of this.mockStreamChunks) yield chunk;
      return;
    }
    yield { type: 'message_start', message: { model: this.modelId } };
    yield { type: 'content_block_start', index: 0, contentBlock: { type: 'text', text: '' } };
    yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Test' } };
    yield { type: 'content_block_stop', index: 0 };
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
    yield { type: 'message_stop' };
  }

  testLogRequest(request: CompletionRequest): void {
    this.logRequest(request);
  }
  testLogResponse(response: CompletionResponse): void {
    this.logResponse(response);
  }
  testTransformError(error: unknown): ModelError {
    return this.transformError(error);
  }
}

interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

describe('BaseAdapter', () => {
  describe('constructor', () => {
    it('should initialize with required configuration', () => {
      const adapter = new TestAdapter({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
        capabilities: [ModelCapability.COMPLETION, ModelCapability.STREAMING],
      });
      expect(adapter.providerId).toBe('anthropic');
      expect(adapter.modelId).toBe('claude-sonnet-4');
      expect(adapter.capabilities).toContain(ModelCapability.COMPLETION);
    });

    it('should use custom logger when provided', () => {
      const mockLogger = createMockLogger();
      const adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        logger: mockLogger,
      });
      adapter.testLogRequest({ messages: [] });
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should create default logger when not provided', () => {
      const adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
      });
      expect(() => {
        adapter.testLogRequest({ messages: [] });
      }).not.toThrow();
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens using character count', async () => {
      expect(await new TestAdapter().countTokens('Hello, world!')).toBe(4); // 13/4 ceil
    });

    it('should return 0 for empty string', async () => {
      expect(await new TestAdapter().countTokens('')).toBe(0);
    });

    it('should handle long text', async () => {
      expect(await new TestAdapter().countTokens('a'.repeat(1000))).toBe(250);
    });

    it('should round up for partial tokens', async () => {
      expect(await new TestAdapter().countTokens('Hello')).toBe(2); // 5/4 ceil
    });
  });

  describe('validateConfig', () => {
    it('should return ok for valid configuration', () => {
      expect(
        new TestAdapter({
          providerId: 'anthropic',
          modelId: 'claude-sonnet-4',
          capabilities: [],
        }).validateConfig().ok
      ).toBe(true);
    });

    it('should fail for empty provider ID', () => {
      const result = new TestAdapter({
        providerId: '',
        modelId: 'test-model',
        capabilities: [],
      }).validateConfig();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Provider ID is required');
    });

    it('should fail for whitespace-only provider ID', () => {
      expect(
        new TestAdapter({
          providerId: '   ',
          modelId: 'test-model',
          capabilities: [],
        }).validateConfig().ok
      ).toBe(false);
    });

    it('should fail for empty model ID', () => {
      const result = new TestAdapter({
        providerId: 'test',
        modelId: '',
        capabilities: [],
      }).validateConfig();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Model ID is required');
    });

    it('should fail for non-positive timeout', () => {
      const result = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        timeout: 0,
      }).validateConfig();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Timeout must be positive');
    });

    it('should fail for negative max retries', () => {
      const result = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        maxRetries: -1,
      }).validateConfig();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Max retries cannot be negative');
    });

    it('should collect multiple validation errors', () => {
      const result = new TestAdapter({
        providerId: '',
        modelId: '',
        capabilities: [],
        timeout: -1,
        maxRetries: -1,
      }).validateConfig();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Provider ID is required');
        expect(result.error.message).toContain('Model ID is required');
      }
    });

    it('should allow zero max retries', () => {
      expect(
        new TestAdapter({
          providerId: 'test',
          modelId: 'test-model',
          capabilities: [],
          maxRetries: 0,
        }).validateConfig().ok
      ).toBe(true);
    });
  });

  describe('hasCapability', () => {
    it('should return true for supported capability', () => {
      const adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [ModelCapability.COMPLETION, ModelCapability.STREAMING],
      });
      expect(adapter.hasCapability(ModelCapability.COMPLETION)).toBe(true);
      expect(adapter.hasCapability(ModelCapability.STREAMING)).toBe(true);
    });

    it('should return false for unsupported capability', () => {
      const adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [ModelCapability.COMPLETION],
      });
      expect(adapter.hasCapability(ModelCapability.VISION)).toBe(false);
    });
  });

  describe('logRequest', () => {
    let mockLogger: MockLogger;
    let adapter: TestAdapter;
    beforeEach(() => {
      mockLogger = createMockLogger();
      adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        logger: mockLogger,
      });
    });

    it('should log basic request details', () => {
      adapter.testLogRequest({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Sending completion request',
        expect.objectContaining({ messageCount: 2, hasTools: false })
      );
    });

    it('should log system prompt presence', () => {
      adapter.testLogRequest({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'You are helpful',
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Sending completion request',
        expect.objectContaining({ hasSystemPrompt: true })
      );
    });

    it('should log tool information', () => {
      adapter.testLogRequest({
        messages: [],
        tools: [{ name: 'search', description: 'Search', inputSchema: {} }],
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Sending completion request',
        expect.objectContaining({ hasTools: true, toolCount: 1 })
      );
    });
  });

  describe('logResponse', () => {
    it('should log response details', () => {
      const mockLogger = createMockLogger();
      const adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        logger: mockLogger,
      });
      adapter.testLogResponse({
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        stopReason: 'end_turn',
        model: 'test-model',
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Received completion response',
        expect.objectContaining({ contentBlocks: 1, stopReason: 'end_turn' })
      );
    });
  });

  describe('transformError', () => {
    let mockLogger: MockLogger;
    let adapter: TestAdapter;
    beforeEach(() => {
      mockLogger = createMockLogger();
      adapter = new TestAdapter({
        providerId: 'test-provider',
        modelId: 'test-model',
        capabilities: [],
        logger: mockLogger,
      });
    });

    it('should return existing ModelError unchanged', () => {
      const originalError = new ModelError('Original error');
      expect(adapter.testTransformError(originalError)).toBe(originalError);
    });

    it('should wrap generic Error in ModelError', () => {
      const genericError = new Error('Something went wrong');
      const result = adapter.testTransformError(genericError);
      expect(result).toBeInstanceOf(NexusError);
      expect(result.name).toBe('ModelError');
      expect(result.message).toContain('test-provider/test-model');
      expect(result.cause).toBe(genericError);
    });

    it('should handle non-Error objects', () => {
      const result = adapter.testTransformError('String error');
      expect(result).toBeInstanceOf(NexusError);
      expect(result.message).toContain('String error');
    });

    it('should set rate limit error code for 429 status', () => {
      const error = Object.assign(new Error('Too many requests'), { status: 429 });
      expect(adapter.testTransformError(error).code).toBe(ErrorCode.MODEL_RATE_LIMITED);
    });

    it('should set rate limit error code for rate limit message', () => {
      expect(adapter.testTransformError(new Error('Rate limit exceeded')).code).toBe(
        ErrorCode.MODEL_RATE_LIMITED
      );
    });

    it('should set timeout error code for ETIMEDOUT', () => {
      const error = Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' });
      expect(adapter.testTransformError(error).code).toBe(ErrorCode.MODEL_TIMEOUT);
    });

    it('should set timeout error code for timeout message', () => {
      expect(adapter.testTransformError(new Error('Connection timeout')).code).toBe(
        ErrorCode.MODEL_TIMEOUT
      );
    });

    it('should set unavailable error code for 503 status', () => {
      const error = Object.assign(new Error('Service unavailable'), { status: 503 });
      expect(adapter.testTransformError(error).code).toBe(ErrorCode.MODEL_UNAVAILABLE);
    });

    it('should set unavailable error code for 502 status', () => {
      const error = Object.assign(new Error('Bad gateway'), { status: 502 });
      expect(adapter.testTransformError(error).code).toBe(ErrorCode.MODEL_UNAVAILABLE);
    });

    it('should default to MODEL_ERROR for unknown errors', () => {
      expect(adapter.testTransformError(new Error('Unknown failure')).code).toBe(
        ErrorCode.MODEL_ERROR
      );
    });

    it('should set MODEL_NOT_FOUND for 404 status (#2540 PR 8)', () => {
      const error = Object.assign(new Error('Not found'), { status: 404 });
      expect(adapter.testTransformError(error).code).toBe(ErrorCode.MODEL_NOT_FOUND);
    });

    it.each([
      'model not found',
      'model_not_found',
      'no such model',
      'model is deprecated',
      'model has been deprecated',
      'model is no longer available',
    ])('should classify "%s" message as MODEL_NOT_FOUND (#2540 PR 8)', (msg) => {
      expect(adapter.testTransformError(new Error(msg)).code).toBe(ErrorCode.MODEL_NOT_FOUND);
    });

    it('should log the error', () => {
      adapter.testTransformError(new Error('Test error'));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Model adapter error',
        expect.any(NexusError),
        expect.objectContaining({ providerId: 'test-provider' })
      );
    });

    it('should include provider context in error', () => {
      const result = adapter.testTransformError(new Error('Test error'));
      expect(result.context).toEqual({ providerId: 'test-provider', modelId: 'test-model' });
    });
  });

  describe('complete (abstract method)', () => {
    it('should call logRequest and logResponse', async () => {
      const mockLogger = createMockLogger();
      const adapter = new TestAdapter({
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        logger: mockLogger,
      });
      await adapter.complete({ messages: [{ role: 'user', content: 'Hello' }] });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Sending completion request',
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Received completion response',
        expect.any(Object)
      );
    });

    it('should increment call count', async () => {
      const adapter = new TestAdapter();
      expect(adapter.completeCallCount).toBe(0);
      await adapter.complete({ messages: [] });
      expect(adapter.completeCallCount).toBe(1);
    });

    it('should return mock result when set', async () => {
      const adapter = new TestAdapter();
      const mockResponse: CompletionResponse = {
        content: [{ type: 'text', text: 'Custom' }],
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        stopReason: 'max_tokens',
        model: 'custom-model',
      };
      adapter.mockCompleteResult = ok(mockResponse);
      const result = await adapter.complete({ messages: [] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(mockResponse);
    });

    it('should return mock error when set', async () => {
      const adapter = new TestAdapter();
      const mockError = new ModelError('Mock error');
      adapter.mockCompleteResult = err(mockError);
      const result = await adapter.complete({ messages: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(mockError);
    });
  });

  describe('stream (abstract method)', () => {
    it('should increment call count', async () => {
      const adapter = new TestAdapter();
      expect(adapter.streamCallCount).toBe(0);
      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.stream({ messages: [] })) chunks.push(chunk);
      expect(adapter.streamCallCount).toBe(1);
    });

    it('should yield default chunks when no mock set', async () => {
      const chunks: StreamChunk[] = [];
      for await (const chunk of new TestAdapter().stream({ messages: [] })) chunks.push(chunk);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]?.type).toBe('message_start');
      expect(chunks[chunks.length - 1]?.type).toBe('message_stop');
    });

    it('should yield mock chunks when set', async () => {
      const adapter = new TestAdapter();
      const mockChunks: StreamChunk[] = [
        { type: 'message_start', message: { model: 'custom' } },
        { type: 'message_stop' },
      ];
      adapter.mockStreamChunks = mockChunks;
      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.stream({ messages: [] })) chunks.push(chunk);
      expect(chunks).toEqual(mockChunks);
    });
  });
});
