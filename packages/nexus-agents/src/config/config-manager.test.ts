/**
 * ConfigManager Unit Tests
 *
 * Tests for the ConfigManager singleton class (Issue #360 Phase 1).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager, getConfigManager } from './config-manager.js';
import { DEFAULTS } from './defaults.js';

describe('ConfigManager', () => {
  beforeEach(() => {
    // Reset singleton before each test
    ConfigManager.resetInstance();
    // Clear any test environment variables
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    ConfigManager.resetInstance();
    vi.unstubAllEnvs();
  });

  describe('getInstance', () => {
    it('returns the same instance on multiple calls', () => {
      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('returns a new instance after resetInstance', () => {
      const instance1 = ConfigManager.getInstance();
      ConfigManager.resetInstance();
      const instance2 = ConfigManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('get', () => {
    it('returns package default when no override exists', () => {
      const config = ConfigManager.getInstance();
      const value = config.get('TIMEOUT_DEFAULTS', 'cliMs');
      expect(value).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    });

    it('returns correct values for different categories', () => {
      const config = ConfigManager.getInstance();

      expect(config.get('TIMEOUT_DEFAULTS', 'apiMs')).toBe(DEFAULTS.TIMEOUT_DEFAULTS.apiMs);
      expect(config.get('RATE_LIMIT_DEFAULTS', 'requestsPerMinute')).toBe(
        DEFAULTS.RATE_LIMIT_DEFAULTS.requestsPerMinute
      );
      expect(config.get('RETRY_DEFAULTS', 'maxRetries')).toBe(DEFAULTS.RETRY_DEFAULTS.maxRetries);
    });
  });

  describe('getWithMeta', () => {
    it('returns metadata with package source for defaults', () => {
      const config = ConfigManager.getInstance();
      const meta = config.getWithMeta('TIMEOUT_DEFAULTS', 'cliMs');

      expect(meta.value).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
      expect(meta.source).toBe('package');
      expect(meta.key).toBe('TIMEOUT_DEFAULTS.cliMs');
      expect(meta.isOverride).toBe(false);
      expect(meta.defaultValue).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    });

    it('returns metadata with override source when override exists', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');

      const meta = config.getWithMeta('TIMEOUT_DEFAULTS', 'cliMs');

      expect(meta.value).toBe(90000);
      expect(meta.source).toBe('session');
      expect(meta.isOverride).toBe(true);
      expect(meta.defaultValue).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    });
  });

  describe('setOverride', () => {
    it('sets an override value', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 120000, 'cli');

      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(120000);
    });

    it('overrides environment variable values', () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', '45000');
      const config = ConfigManager.getInstance();

      // Without override, env var should apply
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(45000);

      // With override, override should win
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(90000);
    });

    it('throws on invalid value type', () => {
      const config = ConfigManager.getInstance();

      expect(() => {
        // @ts-expect-error - Testing runtime validation
        config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 'invalid', 'session');
      }).toThrow('Invalid value type');
    });

    it('accepts boolean overrides for boolean defaults', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('RATE_LIMIT_DEFAULTS', 'enabled', false, 'session');

      expect(config.get('RATE_LIMIT_DEFAULTS', 'enabled')).toBe(false);
    });
  });

  describe('clearOverride', () => {
    it('clears an existing override', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');

      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(90000);

      const cleared = config.clearOverride('TIMEOUT_DEFAULTS', 'cliMs');
      expect(cleared).toBe(true);
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    });

    it('returns false when clearing non-existent override', () => {
      const config = ConfigManager.getInstance();
      const cleared = config.clearOverride('TIMEOUT_DEFAULTS', 'cliMs');
      expect(cleared).toBe(false);
    });
  });

  describe('clearAllOverrides', () => {
    it('clears all overrides', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');
      config.setOverride('RETRY_DEFAULTS', 'maxRetries', 5, 'cli');

      config.clearAllOverrides();

      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
      expect(config.get('RETRY_DEFAULTS', 'maxRetries')).toBe(DEFAULTS.RETRY_DEFAULTS.maxRetries);
    });
  });

  describe('listOverrides', () => {
    it('returns empty array when no overrides', () => {
      const config = ConfigManager.getInstance();
      expect(config.listOverrides()).toEqual([]);
    });

    it('returns all active overrides', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');
      config.setOverride('RETRY_DEFAULTS', 'maxRetries', 5, 'cli');

      const overrides = config.listOverrides();

      expect(overrides).toHaveLength(2);
      expect(overrides).toContainEqual(
        expect.objectContaining({
          key: 'TIMEOUT_DEFAULTS.cliMs',
          value: 90000,
          source: 'session',
        })
      );
      expect(overrides).toContainEqual(
        expect.objectContaining({
          key: 'RETRY_DEFAULTS.maxRetries',
          value: 5,
          source: 'cli',
        })
      );
    });
  });

  describe('listAll', () => {
    it('lists all config values', () => {
      const config = ConfigManager.getInstance();
      const all = config.listAll();

      expect(all.length).toBeGreaterThan(0);
      expect(all).toContainEqual(
        expect.objectContaining({
          category: 'TIMEOUT_DEFAULTS',
          key: 'cliMs',
          source: 'package',
        })
      );
    });

    it('filters by category', () => {
      const config = ConfigManager.getInstance();
      const filtered = config.listAll('TIMEOUT_DEFAULTS');

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((item) => item.category === 'TIMEOUT_DEFAULTS')).toBe(true);
    });

    it('shows env var names', () => {
      const config = ConfigManager.getInstance();
      const all = config.listAll('TIMEOUT_DEFAULTS');

      const cliMsEntry = all.find((item) => item.key === 'cliMs');
      expect(cliMsEntry?.envVar).toBe('NEXUS_TIMEOUT_CLI');
    });
  });

  describe('environment variable resolution', () => {
    it('reads NEXUS_TIMEOUT_CLI', () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', '45000');
      const config = ConfigManager.getInstance();

      const meta = config.getWithMeta('TIMEOUT_DEFAULTS', 'cliMs');
      expect(meta.value).toBe(45000);
      expect(meta.source).toBe('env');
    });

    it('reads NEXUS_RATE_LIMIT_ENABLED as boolean', () => {
      vi.stubEnv('NEXUS_RATE_LIMIT_ENABLED', 'false');
      const config = ConfigManager.getInstance();

      expect(config.get('RATE_LIMIT_DEFAULTS', 'enabled')).toBe(false);
    });

    it('reads NEXUS_RETRY_JITTER as float', () => {
      vi.stubEnv('NEXUS_RETRY_JITTER', '0.25');
      const config = ConfigManager.getInstance();

      expect(config.get('RETRY_DEFAULTS', 'jitterFactor')).toBe(0.25);
    });

    it('ignores invalid env var values', () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', 'not-a-number');
      const config = ConfigManager.getInstance();

      // Should fall back to package default
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    });
  });

  describe('hasOverride', () => {
    it('returns true when override exists', () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');

      expect(config.hasOverride('TIMEOUT_DEFAULTS', 'cliMs')).toBe(true);
    });

    it('returns false when no override exists', () => {
      const config = ConfigManager.getInstance();
      expect(config.hasOverride('TIMEOUT_DEFAULTS', 'cliMs')).toBe(false);
    });
  });

  describe('getEnvVarName', () => {
    it('returns env var name for mapped keys', () => {
      const config = ConfigManager.getInstance();
      expect(config.getEnvVarName('TIMEOUT_DEFAULTS', 'cliMs')).toBe('NEXUS_TIMEOUT_CLI');
    });

    it('returns undefined for unmapped keys', () => {
      const config = ConfigManager.getInstance();
      expect(config.getEnvVarName('TIMEOUT_DEFAULTS', 'healthCheckMs')).toBeUndefined();
    });
  });

  describe('getConfigManager', () => {
    it('returns the singleton instance', () => {
      const instance1 = getConfigManager();
      const instance2 = ConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('precedence order', () => {
    it('CLI override > session override > env > package', () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', '45000');
      const config = ConfigManager.getInstance();

      // Package default: 60000, env: 45000
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(45000);

      // Session override: 90000
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(90000);

      // CLI override: 120000 (should replace session)
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 120000, 'cli');
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(120000);

      // Clear override, should fall back to env
      config.clearOverride('TIMEOUT_DEFAULTS', 'cliMs');
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(45000);
    });
  });
});
