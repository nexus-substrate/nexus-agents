/**
 * nexus-agents/api - Orchestrate Route Tests
 *
 * Tests for task orchestration endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { OrchestrateRequest, OrchestrateResponse } from '../rest-types.js';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockCreate = vi.fn();
  const mockOrchestratorFactory = vi.fn();
  const mockCreateOrchestratorWithSica = vi.fn();
  return { mockExecute, mockCreate, mockOrchestratorFactory, mockCreateOrchestratorWithSica };
});

// Mock OrchestratorFactory (used by orchestrate route since #759)
vi.mock('../../orchestration/orchestrator-factory.js', () => ({
  OrchestratorFactory: mocks.mockOrchestratorFactory,
}));

// Mock createOrchestratorWithSica
vi.mock('../../mcp/tools/orchestrate-sica.js', () => ({
  createOrchestratorWithSica: mocks.mockCreateOrchestratorWithSica,
}));

import { registerOrchestrateRoutes } from './orchestrate.js';

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

describe('Orchestrate Routes', () => {
  let fastify: FastifyInstance;
  let mockLogger: MockLogger;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up OrchestratorFactory mock chain
    mocks.mockCreateOrchestratorWithSica.mockReturnValue({
      execute: vi.fn(),
    });

    mocks.mockExecute.mockResolvedValue({
      ok: true,
      value: {
        executionId: 'test-task-id',
        output: {
          analysis: { complexity: 5, taskType: 'general' },
          subtasks: [],
        },
      },
    });

    mocks.mockCreate.mockReturnValue({
      execute: mocks.mockExecute,
    });

    mocks.mockOrchestratorFactory.mockImplementation(function () {
      return {
        create: mocks.mockCreate,
      };
    });

    mockLogger = createMockLogger();
    fastify = Fastify();
    registerOrchestrateRoutes(fastify, mockLogger);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe('POST /orchestrate', () => {
    it('should orchestrate task successfully', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Implement a new user authentication feature',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as OrchestrateResponse;

      expect(body.taskId).toBeDefined();
      expect(body.analysis).toBeDefined();
      // Response structure validated by Fastify schema
      expect(body.metadata).toBeDefined();
    });

    it('should accept task with context', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Refactor the authentication module',
        context: {
          projectName: 'nexus-agents',
          language: 'typescript',
          framework: 'fastify',
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept task with constraints', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Quick code review',
        constraints: {
          maxTokens: 2000,
          maxCostUsd: 0.05,
          maxDurationMs: 30000,
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept task with all optional fields', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Full orchestration test',
        context: {
          key: 'value',
        },
        constraints: {
          maxTokens: 5000,
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for missing task field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: {},
      });

      // Fastify schema validation catches missing required field
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty task string', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: {
          task: '',
        },
      });

      // Zod validation catches empty string
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for null task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: {
          task: null,
        },
      });

      // Fastify schema validation catches null type mismatch
      expect(response.statusCode).toBe(400);
    });

    it('should log orchestrate request with task length', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Test task for logging',
      };

      await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Orchestrate request',
        expect.objectContaining({
          taskLength: 21,
        })
      );
    });

    it('should log orchestrate complete on success', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Test task',
      };

      await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Orchestrate complete',
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );
    });
  });

  describe('Response Structure', () => {
    it('should include taskId in successful response', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Test structure',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as OrchestrateResponse;
      expect(body.taskId).toBeDefined();
    });

    it('should include analysis in successful response', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Test analysis',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as OrchestrateResponse;
      expect(body.analysis).toBeDefined();
    });

    it('should include metadata in successful response', async () => {
      const requestBody: OrchestrateRequest = {
        task: 'Test metadata',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/orchestrate',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as OrchestrateResponse;
      expect(body.metadata).toBeDefined();
    });
  });

  describe('Route Registration', () => {
    it('should log debug message when routes are registered', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('Orchestrate routes registered');
    });
  });
});
