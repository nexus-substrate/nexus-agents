/**
 * Config Command Handlers Tests
 *
 * Tests for config-command-handlers.ts covering handleGet, handleSet,
 * handleList, handleReset, handleExport, and handleImport.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from '../config/config-manager.js';
import { DEFAULTS } from '../config/defaults.js';
import { ConfigCommandError } from './config-command-types.js';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve('{"entries":[]}')),
}));
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('../core/index.js', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'unknown'),
  getTimeProvider: () => ({ now: () => Date.now(), nowIso: () => new Date().toISOString() }),
}));
vi.mock('./config-command-helpers.js', () => ({
  parseConfigKey: vi.fn((key: string) => {
    const dot = key.indexOf('.');
    if (dot === -1) {
      throw new ConfigCommandError('INVALID_KEY_FORMAT', 'Invalid key format: "' + key + '"');
    }
    return { fullKey: key, category: key.slice(0, dot), key: key.slice(dot + 1) };
  }),
  parseValueFromString: vi.fn((str: string, defaultVal: unknown) => {
    if (typeof defaultVal === 'number') {
      const n = Number(str);
      if (isNaN(n)) throw new ConfigCommandError('INVALID_VALUE', 'Invalid numeric value');
      return n;
    }
    if (typeof defaultVal === 'boolean') {
      if (str === 'true') return true;
      if (str === 'false') return false;
      throw new ConfigCommandError('INVALID_VALUE', 'Invalid boolean value');
    }
    return str;
  }),
  resolveFilePath: vi.fn((f: string) => '/resolved/' + f),
  getDefaultExportPath: vi.fn((fmt: string) => '/resolved/nexus-config.' + fmt),
  serializeConfig: vi.fn(() => '{"entries":[]}'),
  parseConfigFile: vi.fn(() => ({ entries: [] })),
}));

import * as fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  handleGet,
  handleSet,
  handleList,
  handleReset,
  handleExport,
  handleImport,
} from './config-command-handlers.js';
import {
  getDefaultExportPath,
  serializeConfig,
  parseConfigFile,
  resolveFilePath,
} from './config-command-helpers.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mWriteFile() {
  return vi.mocked(fsPromises.writeFile);
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mReadFile() {
  return vi.mocked(fsPromises.readFile);
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mExists() {
  return vi.mocked(existsSync);
}

beforeEach(() => {
  ConfigManager.resetInstance();
  vi.clearAllMocks();
  mExists().mockReturnValue(true);
  mWriteFile().mockImplementation(() => Promise.resolve());
  mReadFile().mockImplementation(() => Promise.resolve('{"entries":[]}'));
  vi.mocked(parseConfigFile).mockReturnValue({ entries: [] });
  vi.mocked(resolveFilePath).mockImplementation((f: string) => '/resolved/' + f);
});
afterEach(() => {
  ConfigManager.resetInstance();
});

describe('handleGet', () => {
  it('returns default value, source, and defaultValue', async () => {
    const r = await handleGet('TIMEOUT_DEFAULTS.cliMs');
    expect(r.success).toBe(true);
    expect(r.action).toBe('get');
    expect(r.key).toBe('TIMEOUT_DEFAULTS.cliMs');
    expect(r.value).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    expect(r.source).toBe('package');
    expect(r.defaultValue).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
  });
  it('returns session override when set', async () => {
    ConfigManager.getInstance().setOverride('TIMEOUT_DEFAULTS', 'cliMs', 99000, 'session');
    const r = await handleGet('TIMEOUT_DEFAULTS.cliMs');
    expect(r.value).toBe(99000);
    expect(r.source).toBe('session');
  });
  it('message contains the key', async () => {
    const r = await handleGet('RETRY_DEFAULTS.maxRetries');
    expect(r.message).toContain('RETRY_DEFAULTS.maxRetries');
  });
  it('throws ConfigCommandError for invalid key format', async () => {
    await expect(handleGet('noCategory')).rejects.toThrow(ConfigCommandError);
  });
  it('returns boolean default correctly', async () => {
    expect((await handleGet('RATE_LIMIT_DEFAULTS.enabled')).value).toBe(true);
  });
  it('returns string default correctly', async () => {
    expect((await handleGet('PROVIDER_DEFAULTS.defaultTier')).value).toBe('balanced');
  });
});

describe('handleSet', () => {
  it('sets numeric value and captures previous', async () => {
    const r = await handleSet('TIMEOUT_DEFAULTS.cliMs', '75000');
    expect(r.success).toBe(true);
    expect(r.action).toBe('set');
    expect(r.previousValue).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
    expect(r.newValue).toBe(75000);
    expect(ConfigManager.getInstance().get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(75000);
  });
  it('sets boolean value', async () => {
    const r = await handleSet('RATE_LIMIT_DEFAULTS.enabled', 'false');
    expect(r.newValue).toBe(false);
    expect(ConfigManager.getInstance().get('RATE_LIMIT_DEFAULTS', 'enabled')).toBe(false);
  });
  it('message contains key and value', async () => {
    const r = await handleSet('TIMEOUT_DEFAULTS.apiMs', '5000');
    expect(r.message).toContain('TIMEOUT_DEFAULTS.apiMs');
    expect(r.message).toContain('5000');
  });
  it('throws on invalid numeric value', async () => {
    await expect(handleSet('TIMEOUT_DEFAULTS.cliMs', 'abc')).rejects.toThrow(ConfigCommandError);
  });
  it('throws on invalid key format', async () => {
    await expect(handleSet('bad', '1')).rejects.toThrow(ConfigCommandError);
  });
  it('overwrites a previous override', async () => {
    await handleSet('TIMEOUT_DEFAULTS.cliMs', '10000');
    const r = await handleSet('TIMEOUT_DEFAULTS.cliMs', '20000');
    expect(r.previousValue).toBe(10000);
    expect(r.newValue).toBe(20000);
  });
  it('result key matches full key format', async () => {
    // Was WORKER_DEFAULTS.maxWorkers — removed in #2977. Use another valid key.
    expect((await handleSet('TIMEOUT_DEFAULTS.cliMs', '5000')).key).toBe('TIMEOUT_DEFAULTS.cliMs');
  });
});

describe('handleList', () => {
  it('returns all entries with correct total', async () => {
    const r = await handleList();
    expect(r.success).toBe(true);
    expect(r.action).toBe('list');
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.total).toBe(r.entries.length);
  });
  it('message contains entry count', async () => {
    const r = await handleList();
    expect(r.message).toContain(String(r.total));
  });
  it('entries have required string fields', async () => {
    for (const e of (await handleList()).entries) {
      expect(typeof e.category).toBe('string');
      expect(typeof e.key).toBe('string');
      expect(typeof e.source).toBe('string');
    }
  });
  it('includes expected categories', async () => {
    const cats = new Set((await handleList()).entries.map((e) => e.category));
    expect(cats.has('TIMEOUT_DEFAULTS')).toBe(true);
    expect(cats.has('RETRY_DEFAULTS')).toBe(true);
  });
  it('reflects overrides in entries', async () => {
    ConfigManager.getInstance().setOverride('TIMEOUT_DEFAULTS', 'cliMs', 12345, 'session');
    const entry = (await handleList()).entries.find(
      (e) => e.category === 'TIMEOUT_DEFAULTS' && e.key === 'cliMs'
    );
    expect(entry?.value).toBe(12345);
    expect(entry?.source).toBe('session');
  });
});

describe('handleReset', () => {
  it('resets a specific key override', async () => {
    const cfg = ConfigManager.getInstance();
    cfg.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 88000, 'session');
    const r = await handleReset('TIMEOUT_DEFAULTS.cliMs');
    expect(r.success).toBe(true);
    expect(r.action).toBe('reset');
    expect(r.keysReset).toContain('TIMEOUT_DEFAULTS.cliMs');
    expect(cfg.get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(DEFAULTS.TIMEOUT_DEFAULTS.cliMs);
  });
  it('returns empty keysReset when key has no override', async () => {
    const r = await handleReset('TIMEOUT_DEFAULTS.cliMs');
    expect(r.keysReset).toHaveLength(0);
    expect(r.message).toBe('No overrides to reset');
  });
  it('resets all overrides when no key provided', async () => {
    const cfg = ConfigManager.getInstance();
    cfg.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 50000, 'session');
    cfg.setOverride('RETRY_DEFAULTS', 'maxRetries', 10, 'session');
    const r = await handleReset();
    expect(r.keysReset).toHaveLength(2);
    expect(cfg.listOverrides()).toHaveLength(0);
  });
  it('returns empty keysReset with no overrides and no key', async () => {
    const r = await handleReset();
    expect(r.keysReset).toHaveLength(0);
    expect(r.message).toBe('No overrides to reset');
  });
  it('throws on invalid key format', async () => {
    await expect(handleReset('invalid')).rejects.toThrow(ConfigCommandError);
  });
  it('message describes count when keys were reset', async () => {
    ConfigManager.getInstance().setOverride('TIMEOUT_DEFAULTS', 'cliMs', 1, 'session');
    const r = await handleReset('TIMEOUT_DEFAULTS.cliMs');
    expect(r.message).toContain('1');
    expect(r.message).toContain('defaults');
  });
});

describe('handleExport', () => {
  it('exports to JSON with correct result fields', async () => {
    const r = await handleExport('out.json', 'json');
    expect(r.success).toBe(true);
    expect(r.action).toBe('export');
    expect(r.format).toBe('json');
    expect(r.path).toBe('/resolved/out.json');
    expect(r.entriesExported).toBeGreaterThan(0);
    expect(mWriteFile()).toHaveBeenCalledOnce();
  });
  it('exports to YAML', async () => {
    const r = await handleExport('out.yaml', 'yaml');
    expect(r.format).toBe('yaml');
    expect(r.path).toBe('/resolved/out.yaml');
  });
  it('uses default path when file is undefined', async () => {
    const r = await handleExport(undefined, 'json');
    expect(r.path).toBe('/resolved/nexus-config.json');
    expect(vi.mocked(getDefaultExportPath)).toHaveBeenCalledWith('json');
  });
  it('defaults to json format', async () => {
    expect((await handleExport('out.json')).format).toBe('json');
  });
  it('calls serializeConfig with entries and format', async () => {
    await handleExport('out.json', 'json');
    expect(vi.mocked(serializeConfig)).toHaveBeenCalledWith(expect.any(Array), 'json');
  });
  it('throws WRITE_ERROR when writeFile fails', async () => {
    mWriteFile().mockImplementation(() => Promise.reject(new Error('disk full')));
    await expect(handleExport('out.json', 'json')).rejects.toThrow(ConfigCommandError);
  });
  it('WRITE_ERROR includes underlying cause', async () => {
    mWriteFile().mockImplementation(() => Promise.reject(new Error('disk full')));
    await expect(handleExport('out.json', 'json')).rejects.toThrow(/disk full/);
  });
  it('message contains entry count and path', async () => {
    const r = await handleExport('out.json', 'json');
    expect(r.message).toContain(String(r.entriesExported));
    expect(r.message).toContain('/resolved/out.json');
  });
});

describe('handleImport', () => {
  it('imports valid entries from JSON', async () => {
    vi.mocked(parseConfigFile).mockReturnValue({
      entries: [{ category: 'TIMEOUT_DEFAULTS', key: 'cliMs', value: 42000 }],
    });
    const r = await handleImport('in.json', { force: true });
    expect(r.success).toBe(true);
    expect(r.action).toBe('import');
    expect(r.entriesImported).toBe(1);
    expect(r.path).toBe('/resolved/in.json');
  });
  it('skips entries with invalid category', async () => {
    vi.mocked(parseConfigFile).mockReturnValue({
      entries: [{ category: 'FAKE_CATEGORY', key: 'foo', value: 1 }],
    });
    expect((await handleImport('in.json', { force: true })).entriesImported).toBe(0);
  });
  it('skips entries with invalid key in valid category', async () => {
    vi.mocked(parseConfigFile).mockReturnValue({
      entries: [{ category: 'TIMEOUT_DEFAULTS', key: 'nonExistentKey', value: 1 }],
    });
    expect((await handleImport('in.json', { force: true })).entriesImported).toBe(0);
  });
  it('throws FILE_NOT_FOUND when file missing', async () => {
    mExists().mockReturnValue(false);
    await expect(handleImport('missing.json')).rejects.toThrow(ConfigCommandError);
    mExists().mockReturnValue(false);
    await expect(handleImport('missing.json')).rejects.toThrow(/File not found/);
  });
  it('throws PARSE_ERROR when readFile fails', async () => {
    mReadFile().mockImplementation(() => Promise.reject(new Error('permission denied')));
    await expect(handleImport('bad.json')).rejects.toThrow(ConfigCommandError);
  });
  it('detects yaml format from .yaml extension', async () => {
    vi.mocked(resolveFilePath).mockReturnValue('/resolved/in.yaml');
    mReadFile().mockImplementation(() => Promise.resolve('entries:\n'));
    await handleImport('in.yaml', { force: true });
    expect(vi.mocked(parseConfigFile)).toHaveBeenCalledWith(expect.any(String), 'yaml');
  });
  it('detects yaml format from .yml extension', async () => {
    vi.mocked(resolveFilePath).mockReturnValue('/resolved/in.yml');
    mReadFile().mockImplementation(() => Promise.resolve('entries:\n'));
    await handleImport('in.yml', { force: true });
    expect(vi.mocked(parseConfigFile)).toHaveBeenCalledWith(expect.any(String), 'yaml');
  });
  it('creates backup when overrides exist and force is false', async () => {
    ConfigManager.getInstance().setOverride('TIMEOUT_DEFAULTS', 'cliMs', 50000, 'session');
    expect((await handleImport('in.json')).backupPath).toBeDefined();
  });
  it('skips backup when force is true', async () => {
    ConfigManager.getInstance().setOverride('TIMEOUT_DEFAULTS', 'cliMs', 50000, 'session');
    expect((await handleImport('in.json', { force: true })).backupPath).toBeUndefined();
  });
  it('skips backup when no overrides exist', async () => {
    expect((await handleImport('in.json')).backupPath).toBeUndefined();
  });
  it('applies multiple valid entries', async () => {
    vi.mocked(parseConfigFile).mockReturnValue({
      entries: [
        { category: 'TIMEOUT_DEFAULTS', key: 'cliMs', value: 11000 },
        { category: 'RETRY_DEFAULTS', key: 'maxRetries', value: 7 },
      ],
    });
    const r = await handleImport('in.json', { force: true });
    expect(r.entriesImported).toBe(2);
    expect(ConfigManager.getInstance().get('TIMEOUT_DEFAULTS', 'cliMs')).toBe(11000);
    expect(ConfigManager.getInstance().get('RETRY_DEFAULTS', 'maxRetries')).toBe(7);
  });
  it('message contains count and path', async () => {
    vi.mocked(resolveFilePath).mockReturnValue('/resolved/in.json');
    vi.mocked(parseConfigFile).mockReturnValue({
      entries: [{ category: 'TIMEOUT_DEFAULTS', key: 'cliMs', value: 5000 }],
    });
    const r = await handleImport('in.json', { force: true });
    expect(r.message).toContain('1');
    expect(r.message).toContain('/resolved/in.json');
  });
  it('defaults options to empty object', async () => {
    expect((await handleImport('in.json')).success).toBe(true);
  });
  it('uses json format for non-yaml extensions', async () => {
    vi.mocked(resolveFilePath).mockReturnValue('/resolved/in.json');
    await handleImport('in.json', { force: true });
    expect(vi.mocked(parseConfigFile)).toHaveBeenCalledWith(expect.any(String), 'json');
  });
});
