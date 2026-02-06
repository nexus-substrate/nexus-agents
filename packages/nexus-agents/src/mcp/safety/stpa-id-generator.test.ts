/**
 * Tests for stpa-id-generator.ts
 *
 * Covers generateId: prefix formatting, tool name sanitization, and index padding.
 */

import { describe, it, expect } from 'vitest';
import { generateId } from './stpa-id-generator.js';

describe('generateId', () => {
  it('generates ID with prefix, sanitized name, and padded index', () => {
    expect(generateId('HAZ', 'read_file', 1)).toBe('HAZ-READ_FILE-001');
  });

  it('pads index to 3 digits', () => {
    expect(generateId('UCA', 'tool', 42)).toBe('UCA-TOOL-042');
  });

  it('handles large indices', () => {
    expect(generateId('SC', 'tool', 1000)).toBe('SC-TOOL-1000');
  });

  it('sanitizes special characters to underscores', () => {
    expect(generateId('HAZ', 'my.tool-v2', 1)).toBe('HAZ-MY_TOOL_V2-001');
  });

  it('uppercases tool name', () => {
    expect(generateId('HAZ', 'readFile', 0)).toBe('HAZ-READFILE-000');
  });

  it('handles empty tool name', () => {
    expect(generateId('HAZ', '', 1)).toBe('HAZ--001');
  });

  it('preserves prefix as-is', () => {
    expect(generateId('custom', 'tool', 5)).toBe('custom-TOOL-005');
  });
});
