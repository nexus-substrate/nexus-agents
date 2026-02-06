/**
 * Tests for config-command-serialization.ts
 *
 * Covers serializeConfig (JSON/YAML), parseConfigFile (JSON/YAML),
 * and validation of imported data.
 */

import { describe, it, expect } from 'vitest';
import { serializeConfig, parseConfigFile } from './config-command-serialization.js';
import { ConfigCommandError } from './config-command-types.js';
import type { ConfigListEntry } from './config-command-types.js';

// ============================================================================
// Fixtures
// ============================================================================

const SAMPLE_ENTRIES: ConfigListEntry[] = [
  {
    category: 'logging',
    key: 'level',
    value: 'info',
    source: 'default',
    envVar: 'NEXUS_LOG_LEVEL',
  },
  { category: 'routing', key: 'timeout', value: 5000, source: 'config', envVar: undefined },
  {
    category: 'security',
    key: 'enabled',
    value: true,
    source: 'env',
    envVar: 'NEXUS_AUTH_ENABLED',
  },
];

// ============================================================================
// serializeConfig - JSON
// ============================================================================

describe('serializeConfig - JSON', () => {
  it('serializes entries as JSON', () => {
    const result = serializeConfig(SAMPLE_ENTRIES, 'json');
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['version']).toBeDefined();
    expect(parsed['exportedAt']).toBeDefined();
    expect(Array.isArray(parsed['entries'])).toBe(true);
  });

  it('preserves entry data', () => {
    const result = serializeConfig(SAMPLE_ENTRIES, 'json');
    const parsed = JSON.parse(result) as { entries: ConfigListEntry[] };
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]?.category).toBe('logging');
    expect(parsed.entries[0]?.key).toBe('level');
    expect(parsed.entries[1]?.value).toBe(5000);
    expect(parsed.entries[2]?.value).toBe(true);
  });

  it('formats as pretty JSON', () => {
    const result = serializeConfig([], 'json');
    expect(result).toContain('\n'); // pretty-printed
  });

  it('handles empty entries', () => {
    const result = serializeConfig([], 'json');
    const parsed = JSON.parse(result) as { entries: unknown[] };
    expect(parsed.entries).toEqual([]);
  });
});

// ============================================================================
// serializeConfig - YAML
// ============================================================================

describe('serializeConfig - YAML', () => {
  it('serializes entries as YAML', () => {
    const result = serializeConfig(SAMPLE_ENTRIES, 'yaml');
    expect(result).toContain('entries:');
    expect(result).toContain('category: "logging"');
    expect(result).toContain('key: "level"');
  });

  it('includes header comments', () => {
    const result = serializeConfig([], 'yaml');
    expect(result).toContain('# Nexus Agents Configuration Export');
  });

  it('includes version and exportedAt', () => {
    const result = serializeConfig([], 'yaml');
    expect(result).toContain('version:');
    expect(result).toContain('exportedAt:');
  });

  it('includes envVar when present', () => {
    const result = serializeConfig(SAMPLE_ENTRIES, 'yaml');
    expect(result).toContain('envVar: "NEXUS_LOG_LEVEL"');
  });

  it('omits envVar when undefined', () => {
    const entries: ConfigListEntry[] = [
      { category: 'test', key: 'k', value: 'v', source: 'default', envVar: undefined },
    ];
    const result = serializeConfig(entries, 'yaml');
    // Should not contain envVar for this entry
    const lines = result.split('\n');
    const entryLines = lines.filter((l) => l.includes('envVar'));
    expect(entryLines).toHaveLength(0);
  });

  it('formats different value types', () => {
    const entries: ConfigListEntry[] = [
      { category: 'a', key: 'str', value: 'hello', source: 's', envVar: undefined },
      { category: 'a', key: 'num', value: 42, source: 's', envVar: undefined },
      { category: 'a', key: 'bool', value: true, source: 's', envVar: undefined },
      { category: 'a', key: 'nul', value: null, source: 's', envVar: undefined },
    ];
    const result = serializeConfig(entries, 'yaml');
    expect(result).toContain('"hello"');
    expect(result).toContain('42');
    expect(result).toContain('true');
    expect(result).toContain('null');
  });
});

// ============================================================================
// parseConfigFile - JSON
// ============================================================================

