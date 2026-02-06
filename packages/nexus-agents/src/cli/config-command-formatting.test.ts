/**
 * Tests for config-command-formatting.ts
 *
 * Covers formatSource, formatValue, and formatHeader.
 */

import { describe, it, expect } from 'vitest';
import { formatSource, formatValue, formatHeader, colors } from './config-command-formatting.js';

// ============================================================================
// formatSource
// ============================================================================

describe('formatSource', () => {
  it('formats package as dim default', () => {
    const result = formatSource('package');
    expect(result).toContain('(default)');
    expect(result).toContain(colors.dim);
  });

  it('formats env in cyan', () => {
    const result = formatSource('env');
    expect(result).toContain('(env)');
    expect(result).toContain(colors.cyan);
  });

  it('formats session in yellow', () => {
    const result = formatSource('session');
    expect(result).toContain('(session)');
    expect(result).toContain(colors.yellow);
  });

  it('formats cli in magenta', () => {
    const result = formatSource('cli');
    expect(result).toContain('(cli)');
    expect(result).toContain(colors.magenta);
  });

  it('formats user_file in green', () => {
    const result = formatSource('user_file');
    expect(result).toContain('(file)');
    expect(result).toContain(colors.green);
  });

  it('formats unknown source as plain text', () => {
    const result = formatSource('custom');
    expect(result).toBe('(custom)');
  });
});

// ============================================================================
// formatValue
// ============================================================================

describe('formatValue', () => {
  it('quotes strings', () => {
    expect(formatValue('hello')).toBe('"hello"');
  });

  it('formats small numbers as-is', () => {
    expect(formatValue(42)).toBe('42');
  });

  it('formats large numbers with locale formatting', () => {
    const result = formatValue(5000);
    // en-US locale uses commas
    expect(result).toContain('5');
  });

  it('formats true as green', () => {
    const result = formatValue(true);
    expect(result).toContain(colors.green);
    expect(result).toContain('true');
  });

  it('formats false as red', () => {
    const result = formatValue(false);
    expect(result).toContain(colors.red);
    expect(result).toContain('false');
  });

  it('formats objects as JSON', () => {
    const result = formatValue({ key: 'value' });
    expect(result).toBe('{"key":"value"}');
  });

  it('formats null as JSON', () => {
    expect(formatValue(null)).toBe('null');
  });
});

// ============================================================================
// formatHeader
// ============================================================================

describe('formatHeader', () => {
  it('wraps text in bold', () => {
    const result = formatHeader('Title');
    expect(result).toBe(`${colors.bold}Title${colors.reset}`);
  });
});
