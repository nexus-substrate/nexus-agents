/**
 * nexus-agents/mcp - Authentication Handler Middleware
 *
 * Provides authentication middleware for network-exposed MCP transports.
 * Supports token-based authentication with secure storage.
 *
 * (Source: Issue #739 - enable MCP authentication by default)
 *
 * @module mcp/middleware/auth-handler
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { AuthConfig } from '../../config/schemas-security.js';
import type { AuthenticatedUser } from './request-context.js';

/**
 * Result of token validation.
 */
export interface AuthResult {
  /** Whether authentication was successful */
  readonly authenticated: boolean;
  /** Authenticated user information (if successful) */
  readonly user?: AuthenticatedUser;
  /** Error message (if authentication failed) */
  readonly error?: string;
}

/**
 * Configuration for the auth handler.
 */
export interface AuthHandlerConfig {
  /** Enable authentication (default: false) */
  enabled: boolean;
  /** Authentication method (default: 'token') */
  method: 'token' | 'oauth2';
  /** Header name for bearer token (default: 'Authorization') */
  tokenHeader: string;
  /** Token file path */
  tokenFile: string;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Default auth directory relative to home.
 */
const DEFAULT_AUTH_DIR = '.nexus-agents/auth';

/**
 * Default token file name.
 */
const DEFAULT_TOKEN_FILE = 'server-token';

/**
 * Token length in bytes (32 bytes = 64 hex chars).
 */
const TOKEN_LENGTH_BYTES = 32;

/**
 * Gets the default token file path.
 */
export function getDefaultTokenPath(): string {
  return join(homedir(), DEFAULT_AUTH_DIR, DEFAULT_TOKEN_FILE);
}

/**
 * Generates a cryptographically secure token.
 * Format: hex-encoded random bytes.
 *
 * @returns Secure token string
 */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_LENGTH_BYTES).toString('hex');
}

/**
 * Reads the stored token from file.
 *
 * @param tokenPath - Path to token file
 * @returns Token string or undefined if not found
 */
export function readStoredToken(tokenPath: string): string | undefined {
  try {
    if (!existsSync(tokenPath)) {
      return undefined;
    }
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return undefined;
  }
}

/**
 * Writes a token to file with secure permissions.
 *
 * @param tokenPath - Path to token file
 * @param token - Token to write
 */
export function writeToken(tokenPath: string, token: string): void {
  const dir = dirname(tokenPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(tokenPath, token + '\n', { mode: 0o600 });
}

/**
 * Validates a token against the stored token.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param providedToken - Token to validate
 * @param storedToken - Stored token to compare against
 * @returns True if tokens match
 */
export function validateToken(providedToken: string, storedToken: string): boolean {
  const provided = Buffer.from(providedToken);
  const stored = Buffer.from(storedToken);

  // Handle empty strings (both empty = match)
  if (provided.length === 0 && stored.length === 0) {
    return true;
  }

  // Constant-time comparison requires same length
  if (provided.length !== stored.length) {
    // Do a dummy comparison to maintain constant time
    const maxLen = Math.max(provided.length, stored.length, 1);
    const dummy1 = Buffer.alloc(maxLen, 0);
    const dummy2 = Buffer.alloc(maxLen, 1);
    timingSafeEqual(dummy1, dummy2);
    return false;
  }

  return timingSafeEqual(provided, stored);
}

/**
 * Extracts bearer token from Authorization header.
 *
 * @param header - Authorization header value
 * @returns Token string or undefined if invalid format
 */
export function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

/**
 * Resolves auth config with defaults.
 */
function resolveAuthConfig(config: Partial<AuthConfig> | undefined): AuthHandlerConfig {
  const resolved = config ?? {};
  return {
    enabled: resolved.enabled ?? true,
    method: resolved.method ?? 'token',
    tokenHeader: resolved.tokenHeader ?? 'Authorization',
    tokenFile: resolved.tokenFile ?? getDefaultTokenPath(),
  };
}

/**
 * Authentication handler for MCP transports.
 */
export class AuthHandler {
  private readonly config: AuthHandlerConfig;
  private readonly logger: ILogger;
  private storedToken: string | undefined;

  constructor(config: Partial<AuthConfig> | undefined, logger?: ILogger) {
    this.config = resolveAuthConfig(config);
    this.logger = logger ?? createLogger({ component: 'AuthHandler' });
    if (this.config.enabled) this.loadToken();
  }

  /**
   * Loads the stored token from file.
   */
  private loadToken(): void {
    this.storedToken = readStoredToken(this.config.tokenFile);
    if (this.storedToken === undefined) {
      this.logger.warn('Auth enabled but no token file found', {
        tokenFile: this.config.tokenFile,
        hint: 'Run "nexus-agents auth init" to generate a token',
      });
    } else {
      this.logger.info('Auth token loaded successfully');
    }
  }

  /**
   * Checks if authentication is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Checks if a valid token is configured.
   */
  hasToken(): boolean {
    return this.storedToken !== undefined;
  }

  /**
   * Validates an incoming request.
   *
   * @param headers - Request headers
   * @returns Authentication result
   */
  authenticate(headers: Record<string, string | undefined>): AuthResult {
    if (!this.config.enabled) {
      return { authenticated: true, user: { id: 'anonymous', name: 'Anonymous (auth disabled)' } };
    }

    if (this.storedToken === undefined) {
      this.logger.error('Auth enabled but no token configured');
      return { authenticated: false, error: 'Server authentication not configured' };
    }

    const authHeader = headers[this.config.tokenHeader.toLowerCase()];
    const providedToken = extractBearerToken(authHeader);

    if (providedToken === undefined) {
      this.logger.debug('Missing or invalid Authorization header');
      return { authenticated: false, error: 'Missing or invalid Authorization header' };
    }

    if (!validateToken(providedToken, this.storedToken)) {
      this.logger.warn('Invalid authentication token provided');
      return { authenticated: false, error: 'Invalid authentication token' };
    }

    return {
      authenticated: true,
      user: { id: 'bearer-token', name: 'Bearer Token Auth' },
    };
  }

  /**
   * Returns the stored token for integration with other auth systems.
   * Used by REST API to accept bearer tokens as valid API keys.
   * (Source: Issue #739 - unified auth)
   *
   * @returns Stored token or undefined if not loaded
   */
  getStoredTokenForIntegration(): string | undefined {
    return this.storedToken;
  }

  /**
   * Generates and stores a new token.
   * Returns the generated token (only time it's shown to user).
   *
   * @returns Generated token string
   */
  generateToken(): string {
    const token = generateSecureToken();
    writeToken(this.config.tokenFile, token);
    this.storedToken = token;
    this.logger.info('New auth token generated and stored', {
      tokenFile: this.config.tokenFile,
    });
    return token;
  }

  /**
   * Rotates the token (generates new, invalidates old).
   *
   * @returns New token string
   */
  rotateToken(): string {
    const oldExists = this.storedToken !== undefined;
    const token = this.generateToken();
    if (oldExists) {
      this.logger.info('Auth token rotated - previous token invalidated');
    }
    return token;
  }
}

/**
 * Creates an AuthHandler from config.
 *
 * @param config - Auth configuration
 * @param logger - Logger instance
 * @returns AuthHandler instance
 */
export function createAuthHandler(config?: Partial<AuthConfig>, logger?: ILogger): AuthHandler {
  return new AuthHandler(config ?? {}, logger);
}

/**
 * Creates an unauthorized response for HTTP.
 */
export function createUnauthorizedResponse(message: string): { status: 401; body: string } {
  return {
    status: 401,
    body: JSON.stringify({ error: 'Unauthorized', message }),
  };
}
