/**
 * env-schema - Unit Tests (Issue #1016)
 *
 * Tests for centralized NEXUS_* environment variable validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateNexusEnv, getKnownNexusVarNames } from './env-schema.js';

describe('env-schema', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateNexusEnv', () => {
    it('returns no warnings for valid env vars', () => {
      vi.stubEnv('NEXUS_V2_MODE', 'full');
      vi.stubEnv('NEXUS_LOG_LEVEL', 'debug');
      vi.stubEnv('NEXUS_TIMEOUT_CLI', '30000');
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('returns no warnings when no NEXUS_* vars are set', () => {
      // Clear all NEXUS_* vars via stubEnv
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('NEXUS_')) {
          vi.stubEnv(key, undefined as unknown as string);
        }
      }
      const result = validateNexusEnv();
      expect(result.unknownVars).toHaveLength(0);
      expect(result.invalidVars).toHaveLength(0);
    });

    it('detects unknown var with typo suggestion', () => {
      vi.stubEnv('NEXUS_PERIST_LEARNING', 'true');
      const result = validateNexusEnv();
      expect(result.unknownVars.length).toBeGreaterThanOrEqual(1);
      const typo = result.unknownVars.find((u) => u.name === 'NEXUS_PERIST_LEARNING');
      expect(typo).toBeDefined();
      expect(typo?.suggestion).toBe('NEXUS_PERSIST_LEARNING');
    });

    it('detects unknown var with no suggestion when too distant', () => {
      vi.stubEnv('NEXUS_FOOBAR_XYZZY_RANDOM', 'true');
      const result = validateNexusEnv();
      const entry = result.unknownVars.find((u) => u.name === 'NEXUS_FOOBAR_XYZZY_RANDOM');
      expect(entry).toBeDefined();
      expect(entry?.suggestion).toBeNull();
    });

    it('detects invalid enum value for NEXUS_V2_MODE', () => {
      vi.stubEnv('NEXUS_V2_MODE', 'invalid');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_V2_MODE');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('invalid');
    });

    it('detects invalid integer value for NEXUS_TIMEOUT_CLI', () => {
      vi.stubEnv('NEXUS_TIMEOUT_CLI', 'abc');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_TIMEOUT_CLI');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('abc');
    });

    it('detects invalid boolean value for NEXUS_AUTH_ENABLED', () => {
      vi.stubEnv('NEXUS_AUTH_ENABLED', 'maybe');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_AUTH_ENABLED');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('maybe');
    });

    it('detects invalid log level', () => {
      vi.stubEnv('NEXUS_LOG_LEVEL', 'verbose');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_LOG_LEVEL');
      expect(inv).toBeDefined();
      expect(inv?.value).toBe('verbose');
    });

    it('reports multiple issues simultaneously', () => {
      vi.stubEnv('NEXUS_PERIST_LEARNING', 'true');
      vi.stubEnv('NEXUS_V2_MODE', 'invalid');
      vi.stubEnv('NEXUS_TIMEOUT_CLI', 'not-a-number');
      const result = validateNexusEnv();
      expect(result.unknownVars.length).toBeGreaterThanOrEqual(1);
      expect(result.invalidVars.length).toBeGreaterThanOrEqual(2);
    });

    it('accepts all valid boolean values', () => {
      vi.stubEnv('NEXUS_AUTH_ENABLED', 'true');
      const result = validateNexusEnv();
      const boolInvalids = result.invalidVars.filter((v) => v.name === 'NEXUS_AUTH_ENABLED');
      expect(boolInvalids).toHaveLength(0);
    });

    it('accepts valid NEXUS_REFLECTIVE_MEMORY shadow mode', () => {
      vi.stubEnv('NEXUS_REFLECTIVE_MEMORY', 'shadow');
      const result = validateNexusEnv();
      const inv = result.invalidVars.find((v) => v.name === 'NEXUS_REFLECTIVE_MEMORY');
      expect(inv).toBeUndefined();
    });

    it('logs warnings when logger is provided', () => {
      vi.stubEnv('NEXUS_PERIST_LEARNING', 'true');
      vi.stubEnv('NEXUS_V2_MODE', 'invalid');
      const warnings: string[] = [];
      const mockLogger = {
        warn: (msg: string) => warnings.push(msg),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      } as unknown as import('../core/index.js').ILogger;

      validateNexusEnv(mockLogger);

      expect(warnings.length).toBeGreaterThanOrEqual(2);
      expect(warnings.some((w) => w.includes('NEXUS_PERIST_LEARNING'))).toBe(true);
      expect(warnings.some((w) => w.includes('did you mean NEXUS_PERSIST_LEARNING'))).toBe(true);
      expect(warnings.some((w) => w.includes('NEXUS_V2_MODE'))).toBe(true);
    });

    it('suggests NEXUS_V2_DELEGATE for NEXUS_V2_DELEATE', () => {
      vi.stubEnv('NEXUS_V2_DELEATE', 'true');
      const result = validateNexusEnv();
      const entry = result.unknownVars.find((u) => u.name === 'NEXUS_V2_DELEATE');
      expect(entry).toBeDefined();
      expect(entry?.suggestion).toBe('NEXUS_V2_DELEGATE');
    });
  });

  describe('getKnownNexusVarNames', () => {
    it('returns a non-empty array of known variable names', () => {
      const names = getKnownNexusVarNames();
      expect(names.length).toBeGreaterThan(40);
    });

    it('includes core known variables', () => {
      const names = getKnownNexusVarNames();
      expect(names).toContain('NEXUS_TIMEOUT_CLI');
      expect(names).toContain('NEXUS_V2_MODE');
      expect(names).toContain('NEXUS_LOG_LEVEL');
      expect(names).toContain('NEXUS_PERSIST_LEARNING');
      expect(names).toContain('NEXUS_AUTH_ENABLED');
      expect(names).toContain('NEXUS_BILLING_MODE');
    });

    it('all names start with NEXUS_', () => {
      const names = getKnownNexusVarNames();
      for (const name of names) {
        expect(name).toMatch(/^NEXUS_/);
      }
    });
  });
});
