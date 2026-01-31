/**
 * Tests for cli-server-rest REST API integration module.
 * (Source: Issue #524 - Wire up REST API server to CLI entry points)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractRestConfig,
  startRestApiServer,
  stopRestApiServer,
  logRestApiConfig,
} from './cli-server-rest.js';
import type { ILogger } from './core/index.js';

describe('cli-server-rest', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as ILogger;
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env['NEXUS_REST_ENABLED'];
    delete process.env['NEXUS_REST_PORT'];
    delete process.env['NEXUS_REST_HOST'];
  });

  describe('extractRestConfig', () => {
    it('should return disabled config by default', () => {
      const config = extractRestConfig();
      expect(config.enabled).toBe(false);
      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
    });

    it('should enable REST API via environment variable', () => {
      process.env['NEXUS_REST_ENABLED'] = 'true';
      const config = extractRestConfig();
      expect(config.enabled).toBe(true);
    });

    it('should use custom port from environment variable', () => {
      process.env['NEXUS_REST_PORT'] = '8080';
      const config = extractRestConfig();
      expect(config.port).toBe(8080);
    });

    it('should use custom host from environment variable', () => {
      process.env['NEXUS_REST_HOST'] = '127.0.0.1';
      const config = extractRestConfig();
      expect(config.host).toBe('127.0.0.1');
    });

    it('should enable CORS and Swagger by default', () => {
      const config = extractRestConfig();
      expect(config.cors).toBe(true);
      expect(config.swagger).toBe(true);
    });
  });

  describe('startRestApiServer', () => {
    it('should return null when REST API is disabled', async () => {
      const config = extractRestConfig();
      const server = await startRestApiServer(config, mockLogger);
      expect(server).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('REST API disabled'));
    });
  });

  describe('stopRestApiServer', () => {
    it('should handle null server gracefully', async () => {
      await expect(stopRestApiServer(null, mockLogger)).resolves.not.toThrow();
    });
  });

  describe('logRestApiConfig', () => {
    it('should log config when enabled', () => {
      const config = {
        enabled: true,
        port: 3000,
        host: '0.0.0.0',
        cors: true,
        swagger: true,
      };
      logRestApiConfig(config, mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith('REST API configuration', {
        port: 3000,
        host: '0.0.0.0',
        cors: true,
        swagger: true,
      });
    });

    it('should not log when disabled', () => {
      const config = {
        enabled: false,
        port: 3000,
        host: '0.0.0.0',
        cors: true,
        swagger: true,
      };
      logRestApiConfig(config, mockLogger);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
