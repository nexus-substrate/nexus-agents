/**
 * nexus-agents CLI Server Authentication
 *
 * Initializes authentication for network-exposed transports.
 * Creates AuthHandler, auto-generates tokens on first run,
 * and provides auth state for REST API integration.
 *
 * @module cli-server-auth
 * (Source: Issue #739 - enable MCP authentication by default)
 */

import type { ILogger } from './core/index.js';
import { createLogger } from './core/index.js';
import { AuthHandler, getDefaultTokenPath } from './mcp/middleware/auth-handler.js';
import type { AuthConfig } from './config/schemas-security.js';
import type { AppConfig } from './config/index.js';

/**
 * Result of auth initialization.
 */
export interface AuthInitResult {
  /** The configured AuthHandler instance */
  readonly handler: AuthHandler;
  /** Whether auth is enabled */
  readonly enabled: boolean;
  /** Whether a token was auto-generated during init */
  readonly tokenGenerated: boolean;
  /** Path to the token file */
  readonly tokenFile: string;
}

/**
 * Resolves auth enabled state from config and environment.
 * Environment variable `NEXUS_AUTH_ENABLED` takes precedence over config.
 */
function resolveAuthEnabled(config?: AppConfig): boolean {
  const envValue = process.env['NEXUS_AUTH_ENABLED'];
  if (envValue !== undefined) {
    return envValue === 'true';
  }
  return config?.security?.auth?.enabled ?? true;
}

/**
 * Builds AuthConfig from AppConfig and environment overrides.
 */
function buildAuthConfig(config?: AppConfig): Partial<AuthConfig> {
  const enabled = resolveAuthEnabled(config);
  const configAuth = config?.security?.auth;
  return {
    enabled,
    method: configAuth?.method ?? 'token',
    tokenHeader: configAuth?.tokenHeader ?? 'Authorization',
    tokenFile: configAuth?.tokenFile ?? getDefaultTokenPath(),
  };
}

/**
 * Initializes authentication for the server.
 *
 * When auth is enabled and no token exists, auto-generates one.
 * The token file path and status are logged for operator visibility.
 *
 * @param config - Application configuration
 * @param logger - Logger instance
 * @returns Auth initialization result with handler and state
 */
export function initializeAuth(config?: AppConfig, logger?: ILogger): AuthInitResult {
  const log = logger ?? createLogger({ component: 'auth' });
  const authConfig = buildAuthConfig(config);
  const handler = new AuthHandler(authConfig, log);
  const tokenFile = authConfig.tokenFile ?? getDefaultTokenPath();
  let tokenGenerated = false;

  if (handler.isEnabled()) {
    if (!handler.hasToken()) {
      log.info('No auth token found — generating one automatically');
      handler.generateToken();
      tokenGenerated = true;
      log.info('Auth token generated', { tokenFile });
      log.warn('Auth token stored at: ' + tokenFile + ' — share this with MCP clients');
    } else {
      log.info('Auth token loaded', { tokenFile });
    }
  }

  return {
    handler,
    enabled: handler.isEnabled(),
    tokenGenerated,
    tokenFile,
  };
}
