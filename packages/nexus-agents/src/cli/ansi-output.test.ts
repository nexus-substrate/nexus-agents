/**
 * Tests for ansi-output.ts
 *
 * Covers colors, symbols, colorize, color, bold, dim,
 * formatStatus, formatHeader, formatCodeBlock, formatBoolean.
 */

import { describe, it, expect } from 'vitest';
import {
  colors,
  symbols,
  colorize,
  color,
  bold,
  dim,
  formatStatus,
  formatHeader,
  formatCodeBlock,
  formatBoolean,
} from './ansi-output.js';

// ============================================================================
// Colors and symbols constants
// ============================================================================

describe('colors', () => {
  it('has reset code', () => {
    expect(colors.reset).toBe('\x1b[0m');
  });

  it('has all expected color codes', () => {
    expect(colors.green).toBeDefined();
    expect(colors.red).toBeDefined();
    expect(colors.yellow).toBeDefined();
    expect(colors.cyan).toBeDefined();
    expect(colors.dim).toBeDefined();
    expect(colors.bold).toBeDefined();
    expect(colors.magenta).toBeDefined();
    expect(colors.blue).toBeDefined();
    expect(colors.white).toBeDefined();
    expect(colors.gray).toBeDefined();
  });
});

describe('symbols', () => {
  it('has all expected symbols', () => {
    expect(symbols.check).toBeDefined();
    expect(symbols.cross).toBeDefined();
    expect(symbols.warn).toBeDefined();
    expect(symbols.bullet).toBeDefined();
    expect(symbols.arrow).toBeDefined();
    expect(symbols.info).toBeDefined();
    expect(symbols.circle).toBeDefined();
  });
});

// ============================================================================
// colorize
// ============================================================================

describe('colorize', () => {
  it('wraps text in color and reset', () => {
    const result = colorize('hello', 'green');
    expect(result).toBe(`${colors.green}hello${colors.reset}`);
  });

  it('works with different colors', () => {
    const result = colorize('error', 'red');
    expect(result).toContain(colors.red);
    expect(result).toContain(colors.reset);
  });
});

// ============================================================================
// color (raw code)
// ============================================================================

describe('color', () => {
  it('wraps text in raw ANSI code', () => {
    const result = color('test', '\x1b[35m');
    expect(result).toBe('\x1b[35mtest\x1b[0m');
  });
});

// ============================================================================
// bold / dim
// ============================================================================

describe('bold', () => {
  it('wraps text in bold', () => {
    const result = bold('title');
    expect(result).toBe(`${colors.bold}title${colors.reset}`);
  });
});

describe('dim', () => {
  it('wraps text in dim', () => {
    const result = dim('subtle');
    expect(result).toBe(`${colors.dim}subtle${colors.reset}`);
  });
});

// ============================================================================
// formatStatus
// ============================================================================

describe('formatStatus', () => {
  it('formats pass with green check', () => {
    const result = formatStatus('pass');
    expect(result).toContain(colors.green);
    expect(result).toContain(symbols.check);
    expect(result).toContain(colors.reset);
  });

  it('formats warn with yellow warning', () => {
    const result = formatStatus('warn');
    expect(result).toContain(colors.yellow);
    expect(result).toContain(symbols.warn);
  });

  it('formats fail with red cross', () => {
    const result = formatStatus('fail');
    expect(result).toContain(colors.red);
    expect(result).toContain(symbols.cross);
  });

  it('formats extended status aliases', () => {
    expect(formatStatus('success')).toContain(colors.green);
    expect(formatStatus('failed')).toContain(colors.red);
    expect(formatStatus('skipped')).toContain(colors.yellow);
    expect(formatStatus('pending')).toContain(colors.dim);
    expect(formatStatus('warning')).toContain(colors.yellow);
  });
});

// ============================================================================
// formatHeader
// ============================================================================

describe('formatHeader', () => {
  it('wraps in bold', () => {
    const result = formatHeader('Section Title');
    expect(result).toBe(`${colors.bold}Section Title${colors.reset}`);
  });
});

// ============================================================================
// formatCodeBlock
// ============================================================================

describe('formatCodeBlock', () => {
  it('indents and dims single line', () => {
    const result = formatCodeBlock('const x = 1;');
    expect(result).toContain('  ');
    expect(result).toContain(colors.dim);
    expect(result).toContain('const x = 1;');
  });

  it('indents and dims multi-line code', () => {
    const result = formatCodeBlock('line1\nline2\nline3');
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.startsWith('  ')).toBe(true);
    }
  });
});

// ============================================================================
// formatBoolean
// ============================================================================

describe('formatBoolean', () => {
  it('formats true as green', () => {
    const result = formatBoolean(true);
    expect(result).toContain(colors.green);
    expect(result).toContain('true');
  });

  it('formats false as red', () => {
    const result = formatBoolean(false);
    expect(result).toContain(colors.red);
    expect(result).toContain('false');
  });
});
