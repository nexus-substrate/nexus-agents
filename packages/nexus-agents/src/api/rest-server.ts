/**
 * nexus-agents/api - REST API Server
 *
 * Fastify-based REST API gateway exposing nexus-agents capabilities.
 * Provides HTTP interface for non-MCP clients.
 *
 * (Source: Issue #184 - REST API gateway for non-MCP clients)
 *
 * @module api/rest-server
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { ILogger } from '../core/logger.js';
import { createLogger, getTimeProvider, getRandomProvider } from '../core/index.js';
import { VERSION } from '../version.js';
import {
  RestApiConfigSchema,
  type RestApiConfig,
  type IRestApiServer,
  type ApiKeyConfig,
  type AuthContext,
  type ApiError,
} from './rest-types.js';
import { registerRoutes } from './routes/index.js';

// ============================================================================
// REST API Server Implementation
// ============================================================================

/**
 * REST API server options.
 */
export interface RestApiServerOptions {
  config?: Partial<RestApiConfig> | undefined;
  logger?: ILogger | undefined;
  apiKeys?: ApiKeyConfig[] | undefined;
}

/**
 * REST API Server providing HTTP interface to nexus-agents.
 *
 * @example
 * ```typescript
 * const server = new RestApiServer({
 *   config: { port: 3000 },
 *   apiKeys: [{ key: 'my-secret-key', name: 'default' }],
 * });
 *
 * await server.start();
 * // Server running at http://0.0.0.0:3000
 *
 * await server.stop();
 * ```
 */
export class RestApiServer implements IRestApiServer {
  private readonly config: RestApiConfig;
  private readonly logger: ILogger;
  private readonly apiKeys: Map<string, ApiKeyConfig>;
  private fastify: FastifyInstance | null = null;
  private running = false;
  private address: string | null = null;
  private readonly startTime: number;

  // Metrics tracking
  private requestCount = 0;
  private readonly requestsPerEndpoint: Map<string, number> = new Map();
  private totalResponseTimeMs = 0;
  private errorCount = 0;

  constructor(options?: RestApiServerOptions) {
    this.config = RestApiConfigSchema.parse(options?.config ?? {});
    this.logger = options?.logger ?? createLogger({ component: 'RestApiServer' });
    this.apiKeys = new Map((options?.apiKeys ?? []).map((k) => [k.key, k]));
    this.startTime = getTimeProvider().now();
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Server already running');
      return;
    }

    this.fastify = await this.createFastifyInstance();
    await this.registerPlugins();
    this.registerMiddleware();
    await registerRoutes(this.fastify, this.logger);

    const addr = await this.fastify.listen({
      port: this.config.port,
      host: this.config.host,
    });

