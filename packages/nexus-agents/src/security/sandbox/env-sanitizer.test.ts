/**
 * Tests for env-sanitizer.ts
 *
 * Covers sanitizeEnvironment, validateEnvVar, createMinimalEnv,
 * looksLikeSecret, and the constant lists (SAFE_ENV_VARS,
 * DENIED_ENV_PREFIXES, DENIED_ENV_PATTERNS).
 */

import { describe, it, expect } from 'vitest';
import {
  SAFE_ENV_VARS,
  DENIED_ENV_PREFIXES,
  DENIED_ENV_PATTERNS,
  sanitizeEnvironment,
  validateEnvVar,
  createMinimalEnv,
  looksLikeSecret,
} from './env-sanitizer.js';

// ============================================================================
// Constants validation
// ============================================================================

describe('SAFE_ENV_VARS', () => {
  it('includes PATH', () => {
    expect(SAFE_ENV_VARS).toContain('PATH');
  });

  it('includes NODE_ENV', () => {
    expect(SAFE_ENV_VARS).toContain('NODE_ENV');
  });

  it('has no duplicates', () => {
    expect(new Set(SAFE_ENV_VARS).size).toBe(SAFE_ENV_VARS.length);
  });
});

describe('DENIED_ENV_PREFIXES', () => {
  it('includes API key prefixes', () => {
    expect(DENIED_ENV_PREFIXES).toContain('API_');
    expect(DENIED_ENV_PREFIXES).toContain('SECRET_');
  });

  it('includes cloud provider prefixes', () => {
    expect(DENIED_ENV_PREFIXES).toContain('AWS_');
    expect(DENIED_ENV_PREFIXES).toContain('AZURE_');
    expect(DENIED_ENV_PREFIXES).toContain('GCP_');
  });

  it('includes AI service prefixes', () => {
    expect(DENIED_ENV_PREFIXES).toContain('ANTHROPIC_');
    expect(DENIED_ENV_PREFIXES).toContain('OPENAI_');
  });
});

describe('DENIED_ENV_PATTERNS', () => {
  it('matches TOKEN suffix', () => {
    expect(DENIED_ENV_PATTERNS.some((p) => p.test('MY_TOKEN'))).toBe(true);
  });

  it('matches SECRET suffix', () => {
    expect(DENIED_ENV_PATTERNS.some((p) => p.test('APP_SECRET'))).toBe(true);
  });

  it('does not match safe var', () => {
    expect(DENIED_ENV_PATTERNS.some((p) => p.test('PATH'))).toBe(false);
  });
});

// ============================================================================
// validateEnvVar
// ============================================================================

