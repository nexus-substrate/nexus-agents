/**
 * Tests for handler-utils
 *
 * Tests utility functions for hook handlers.
 *
 * @module cli/hooks/handlers/handler-utils.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  getDefaultDbPath,
  getNexusDataDir,
  HookEnvVars,
  isFeatureDisabled,
  getDbPathFromEnv,
  isVerboseLogging,
  safeString,
  safeNumber,
} from './handler-utils.js';

describe('handler-utils', () => {
  describe('getDefaultDbPath', () => {
    it('should return path in home directory', () => {
      // `sessions.db` is a top-level FILE — distinct from the per-repo
      // `sessions/` directory. The epic #2872 router keys on the first
      // path segment, and `sessions.db` is not in PER_REPO_SUBDIRS, so
      // it resolves cross-repo (homedir). This is intentional, not a bug.
      const result = getDefaultDbPath();

      expect(result).toBe(join(homedir(), '.nexus-agents', 'sessions.db'));
    });
  });

  describe('getNexusDataDir', () => {
    it('should return nexus-agents data directory', () => {
      const result = getNexusDataDir();

      expect(result).toBe(join(homedir(), '.nexus-agents'));
    });
  });

  describe('HookEnvVars', () => {
    it('should have correct environment variable names', () => {
      expect(HookEnvVars.NEXUS_SESSIONS_DB).toBe('NEXUS_SESSIONS_DB');
      expect(HookEnvVars.NEXUS_HOOK_VERBOSE).toBe('NEXUS_HOOK_VERBOSE');
      expect(HookEnvVars.NEXUS_DISABLE_SESSIONS).toBe('NEXUS_DISABLE_SESSIONS');
      expect(HookEnvVars.NEXUS_DISABLE_METRICS).toBe('NEXUS_DISABLE_METRICS');
    });
  });

  describe('isFeatureDisabled', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true when value is "1"', () => {
      process.env['TEST_DISABLE'] = '1';

      expect(isFeatureDisabled('TEST_DISABLE')).toBe(true);
    });

    it('should return true when value is "true"', () => {
      process.env['TEST_DISABLE'] = 'true';

      expect(isFeatureDisabled('TEST_DISABLE')).toBe(true);
    });

    it('should return false when value is "0"', () => {
      process.env['TEST_DISABLE'] = '0';

      expect(isFeatureDisabled('TEST_DISABLE')).toBe(false);
    });

    it('should return false when value is "false"', () => {
      process.env['TEST_DISABLE'] = 'false';

      expect(isFeatureDisabled('TEST_DISABLE')).toBe(false);
    });

    it('should return false when not set', () => {
      delete process.env['TEST_DISABLE'];

      expect(isFeatureDisabled('TEST_DISABLE')).toBe(false);
    });

    it('should return false for empty string', () => {
      process.env['TEST_DISABLE'] = '';

      expect(isFeatureDisabled('TEST_DISABLE')).toBe(false);
    });
  });

  describe('getDbPathFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return env value when set', () => {
      process.env['NEXUS_SESSIONS_DB'] = '/custom/path/sessions.db';

      expect(getDbPathFromEnv()).toBe('/custom/path/sessions.db');
    });

    it('should return default path when env not set', () => {
      delete process.env['NEXUS_SESSIONS_DB'];

      expect(getDbPathFromEnv()).toBe(getDefaultDbPath());
    });
  });

  describe('isVerboseLogging', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true when NEXUS_HOOK_VERBOSE is "1"', () => {
      process.env['NEXUS_HOOK_VERBOSE'] = '1';

      expect(isVerboseLogging()).toBe(true);
    });

    it('should return true when NEXUS_HOOK_VERBOSE is "true"', () => {
      process.env['NEXUS_HOOK_VERBOSE'] = 'true';

      expect(isVerboseLogging()).toBe(true);
    });

    it('should return false when NEXUS_HOOK_VERBOSE is not set', () => {
      delete process.env['NEXUS_HOOK_VERBOSE'];

      expect(isVerboseLogging()).toBe(false);
    });

    it('should return false when NEXUS_HOOK_VERBOSE is "0"', () => {
      process.env['NEXUS_HOOK_VERBOSE'] = '0';

      expect(isVerboseLogging()).toBe(false);
    });
  });

  describe('safeString', () => {
    it('should return string as-is', () => {
      expect(safeString('hello')).toBe('hello');
    });

    it('should return empty string for null', () => {
      expect(safeString(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(safeString(undefined)).toBe('');
    });

    it('should convert number to string', () => {
      expect(safeString(42)).toBe('42');
      expect(safeString(3.14)).toBe('3.14');
      expect(safeString(0)).toBe('0');
      expect(safeString(-1)).toBe('-1');
    });

    it('should convert boolean to string', () => {
      expect(safeString(true)).toBe('true');
      expect(safeString(false)).toBe('false');
    });

    it('should return empty string for objects', () => {
      expect(safeString({})).toBe('');
      expect(safeString({ key: 'value' })).toBe('');
    });

    it('should return empty string for arrays', () => {
      expect(safeString([])).toBe('');
      expect(safeString([1, 2, 3])).toBe('');
    });

    it('should return empty string for functions', () => {
      expect(safeString(() => {})).toBe('');
    });
  });

  describe('safeNumber', () => {
    it('should return number as-is', () => {
      expect(safeNumber(42)).toBe(42);
      expect(safeNumber(3.14)).toBe(3.14);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-1)).toBe(-1);
    });

    it('should return default for NaN', () => {
      expect(safeNumber(NaN)).toBe(0);
      expect(safeNumber(NaN, 100)).toBe(100);
    });

    it('should parse numeric strings', () => {
      expect(safeNumber('42')).toBe(42);
      expect(safeNumber('3.14')).toBe(3.14);
      expect(safeNumber('-5')).toBe(-5);
    });

    it('should return default for non-numeric strings', () => {
      expect(safeNumber('hello')).toBe(0);
      expect(safeNumber('hello', 100)).toBe(100);
    });

    it('should return default for null', () => {
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber(null, 50)).toBe(50);
    });

    it('should return default for undefined', () => {
      expect(safeNumber(undefined)).toBe(0);
      expect(safeNumber(undefined, 25)).toBe(25);
    });

    it('should return default for objects', () => {
      expect(safeNumber({})).toBe(0);
      expect(safeNumber({ value: 10 }, 99)).toBe(99);
    });

    it('should return default for boolean', () => {
      expect(safeNumber(true)).toBe(0);
      expect(safeNumber(false, 5)).toBe(5);
    });

    it('should use custom default value', () => {
      expect(safeNumber('invalid', 999)).toBe(999);
    });
  });
});
