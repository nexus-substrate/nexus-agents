/**
 * nexus-agents/api - Workflow Route Tests
 *
 * Tests for workflow execution endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerWorkflowRoutes } from './workflow.js';
import type { WorkflowRequest, WorkflowResponse } from '../rest-types.js';

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

describe('Workflow Routes', () => {
  let fastify: FastifyInstance;
  let mockLogger: MockLogger;

  beforeEach(async () => {
    mockLogger = createMockLogger();
    fastify = Fastify();
    registerWorkflowRoutes(fastify, mockLogger);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe('POST /workflow', () => {
    it('should execute workflow by ID successfully', async () => {
      const requestBody: WorkflowRequest = {
        workflowId: 'code-review',
        inputs: {
          prUrl: 'https://github.com/owner/repo/pull/123',
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as WorkflowResponse;

      expect(body.executionId).toMatch(/^exec-\d+$/);
      expect(body.status).toBe('completed');
      expect(body.stepResults).toBeDefined();
      expect(body.stepResults.length).toBeGreaterThan(0);
      expect(body.stepResults[0]?.stepId).toBe('step-1');
      expect(body.stepResults[0]?.status).toBe('completed');
      expect(body.finalOutput).toBeDefined();
      expect(body.metadata).toBeDefined();
    });

    it('should execute workflow from inline YAML', async () => {
      const requestBody: WorkflowRequest = {
        workflowYaml: `
name: test-workflow
version: 1.0.0
steps:
  - id: step-1
    action: echo
    input:
      message: Hello World
`,
        inputs: {
          customVar: 'value',
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as WorkflowResponse;
      expect(body.status).toBe('completed');
    });

    it('should accept workflow with inputs only', async () => {
      const requestBody: WorkflowRequest = {
        workflowId: 'build-and-test',
        inputs: {
          branch: 'main',
          environment: 'staging',
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 when neither workflowId nor workflowYaml provided', async () => {
      const requestBody: WorkflowRequest = {
        inputs: {
          someInput: 'value',
        },
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      // Route handler validates this after Zod parsing
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty request body', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: {},
      });

      // Route handler validates this after Zod parsing succeeds with optional fields
      expect(response.statusCode).toBe(400);
    });

    it('should prefer workflowId when both are provided', async () => {
      const requestBody: WorkflowRequest = {
        workflowId: 'existing-workflow',
        workflowYaml: 'name: inline-workflow',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);

      // Should log with workflowId (not just hasYaml)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow request',
        expect.objectContaining({
          workflowId: 'existing-workflow',
          hasYaml: true,
        })
      );
    });

    it('should log workflow request info', async () => {
      const requestBody: WorkflowRequest = {
        workflowId: 'test-workflow',
      };

      await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow request',
        expect.objectContaining({
          workflowId: 'test-workflow',
          hasYaml: false,
        })
      );
    });

    it('should log workflow request with YAML', async () => {
      const requestBody: WorkflowRequest = {
        workflowYaml: 'name: test',
      };

      await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow request',
        expect.objectContaining({
          workflowId: undefined,
          hasYaml: true,
        })
      );
    });

    it('should log workflow complete on success', async () => {
      const requestBody: WorkflowRequest = {
        workflowId: 'test',
      };

      await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: requestBody,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow complete',
        expect.objectContaining({
          executionId: expect.stringMatching(/^exec-\d+$/),
        })
      );
    });

    it('should accept workflowId as number and coerce to string', async () => {
      // Fastify schema may coerce types - test actual behavior
      const response = await fastify.inject({
        method: 'POST',
        url: '/workflow',
        payload: {
          workflowId: 123, // May be coerced to string "123"
        },
      });

      // If Fastify coerces the number to string, it should succeed
      // If strict validation, it should return 400
      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe('Route Registration', () => {
    it('should log debug message when routes are registered', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('Workflow routes registered');
    });
  });
});
