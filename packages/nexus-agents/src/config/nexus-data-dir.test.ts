/**
 * Tests for getNexusDataDir() helper (#2302, child of #2301).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { getNexusDataDir, nexusDataPath, resetNexusDataDirCache } from './nexus-data-dir.js';

describe('getNexusDataDir', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_DATA_DIR'];
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalEnv;
    resetNexusDataDirCache();
  });

  it('falls back to <homedir>/.nexus-agents when env var is unset', () => {
    expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
  });

  it('uses NEXUS_DATA_DIR when set to an absolute path', () => {
    process.env['NEXUS_DATA_DIR'] = '/var/lib/nexus-portable';
    expect(getNexusDataDir()).toBe('/var/lib/nexus-portable');
  });

  it('resolves relative NEXUS_DATA_DIR against process.cwd() at first call', () => {
    process.env['NEXUS_DATA_DIR'] = '.nexus-agents';
    const result = getNexusDataDir();
    expect(isAbsolute(result)).toBe(true);
    expect(result).toBe(resolve('.nexus-agents'));
  });

  it('treats empty string env var as unset (homedir fallback)', () => {
    process.env['NEXUS_DATA_DIR'] = '';
    expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
  });

  it('treats whitespace-only env var as unset (homedir fallback)', () => {
    process.env['NEXUS_DATA_DIR'] = '   ';
    expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
  });

  it('re-reads the env var on every call (no caching)', () => {
    process.env['NEXUS_DATA_DIR'] = '/first';
    expect(getNexusDataDir()).toBe('/first');
    process.env['NEXUS_DATA_DIR'] = '/second';
    expect(getNexusDataDir()).toBe('/second');
  });

  it('resetNexusDataDirCache() is a documented no-op', () => {
    expect(() => {
      resetNexusDataDirCache();
    }).not.toThrow();
  });

  it('handles paths with trailing whitespace by trimming', () => {
    process.env['NEXUS_DATA_DIR'] = '  /trimmed  ';
    expect(getNexusDataDir()).toBe('/trimmed');
  });
});

describe('nexusDataPath', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_DATA_DIR'];
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalEnv;
    resetNexusDataDirCache();
  });

  it('joins segments under the resolved data dir (homedir default)', () => {
    expect(nexusDataPath('audit', 'log.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'audit', 'log.jsonl')
    );
  });

  it('joins segments under NEXUS_DATA_DIR when set', () => {
    process.env['NEXUS_DATA_DIR'] = '/var/nexus';
    expect(nexusDataPath('memory', 'beliefs.json')).toBe('/var/nexus/memory/beliefs.json');
  });

  it('returns the data dir itself when called with no segments', () => {
    process.env['NEXUS_DATA_DIR'] = '/var/nexus';
    expect(nexusDataPath()).toBe('/var/nexus');
  });
});
