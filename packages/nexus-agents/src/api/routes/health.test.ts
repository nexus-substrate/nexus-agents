/**
 * nexus-agents/api - Health Route Tests
 *
 * Tests for health check and metrics endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './health.js';
import { VERSION } from '../../version.js';

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

describe('Health Routes', () => {
  let fastify: FastifyInstance;
  let mockLogger: MockLogger;

  beforeEach(async () => {
    mockLogger = createMockLogger();
    fastify = Fastify();
    registerHealthRoutes(fastify, mockLogger);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status with all checks passing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as {
        status: string;
        version: string;
        uptime: number;
        checks: Record<string, { status: string; message?: string }>;
      };

      expect(body.status).toBe('healthy');
      expect(body.version).toBe(VERSION);
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.checks).toBeDefined();
      expect(body.checks['memory']).toBeDefined();
      expect(body.checks['event_loop']).toBeDefined();
    });

    it('should include memory check with status and message', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.payload) as {
        checks: Record<string, { status: string; message?: string }>;
      };

      expect(body.checks['memory']?.status).toBe('pass');
      expect(body.checks['memory']?.message).toMatch(/\d+\.\d+MB \/ \d+\.\d+MB/);
    });

    it('should include event loop check', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.payload) as {
        checks: Record<string, { status: string; message?: string }>;
      };

      expect(body.checks['event_loop']?.status).toBe('pass');
      expect(body.checks['event_loop']?.message).toMatch(/\d+ms lag/);
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics response with default values', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as {
        requestsTotal: number;
        requestsPerEndpoint: Record<string, number>;
        avgResponseTimeMs: number;
        errorRate: number;
        activeConnections: number;
      };

      expect(body.requestsTotal).toBe(0);
      expect(body.requestsPerEndpoint).toEqual({});
      expect(body.avgResponseTimeMs).toBe(0);
      expect(body.errorRate).toBe(0);
      expect(body.activeConnections).toBe(0);
    });

    it('should return metrics from server when getMetrics is available', async () => {
      // Create a new fastify instance with mocked metrics
      const fastifyWithMetrics = Fastify();

      // Add metrics to server after ready
      registerHealthRoutes(fastifyWithMetrics, mockLogger);
      await fastifyWithMetrics.ready();

      // Mock getMetrics on the server
      const mockServer = fastifyWithMetrics.server as unknown as {
        getMetrics?: () => {
          requestsTotal: number;
          requestsPerEndpoint: Record<string, number>;
          avgResponseTimeMs: number;
          errorRate: number;
        };
      };
      mockServer.getMetrics = () => ({
        requestsTotal: 100,
        requestsPerEndpoint: { '/health': 50, '/metrics': 50 },
        avgResponseTimeMs: 25,
        errorRate: 0.02,
      });

      const response = await fastifyWithMetrics.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as {
        requestsTotal: number;
        requestsPerEndpoint: Record<string, number>;
        avgResponseTimeMs: number;
        errorRate: number;
        activeConnections: number;
      };

      expect(body.requestsTotal).toBe(100);
      expect(body.requestsPerEndpoint).toEqual({ '/health': 50, '/metrics': 50 });
      expect(body.avgResponseTimeMs).toBe(25);
      expect(body.errorRate).toBe(0.02);
      expect(body.activeConnections).toBe(0);

      await fastifyWithMetrics.close();
    });
  });

  describe('GET /metrics/prometheus', () => {
    it('should return Prometheus format metrics', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics/prometheus',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');

      const body = response.payload;

      expect(body).toContain('# HELP nexus_agents_up Server up status');
      expect(body).toContain('# TYPE nexus_agents_up gauge');
      expect(body).toContain('nexus_agents_up 1');
      expect(body).toContain('# HELP nexus_agents_uptime_seconds Server uptime in seconds');
      expect(body).toContain('# TYPE nexus_agents_uptime_seconds counter');
      expect(body).toContain('nexus_agents_uptime_seconds');
      expect(body).toContain('# HELP nexus_agents_info Server information');
      expect(body).toContain('# TYPE nexus_agents_info gauge');
      expect(body).toContain(`nexus_agents_info{version="${VERSION}"} 1`);
    });

    it('should return uptime in seconds', async () => {
      // Wait a bit to ensure measurable uptime
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics/prometheus',
      });

      const body = response.payload;
      const uptimeMatch = body.match(/nexus_agents_uptime_seconds (\d+)/);

      expect(uptimeMatch).not.toBeNull();
      expect(Number(uptimeMatch?.[1])).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Route Registration', () => {
    it('should log debug message when routes are registered', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('Health routes registered');
    });
  });
});
