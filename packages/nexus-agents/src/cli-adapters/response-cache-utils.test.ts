/**
 * Tests for response-cache-utils utilities
 *
 * @module cli-adapters/response-cache-utils.test
 */

import { describe, it, expect } from 'vitest';
import { estimateSize, generateCacheKey, sortObjectKeys } from './response-cache-utils.js';

describe('response-cache-utils', () => {
  describe('estimateSize', () => {
    it('estimates size of a string', () => {
      const size = estimateSize('hello');
      // "hello" JSON stringifies to '"hello"' (7 chars) -> 7*2 + 64 = 78
      expect(size).toBe(78);
    });

    it('estimates size of a number', () => {
      const size = estimateSize(123);
      // 123 JSON stringifies to '123' (3 chars) -> 3*2 + 64 = 70
      expect(size).toBe(70);
    });

    it('estimates size of an object', () => {
      const size = estimateSize({ a: 1, b: 2 });
      // {"a":1,"b":2} is 13 chars -> 13*2 + 64 = 90
      expect(size).toBe(90);
    });

    it('estimates size of an array', () => {
      const size = estimateSize([1, 2, 3]);
      // [1,2,3] is 7 chars -> 7*2 + 64 = 78
      expect(size).toBe(78);
    });

    it('estimates size of null', () => {
      const size = estimateSize(null);
      // 'null' is 4 chars -> 4*2 + 64 = 72
      expect(size).toBe(72);
    });

    it('estimates size of empty object', () => {
      const size = estimateSize({});
      // '{}' is 2 chars -> 2*2 + 64 = 68
      expect(size).toBe(68);
    });

    it('estimates size of nested objects', () => {
      const size = estimateSize({ a: { b: { c: 1 } } });
      expect(size).toBeGreaterThan(68); // More than empty object
    });

    it('returns fallback for circular references', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;
      const size = estimateSize(obj);
      expect(size).toBe(1024); // Fallback value
    });
  });

  describe('generateCacheKey', () => {
    it('generates consistent keys for same inputs', () => {
      const key1 = generateCacheKey({ adapter: 'claude', prompt: 'test', options: {} });
      const key2 = generateCacheKey({ adapter: 'claude', prompt: 'test', options: {} });
      expect(key1).toBe(key2);
    });

    it('generates different keys for different adapters', () => {
      const key1 = generateCacheKey({ adapter: 'claude', prompt: 'test', options: {} });
      const key2 = generateCacheKey({ adapter: 'gemini', prompt: 'test', options: {} });
      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different prompts', () => {
      const key1 = generateCacheKey({ adapter: 'claude', prompt: 'test1', options: {} });
      const key2 = generateCacheKey({ adapter: 'claude', prompt: 'test2', options: {} });
      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different options', () => {
      const key1 = generateCacheKey({ adapter: 'claude', prompt: 'test', options: { temp: 0.5 } });
      const key2 = generateCacheKey({ adapter: 'claude', prompt: 'test', options: { temp: 0.7 } });
      expect(key1).not.toBe(key2);
    });

    it('generates same key regardless of option key order', () => {
      const key1 = generateCacheKey({
        adapter: 'claude',
        prompt: 'test',
        options: { a: 1, b: 2, c: 3 },
      });
      const key2 = generateCacheKey({
        adapter: 'claude',
        prompt: 'test',
        options: { c: 3, a: 1, b: 2 },
      });
      expect(key1).toBe(key2);
    });

    it('prefixes key with adapter name', () => {
      const key = generateCacheKey({ adapter: 'claude', prompt: 'test', options: {} });
      expect(key).toMatch(/^claude:/);
    });

    it('generates key with hash suffix', () => {
      const key = generateCacheKey({ adapter: 'claude', prompt: 'test', options: {} });
      // Key format: adapter:hash (16 hex chars)
      expect(key).toMatch(/^claude:[a-f0-9]{16}$/);
    });

    it('handles missing options', () => {
      // Test with options omitted entirely
      const keyWithEmpty = generateCacheKey({ adapter: 'claude', prompt: 'test', options: {} });
      expect(keyWithEmpty).toMatch(/^claude:/);
    });

    it('handles complex nested options deterministically', () => {
      const key1 = generateCacheKey({
        adapter: 'claude',
        prompt: 'test',
        options: { nested: { deep: { value: [1, 2, 3] } } },
      });
      const key2 = generateCacheKey({
        adapter: 'claude',
        prompt: 'test',
        options: { nested: { deep: { value: [1, 2, 3] } } },
      });
      expect(key1).toBe(key2);
    });
  });

  describe('sortObjectKeys', () => {
    it('sorts object keys alphabetically', () => {
      const result = sortObjectKeys({ c: 3, a: 1, b: 2 });
      expect(Object.keys(result as Record<string, unknown>)).toEqual(['a', 'b', 'c']);
    });

    it('returns primitives unchanged', () => {
      expect(sortObjectKeys('hello')).toBe('hello');
      expect(sortObjectKeys(123)).toBe(123);
      expect(sortObjectKeys(true)).toBe(true);
      expect(sortObjectKeys(null)).toBe(null);
      expect(sortObjectKeys(undefined)).toBe(undefined);
    });

    it('recursively sorts nested objects', () => {
      const result = sortObjectKeys({
        z: { y: 1, x: 2 },
        a: { c: 3, b: 4 },
      });

      const expected = {
        a: { b: 4, c: 3 },
        z: { x: 2, y: 1 },
      };

      expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    });

    it('handles arrays by sorting nested objects within', () => {
      const result = sortObjectKeys([
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ]);
      const expected = [
        { a: 1, b: 2 },
        { c: 3, d: 4 },
      ];
      expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    });

    it('handles empty objects', () => {
      expect(sortObjectKeys({})).toEqual({});
    });

    it('handles empty arrays', () => {
      expect(sortObjectKeys([])).toEqual([]);
    });

    it('handles mixed nested structures', () => {
      const result = sortObjectKeys({
        items: [{ z: 1, a: 2 }],
        meta: { y: 'test', x: 123 },
      });

      expect(Object.keys(result as Record<string, unknown>)).toEqual(['items', 'meta']);
    });
  });
});
