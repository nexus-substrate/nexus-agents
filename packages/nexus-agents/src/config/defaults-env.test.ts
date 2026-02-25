/**
 * Tests for defaults-env.ts
 *
 * Covers parseIntEnv, parseFloatEnv, and parseBoolEnv.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { parseIntEnv, parseFloatEnv, parseBoolEnv } from './defaults-env.js';

// ============================================================================
// Helpers
// ============================================================================

const TEST_KEY = 'NEXUS_TEST_ENV_VAR_XYZ';

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete process.env[TEST_KEY];
});

// ============================================================================
// parseIntEnv
// ============================================================================

describe('parseIntEnv', () => {
  it('returns fallback when env var is undefined', () => {
    expect(parseIntEnv(TEST_KEY, 42)).toBe(42);
  });

  it('parses valid integer from env', () => {
    process.env[TEST_KEY] = '100';
    expect(parseIntEnv(TEST_KEY, 42)).toBe(100);
  });

  it('returns fallback for non-numeric env var', () => {
    process.env[TEST_KEY] = 'not-a-number';
    expect(parseIntEnv(TEST_KEY, 42)).toBe(42);
  });

  it('returns fallback for zero value', () => {
    process.env[TEST_KEY] = '0';
    expect(parseIntEnv(TEST_KEY, 42)).toBe(42);
  });

  it('returns fallback for negative value', () => {
    process.env[TEST_KEY] = '-5';
    expect(parseIntEnv(TEST_KEY, 42)).toBe(42);
  });

  it('parses positive integers correctly', () => {
    process.env[TEST_KEY] = '5000';
    expect(parseIntEnv(TEST_KEY, 42)).toBe(5000);
  });
});

// ============================================================================
// parseFloatEnv
// ============================================================================

describe('parseFloatEnv', () => {
  it('returns fallback when env var is undefined', () => {
    expect(parseFloatEnv(TEST_KEY, 0.5)).toBe(0.5);
  });

  it('parses valid float from env', () => {
    process.env[TEST_KEY] = '0.75';
    expect(parseFloatEnv(TEST_KEY, 0.5)).toBe(0.75);
  });

  it('returns fallback for non-numeric env var', () => {
    process.env[TEST_KEY] = 'abc';
    expect(parseFloatEnv(TEST_KEY, 0.5)).toBe(0.5);
  });

  it('accepts zero', () => {
    process.env[TEST_KEY] = '0';
    expect(parseFloatEnv(TEST_KEY, 0.5)).toBe(0);
  });

  it('accepts negative values', () => {
    process.env[TEST_KEY] = '-1.5';
    expect(parseFloatEnv(TEST_KEY, 0.5)).toBe(-1.5);
  });
});

// ============================================================================
// parseBoolEnv
// ============================================================================

describe('parseBoolEnv', () => {
  it('returns fallback when env var is undefined', () => {
    expect(parseBoolEnv(TEST_KEY, true)).toBe(true);
    expect(parseBoolEnv(TEST_KEY, false)).toBe(false);
  });

  it('returns false for "false" string', () => {
    process.env[TEST_KEY] = 'false';
    expect(parseBoolEnv(TEST_KEY, true)).toBe(false);
  });

  it('returns true for "true" string', () => {
    process.env[TEST_KEY] = 'true';
    expect(parseBoolEnv(TEST_KEY, false)).toBe(true);
  });

  it('returns true for "1" string', () => {
    process.env[TEST_KEY] = '1';
    expect(parseBoolEnv(TEST_KEY, false)).toBe(true);
  });

  it('returns false for "0" string', () => {
    process.env[TEST_KEY] = '0';
    expect(parseBoolEnv(TEST_KEY, true)).toBe(false);
  });

  it('returns fallback for unrecognized values', () => {
    process.env[TEST_KEY] = 'yes';
    expect(parseBoolEnv(TEST_KEY, false)).toBe(false);
    process.env[TEST_KEY] = '';
    expect(parseBoolEnv(TEST_KEY, false)).toBe(false);
    process.env[TEST_KEY] = 'garbage';
    expect(parseBoolEnv(TEST_KEY, true)).toBe(true);
  });
});
