/**
 * Tests for the tool-output consistency lint (#2653).
 *
 * @module scripts/check-tool-output-consistency.test
 */

import { describe, it, expect } from 'vitest';
import { findTimestampNumberFields } from './check-tool-output-consistency.js';

describe('findTimestampNumberFields', () => {
  it('flags a timestamp field typed as z.number() inside an outputSchema', () => {
    const src = [
      'const outputSchema = {',
      '  success: z.boolean(),',
      '  createdAt: z.number(),',
      '};',
    ].join('\n');
    const v = findTimestampNumberFields(src, 'tool.ts');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ field: 'createdAt', line: 3 });
  });

  it('flags a timestamp field typed as number inside a *Response interface', () => {
    const src = [
      'export interface FooResponse {',
      '  status: string;',
      '  reviewedDate: number;',
      '}',
    ].join('\n');
    const v = findTimestampNumberFields(src, 'tool.ts');
    expect(v).toHaveLength(1);
    expect(v[0]?.field).toBe('reviewedDate');
  });

  it('does NOT flag timestamp-as-number in an internal (non-output) type', () => {
    // The exact false-positive pattern from reflective-retriever.ts /
    // scanner-registry-fetcher.ts: an internal LRU cache entry.
    const src = [
      'interface CacheEntry {',
      '  manifest: Manifest;',
      '  fetchedAt: number;',
      '  timestamp: number;',
      '}',
    ].join('\n');
    expect(findTimestampNumberFields(src, 'tool.ts')).toEqual([]);
  });

  it('does NOT flag an ISO-string timestamp in an output schema', () => {
    const src = ['const outputSchema = {', '  createdAt: z.string(),', '};'].join('\n');
    expect(findTimestampNumberFields(src, 'tool.ts')).toEqual([]);
  });

  it('does NOT flag a duration field (durationMs is legitimately numeric)', () => {
    const src = [
      'const outputSchema = {',
      '  durationMs: z.number(),',
      '  totalTime: z.number(),',
      '};',
    ].join('\n');
    // `*Time` is deliberately excluded — durations are numeric.
    expect(findTimestampNumberFields(src, 'tool.ts')).toEqual([]);
  });

  it('flags inside the output region only, not a sibling internal type', () => {
    const src = [
      'interface CacheEntry { timestamp: number; }',
      'export interface ToolResponse {',
      '  publishedAt: z.number(),',
      '}',
    ].join('\n');
    const v = findTimestampNumberFields(src, 'tool.ts');
    expect(v).toHaveLength(1);
    expect(v[0]?.field).toBe('publishedAt');
  });
});
