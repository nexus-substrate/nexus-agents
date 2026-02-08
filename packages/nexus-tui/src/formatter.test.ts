import { describe, it, expect } from 'vitest';
import { formatResult, formatHeader, formatTable, formatBar, formatBarRow } from './formatter.js';

describe('formatResult', () => {
  it('returns output directly in text mode', () => {
    expect(formatResult({ output: 'hello' }, false)).toBe('hello');
  });

  it('prefixes error in text mode', () => {
    expect(formatResult({ output: 'bad', isError: true }, false)).toBe('Error: bad');
  });

  it('returns JSON in json mode', () => {
    const json = formatResult({ output: 'data' }, true);
    expect(JSON.parse(json)).toEqual({ output: 'data', isError: false });
  });

  it('returns JSON with error flag', () => {
    const json = formatResult({ output: 'fail', isError: true }, true);
    expect(JSON.parse(json)).toEqual({ output: 'fail', isError: true });
  });
});

describe('formatHeader', () => {
  it('creates centered header with dashes', () => {
    const result = formatHeader('Test');
    expect(result).toContain('Test');
    expect(result).toContain('---');
  });
});

describe('formatTable', () => {
  it('returns (empty) for no rows', () => {
    expect(formatTable([])).toBe('(empty)');
  });

  it('aligns columns', () => {
    const result = formatTable([
      ['short', 'value1'],
      ['longername', 'value2'],
    ]);
    expect(result).toContain('short');
    expect(result).toContain('longername');
    // First column should be padded
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('handles single row', () => {
    const result = formatTable([['key', 'val']]);
    expect(result).toContain('key');
    expect(result).toContain('val');
  });
});

describe('formatBar', () => {
  it('shows 100% filled bar for ratio 1.0', () => {
    const bar = formatBar(1.0);
    expect(bar).toContain('100%');
    expect(bar).not.toContain('-');
  });

  it('shows 0% empty bar for ratio 0', () => {
    const bar = formatBar(0);
    expect(bar).toContain('0%');
    expect(bar).not.toContain('#');
  });

  it('shows 50% for ratio 0.5', () => {
    const bar = formatBar(0.5);
    expect(bar).toContain('50%');
    expect(bar).toContain('#');
    expect(bar).toContain('-');
  });

  it('clamps values above 1', () => {
    const bar = formatBar(1.5);
    expect(bar).toContain('100%');
  });

  it('clamps values below 0', () => {
    const bar = formatBar(-0.5);
    expect(bar).toContain('0%');
  });

  it('respects custom width', () => {
    const bar = formatBar(0.5, 10);
    // 5 filled + 5 empty = 10 chars between brackets
    expect(bar).toContain('#####-----');
  });
});

describe('formatBarRow', () => {
  it('includes label and bar', () => {
    const row = formatBarRow('claude', 0.85, 8);
    expect(row).toContain('claude');
    expect(row).toContain('85%');
    expect(row).toContain('#');
  });

  it('pads label to max width', () => {
    const row = formatBarRow('abc', 0.5, 10);
    // 'abc' padded to 10 chars
    expect(row).toContain('abc       ');
  });
});
