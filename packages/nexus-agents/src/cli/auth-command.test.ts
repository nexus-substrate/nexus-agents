/**
 * nexus-agents/cli - Auth Command Tests
 *
 * Tests for the authentication token management CLI command.
 *
 * (Source: Issue #739 - enable MCP authentication by default)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isValidAuthSubcommand,
  runAuthInit,
  runAuthShow,
  runAuthRotate,
  runAuthCommand,
} from './auth-command.js';

describe('auth-command', () => {
  describe('isValidAuthSubcommand', () => {
    it('validates known subcommands', () => {
      expect(isValidAuthSubcommand('init')).toBe(true);
      expect(isValidAuthSubcommand('show')).toBe(true);
      expect(isValidAuthSubcommand('rotate')).toBe(true);
      expect(isValidAuthSubcommand('help')).toBe(true);
    });

    it('rejects invalid subcommands', () => {
      expect(isValidAuthSubcommand('invalid')).toBe(false);
      expect(isValidAuthSubcommand(undefined)).toBe(false);
      expect(isValidAuthSubcommand('')).toBe(false);
    });
  });

  describe('runAuthInit', () => {
    const testDir = join(tmpdir(), `nexus-auth-cmd-test-${String(Date.now())}`);
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

    it('generates a new token when none exists', () => {
      const result = runAuthInit({ tokenFile: testTokenFile });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('init');
      expect(result.tokenExists).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toHaveLength(64);
      expect(existsSync(testTokenFile)).toBe(true);
    });

    it('fails when token exists without --force', () => {
      // First create a token
      runAuthInit({ tokenFile: testTokenFile });

      // Try to create again
      const result = runAuthInit({ tokenFile: testTokenFile });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('overwrites token with --force', () => {
      // First create a token
      const first = runAuthInit({ tokenFile: testTokenFile });
      const firstToken = first.token;

      // Force overwrite
      const result = runAuthInit({ tokenFile: testTokenFile, force: true });
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).not.toBe(firstToken);
    });
  });

  describe('runAuthShow', () => {
    const testDir = join(tmpdir(), `nexus-auth-show-test-${String(Date.now())}`);
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

    it('shows status when token exists', () => {
      // First create a token
      runAuthInit({ tokenFile: testTokenFile });

      const result = runAuthShow({ tokenFile: testTokenFile });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('show');
      expect(result.tokenExists).toBe(true);
      expect(result.tokenFile).toBe(testTokenFile);
      // Token should not be returned in show
      expect(result.token).toBeUndefined();
    });

    it('shows status when no token exists', () => {
      const result = runAuthShow({ tokenFile: testTokenFile });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('show');
      expect(result.tokenExists).toBe(false);
    });
  });

  describe('runAuthRotate', () => {
    const testDir = join(tmpdir(), `nexus-auth-rotate-test-${String(Date.now())}`);
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

    it('fails when no token exists', () => {
      const result = runAuthRotate({ tokenFile: testTokenFile });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No existing token');
    });

    it('rotates token when one exists', () => {
      // First create a token
      const first = runAuthInit({ tokenFile: testTokenFile });
      const firstToken = first.token;

      const result = runAuthRotate({ tokenFile: testTokenFile });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('rotate');
      expect(result.token).toBeDefined();
      expect(result.token).not.toBe(firstToken);
    });
  });

  describe('runAuthCommand', () => {
    const testDir = join(tmpdir(), `nexus-auth-cmd-dispatch-test-${String(Date.now())}`);
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

    it('dispatches to init subcommand', () => {
      const result = runAuthCommand({ subcommand: 'init', tokenFile: testTokenFile });
      expect(result.operation).toBe('init');
      expect(result.success).toBe(true);
    });

    it('dispatches to show subcommand', () => {
      const result = runAuthCommand({ subcommand: 'show', tokenFile: testTokenFile });
      expect(result.operation).toBe('show');
      expect(result.success).toBe(true);
    });

    it('dispatches to help by default', () => {
      const result = runAuthCommand({ tokenFile: testTokenFile });
      expect(result.operation).toBe('help');
      expect(result.success).toBe(true);
    });
  });
});
