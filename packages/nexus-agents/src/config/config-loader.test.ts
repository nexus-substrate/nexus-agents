/**
 * Tests for config-loader.ts
 * (Source: Issue #472 - Wire AppConfigSchema to runtime)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadConfig,
  getConfig,
  clearConfigCache,
  reloadConfig,
  ConfigLoadError,
} from './config-loader.js';
import { existsSync, readFileSync } from 'node:fs';
import * as yaml from 'yaml';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock yaml module
vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockYamlParse = vi.mocked(yaml.parse);

describe('config-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConfigCache();
    // Reset env vars
    delete process.env['NEXUS_CONFIG_PATH'];
  });

  afterEach(() => {
    clearConfigCache();
  });

  describe('loadConfig', () => {
    it('returns defaults when no config file exists', () => {
      mockExistsSync.mockReturnValue(false);

      const result = loadConfig();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usingDefaults).toBe(true);
        expect(result.value.configPath).toBeUndefined();
        expect(result.value.config.models).toBeDefined();
      }
    });

    it('loads and validates config from yaml file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('models:\n  default: claude-sonnet-4');
      mockYamlParse.mockReturnValue({
        models: {
          default: 'claude-sonnet-4',
          tiers: {
            fast: ['claude-haiku-3'],
            balanced: ['claude-sonnet-4'],
            powerful: ['claude-opus-4'],
          },
        },
      });

      const result = loadConfig();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usingDefaults).toBe(false);
        expect(result.value.config.models.default).toBe('claude-sonnet-4');
      }
    });

    it('returns error for invalid YAML', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid: yaml: content');
      mockYamlParse.mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      const result = loadConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigLoadError);
        expect(result.error.code).toBe('YAML_PARSE_ERROR');
      }
    });

    it('returns error for file read failure', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = loadConfig();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigLoadError);
        expect(result.error.code).toBe('FILE_READ_ERROR');
      }
    });

    it('returns error for schema validation failure', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid: config');
      mockYamlParse.mockReturnValue({
        // Missing required 'models' field
        invalid: 'config',
      });

      const result = loadConfig({ mergeDefaults: false });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigLoadError);
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('uses NEXUS_CONFIG_PATH environment variable', () => {
      process.env['NEXUS_CONFIG_PATH'] = './custom-config.yaml';
      mockExistsSync.mockImplementation((p) => {
        return String(p).includes('custom-config.yaml');
      });
      mockReadFileSync.mockReturnValue('models:\n  default: test');
      // Return partial config - it will be merged with defaults
      mockYamlParse.mockReturnValue({
        models: {
          default: 'test-model',
        },
      });

      const result = loadConfig();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.configPath).toContain('custom-config.yaml');
        // Model from file should override default
        expect(result.value.config.models.default).toBe('test-model');
      }
    });

    it('detects path traversal attempts', () => {
      const result = loadConfig({ configPath: '../../../etc/passwd' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PATH_TRAVERSAL');
      }
    });
  });

  describe('getConfig', () => {
    it('caches loaded configuration', () => {
      mockExistsSync.mockReturnValue(false);

      const first = getConfig();
      const second = getConfig();

      expect(first).toBe(second);
      // existsSync should only be called once (cached after first call)
    });

    it('throws ConfigLoadError on failure', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid');
      mockYamlParse.mockImplementation(() => {
        throw new Error('YAML error');
      });

      expect(() => getConfig()).toThrow(ConfigLoadError);
    });
  });

  describe('clearConfigCache', () => {
    it('clears cached configuration', () => {
      mockExistsSync.mockReturnValue(false);

      const first = getConfig();
      clearConfigCache();

      // After clearing, getConfig will load again
      mockExistsSync.mockReturnValue(false);
      const second = getConfig();

      // They should be equal but different instances
      expect(first.usingDefaults).toBe(second.usingDefaults);
    });
  });

  describe('reloadConfig', () => {
    it('reloads configuration from file', () => {
      mockExistsSync.mockReturnValue(false);

      // Load initial config
      const initial = getConfig();
      expect(initial.usingDefaults).toBe(true);

      // Reload should return fresh result
      const reloaded = reloadConfig();
      expect(reloaded.ok).toBe(true);
      if (reloaded.ok) {
        expect(reloaded.value.usingDefaults).toBe(true);
      }
    });
  });
});
