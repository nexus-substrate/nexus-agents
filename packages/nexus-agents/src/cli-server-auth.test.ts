/**
 * Tests for cli-server-auth module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initializeAuth } from './cli-server-auth.js';
import type { AppConfig } from './config/index.js';
import type { ILogger } from './core/index.js';

// Mock dependencies
vi.mock('./core/index.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('./mcp/middleware/auth-handler.js', () => ({
  AuthHandler: vi.fn(),
  getDefaultTokenPath: vi.fn(() => '/default/token/path'),
}));

import { AuthHandler, getDefaultTokenPath } from './mcp/middleware/auth-handler.js';
import { createLogger } from './core/index.js';

describe('cli-server-auth', () => {
  let mockLogger: ILogger;
  let mockHandler: {
    isEnabled: ReturnType<typeof vi.fn>;
    hasToken: ReturnType<typeof vi.fn>;
    generateToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    mockHandler = {
      isEnabled: vi.fn(),
      hasToken: vi.fn(),
      generateToken: vi.fn(),
    };
    (AuthHandler as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockHandler);
  });

  afterEach(() => {
    delete process.env['NEXUS_AUTH_ENABLED'];
  });

  describe('initializeAuth', () => {
    it('returns disabled auth when no config provided', () => {
      mockHandler.isEnabled.mockReturnValue(false);

      const result = initializeAuth(undefined, mockLogger);

      expect(result.enabled).toBe(false);
      expect(result.tokenGenerated).toBe(false);
      expect(result.handler).toBe(mockHandler);
      expect(mockHandler.generateToken).not.toHaveBeenCalled();
    });

    it('returns disabled auth when config has auth disabled', () => {
      mockHandler.isEnabled.mockReturnValue(false);
      const config: AppConfig = {
        security: { auth: { enabled: false } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.enabled).toBe(false);
      expect(result.tokenGenerated).toBe(false);
    });

    it('enables auth when config has auth enabled', () => {
      mockHandler.isEnabled.mockReturnValue(true);
      mockHandler.hasToken.mockReturnValue(true);
      const config: AppConfig = {
        security: { auth: { enabled: true } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.enabled).toBe(true);
      expect(AuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        expect.any(Object)
      );
    });

    it('generates token when auth enabled and no token exists', () => {
      mockHandler.isEnabled.mockReturnValue(true);
      mockHandler.hasToken.mockReturnValue(false);
      const config: AppConfig = {
        security: { auth: { enabled: true } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.enabled).toBe(true);
      expect(result.tokenGenerated).toBe(true);
      expect(mockHandler.generateToken).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No auth token found — generating one automatically'
      );
    });

    it('does not generate token when token already exists', () => {
      mockHandler.isEnabled.mockReturnValue(true);
      mockHandler.hasToken.mockReturnValue(true);
      const config: AppConfig = {
        security: { auth: { enabled: true } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.enabled).toBe(true);
      expect(result.tokenGenerated).toBe(false);
      expect(mockHandler.generateToken).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Auth token loaded', {
        tokenFile: expect.any(String),
      });
    });

    it('uses env var NEXUS_AUTH_ENABLED=true to enable auth', () => {
      process.env['NEXUS_AUTH_ENABLED'] = 'true';
      mockHandler.isEnabled.mockReturnValue(true);
      mockHandler.hasToken.mockReturnValue(true);

      const result = initializeAuth(undefined, mockLogger);

      expect(result.enabled).toBe(true);
      expect(AuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        expect.any(Object)
      );
    });

    it('uses env var NEXUS_AUTH_ENABLED=false to disable auth', () => {
      process.env['NEXUS_AUTH_ENABLED'] = 'false';
      mockHandler.isEnabled.mockReturnValue(false);
      const config: AppConfig = {
        security: { auth: { enabled: true } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.enabled).toBe(false);
      expect(AuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        expect.any(Object)
      );
    });

    it('env var takes precedence over config', () => {
      process.env['NEXUS_AUTH_ENABLED'] = 'true';
      mockHandler.isEnabled.mockReturnValue(true);
      mockHandler.hasToken.mockReturnValue(true);
      const config: AppConfig = {
        security: { auth: { enabled: false } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.enabled).toBe(true);
    });

    it('uses custom token file path from config', () => {
      mockHandler.isEnabled.mockReturnValue(false);
      const customPath = '/custom/token/file';
      const config: AppConfig = {
        security: { auth: { enabled: false, tokenFile: customPath } },
      } as AppConfig;

      const result = initializeAuth(config, mockLogger);

      expect(result.tokenFile).toBe(customPath);
      expect(AuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({ tokenFile: customPath }),
        expect.any(Object)
      );
    });

    it('uses default token path when no custom path provided', () => {
      mockHandler.isEnabled.mockReturnValue(false);

      const result = initializeAuth(undefined, mockLogger);

      expect(result.tokenFile).toBe('/default/token/path');
      expect(getDefaultTokenPath).toHaveBeenCalled();
    });

    it('creates default logger when none provided', () => {
      mockHandler.isEnabled.mockReturnValue(false);

      initializeAuth(undefined);

      expect(createLogger).toHaveBeenCalledWith({ component: 'auth' });
    });

    it('logs warning with token file path when token generated', () => {
      mockHandler.isEnabled.mockReturnValue(true);
      mockHandler.hasToken.mockReturnValue(false);
      const config: AppConfig = {
        security: { auth: { enabled: true } },
      } as AppConfig;

      initializeAuth(config, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Auth token stored at:')
      );
    });

    it('passes config auth method to handler', () => {
      mockHandler.isEnabled.mockReturnValue(false);
      const config: AppConfig = {
        security: { auth: { enabled: false, method: 'token' } },
      } as AppConfig;

      initializeAuth(config, mockLogger);

      expect(AuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'token' }),
        expect.any(Object)
      );
    });

    it('passes config token header to handler', () => {
      mockHandler.isEnabled.mockReturnValue(false);
      const config: AppConfig = {
        security: { auth: { enabled: false, tokenHeader: 'X-Custom-Auth' } },
      } as AppConfig;

      initializeAuth(config, mockLogger);

      expect(AuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHeader: 'X-Custom-Auth' }),
        expect.any(Object)
      );
    });
  });
});
