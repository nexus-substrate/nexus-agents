/**
 * Config Command Unit Tests
 *
 * Tests for the config management CLI commands (Issue #360).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { ConfigManager } from '../config/config-manager.js';
import { DEFAULTS } from '../config/defaults.js';
import {
  handleGet,
  handleSet,
  handleList,
  handleReset,
  handleExport,
  handleImport,
  runConfigCommand,
  getConfigCommandHelp,
} from './config-command.js';
import { ConfigCommandError } from './config-command-types.js';
import {
  parseConfigKey,
  parseValueFromString,
  serializeConfig,
  parseConfigFile,
  formatValue,
  formatSource,
} from './config-command-helpers.js';

// ============================================================================
// Helper Tests
// ============================================================================

describe('config-command-helpers', () => {
  describe('parseConfigKey', () => {
    it('parses valid key format', () => {
      const result = parseConfigKey('TIMEOUT_DEFAULTS.cliMs');
      expect(result.category).toBe('TIMEOUT_DEFAULTS');
      expect(result.key).toBe('cliMs');
      expect(result.fullKey).toBe('TIMEOUT_DEFAULTS.cliMs');
    });

    it('throws on missing dot', () => {
      expect(() => parseConfigKey('TIMEOUT_DEFAULTS')).toThrow(ConfigCommandError);
      expect(() => parseConfigKey('TIMEOUT_DEFAULTS')).toThrow(/Expected format/);
    });

    it('throws on empty category', () => {
      expect(() => parseConfigKey('.cliMs')).toThrow(ConfigCommandError);
    });

    it('throws on empty key', () => {
      expect(() => parseConfigKey('TIMEOUT_DEFAULTS.')).toThrow(ConfigCommandError);
    });

    it('throws on invalid category', () => {
      expect(() => parseConfigKey('INVALID_CATEGORY.key')).toThrow(ConfigCommandError);
      expect(() => parseConfigKey('INVALID_CATEGORY.key')).toThrow(/Unknown category/);
    });

    it('throws on invalid key within category', () => {
      expect(() => parseConfigKey('TIMEOUT_DEFAULTS.invalidKey')).toThrow(ConfigCommandError);
      expect(() => parseConfigKey('TIMEOUT_DEFAULTS.invalidKey')).toThrow(/Unknown key/);
    });

    it('trims whitespace', () => {
      const result = parseConfigKey('  TIMEOUT_DEFAULTS.cliMs  ');
      expect(result.category).toBe('TIMEOUT_DEFAULTS');
      expect(result.key).toBe('cliMs');
    });
  });

  describe('parseValueFromString', () => {
    it('parses numeric values', () => {
      expect(parseValueFromString('42', 0)).toBe(42);
      expect(parseValueFromString('3.14', 0)).toBe(3.14);
      expect(parseValueFromString('-100', 0)).toBe(-100);
    });

    it('throws on invalid numeric values', () => {
      expect(() => parseValueFromString('not-a-number', 0)).toThrow(ConfigCommandError);
      expect(() => parseValueFromString('', 0)).toThrow(ConfigCommandError);
    });

    it('parses boolean values', () => {
      expect(parseValueFromString('true', true)).toBe(true);
      expect(parseValueFromString('false', true)).toBe(false);
      expect(parseValueFromString('1', true)).toBe(true);
      expect(parseValueFromString('0', true)).toBe(false);
      expect(parseValueFromString('yes', true)).toBe(true);
      expect(parseValueFromString('no', true)).toBe(false);
    });

    it('throws on invalid boolean values', () => {
      expect(() => parseValueFromString('maybe', true)).toThrow(ConfigCommandError);
    });

    it('returns string values as-is', () => {
      expect(parseValueFromString('hello', 'default')).toBe('hello');
      expect(parseValueFromString('', 'default')).toBe('');
    });
  });

  describe('formatValue', () => {
    it('formats strings with quotes', () => {
      expect(formatValue('hello')).toBe('"hello"');
    });

    it('formats numbers', () => {
      expect(formatValue(42)).toBe('42');
    });

    it('formats large numbers with localization', () => {
      expect(formatValue(60000)).toBe('60,000');
    });

    it('formats booleans with color', () => {
      expect(formatValue(true)).toContain('true');
      expect(formatValue(false)).toContain('false');
    });
  });

  describe('formatSource', () => {
    it('formats package source', () => {
      expect(formatSource('package')).toContain('default');
    });

    it('formats env source', () => {
      expect(formatSource('env')).toContain('env');
    });

    it('formats session source', () => {
      expect(formatSource('session')).toContain('session');
    });

    it('formats cli source', () => {
      expect(formatSource('cli')).toContain('cli');
    });
  });

  describe('serializeConfig', () => {
    const entries = [
      {
        category: 'TIMEOUT_DEFAULTS',
        key: 'cliMs',
        value: 60000,
        source: 'package',
        envVar: 'NEXUS_TIMEOUT_CLI',
      },
    ];

    it('serializes to JSON', () => {
      const result = serializeConfig(entries, 'json');
      const parsed = JSON.parse(result) as unknown;
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('entries');
    });

    it('serializes to YAML', () => {
      const result = serializeConfig(entries, 'yaml');
      expect(result).toContain('version:');
      expect(result).toContain('entries:');
      expect(result).toContain('category: "TIMEOUT_DEFAULTS"');
    });
  });

  describe('parseConfigFile', () => {
    it('parses JSON config', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        entries: [{ category: 'TIMEOUT_DEFAULTS', key: 'cliMs', value: 90000 }],
      });
      const result = parseConfigFile(json, 'json');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        category: 'TIMEOUT_DEFAULTS',
        key: 'cliMs',
        value: 90000,
      });
    });

    it('throws on invalid JSON', () => {
      expect(() => parseConfigFile('not valid json', 'json')).toThrow(ConfigCommandError);
    });

    it('parses YAML config', () => {
      const yaml = `
version: "1.0.0"
entries:
  - category: "TIMEOUT_DEFAULTS"
    key: "cliMs"
    value: 90000
`;
      const result = parseConfigFile(yaml, 'yaml');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.category).toBe('TIMEOUT_DEFAULTS');
    });
  });
});

// ============================================================================
// Command Handler Tests
// ============================================================================

describe('config-command handlers', () => {
  beforeEach(() => {
    ConfigManager.resetInstance();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    ConfigManager.resetInstance();
    vi.unstubAllEnvs();
  });

  describe('handleGet', () => {
    it('returns value for valid key', async () => {
      const result = await handleGet('TIMEOUT_DEFAULTS.cliMs');
      expect(result.success).toBe(true);
      expect(result.action).toBe('get');
      expect(result.key).toBe('TIMEOUT_DEFAULTS.cliMs');
      expect(result.value).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
      expect(result.source).toBe('package');
    });

    it('returns override value when set', async () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');

      const result = await handleGet('TIMEOUT_DEFAULTS.cliMs');
      expect(result.value).toBe(90000);
      expect(result.source).toBe('session');
    });

    it('returns env value when set', async () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', '45000');

      const result = await handleGet('TIMEOUT_DEFAULTS.cliMs');
      expect(result.value).toBe(45000);
      expect(result.source).toBe('env');
    });
  });

  describe('handleSet', () => {
    it('sets numeric value', async () => {
      const result = await handleSet('TIMEOUT_DEFAULTS.cliMs', '90000');
      expect(result.success).toBe(true);
      expect(result.action).toBe('set');
      expect(result.newValue).toBe(90000);

      // Verify it was set
      const config = ConfigManager.getInstance();
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(90000);
    });

    it('sets boolean value', async () => {
      const result = await handleSet('RATE_LIMIT_DEFAULTS.enabled', 'false');
      expect(result.success).toBe(true);
      expect(result.newValue).toBe(false);

      const config = ConfigManager.getInstance();
      expect(config.get('RATE_LIMIT_DEFAULTS', 'enabled')).toBe(false);
    });

    it('throws on invalid value type', async () => {
      await expect(handleSet('TIMEOUT_DEFAULTS.cliMs', 'not-a-number')).rejects.toThrow(
        ConfigCommandError
      );
    });
  });

  describe('handleList', () => {
    it('returns all config entries', async () => {
      const result = await handleList();
      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.entries.length);
    });

    it('includes all categories', async () => {
      const result = await handleList();
      const categories = new Set(result.entries.map((e) => e.category));
      expect(categories.has('TIMEOUT_DEFAULTS')).toBe(true);
      expect(categories.has('RATE_LIMIT_DEFAULTS')).toBe(true);
      expect(categories.has('RETRY_DEFAULTS')).toBe(true);
    });

    it('shows env var names', async () => {
      const result = await handleList();
      const cliMsEntry = result.entries.find(
        (e) => e.category === 'TIMEOUT_DEFAULTS' && e.key === 'cliMs'
      );
      expect(cliMsEntry?.envVar).toBe('NEXUS_TIMEOUT_CLI');
    });
  });

  describe('handleReset', () => {
    it('resets specific key', async () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');

      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(90000);

      const result = await handleReset('TIMEOUT_DEFAULTS.cliMs');
      expect(result.success).toBe(true);
      expect(result.keysReset).toContain('TIMEOUT_DEFAULTS.cliMs');
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    });

    it('resets all keys when no key specified', async () => {
      const config = ConfigManager.getInstance();
      config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');
      config.setOverride('RETRY_DEFAULTS', 'maxRetries', 5, 'session');

      const result = await handleReset();
      expect(result.success).toBe(true);
      expect(result.keysReset.length).toBe(2);
      expect(config.listOverrides()).toHaveLength(0);
    });

    it('returns empty keysReset when no overrides exist', async () => {
      const result = await handleReset();
      expect(result.success).toBe(true);
      expect(result.keysReset).toHaveLength(0);
    });
  });

  describe('handleExport', () => {
    const testExportPath = '/tmp/nexus-test-export.json';

    afterEach(async () => {
      try {
        await fs.unlink(testExportPath);
      } catch {
        // Ignore if doesn't exist
      }
    });

    it('exports to JSON file', async () => {
      const result = await handleExport(testExportPath, 'json');
      expect(result.success).toBe(true);
      expect(result.action).toBe('export');
      expect(result.format).toBe('json');
      expect(result.entriesExported).toBeGreaterThan(0);

      // Verify file was created
      const content = await fs.readFile(testExportPath, 'utf-8');
      const parsed = JSON.parse(content) as { entries: unknown[] };
      expect(parsed.entries).toBeDefined();
    });

    it('exports to YAML file', async () => {
      const yamlPath = '/tmp/nexus-test-export.yaml';
      try {
        const result = await handleExport(yamlPath, 'yaml');
        expect(result.success).toBe(true);
        expect(result.format).toBe('yaml');

        const content = await fs.readFile(yamlPath, 'utf-8');
        expect(content).toContain('version:');
        expect(content).toContain('entries:');
      } finally {
        try {
          await fs.unlink(yamlPath);
        } catch {
          // Ignore
        }
      }
    });
  });

  describe('handleImport', () => {
    const testImportPath = '/tmp/nexus-test-import.json';

    beforeEach(async () => {
      // Create test import file
      const data = {
        version: '1.0.0',
        entries: [
          { category: 'TIMEOUT_DEFAULTS', key: 'cliMs', value: 120000 },
          { category: 'RETRY_DEFAULTS', key: 'maxRetries', value: 5 },
        ],
      };
      await fs.writeFile(testImportPath, JSON.stringify(data), 'utf-8');
    });

    afterEach(async () => {
      try {
        await fs.unlink(testImportPath);
      } catch {
        // Ignore
      }
    });

    it('imports from JSON file', async () => {
      const result = await handleImport(testImportPath, { force: true });
      expect(result.success).toBe(true);
      expect(result.action).toBe('import');
      expect(result.entriesImported).toBe(2);

      const config = ConfigManager.getInstance();
      expect(config.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(120000);
      expect(config.get('RETRY_DEFAULTS', 'maxRetries')).toBe(5);
    });

    it('throws on missing file', async () => {
      await expect(handleImport('/nonexistent/path.json')).rejects.toThrow(ConfigCommandError);
    });

    it('skips invalid entries', async () => {
      const invalidData = {
        entries: [
          { category: 'TIMEOUT_DEFAULTS', key: 'cliMs', value: 90000 },
          { category: 'INVALID_CATEGORY', key: 'invalid', value: 'x' },
        ],
      };
      await fs.writeFile(testImportPath, JSON.stringify(invalidData), 'utf-8');

      const result = await handleImport(testImportPath, { force: true });
      expect(result.success).toBe(true);
      expect(result.entriesImported).toBe(1);
    });
  });
});

// ============================================================================
// Main Command Tests
// ============================================================================

describe('runConfigCommand', () => {
  beforeEach(() => {
    ConfigManager.resetInstance();
  });

  afterEach(() => {
    ConfigManager.resetInstance();
  });

  it('handles get action', async () => {
    const result = await runConfigCommand({
      action: 'get',
      key: 'TIMEOUT_DEFAULTS.cliMs',
    });
    expect(result.action).toBe('get');
    expect(result.success).toBe(true);
  });

  it('handles set action', async () => {
    const result = await runConfigCommand({
      action: 'set',
      key: 'TIMEOUT_DEFAULTS.cliMs',
      value: '90000',
    });
    expect(result.action).toBe('set');
    expect(result.success).toBe(true);
  });

  it('handles list action', async () => {
    const result = await runConfigCommand({ action: 'list' });
    expect(result.action).toBe('list');
    expect(result.success).toBe(true);
  });

  it('handles reset action', async () => {
    const result = await runConfigCommand({ action: 'reset' });
    expect(result.action).toBe('reset');
    expect(result.success).toBe(true);
  });

  it('throws on missing key for get', async () => {
    await expect(runConfigCommand({ action: 'get' })).rejects.toThrow(ConfigCommandError);
  });

  it('throws on missing value for set', async () => {
    await expect(
      runConfigCommand({ action: 'set', key: 'TIMEOUT_DEFAULTS.cliMs' })
    ).rejects.toThrow(ConfigCommandError);
  });

  it('throws on missing file for import', async () => {
    await expect(runConfigCommand({ action: 'import' })).rejects.toThrow(ConfigCommandError);
  });
});

// ============================================================================
// Help Tests
// ============================================================================

describe('getConfigCommandHelp', () => {
  it('returns help text', () => {
    const help = getConfigCommandHelp();
    expect(help).toContain('config');
    expect(help).toContain('get');
    expect(help).toContain('set');
    expect(help).toContain('list');
    expect(help).toContain('reset');
    expect(help).toContain('export');
    expect(help).toContain('import');
    expect(help).toContain('TIMEOUT_DEFAULTS');
  });
});
