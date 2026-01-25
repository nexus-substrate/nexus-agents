/**
 * nexus-agents/api - Expert Route Tests
 *
 * Tests for expert task execution endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerExpertRoutes } from './expert.js';
import type { ExpertRequest, ExpertResponse } from '../rest-types.js';

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

describe('Expert Routes', () => {
  let fastify: FastifyInstance;
  let mockLogger: MockLogger;

  beforeEach(async () => {
    mockLogger = createMockLogger();
    fastify = Fastify();
    registerExpertRoutes(fastify, mockLogger);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe('POST /expert', () => {
    it('should execute code expert task successfully', async () => {
      const requestBody: ExpertRequest = {
        type: 'code',
        task: 'Review this JavaScript function for best practices',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as ExpertResponse;

      expect(body.expertId).toMatch(/^expert-code-\d+$/);
      expect(body.expertType).toBe('code');
      expect(body.result).toEqual({
        analysis: 'code analysis of the task',
        recommendations: ['Consider code best practices'],
      });
      // Fastify serialization may not include metadata in response schema
      expect(body.metadata).toBeDefined();
    });

    it('should execute security expert task', async () => {
      const requestBody: ExpertRequest = {
        type: 'security',
        task: 'Audit this authentication module',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as ExpertResponse;

      expect(body.expertId).toMatch(/^expert-security-\d+$/);
      expect(body.expertType).toBe('security');
      expect(body.result).toEqual({
        analysis: 'security analysis of the task',
        recommendations: ['Consider security best practices'],
      });
    });

    it('should execute architecture expert task', async () => {
      const requestBody: ExpertRequest = {
        type: 'architecture',
        task: 'Design a microservices architecture',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as ExpertResponse;

      expect(body.expertType).toBe('architecture');
    });

    it('should execute testing expert task', async () => {
      const requestBody: ExpertRequest = {
        type: 'testing',
        task: 'Create test coverage strategy',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as ExpertResponse;

      expect(body.expertType).toBe('testing');
    });

    it('should execute documentation expert task', async () => {
      const requestBody: ExpertRequest = {
        type: 'documentation',
        task: 'Write API documentation',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as ExpertResponse;

      expect(body.expertType).toBe('documentation');
    });

    it('should accept expert-specific options', async () => {
      const requestBody: ExpertRequest = {
        type: 'code',
        task: 'Refactor this function',
        options: {
          language: 'typescript',
          framework: 'react',
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for missing type field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: {
          task: 'Some task',
        },
      });

      // Fastify schema validation catches missing required field
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing task field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: {
          type: 'code',
        },
      });

      // Fastify schema validation catches missing required field
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid expert type', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: {
          type: 'invalid-expert',
          task: 'Some task',
        },
      });

      // Fastify schema validation catches invalid enum value
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty task string', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: {
          type: 'code',
          task: '',
        },
      });

      // Zod validation catches empty string
      expect(response.statusCode).toBe(400);
    });

    it('should log expert request info', async () => {
      const requestBody: ExpertRequest = {
        type: 'security',
        task: 'Audit authentication',
      };

      await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Expert request',
        expect.objectContaining({
          expertType: 'security',
          taskLength: 20, // 'Audit authentication' is 20 characters
        })
      );
    });

    it('should log expert complete on success', async () => {
      const requestBody: ExpertRequest = {
        type: 'code',
        task: 'Test task',
      };

      await fastify.inject({
        method: 'POST',
        url: '/expert',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Expert complete',
        expect.objectContaining({
          expertId: expect.stringMatching(/^expert-code-\d+$/),
        })
      );
    });
  });

  describe('GET /expert/types', () => {
    it('should return list of available expert types', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/expert/types',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as { types: string[] };

      expect(body.types).toEqual(['code', 'security', 'architecture', 'testing', 'documentation']);
    });

    it('should return types array with correct length', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/expert/types',
      });

      const body = JSON.parse(response.payload) as { types: string[] };
      expect(body.types).toHaveLength(5);
    });
  });

  describe('Route Registration', () => {
    it('should log debug message when routes are registered', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('Expert routes registered');
    });
  });
});
