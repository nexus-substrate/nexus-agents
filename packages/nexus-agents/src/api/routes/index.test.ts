/**
 * nexus-agents/api - Route Registration Tests
 *
 * Tests for main route registration module.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './index.js';

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

describe('Route Registration', () => {
  let fastify: FastifyInstance;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    fastify = Fastify();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('registerRoutes()', () => {
    it('should register all routes successfully', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      // After registration, logger should have been called
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should log debug message after all routes registered', async () => {
      await registerRoutes(fastify, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith('All routes registered');
    });

    it('should handle async registration correctly', async () => {
      const promise = registerRoutes(fastify, mockLogger);

      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should make health routes available at root level', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      // Health should be available at root /health
      const rootResponse = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(rootResponse.statusCode).toBe(200);
    });

    it('should make health routes available under /api/v1 prefix', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      // Health should also be available at /api/v1/health
      const prefixedResponse = await fastify.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(prefixedResponse.statusCode).toBe(200);
    });

    it('should make delegate routes available under /api/v1 prefix', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/delegate',
        payload: { task: 'test task' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should make expert routes available under /api/v1 prefix', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/expert/types',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should make workflow routes available under /api/v1 prefix', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/workflow',
        payload: { workflowId: 'test' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should make orchestrate routes available under /api/v1 prefix', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/orchestrate',
        payload: { task: 'test task' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should make metrics routes available at root level', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should make prometheus metrics available at root level', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics/prometheus',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('Route 404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/unknown',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for routes without /api/v1 prefix', async () => {
      await registerRoutes(fastify, mockLogger);
      await fastify.ready();

      // /delegate should not exist at root level
      const response = await fastify.inject({
        method: 'POST',
        url: '/delegate',
        payload: { task: 'test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

describe('Route Module Exports', () => {
  it('should export registerRoutes function', async () => {
    const module = await import('./index.js');
    expect(typeof module.registerRoutes).toBe('function');
  });
});
