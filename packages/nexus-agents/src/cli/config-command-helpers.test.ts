/**
 * Config Command Helpers Unit Tests
 * Tests for config-command-helpers.ts (Issue #394).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { ConfigCommandError } from './config-command-types.js';
import {
  parseConfigKey,
  parseValueFromString,
  serializeConfig,
  parseConfigFile,
  formatValue,
  formatSource,
  getValidCategories,
  getValidKeys,
  createBackup,
  resolveFilePath,
  getDefaultExportPath,
  formatHeader,
  colors,
} from './config-command-helpers.js';

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

  it('handles Infinity as invalid number', () => {
    expect(() => parseValueFromString('Infinity', 0)).toThrow(ConfigCommandError);
  });

  it('handles whitespace-only string as invalid number', () => {
    expect(() => parseValueFromString('   ', 0)).toThrow(ConfigCommandError);
  });

  it('handles case-insensitive boolean values', () => {
    expect(parseValueFromString('TRUE', true)).toBe(true);
    expect(parseValueFromString('FALSE', true)).toBe(false);
    expect(parseValueFromString('Yes', true)).toBe(true);
    expect(parseValueFromString('No', true)).toBe(false);
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

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

  it('formats user_file source', () => {
    expect(formatSource('user_file')).toContain('file');
  });

  it('formats unknown source', () => {
    const result = formatSource('custom');
    expect(result).toBe('(custom)');
  });
});

describe('formatHeader', () => {
  it('wraps text with bold ANSI codes', () => {
    const result = formatHeader('Test Header');
    expect(result).toContain('Test Header');
    expect(result).toContain(colors.bold);
    expect(result).toContain(colors.reset);
  });
});

// ============================================================================
// Category/Key Discovery Tests
// ============================================================================

describe('getValidCategories', () => {
  it('returns array of category names', () => {
    const categories = getValidCategories();
    expect(categories).toBeInstanceOf(Array);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('includes expected categories', () => {
    const categories = getValidCategories();
    expect(categories).toContain('TIMEOUT_DEFAULTS');
    expect(categories).toContain('RATE_LIMIT_DEFAULTS');
    expect(categories).toContain('RETRY_DEFAULTS');
  });
});

describe('getValidKeys', () => {
  it('returns keys for valid category', () => {
    const keys = getValidKeys('TIMEOUT_DEFAULTS');
    expect(keys).toBeInstanceOf(Array);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain('cliMs');
  });

  it('returns empty array for invalid category', () => {
    const keys = getValidKeys('NONEXISTENT_CATEGORY');
    expect(keys).toEqual([]);
  });
});

// ============================================================================
// File Operation Tests
// ============================================================================

describe('createBackup', () => {
  const testFilePath = '/tmp/nexus-test-backup-source.txt';
  const cleanupFiles: string[] = [];

  beforeEach(async () => {
    for (const f of cleanupFiles) {
      try {
        await fs.unlink(f);
      } catch {
        // Ignore
      }
    }
    cleanupFiles.length = 0;
  });

  afterEach(async () => {
    for (const f of cleanupFiles) {
      try {
        await fs.unlink(f);
      } catch {
        // Ignore
      }
    }
  });

  it('returns undefined for non-existent file', async () => {
    const result = await createBackup('/nonexistent/path/file.txt');
    expect(result).toBeUndefined();
  });

  it('creates backup for existing file', async () => {
    await fs.writeFile(testFilePath, 'test content', 'utf-8');
    cleanupFiles.push(testFilePath);

    const backupPath = await createBackup(testFilePath);
    expect(backupPath).toBeDefined();
    expect(backupPath).toContain('.backup-');

    if (backupPath !== undefined) {
      cleanupFiles.push(backupPath);
      const content = await fs.readFile(backupPath, 'utf-8');
      expect(content).toBe('test content');
    }
  });
});

describe('resolveFilePath', () => {
  it('returns absolute path unchanged', () => {
    const absPath = '/absolute/path/to/file.json';
    expect(resolveFilePath(absPath)).toBe(absPath);
  });

  it('resolves relative path from cwd', () => {
    const relPath = 'config.json';
    const resolved = resolveFilePath(relPath);
    expect(resolved).toContain(process.cwd());
    expect(resolved.endsWith('config.json')).toBe(true);
  });
});

describe('getDefaultExportPath', () => {
  it('returns json path for json format', () => {
    const path = getDefaultExportPath('json');
    expect(path.endsWith('nexus-config.json')).toBe(true);
  });

  it('returns yaml path for yaml format', () => {
    const path = getDefaultExportPath('yaml');
    expect(path.endsWith('nexus-config.yaml')).toBe(true);
  });

  it('includes cwd in path', () => {
    const path = getDefaultExportPath('json');
    expect(path).toContain(process.cwd());
  });
});

// ============================================================================
// Serialization Tests
// ============================================================================

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

  it('parses YAML with boolean values', () => {
    const yaml = `
entries:
  - category: "RATE_LIMIT_DEFAULTS"
    key: "enabled"
    value: true
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.value).toBe(true);
  });

  it('parses YAML with null values', () => {
    const yaml = `
entries:
  - category: "TEST"
    key: "nullKey"
    value: null
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.value).toBeNull();
  });

  it('parses YAML with comments', () => {
    const yaml = `
# This is a comment
version: "1.0.0"
entries:
  # Entry comment
  - category: "TIMEOUT_DEFAULTS"
    key: "cliMs"
    value: 60000
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries).toHaveLength(1);
    expect(result.version).toBe('1.0.0');
  });

  it('parses YAML without version', () => {
    const yaml = `
entries:
  - category: "TIMEOUT_DEFAULTS"
    key: "cliMs"
    value: 30000
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.version).toBeUndefined();
    expect(result.entries).toHaveLength(1);
  });
});
