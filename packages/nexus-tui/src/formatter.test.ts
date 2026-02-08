import { describe, it, expect } from 'vitest';
import { formatResult, formatHeader, formatTable } from './formatter.js';

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
