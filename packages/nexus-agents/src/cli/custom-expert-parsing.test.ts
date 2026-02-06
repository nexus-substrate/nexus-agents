/**
 * Tests for custom-expert-parsing
 *
 * Covers: parseYaml, extractRawExpertConfig, processCustomExperts,
 * findConfigPath, resolveConfigPath, readConfigContent.
 * (Source: Issue #300)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  parseYaml,
  extractRawExpertConfig,
  processCustomExperts,
  findConfigPath,
  resolveConfigPath,
  readConfigContent,
} from './custom-expert-parsing.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('custom-expert-parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['NEXUS_CONFIG_PATH'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── parseYaml ──────────────────────────────────────────────────────

  describe('parseYaml', () => {
    it('should parse valid YAML and return ok result', () => {
      const result = parseYaml('key: value');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ key: 'value' });
      }
    });

    it('should parse nested YAML structures', () => {
      const yaml = 'a:\n  b: 1\n  c: true';
      const result = parseYaml(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ a: { b: 1, c: true } });
      }
    });

    it('should parse empty string as null', () => {
      const result = parseYaml('');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should parse arrays correctly', () => {
      const result = parseYaml('items:\n  - a\n  - b');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ items: ['a', 'b'] });
      }
    });

    it('should return error for invalid YAML', () => {
      const result = parseYaml('{ invalid yaml: [}');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('YAML parse error');
      }
    });
  });

  // ── extractRawExpertConfig ─────────────────────────────────────────

  describe('extractRawExpertConfig', () => {
    it('should return undefined for null input', () => {
      const result = extractRawExpertConfig(null);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return undefined for non-object input', () => {
      const result = extractRawExpertConfig('string');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return undefined for number input', () => {
      const result = extractRawExpertConfig(42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return undefined when experts key is missing', () => {
      const result = extractRawExpertConfig({ models: {} });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return undefined when experts is null', () => {
      const result = extractRawExpertConfig({ experts: null });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return undefined when experts is a string', () => {
      const result = extractRawExpertConfig({ experts: 'nope' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return undefined when custom key is missing', () => {
      const result = extractRawExpertConfig({ experts: { builtin: true } });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('should return error when custom is a non-object', () => {
      const result = extractRawExpertConfig({ experts: { custom: 'bad' } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0]?.message).toContain('must be an object');
      }
    });

    it('should return error when custom is null', () => {
      const result = extractRawExpertConfig({ experts: { custom: null } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0]?.field).toBe('custom');
      }
    });

    it('should return custom experts object when valid', () => {
      const custom = { my_expert: { systemPrompt: 'hi' } };
      const parsed = { experts: { custom } };
      const result = extractRawExpertConfig(parsed);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(custom);
      }
    });
  });

  // ── processCustomExperts ───────────────────────────────────────────

  describe('processCustomExperts', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const validDef = (overrides: Record<string, unknown> = {}) => ({
      systemPrompt: 'You are an expert.',
      tier: 'balanced',
      domain: 'code',
      capabilities: ['task_execution'],
      ...overrides,
    });

    it('should convert a valid expert definition', () => {
      const { experts, errors } = processCustomExperts({
        my_expert: validDef(),
      });
      expect(errors).toEqual([]);
      expect(experts).toHaveLength(1);
      expect(experts[0]).toMatchObject({
        id: 'custom-my_expert',
        role: 'custom',
        name: 'My Expert',
        primaryDomain: 'code',
        capabilities: ['task_execution'],
        available: true,
        weight: 1.0,
      });
    });

    it('should format multi-word IDs as names', () => {
      const { experts } = processCustomExperts({
        rust_systems_guru: validDef(),
      });
      expect(experts[0]?.name).toBe('Rust Systems Guru');
    });

    it('should use description from definition when provided', () => {
      const { experts } = processCustomExperts({
        my_expert: validDef({ description: 'My desc' }),
      });
      expect(experts[0]?.description).toBe('My desc');
    });

    it('should fallback to default description when omitted', () => {
      const { experts } = processCustomExperts({
        my_expert: validDef(),
      });
      expect(experts[0]?.description).toContain('Custom expert: my_expert');
    });

    it('should handle secondary domains', () => {
      const { experts } = processCustomExperts({
        my_expert: validDef({ secondaryDomains: ['testing', 'security'] }),
      });
      expect(experts[0]?.secondaryDomains).toEqual(['testing', 'security']);
    });

    it('should default secondaryDomains to empty array', () => {
      const { experts } = processCustomExperts({
        my_expert: validDef(),
      });
      expect(experts[0]?.secondaryDomains).toEqual([]);
    });

    it('should reject invalid expert ID with uppercase', () => {
      const { experts, errors } = processCustomExperts({
        BadId: validDef(),
      });
      expect(experts).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe('id');
      expect(errors[0]?.suggestion).toContain('lowercase');
    });

    it('should reject ID starting with a number', () => {
      const { experts, errors } = processCustomExperts({
        '9expert': validDef(),
      });
      expect(experts).toHaveLength(0);
      expect(errors[0]?.field).toBe('id');
    });

    it('should reject ID with hyphens', () => {
      const { errors } = processCustomExperts({
        'my-expert': validDef(),
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.expertId).toBe('my-expert');
    });

    it('should report validation errors for invalid tier', () => {
      const { experts, errors } = processCustomExperts({
        my_expert: validDef({ tier: 'mega' }),
      });
      expect(experts).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.expertId).toBe('my_expert');
    });

    it('should process mix of valid and invalid experts', () => {
      const { experts, errors } = processCustomExperts({
        good_expert: validDef(),
        'Bad-Expert': validDef(),
        another_good: validDef({ domain: 'security' }),
      });
      expect(experts).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.expertId).toBe('Bad-Expert');
    });

    it('should handle empty input', () => {
      const { experts, errors } = processCustomExperts({});
      expect(experts).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('should reject missing systemPrompt', () => {
      const { errors } = processCustomExperts({
        my_expert: { tier: 'balanced', domain: 'code', capabilities: ['a'] },
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ── findConfigPath ─────────────────────────────────────────────────

  describe('findConfigPath', () => {
    it('should return cwd config when it exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const result = findConfigPath();
      expect(result.path).toBeDefined();
      expect(result.securityError).toBeUndefined();
    });

    it('should return empty when no config exists', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = findConfigPath();
      expect(result.path).toBeUndefined();
      expect(result.securityError).toBeUndefined();
    });

    it('should use NEXUS_CONFIG_PATH when set and valid', () => {
      process.env['NEXUS_CONFIG_PATH'] = 'sub/config.yaml';
      vi.mocked(existsSync).mockReturnValue(true);
      const result = findConfigPath();
      expect(result.path).toContain('sub/config.yaml');
    });

    it('should return security error for path traversal', () => {
      process.env['NEXUS_CONFIG_PATH'] = '../../../etc/passwd';
      vi.mocked(existsSync).mockReturnValue(true);
      const result = findConfigPath();
      expect(result.securityError).toBeDefined();
      expect(result.path).toBeUndefined();
    });

    it('should fall through to cwd if env path does not exist', () => {
      process.env['NEXUS_CONFIG_PATH'] = 'missing.yaml';
      vi.mocked(existsSync).mockImplementation((p) => {
        return String(p).endsWith('nexus-agents.yaml');
      });
      const result = findConfigPath();
      expect(result.path).toContain('nexus-agents.yaml');
    });

    it('should skip empty env var', () => {
      process.env['NEXUS_CONFIG_PATH'] = '';
      vi.mocked(existsSync).mockReturnValue(false);
      const result = findConfigPath();
      expect(result.securityError).toBeUndefined();
    });
  });

  // ── resolveConfigPath ──────────────────────────────────────────────

  describe('resolveConfigPath', () => {
    it('should return explicit path directly', () => {
      const result = resolveConfigPath('/explicit/path.yaml');
      expect(result.path).toBe('/explicit/path.yaml');
      expect(result.error).toBeUndefined();
    });

    it('should auto-detect when path is undefined', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const result = resolveConfigPath(undefined);
      expect(result.path).toBeDefined();
    });

    it('should return error for path traversal via env', () => {
      process.env['NEXUS_CONFIG_PATH'] = '../../../../etc/shadow';
      const result = resolveConfigPath(undefined);
      expect(result.error).toBeDefined();
      expect(result.error?.field).toBe('path');
      expect(result.error?.suggestion).toContain('current working directory');
    });

    it('should return empty when no config found', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = resolveConfigPath(undefined);
      expect(result.path).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  // ── readConfigContent ──────────────────────────────────────────────

  describe('readConfigContent', () => {
    it('should read file content successfully', () => {
      vi.mocked(readFileSync).mockReturnValue('key: val');
      const result = readConfigContent('/some/file.yaml');
      expect(result.content).toBe('key: val');
      expect(result.error).toBeUndefined();
    });

    it('should return error on read failure', () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: file not found');
      });
      const result = readConfigContent('/missing.yaml');
      expect(result.content).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Failed to read config file');
      expect(result.error?.message).toContain('ENOENT');
    });

    it('should return error on permission denied', () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      const result = readConfigContent('/protected.yaml');
      expect(result.error?.message).toContain('permission denied');
    });
  });
});
