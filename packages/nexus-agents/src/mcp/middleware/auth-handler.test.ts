/**
 * nexus-agents/mcp - Auth Handler Tests
 *
 * Tests for the authentication handler middleware.
 *
 * (Source: Issue #739 - enable MCP authentication by default)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AuthHandler,
  generateSecureToken,
  validateToken,
  extractBearerToken,
  readStoredToken,
  writeToken,
  createAuthHandler,
} from './auth-handler.js';

describe('auth-handler', () => {
  describe('generateSecureToken', () => {
    it('generates a 64-character hex token', () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('generates unique tokens', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('returns true for matching tokens', () => {
      const token = 'abc123';
      expect(validateToken('abc123', token)).toBe(true);
    });

    it('returns false for non-matching tokens', () => {
      expect(validateToken('abc123', 'xyz789')).toBe(false);
    });

    it('returns false for different length tokens', () => {
      expect(validateToken('short', 'longertoken')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(validateToken('', '')).toBe(true);
      expect(validateToken('', 'nonempty')).toBe(false);
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from valid Bearer header', () => {
      expect(extractBearerToken('Bearer mytoken123')).toBe('mytoken123');
    });

    it('handles case-insensitive Bearer', () => {
      expect(extractBearerToken('bearer mytoken')).toBe('mytoken');
      expect(extractBearerToken('BEARER MYTOKEN')).toBe('MYTOKEN');
    });

    it('returns undefined for missing header', () => {
      expect(extractBearerToken(undefined)).toBeUndefined();
    });

    it('returns undefined for invalid format', () => {
      expect(extractBearerToken('Basic abc123')).toBeUndefined();
      expect(extractBearerToken('mytoken')).toBeUndefined();
    });
  });

  describe('token file operations', () => {
    const testDir = join(tmpdir(), `nexus-auth-test-${String(Date.now())}`);
    const testTokenFile = join(testDir, 'test-token');

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it('writes and reads token correctly', () => {
      const token = 'test-token-value';
      writeToken(testTokenFile, token);
      expect(existsSync(testTokenFile)).toBe(true);
      expect(readStoredToken(testTokenFile)).toBe(token);
    });

    it('creates directory if not exists', () => {
      const nestedPath = join(testDir, 'nested', 'deep', 'token');
      writeToken(nestedPath, 'token');
      expect(existsSync(nestedPath)).toBe(true);
    });

    it('returns undefined for non-existent file', () => {
      expect(readStoredToken('/nonexistent/path')).toBeUndefined();
    });
  });

  describe('AuthHandler', () => {
    const testDir = join(tmpdir(), `nexus-auth-handler-test-${String(Date.now())}`);
    const testTokenFile = join(testDir, 'server-token');

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    describe('when disabled', () => {
      it('always authenticates successfully', () => {
        const handler = new AuthHandler({ enabled: false });
        const result = handler.authenticate({});
        expect(result.authenticated).toBe(true);
        expect(result.user?.id).toBe('anonymous');
      });

      it('does not require token file', () => {
        const handler = new AuthHandler({
          enabled: false,
          tokenFile: '/nonexistent',
        });
        expect(handler.isEnabled()).toBe(false);
      });
    });

    describe('when enabled', () => {
      it('fails if no token configured', () => {
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: '/nonexistent/token',
        });
        const result = handler.authenticate({});
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('not configured');
      });

      it('fails if Authorization header missing', () => {
        const token = generateSecureToken();
        writeToken(testTokenFile, token);
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        const result = handler.authenticate({});
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('Missing');
      });

      it('fails for invalid token', () => {
        const token = generateSecureToken();
        writeToken(testTokenFile, token);
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        const result = handler.authenticate({
          authorization: 'Bearer wrongtoken',
        });
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('Invalid');
      });

      it('succeeds for valid token', () => {
        const token = generateSecureToken();
        writeToken(testTokenFile, token);
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        const result = handler.authenticate({
          authorization: `Bearer ${token}`,
        });
        expect(result.authenticated).toBe(true);
        expect(result.user).toBeDefined();
      });
    });

    describe('token management', () => {
      it('generates and stores token', () => {
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        const token = handler.generateToken();
        expect(token).toHaveLength(64);
        expect(readStoredToken(testTokenFile)).toBe(token);
        expect(handler.hasToken()).toBe(true);
      });

      it('rotates token', () => {
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        const token1 = handler.generateToken();
        const token2 = handler.rotateToken();
        expect(token1).not.toBe(token2);
        expect(readStoredToken(testTokenFile)).toBe(token2);
      });
    });

    describe('getStoredTokenForIntegration', () => {
      it('returns undefined when no token is loaded (auth disabled)', () => {
        const handler = new AuthHandler({ enabled: false });
        expect(handler.getStoredTokenForIntegration()).toBeUndefined();
      });

      it('returns the stored token when auth is enabled and token exists', () => {
        const token = generateSecureToken();
        writeToken(testTokenFile, token);
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        expect(handler.getStoredTokenForIntegration()).toBe(token);
      });

      it('returns token after generateToken() is called', () => {
        const handler = new AuthHandler({
          enabled: true,
          tokenFile: testTokenFile,
        });
        const token = handler.generateToken();
        expect(handler.getStoredTokenForIntegration()).toBe(token);
      });
    });
  });

  describe('createAuthHandler', () => {
    it('creates handler with defaults', () => {
      const handler = createAuthHandler();
      expect(handler.isEnabled()).toBe(false);
    });

    it('creates handler with config', () => {
      const handler = createAuthHandler({ enabled: false });
      expect(handler.isEnabled()).toBe(false);
    });
  });
});