describe('validateEnvVar', () => {
  it('returns null for safe allowed var', () => {
    expect(validateEnvVar('PATH', SAFE_ENV_VARS)).toBeNull();
  });

  it('returns violation for denied prefix', () => {
    const result = validateEnvVar('AWS_SECRET_KEY', SAFE_ENV_VARS);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('env');
    expect(result?.denied).toBe('AWS_SECRET_KEY');
  });

  it('returns violation for denied pattern', () => {
    const result = validateEnvVar('MY_TOKEN', SAFE_ENV_VARS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('denied pattern');
  });

  it('returns violation for var not in allowlist', () => {
    const result = validateEnvVar('CUSTOM_VAR', SAFE_ENV_VARS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('not in the allowlist');
  });

  it('deny list takes priority over allowlist', () => {
    // Even if we add API_KEY to allowlist, prefix check blocks it
    const result = validateEnvVar('API_KEY', ['API_KEY']);
    expect(result).not.toBeNull();
  });
});

// ============================================================================
// sanitizeEnvironment
// ============================================================================

describe('sanitizeEnvironment', () => {
  it('passes safe vars through', () => {
    const source = { PATH: '/usr/bin', HOME: '/home/user', NODE_ENV: 'test' };
    const result = sanitizeEnvironment(source, SAFE_ENV_VARS);
    expect(result.env['PATH']).toBe('/usr/bin');
    expect(result.env['HOME']).toBe('/home/user');
    expect(result.blocked).toHaveLength(0);
  });

  it('blocks denied vars', () => {
    const source = { PATH: '/usr/bin', AWS_SECRET_KEY: 'secret123' };
    const result = sanitizeEnvironment(source, SAFE_ENV_VARS);
    expect(result.env['AWS_SECRET_KEY']).toBeUndefined();
    expect(result.blocked).toContain('AWS_SECRET_KEY');
    expect(result.violations).toHaveLength(1);
  });

  it('skips undefined values', () => {
    const source: Record<string, string | undefined> = { PATH: '/usr/bin', EMPTY: undefined };
    const result = sanitizeEnvironment(source, SAFE_ENV_VARS);
    expect(Object.keys(result.env)).not.toContain('EMPTY');
  });

  it('uses SAFE_ENV_VARS when allowedVars is empty', () => {
    const source = { PATH: '/usr/bin', CUSTOM: 'val' };
    const result = sanitizeEnvironment(source, []);
    // PATH is in SAFE_ENV_VARS, CUSTOM is not
    expect(result.env['PATH']).toBe('/usr/bin');
    expect(result.blocked).toContain('CUSTOM');
  });

  it('uses custom allowlist when provided', () => {
    const source = { MY_VAR: 'val' };
    const result = sanitizeEnvironment(source, ['MY_VAR']);
    expect(result.env['MY_VAR']).toBe('val');
    expect(result.blocked).toHaveLength(0);
  });

  it('handles additionalEnv bypassing allowlist', () => {
    const result = sanitizeEnvironment({}, SAFE_ENV_VARS, { CUSTOM_FLAG: 'true' });
    expect(result.env['CUSTOM_FLAG']).toBe('true');
  });

  it('blocks additionalEnv with denied prefix', () => {
    const result = sanitizeEnvironment({}, SAFE_ENV_VARS, { AWS_KEY: 'secret' });
    expect(result.env['AWS_KEY']).toBeUndefined();
    expect(result.blocked).toContain('AWS_KEY');
  });

  it('returns correct violation count', () => {
    const source = { API_KEY: 'k1', SECRET_TOKEN: 's1', PATH: '/bin' };
    const result = sanitizeEnvironment(source, SAFE_ENV_VARS);
    expect(result.violations.length).toBe(2);
    expect(result.blocked.length).toBe(2);
  });
});

// ============================================================================
// createMinimalEnv
// ============================================================================

describe('createMinimalEnv', () => {
  it('includes PATH', () => {
    const env = createMinimalEnv();
    expect(env['PATH']).toBeDefined();
  });

  it('uses provided cwd', () => {
    const env = createMinimalEnv('/my/project');
    expect(env['PWD']).toBe('/my/project');
  });

  it('sets NODE_ENV to production', () => {
    const env = createMinimalEnv();
    expect(env['NODE_ENV']).toBe('production');
  });

  it('sets NO_COLOR to 1', () => {
    const env = createMinimalEnv();
    expect(env['NO_COLOR']).toBe('1');
  });

  it('sets CI to true', () => {
    const env = createMinimalEnv();
    expect(env['CI']).toBe('true');
  });

  it('has all expected keys', () => {
    const env = createMinimalEnv();
    const keys = Object.keys(env);
    expect(keys).toContain('PATH');
    expect(keys).toContain('HOME');
    expect(keys).toContain('USER');
    expect(keys).toContain('SHELL');
    expect(keys).toContain('TERM');
    expect(keys).toContain('LANG');
  });
});

// ============================================================================
// looksLikeSecret
// ============================================================================

describe('looksLikeSecret', () => {
  it('detects JWT tokens', () => {
    expect(
      looksLikeSecret(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      )
    ).toBe(true);
  });

  it('detects AWS keys', () => {
    expect(looksLikeSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('detects GitHub tokens', () => {
    expect(looksLikeSecret('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')).toBe(true);
  });

  it('detects hex strings', () => {
    expect(looksLikeSecret('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4')).toBe(true);
  });

  it('returns false for normal values', () => {
    expect(looksLikeSecret('hello world')).toBe(false);
  });

  it('returns false for short strings', () => {
    expect(looksLikeSecret('abc')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(looksLikeSecret('')).toBe(false);
  });
});
