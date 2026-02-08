import { describe, it, expect } from 'vitest';
import { sanitizeOutput, safeParseInt, safeParseJson, redactSecrets } from './sanitize.js';

describe('sanitizeOutput', () => {
  it('passes through clean strings', () => {
    expect(sanitizeOutput('hello world')).toBe('hello world');
  });

  it('strips ANSI color codes', () => {
    expect(sanitizeOutput('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips ANSI cursor movement', () => {
    expect(sanitizeOutput('\x1b[2Aup two lines')).toBe('up two lines');
  });

  it('strips ANSI clear screen', () => {
    expect(sanitizeOutput('\x1b[2Jcleared')).toBe('cleared');
  });

  it('strips null bytes and control chars', () => {
    expect(sanitizeOutput('a\x00b\x01c\x7fd')).toBe('abcd');
  });

  it('preserves tabs and newlines', () => {
    expect(sanitizeOutput('line1\n\tindented\r\nline3')).toBe('line1\n\tindented\r\nline3');
  });

  it('handles combined ANSI + control chars', () => {
    const input = '\x1b[31m\x00dangerous\x1b[0m\x01text';
    expect(sanitizeOutput(input)).toBe('dangeroustext');
  });

  it('handles empty string', () => {
    expect(sanitizeOutput('')).toBe('');
  });
});

describe('safeParseInt', () => {
  it('parses valid integer', () => {
    expect(safeParseInt('42')).toBe(42);
  });

  it('returns undefined for non-numeric', () => {
    expect(safeParseInt('abc')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(safeParseInt(undefined)).toBeUndefined();
  });

  it('returns undefined below min', () => {
    expect(safeParseInt('0', 1, 100)).toBeUndefined();
  });

  it('returns undefined above max', () => {
    expect(safeParseInt('200', 1, 100)).toBeUndefined();
  });

  it('accepts value at min boundary', () => {
    expect(safeParseInt('1', 1, 100)).toBe(1);
  });

  it('accepts value at max boundary', () => {
    expect(safeParseInt('100', 1, 100)).toBe(100);
  });

  it('returns undefined for NaN', () => {
    expect(safeParseInt('NaN')).toBeUndefined();
  });

  it('returns undefined for Infinity string', () => {
    expect(safeParseInt('Infinity')).toBeUndefined();
  });

  it('returns undefined for negative when min is 1', () => {
    expect(safeParseInt('-5')).toBeUndefined();
  });
});

describe('safeParseJson', () => {
  it('parses valid JSON object', () => {
    const result = safeParseJson('{"key":"value"}');
    expect(result).toEqual({ value: { key: 'value' } });
  });

  it('rejects JSON array', () => {
    const result = safeParseJson('[1,2,3]');
    expect(result).toEqual({ error: 'Expected a JSON object' });
  });

  it('rejects JSON string', () => {
    const result = safeParseJson('"hello"');
    expect(result).toEqual({ error: 'Expected a JSON object' });
  });

  it('rejects JSON null', () => {
    const result = safeParseJson('null');
    expect(result).toEqual({ error: 'Expected a JSON object' });
  });

  it('rejects invalid JSON', () => {
    const result = safeParseJson('{broken');
    expect(result).toEqual({ error: 'Invalid JSON' });
  });

  it('rejects JSON number', () => {
    const result = safeParseJson('42');
    expect(result).toEqual({ error: 'Expected a JSON object' });
  });
});

describe('redactSecrets', () => {
  it('redacts sk- prefixed keys', () => {
    expect(redactSecrets('key: sk-abcdef1234567890')).toBe('key: ***7890');
  });

  it('redacts key- prefixed keys', () => {
    expect(redactSecrets('token: key-xyz123456789')).toBe('token: ***6789');
  });

  it('redacts api_key= patterns', () => {
    expect(redactSecrets('api_key=abcdefgh12345678')).toBe('***5678');
  });

  it('redacts api-key: patterns', () => {
    expect(redactSecrets('api-key: abcdefgh12345678')).toBe('***5678');
  });

  it('leaves non-secret strings alone', () => {
    expect(redactSecrets('normal text here')).toBe('normal text here');
  });

  it('redacts short keys with full mask', () => {
    expect(redactSecrets('sk-12345678')).toBe('***5678');
  });

  it('handles empty string', () => {
    expect(redactSecrets('')).toBe('');
  });
});
