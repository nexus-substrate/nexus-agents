/** Unit tests for shared redaction boundaries (#7322, #7315, #7426). */
import { describe, expect, it } from 'vitest';
import { contextValueEnd, escapedValueEnd, isJsonDocument } from './redaction-boundaries.js';

describe('isJsonDocument', () => {
  it('detects valid JSON objects and arrays', () => {
    expect(isJsonDocument('{"key":"value"}')).toBe(true);
    expect(isJsonDocument('  [1, 2, 3]  ')).toBe(true);
    expect(isJsonDocument('"just a string"')).toBe(true);
  });

  it('rejects plain text and invalid JSON', () => {
    expect(isJsonDocument('')).toBe(false);
    expect(isJsonDocument('plain text error')).toBe(false);
    expect(isJsonDocument('{invalid json}')).toBe(false);
    expect(isJsonDocument('password=secret')).toBe(false);
  });
});

describe('contextValueEnd (#7426)', () => {
  it('stops at whitespace in plain text', () => {
    const text = 'password=secret value here';
    const start = text.indexOf('secret');
    const end = contextValueEnd(text, start, false, false);
    expect(text.slice(start, end)).toBe('secret');
  });

  it('stops at & in query strings', () => {
    const text = 'https://example.com/?token=secret&next=page';
    const start = text.indexOf('secret');
    const end = contextValueEnd(text, start, true, false);
    expect(text.slice(start, end)).toBe('secret');
  });

  it('stops at unescaped quote in JSON', () => {
    const text = '{"message":"password=secret"}';
    const start = text.indexOf('secret');
    const end = contextValueEnd(text, start, false, true);
    expect(text.slice(start, end)).toBe('secret');
  });

  it.each([
    ['newline (\\n)', '{"text":"password=secret\\nnext"}', 'secret', '\\n'],
    ['carriage return (\\r)', '{"text":"password=secret\\rnext"}', 'secret', '\\r'],
    ['tab (\\t)', '{"text":"password=secret\\tnext"}', 'secret', '\\t'],
    ['escaped quote (\\")', '{"text":"{\\"password\\":\\"secret\\",\\"a\\":1}"}', 'secret', '\\"'],
  ])('terminates contextual scan at %s', (_name, text, val, delimiter) => {
    const start = text.indexOf(val);
    const end = contextValueEnd(text, start, false, true);
    expect(text.slice(start, end)).toBe(val);
    expect(text.slice(end, end + delimiter.length)).toBe(delimiter);
  });

  it('consumes non-delimiter escapes as atomic pairs without splitting', () => {
    const text = '{"text":"password=foo\\\\bar"}';
    const start = text.indexOf('foo');
    const end = contextValueEnd(text, start, false, true);
    expect(text.slice(start, end)).toBe('foo\\\\bar');
  });

  it('scans balanced containers for json-field boundary', () => {
    const text = '{"nested":{"a":1,"b":[2,3]},"next":4}';
    const start = text.indexOf('{"a"');
    const end = contextValueEnd(text, start, false, true, 'json-field');
    expect(text.slice(start, end)).toBe('{"a":1,"b":[2,3]}');
  });
});

describe('escapedValueEnd', () => {
  it('scans through an escaped closing quote', () => {
    const text = 'prefix\\"secret_value\\"suffix';
    const start = text.indexOf('secret');
    const end = escapedValueEnd(text, start);
    expect(text.slice(start, end)).toBe('secret_value\\"');
  });

  it('stops at unescaped quote if reached', () => {
    const text = 'prefix\\"secret_value"suffix';
    const start = text.indexOf('secret');
    const end = escapedValueEnd(text, start);
    expect(text.slice(start, end)).toBe('secret_value');
  });
});
