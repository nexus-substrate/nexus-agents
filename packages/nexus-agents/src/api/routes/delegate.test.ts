/**
 * nexus-agents/api - Delegate Route Tests
 *
 * Tests for model delegation endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDelegateRoutes } from './delegate.js';
import type { DelegateRequest, DelegateResponse } from '../rest-types.js';

/**
 * Mock logger interface for testing.
 */
interface MockLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

/**
 * Creates a mock logger for testing.
 */
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

describe('Delegate Routes', () => {
  let fastify: FastifyInstance;
  let mockLogger: MockLogger;

  beforeEach(async () => {
    mockLogger = createMockLogger();
    fastify = Fastify();
    registerDelegateRoutes(fastify, mockLogger);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe('POST /delegate', () => {
    it('should delegate task successfully with default model', async () => {
      const requestBody: DelegateRequest = {
        task: 'Analyze this code for performance issues',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as DelegateResponse;

      expect(body.selectedModel).toBe('claude');
      expect(body.confidence).toBe(0.85);
      expect(body.reason).toBe('Default routing based on task analysis');
      expect(body.alternatives).toEqual(['gemini', 'codex']);
    });

    it('should use preferred model when specified', async () => {
      const requestBody: DelegateRequest = {
        task: 'Generate unit tests',
        preferredModel: 'codex',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as DelegateResponse;

      expect(body.selectedModel).toBe('codex');
      expect(body.reason).toBe('User preferred model: codex');
      expect(body.alternatives).toEqual(['claude', 'gemini']);
    });

    it('should handle gemini as preferred model', async () => {
      const requestBody: DelegateRequest = {
        task: 'Summarize documentation',
        preferredModel: 'gemini',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as DelegateResponse;

      expect(body.selectedModel).toBe('gemini');
      expect(body.alternatives).toEqual(['claude', 'codex']);
    });

    it('should accept constraints in request', async () => {
      const requestBody: DelegateRequest = {
        task: 'Quick analysis',
        constraints: {
          maxTokens: 1000,
          maxCostUsd: 0.01,
          maxLatencyMs: 5000,
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as DelegateResponse;
      expect(body.selectedModel).toBe('claude');
    });

    it('should return 400 for missing task field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      // Fastify schema validation returns error in response body
      const body = JSON.parse(response.payload) as Record<string, unknown>;
      // The error format depends on Fastify's error handler
      expect(body).toBeDefined();
    });

    it('should return 400 for empty task string', async () => {
      const requestBody = {
        task: '',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      // Zod validation catches empty string
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid preferredModel', async () => {
      const requestBody = {
        task: 'Test task',
        preferredModel: 'invalid-model',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      // Fastify schema validation catches enum mismatch
      expect(response.statusCode).toBe(400);
    });

    it('should log delegate request with task length', async () => {
      const requestBody: DelegateRequest = {
        task: 'Analyze this code',
      };

      await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Delegate request',
        expect.objectContaining({
          taskLength: 17,
          preferredModel: undefined,
        })
      );
    });

    it('should log delegate complete on success', async () => {
      const requestBody: DelegateRequest = {
        task: 'Test task',
      };

      await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Delegate complete',
        expect.objectContaining({
          selectedModel: 'claude',
        })
      );
    });
  });

  describe('Route Registration', () => {
    it('should log debug message when routes are registered', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('Delegate routes registered');
    });
  });
});
