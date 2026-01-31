/**
 * nexus-agents CLI Server REST API Integration
 *
 * REST API server lifecycle management for the CLI.
 * Provides HTTP interface alongside MCP server mode.
 *
 * @module cli-server-rest
 * (Source: Issue #524 - Wire up REST API server to CLI entry points)
 */

import type { ILogger } from './core/index.js';
import { createLogger } from './core/index.js';
import { RestApiServer, type RestApiServerOptions } from './api/rest-server.js';
import type { AppConfig } from './config/index.js';

/**
 * REST API configuration extracted from AppConfig.
 */
export interface RestApiCliConfig {
  /** Enable REST API server */
  enabled: boolean;
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host: string;
  /** Enable CORS */
  cors: boolean;
  /** Enable Swagger UI */
  swagger: boolean;
}

/**
 * Default REST API configuration.
 */
const DEFAULT_REST_CONFIG: RestApiCliConfig = {
  enabled: false,
  port: 3000,
  host: '0.0.0.0',
  cors: true,
  swagger: true,
};

/**
 * Extracts REST API configuration from AppConfig.
 * Currently uses environment variables; AppConfig integration is planned.
 */
export function extractRestConfig(_config?: AppConfig): RestApiCliConfig {
  // REST config is not yet in AppConfig schema - use defaults with env override
  const portEnv = process.env['NEXUS_REST_PORT'];
  const hostEnv = process.env['NEXUS_REST_HOST'];

  return {
    enabled: process.env['NEXUS_REST_ENABLED'] === 'true',
    port: portEnv !== undefined ? parseInt(portEnv, 10) : DEFAULT_REST_CONFIG.port,
    host: hostEnv ?? DEFAULT_REST_CONFIG.host,
    cors: DEFAULT_REST_CONFIG.cors,
    swagger: DEFAULT_REST_CONFIG.swagger,
  };
}

/**
 * Creates and starts the REST API server.
 *
 * @param config - REST API configuration
 * @param logger - Parent logger
 * @returns The started REST API server, or null if disabled
 */
export async function startRestApiServer(
  config: RestApiCliConfig,
  logger: ILogger
): Promise<RestApiServer | null> {
  if (!config.enabled) {
    logger.debug('REST API disabled (set NEXUS_REST_ENABLED=true to enable)');
    return null;
  }

  const restLogger = createLogger({ component: 'RestApiServer' });
  const serverOptions: RestApiServerOptions = {
    config: {
      port: config.port,
      host: config.host,
      enableCors: config.cors,
      enableSwagger: config.swagger,
    },
    logger: restLogger,
  };

  const server = new RestApiServer(serverOptions);
  await server.start();

  logger.info('REST API server started', {
    address: `http://${config.host}:${String(config.port)}`,
    swagger: config.swagger ? `http://${config.host}:${String(config.port)}/docs` : 'disabled',
  });

  return server;
}

/**
 * Stops the REST API server gracefully.
 */
export async function stopRestApiServer(
  server: RestApiServer | null,
  logger: ILogger
): Promise<void> {
  if (server === null) {
    return;
  }

  try {
    await server.stop();
    logger.info('REST API server stopped');
  } catch (error) {
    logger.error(
      'Error stopping REST API server',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Logs REST API configuration at startup.
 */
export function logRestApiConfig(config: RestApiCliConfig, logger: ILogger): void {
  if (config.enabled) {
    logger.info('REST API configuration', {
      port: config.port,
      host: config.host,
      cors: config.cors,
      swagger: config.swagger,
    });
  }
}
