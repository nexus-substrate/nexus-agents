/**
 * nexus-agents CLI Server REST API Integration
 *
 * REST API server lifecycle management for the CLI.
 * Provides HTTP interface alongside MCP server mode.
 *
 * @module cli-server-rest
 * (Source: Issue #524 - Wire up REST API server to CLI entry points)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { homedir } from 'node:os';
import type { ILogger } from './core/index.js';
import { createLogger } from './core/index.js';
import { RestApiServer, type RestApiServerOptions } from './api/rest-server.js';
import type { ApiKeyConfig } from './api/rest-types.js';
import type { AppConfig } from './config/index.js';
import type { AuthHandler } from './mcp/middleware/auth-handler.js';

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

/** Parses and validates a port number from string. Returns default port on invalid input. */
function parseValidPort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return DEFAULT_REST_CONFIG.port;
  }
  return port;
}

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
    port: portEnv !== undefined ? parseValidPort(portEnv) : DEFAULT_REST_CONFIG.port,
    host: hostEnv ?? DEFAULT_REST_CONFIG.host,
    cors: DEFAULT_REST_CONFIG.cors,
    swagger: DEFAULT_REST_CONFIG.swagger,
  };
}

/** Directory for auth credentials within ~/.nexus-agents. */
const AUTH_DIR = 'auth';
/** Filename for the auto-generated REST API key. */
const API_KEY_FILE = 'rest-api-key';

/** Returns the path to the auth directory. */
function getAuthDir(baseDir?: string): string {
  const home = baseDir ?? path.join(homedir(), '.nexus-agents');
  return path.join(home, AUTH_DIR);
}

/**
 * Loads an existing API key from disk, or generates and persists a new one.
 * Key file is created with mode 0o600 (owner read/write only).
 * (Source: Issue #740 Phase 2 - auto-generated API key)
 *
 * @param logger - Logger instance
 * @param baseDir - Optional base directory (defaults to ~/.nexus-agents). Used for testing.
 */
export function loadOrGenerateApiKey(logger: ILogger, baseDir?: string): ApiKeyConfig {
  const authDir = getAuthDir(baseDir);
  const keyPath = path.join(authDir, API_KEY_FILE);

  // Try to load existing key
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath, 'utf-8').trim();
    if (key.length > 0) {
      logger.info('Loaded REST API key from disk', { keyFile: keyPath });
      return { key, name: 'auto-generated' };
    }
  }

  // Generate new key
  const key = 'nxa-' + crypto.randomBytes(24).toString('hex');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(keyPath, key + '\n', { mode: 0o600 });
  logger.info('Generated new REST API key', { keyFile: keyPath });
  logger.warn('REST API key stored at: ' + keyPath + ' — keep this file secure');
  return { key, name: 'auto-generated' };
}

/**
 * Options for starting the REST API server.
 */
export interface StartRestApiOptions {
  /** REST API configuration */
  config: RestApiCliConfig;
  /** Parent logger */
  logger: ILogger;
  /** Optional auth handler for bearer token validation (Issue #739) */
  authHandler?: AuthHandler;
}

/**
 * Builds the API key list from auto-generated key and optional auth handler token.
 * When an AuthHandler is provided and enabled, its bearer token is also accepted
 * as a valid API key, unifying the auth paths.
 */
function buildApiKeys(logger: ILogger, authHandler?: AuthHandler): ApiKeyConfig[] {
  const keys: ApiKeyConfig[] = [loadOrGenerateApiKey(logger)];
  if (authHandler?.isEnabled() === true && authHandler.hasToken()) {
    const token = authHandler.getStoredTokenForIntegration();
    if (token !== undefined) {
      keys.push({ key: token, name: 'mcp-bearer-token' });
      logger.info('REST API also accepts MCP bearer token for authentication');
    }
  }
  return keys;
}

/**
 * Creates and starts the REST API server.
 *
 * @param config - REST API configuration
 * @param logger - Parent logger
 * @param authHandler - Optional auth handler for bearer token support (Issue #739)
 * @returns The started REST API server, or null if disabled
 */
export async function startRestApiServer(
  config: RestApiCliConfig,
  logger: ILogger,
  authHandler?: AuthHandler
): Promise<RestApiServer | null> {
  if (!config.enabled) {
    logger.debug('REST API disabled (set NEXUS_REST_ENABLED=true to enable)');
    return null;
  }

  const restLogger = createLogger({ component: 'RestApiServer' });

  // Build API keys: auto-generated + optional MCP bearer token (Issue #739)
  const apiKeys = buildApiKeys(logger, authHandler);
  const serverOptions: RestApiServerOptions = {
    config: {
      port: config.port,
      host: config.host,
      enableCors: config.cors,
      enableSwagger: config.swagger,
    },
    logger: restLogger,
    apiKeys,
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