describe('parseConfigFile - JSON', () => {
  it('parses valid JSON config', () => {
    const json = JSON.stringify({
      version: '1.0.0',
      entries: [{ category: 'test', key: 'k', value: 'v' }],
    });
    const result = parseConfigFile(json, 'json');
    expect(result.version).toBe('1.0.0');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.category).toBe('test');
  });

  it('throws on invalid JSON syntax', () => {
    expect(() => parseConfigFile('{ invalid }', 'json')).toThrow(ConfigCommandError);
  });

  it('throws on non-object data', () => {
    expect(() => parseConfigFile('"string"', 'json')).toThrow(ConfigCommandError);
  });

  it('throws when entries array is missing', () => {
    expect(() => parseConfigFile('{"version": "1.0.0"}', 'json')).toThrow(ConfigCommandError);
  });

  it('skips invalid entries gracefully', () => {
    const json = JSON.stringify({
      entries: [
        { category: 'ok', key: 'k', value: 'v' },
        'not an object',
        { noCategory: true },
        null,
      ],
    });
    const result = parseConfigFile(json, 'json');
    expect(result.entries).toHaveLength(1);
  });

  it('omits version when not present', () => {
    const json = JSON.stringify({
      entries: [{ category: 'test', key: 'k', value: 'v' }],
    });
    const result = parseConfigFile(json, 'json');
    expect(result.version).toBeUndefined();
  });
});

// ============================================================================
// parseConfigFile - YAML
// ============================================================================

describe('parseConfigFile - YAML', () => {
  it('parses valid YAML config', () => {
    const yaml = `
version: "1.0.0"
entries:
  - category: "logging"
    key: "level"
    value: "info"
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.version).toBe('1.0.0');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.key).toBe('level');
    expect(result.entries[0]?.value).toBe('info');
  });

  it('skips comments and blank lines', () => {
    const yaml = `
# This is a comment
version: "2.0.0"

# Another comment
entries:
  - category: "test"
    key: "k"
    value: "v"
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.version).toBe('2.0.0');
    expect(result.entries).toHaveLength(1);
  });

  it('parses boolean values', () => {
    const yaml = `entries:
  - category: "test"
    key: "enabled"
    value: true
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries[0]?.value).toBe(true);
  });

  it('parses null values', () => {
    const yaml = `entries:
  - category: "test"
    key: "optional"
    value: null
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries[0]?.value).toBeNull();
  });

  it('parses numeric values', () => {
    const yaml = `entries:
  - category: "test"
    key: "timeout"
    value: 5000
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries[0]?.value).toBe(5000);
  });

  it('handles quoted strings', () => {
    const yaml = `entries:
  - category: "test"
    key: "name"
    value: "hello world"
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries[0]?.value).toBe('hello world');
  });

  it('handles empty input', () => {
    const result = parseConfigFile('', 'yaml');
    expect(result.entries).toEqual([]);
    expect(result.version).toBeUndefined();
  });

  it('handles multiple entries', () => {
    const yaml = `entries:
  - category: "a"
    key: "k1"
    value: "v1"
  - category: "b"
    key: "k2"
    value: "v2"
`;
    const result = parseConfigFile(yaml, 'yaml');
    expect(result.entries).toHaveLength(2);
  });
});

// ============================================================================
// Round-trip test
// ============================================================================

describe('serializeConfig/parseConfigFile round-trip', () => {
  it('JSON round-trips correctly', () => {
    const serialized = serializeConfig(SAMPLE_ENTRIES, 'json');
    const parsed = parseConfigFile(serialized, 'json');
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]?.category).toBe('logging');
    expect(parsed.entries[0]?.key).toBe('level');
    expect(parsed.entries[0]?.value).toBe('info');
    expect(parsed.entries[1]?.value).toBe(5000);
    expect(parsed.entries[2]?.value).toBe(true);
  });

  it('YAML round-trips correctly', () => {
    const serialized = serializeConfig(SAMPLE_ENTRIES, 'yaml');
    const parsed = parseConfigFile(serialized, 'yaml');
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]?.category).toBe('logging');
    expect(parsed.entries[0]?.key).toBe('level');
    expect(parsed.entries[0]?.value).toBe('info');
    expect(parsed.entries[1]?.value).toBe(5000);
    expect(parsed.entries[2]?.value).toBe(true);
  });
});