    this.address = addr;
    this.running = true;
    this.logger.info('REST API server started', { address: addr, version: VERSION });
  }

  async stop(): Promise<void> {
    if (!this.running || this.fastify === null) return;

    await this.fastify.close();
    this.fastify = null;
    this.running = false;
    this.address = null;
    this.logger.info('REST API server stopped');
  }

  getInstance(): FastifyInstance {
    if (this.fastify === null) {
      throw new Error('Server not started');
    }
    return this.fastify;
  }

  isRunning(): boolean {
    return this.running;
  }

  getAddress(): string | null {
    return this.address;
  }

  // ========== Private Methods ==========

  private async createFastifyInstance(): Promise<FastifyInstance> {
    const fastify = Fastify({
      logger: false, // Use our own logger
      trustProxy: this.config.trustProxy,
      bodyLimit: this.config.maxBodySize,
      genReqId: () => this.generateRequestId(),
    });

    // Add request context
    fastify.decorateRequest('authContext', null);

    return fastify;
  }

  private async registerPlugins(): Promise<void> {
    if (this.fastify === null) return;

    // CORS
    if (this.config.enableCors) {
      await this.fastify.register(cors, {
        origin: this.config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', this.config.apiKeyHeader],
      });
    }

    // Rate limiting
    await this.fastify.register(rateLimit, {
      max: this.config.rateLimitPerMinute,
      timeWindow: '1 minute',
      keyGenerator: (request) => this.getRateLimitKey(request),
    });

    // Swagger
    if (this.config.enableSwagger) {
      await this.registerSwagger();
    }
  }

  private async registerSwagger(): Promise<void> {
    if (this.fastify === null) return;

    await this.fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Nexus Agents REST API',
          description: 'HTTP interface for nexus-agents multi-agent orchestration',
          version: VERSION,
        },
        servers: [{ url: this.config.basePath }],
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              name: this.config.apiKeyHeader,
              in: 'header',
            },
          },
        },
        security: [{ apiKey: [] }],
      },
    });

    await this.fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  private registerMiddleware(): void {
    if (this.fastify === null) return;

    this.registerSecurityHeaders();
    this.registerRequestHooks();
  }

  /** Adds security headers to all responses (Issue #740). */
  private registerSecurityHeaders(): void {
    if (this.fastify === null) return;
    this.fastify.addHook('onSend', (_request, reply, payload, done) => {
      void reply.header('X-Content-Type-Options', 'nosniff');
      void reply.header('X-Frame-Options', 'DENY');
      void reply.header('Cache-Control', 'no-store');
      void reply.header('Content-Security-Policy', "default-src 'none'");
      void reply.header('X-Permitted-Cross-Domain-Policies', 'none');
      void reply.header('Referrer-Policy', 'no-referrer');
      done(null, payload);
    });
  }

  /** Registers request-level hooks (logging, auth, response tracking). */
  private registerRequestHooks(): void {
    if (this.fastify === null) return;

    // Request logging and timing
    this.fastify.addHook('onRequest', (request, _reply, done) => {
      (request as FastifyRequest & { startTime: number }).startTime = getTimeProvider().now();
      this.requestCount++;
      const endpoint = request.routeOptions.url ?? request.url;
      this.requestsPerEndpoint.set(endpoint, (this.requestsPerEndpoint.get(endpoint) ?? 0) + 1);
      done();
    });

    // Authentication
    this.fastify.addHook('preHandler', async (request, reply) => {
      await this.authenticateRequest(request, reply);
    });

    // Response logging
    this.fastify.addHook('onResponse', (request, reply, done) => {
      const time = getTimeProvider();
      const startTime =
        (request as FastifyRequest & { startTime?: number }).startTime ?? time.now();
      const duration = time.now() - startTime;
      this.totalResponseTimeMs += duration;

      if (reply.statusCode >= 400) {
        this.errorCount++;
      }

      this.logger.debug('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: duration,
      });
      done();
    });

    // Error handler
    this.fastify.setErrorHandler((error: Error, request, reply) => {
      this.logger.error('Request error', error, { url: request.url });

      const apiError: ApiError = {
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
        requestId: request.id,
        timestamp: getTimeProvider().nowIso(),
      };

      void reply.status(500).send(apiError);
    });
  }

  /** Checks if a URL path matches a public (unauthenticated) endpoint. */
  private isPublicPath(url: string): boolean {
    // SECURITY: Explicit allowlist of public path prefixes.
    // Only pathname is checked — query strings are stripped to prevent bypass.
    const publicPrefixes = ['/health', '/metrics', '/docs', '/api/v1/health', '/api/v1/metrics'];
    const pathname = url.split('?')[0] ?? url;
    return publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
  }

  private async authenticateRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Skip auth for public endpoints (health, metrics, docs)
    if (this.isPublicPath(request.url)) {
      (request as FastifyRequest & { authContext: AuthContext }).authContext = {
        authenticated: false,
        clientId: this.getClientId(request),
      };
      return;
    }

    // Fail closed: reject if no API keys configured (Issue #739 - security by default)
    if (this.apiKeys.size === 0) {
      const error: ApiError = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'No API keys configured — server cannot authenticate requests',
        },
        requestId: request.id,
        timestamp: getTimeProvider().nowIso(),
      };
      await reply.status(401).send(error);
      return;
    }

    const apiKey = request.headers[this.config.apiKeyHeader.toLowerCase()] as string | undefined;

    if (apiKey === undefined) {
      const error: ApiError = {
        error: { code: 'UNAUTHORIZED', message: 'API key required' },
        requestId: request.id,
        timestamp: getTimeProvider().nowIso(),
      };
      await reply.status(401).send(error);
      return;
    }

    const keyConfig = this.apiKeys.get(apiKey);
    if (keyConfig === undefined) {
      const error: ApiError = {
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        requestId: request.id,
        timestamp: getTimeProvider().nowIso(),
      };
      await reply.status(401).send(error);
      return;
    }

    (request as FastifyRequest & { authContext: AuthContext }).authContext = {
      authenticated: true,
      keyName: keyConfig.name,
      clientId: this.getClientId(request),
    };
  }

  private getRateLimitKey(request: FastifyRequest): string {
    const apiKey = request.headers[this.config.apiKeyHeader.toLowerCase()] as string | undefined;
    if (apiKey !== undefined && this.apiKeys.has(apiKey)) {
      return 'key:' + apiKey.slice(0, 8);
    }
    return 'ip:' + request.ip;
  }

  private getClientId(request: FastifyRequest): string {
    const apiKey = request.headers[this.config.apiKeyHeader.toLowerCase()] as string | undefined;
    if (apiKey !== undefined) {
      return 'api-key:' + apiKey.slice(0, 8);
    }
    return 'ip:' + request.ip;
  }

  private generateRequestId(): string {
    const time = getTimeProvider();
    const random = getRandomProvider();
    return 'req-' + String(time.now()) + '-' + random.random().toString(36).slice(2, 8);
  }

  // ========== Metrics Methods ==========

  getMetrics(): {
    requestsTotal: number;
    requestsPerEndpoint: Record<string, number>;
    avgResponseTimeMs: number;
    errorRate: number;
    uptimeMs: number;
  } {
    return {
      requestsTotal: this.requestCount,
      requestsPerEndpoint: Object.fromEntries(this.requestsPerEndpoint),
      avgResponseTimeMs: this.requestCount > 0 ? this.totalResponseTimeMs / this.requestCount : 0,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      uptimeMs: getTimeProvider().now() - this.startTime,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a REST API server instance.
 */
export function createRestApiServer(options?: RestApiServerOptions): IRestApiServer {
  return new RestApiServer(options);
}
