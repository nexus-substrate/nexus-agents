/**
 * REST API Server Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RestApiServer } from './rest-server.js';

/**
 * Generates a test port using PID + random offset to minimize EADDRINUSE collisions
 * in parallel test execution. Range: 10000-60000.
 */
let portCounter = 0;
function getTestPort(): number {
  const base = 10000 + (process.pid % 50000);
  return ((base + portCounter++) % 50000) + 10000;
}

describe('RestApiServer', () => {
  describe('lifecycle', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should start and stop the server', async () => {
      expect(server.isRunning()).toBe(false);
      expect(server.getAddress()).toBeNull();

      await server.start();

      expect(server.isRunning()).toBe(true);
      expect(server.getAddress()).not.toBeNull();

      await server.stop();

      expect(server.isRunning()).toBe(false);
      expect(server.getAddress()).toBeNull();
    });

    it('should handle multiple start calls gracefully', async () => {
      await server.start();
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('should handle multiple stop calls gracefully', async () => {
      await server.start();
      await server.stop();
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should throw when getting instance before start', () => {
      expect(() => server.getInstance()).toThrow('Server not started');
    });

    it('should return fastify instance after start', async () => {
      await server.start();
      expect(server.getInstance()).toBeDefined();
    });
  });

  describe('health endpoint', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should respond to /health', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { status: string; version: string };
      expect(body.status).toBe('healthy');
      expect(body.version).toBeDefined();
    });

    it('should respond to /api/v1/health', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/api/v1/health',
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('metrics endpoint', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should respond to /metrics', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { requestsTotal: number };
      expect(typeof body.requestsTotal).toBe('number');
    });

    it('should respond to /metrics/prometheus', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/metrics/prometheus',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('nexus_agents_up 1');
    });
  });

  describe('authentication', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({
        config: { port: getTestPort() },
        apiKeys: [{ key: 'test-key-12345', name: 'test' }],
      });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should reject requests without API key', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/orchestrate',
        payload: { task: 'test' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with invalid API key', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/orchestrate',
        payload: { task: 'test' },
        headers: { 'X-API-Key': 'wrong-key' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow health endpoints without API key', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('orchestrate endpoint', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should accept valid orchestrate request', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/orchestrate',
        payload: { task: 'Analyze the code structure' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { taskId: string; analysis: unknown };
      expect(body.taskId).toBeDefined();
      expect(body.analysis).toBeDefined();
    });

    it('should reject invalid orchestrate request without task', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/orchestrate',
        payload: {},
      });

      // Missing required 'task' field - should return error (400 or 500)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject invalid orchestrate request with empty task', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/orchestrate',
        payload: { task: '' },
      });

      // Empty task validated by Zod inside handler - should return error (400 or 500)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error).toBeDefined();
    });
  });

  describe('delegate endpoint', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should accept valid delegate request', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/delegate',
        payload: { task: 'Write unit tests' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { selectedModel: string };
      expect(body.selectedModel).toBe('claude');
    });

    it('should respect preferred model', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/delegate',
        payload: { task: 'Generate code', preferredModel: 'gemini' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { selectedModel: string };
      expect(body.selectedModel).toBe('gemini');
    });
  });

  describe('workflow endpoint', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should accept valid workflow request with workflowId', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/workflow',
        payload: { workflowId: 'test-workflow' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { executionId: string; status: string };
      expect(body.executionId).toBeDefined();
      expect(body.status).toBe('completed');
    });

    it('should accept valid workflow request with YAML', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/workflow',
        payload: { workflowYaml: 'name: test\nsteps: []' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject request without workflowId or YAML', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/workflow',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('expert endpoint', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should accept valid expert request', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'POST',
        url: '/api/v1/expert',
        payload: { type: 'code', task: 'Review this function' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { expertId: string; expertType: string };
      expect(body.expertId).toContain('expert-code');
      expect(body.expertType).toBe('code');
    });

    it('should list available expert types', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/api/v1/expert/types',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { types: string[] };
      expect(body.types).toContain('code');
      expect(body.types).toContain('security');
    });
  });

  describe('swagger', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should serve swagger UI', async () => {
      await server.start();
      const response = await server.getInstance().inject({
        method: 'GET',
        url: '/docs/',
      });

      // Should return swagger UI page
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('swagger');
    });
  });

  describe('metrics tracking', () => {
    let server: RestApiServer;

    beforeEach(() => {
      server = new RestApiServer({ config: { port: getTestPort() } });
    });

    afterEach(async () => {
      if (server?.isRunning()) {
        await server.stop();
      }
    });

    it('should track request metrics', async () => {
      await server.start();
      const fastify = server.getInstance();

      await fastify.inject({ method: 'GET', url: '/health' });
      await fastify.inject({ method: 'GET', url: '/health' });
      await fastify.inject({ method: 'GET', url: '/metrics' });

      const metrics = server.getMetrics();

      expect(metrics.requestsTotal).toBeGreaterThanOrEqual(3);
      expect(metrics.uptimeMs).toBeGreaterThan(0);
    });
  });
});
