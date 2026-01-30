/**
 * nexus-agents/api - Health and Metrics Routes
 *
 * Health check and metrics endpoints for monitoring.
 *
 * @module api/routes/health
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import { getTimeProvider } from '../../core/index.js';
import { VERSION } from '../../version.js';
import type { HealthResponse, MetricsResponse } from '../rest-types.js';

/** Track server start time. */
const serverStartTime = getTimeProvider().now();

/**
 * Health check result.
 */
interface HealthCheck {
  status: 'pass' | 'fail';
  message?: string;
}

/**
 * Register health and metrics routes.
 */
export function registerHealthRoutes(fastify: FastifyInstance, logger: ILogger): void {
  registerHealthEndpoint(fastify);
  registerMetricsEndpoint(fastify);
  registerPrometheusEndpoint(fastify);
  logger.debug('Health routes registered');
}

/**
 * Register GET /health endpoint.
 */
function registerHealthEndpoint(fastify: FastifyInstance): void {
  fastify.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              version: { type: 'string' },
              uptime: { type: 'number' },
              checks: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async () => {
      const checks = await runHealthChecks();
      const allPassing = Object.values(checks).every((c) => c.status === 'pass');
      return {
        status: allPassing ? 'healthy' : 'degraded',
        version: VERSION,
        uptime: getTimeProvider().now() - serverStartTime,
        checks,
      };
    }
  );
}

/**
 * Register GET /metrics endpoint.
 */
function registerMetricsEndpoint(fastify: FastifyInstance): void {
  fastify.get<{ Reply: MetricsResponse }>(
    '/metrics',
    {
      schema: {
        description: 'Server metrics endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              requestsTotal: { type: 'number' },
              requestsPerEndpoint: { type: 'object', additionalProperties: { type: 'number' } },
              avgResponseTimeMs: { type: 'number' },
              errorRate: { type: 'number' },
              activeConnections: { type: 'number' },
            },
          },
        },
      },
    },
    (_request, reply) => {
      const metrics = getServerMetrics(fastify);
      void reply.send(metrics);
    }
  );
}

/**
 * Get metrics from server.
 */
function getServerMetrics(fastify: FastifyInstance): MetricsResponse {
  const server = fastify.server as unknown as {
    getMetrics?: () => {
      requestsTotal: number;
      requestsPerEndpoint: Record<string, number>;
      avgResponseTimeMs: number;
      errorRate: number;
    };
  };

  if (typeof server.getMetrics === 'function') {
    const metrics = server.getMetrics();
    return { ...metrics, activeConnections: 0 };
  }

  return {
    requestsTotal: 0,
    requestsPerEndpoint: {},
    avgResponseTimeMs: 0,
    errorRate: 0,
    activeConnections: 0,
  };
}

/**
 * Register GET /metrics/prometheus endpoint.
 */
function registerPrometheusEndpoint(fastify: FastifyInstance): void {
  fastify.get(
    '/metrics/prometheus',
    {
      schema: {
        description: 'Prometheus format metrics',
        tags: ['Health'],
        produces: ['text/plain'],
      },
    },
    (_request, reply: FastifyReply) => {
      const uptime = getTimeProvider().now() - serverStartTime;
      const uptimeSeconds = Math.floor(uptime / 1000);
      const lines = [
        '# HELP nexus_agents_up Server up status',
        '# TYPE nexus_agents_up gauge',
        'nexus_agents_up 1',
        '',
        '# HELP nexus_agents_uptime_seconds Server uptime in seconds',
        '# TYPE nexus_agents_uptime_seconds counter',
        `nexus_agents_uptime_seconds ${String(uptimeSeconds)}`,
        '',
        '# HELP nexus_agents_info Server information',
        '# TYPE nexus_agents_info gauge',
        `nexus_agents_info{version="${VERSION}"} 1`,
      ];
      void reply.type('text/plain').send(lines.join('\n'));
    }
  );
}

/**
 * Run health checks for various subsystems.
 */
async function runHealthChecks(): Promise<Record<string, HealthCheck>> {
  const checks: Record<string, HealthCheck> = {};

  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
  const heapPercent = (heapUsedMB / heapTotalMB) * 100;

  checks['memory'] = {
    status: heapPercent < 90 ? 'pass' : 'fail',
    message: `${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB (${heapPercent.toFixed(1)}%)`,
  };

  // Event loop check
  const eventLoopLag = await measureEventLoopLag();
  checks['event_loop'] = {
    status: eventLoopLag < 100 ? 'pass' : 'fail',
    message: `${String(eventLoopLag)}ms lag`,
  };

  return checks;
}

/**
 * Measure event loop lag.
 */
async function measureEventLoopLag(): Promise<number> {
  const time = getTimeProvider();
  const start = time.now();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  return time.now() - start;
}
