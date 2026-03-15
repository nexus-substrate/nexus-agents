/**
 * Tests for zod-helpers utilities
 *
 * @module core/zod-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  formatZodIssue,
  formatZodError,
  formatZodIssuesAsArray,
  formatZodIssueWithRoot,
  isZodError,
} from './zod-helpers.js';

describe('zod-helpers', () => {
  // Helper to create a Zod error from schema validation
  const getZodError = (schema: z.ZodType, data: unknown): z.ZodError => {
    const result = schema.safeParse(data);
    if (result.success) {
      throw new Error('Expected validation to fail');
    }
    return result.error;
  };

  describe('formatZodIssue', () => {
    it('formats issue with path', () => {
      const error = getZodError(z.object({ name: z.string() }), { name: 123 });
      const formatted = formatZodIssue(error.issues[0]!);
      expect(formatted).toMatch(/^name:/);
    });

    it('formats issue without path', () => {
      const error = getZodError(z.string(), 123);
      const formatted = formatZodIssue(error.issues[0]!);
      // In zod v4, message is "Invalid input: expected string, received number"
      expect(formatted).toContain('expected string');
    });

    it('formats nested path correctly', () => {
      const schema = z.object({
        user: z.object({
          email: z.email(),
        }),
      });
      const error = getZodError(schema, { user: { email: 'invalid' } });
      const formatted = formatZodIssue(error.issues[0]!);
      expect(formatted).toMatch(/^user\.email:/);
    });

    it('formats array index path correctly', () => {
      const schema = z.object({
        items: z.array(z.string()),
      });
      const error = getZodError(schema, { items: ['valid', 123] });
      const formatted = formatZodIssue(error.issues[0]!);
      expect(formatted).toMatch(/^items\.1:/);
    });
  });

  describe('formatZodError', () => {
    it('formats single issue', () => {
      const error = getZodError(z.string(), 123);
      const formatted = formatZodError(error);
      // In zod v4, message is "Invalid input: expected string, received number"
      expect(formatted).toContain('expected string');
    });

    it('formats multiple issues with semicolon separator', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const error = getZodError(schema, { name: 123, age: 'twenty' });
      const formatted = formatZodError(error);
      expect(formatted).toContain(';');
      expect(formatted).toContain('name:');
      expect(formatted).toContain('age:');
    });

    it('handles union type errors', () => {
      const schema = z.union([z.string(), z.number()]);
      const error = getZodError(schema, { invalid: true });
      const formatted = formatZodError(error);
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatZodIssuesAsArray', () => {
    it('returns array of formatted issues', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const error = getZodError(schema, { name: 123, age: 'twenty' });
      const issues = formatZodIssuesAsArray(error);
      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBe(2);
    });

    it('returns single-element array for single issue', () => {
      const error = getZodError(z.string(), 123);
      const issues = formatZodIssuesAsArray(error);
      expect(issues).toHaveLength(1);
    });

    it('each issue is a string', () => {
      const schema = z.object({ a: z.string(), b: z.string() });
      const error = getZodError(schema, { a: 1, b: 2 });
      const issues = formatZodIssuesAsArray(error);
      for (const issue of issues) {
        expect(typeof issue).toBe('string');
      }
    });
  });

  describe('formatZodIssueWithRoot', () => {
    it('uses "root" for root-level errors', () => {
      const error = getZodError(z.string(), 123);
      const formatted = formatZodIssueWithRoot(error.issues[0]!);
      expect(formatted).toMatch(/^root:/);
    });

    it('uses actual path for nested errors', () => {
      const schema = z.object({ field: z.string() });
      const error = getZodError(schema, { field: 123 });
      const formatted = formatZodIssueWithRoot(error.issues[0]!);
      expect(formatted).toMatch(/^field:/);
      expect(formatted).not.toContain('root');
    });

    it('formats nested path without "root"', () => {
      const schema = z.object({
        deep: z.object({
          value: z.number(),
        }),
      });
      const error = getZodError(schema, { deep: { value: 'not a number' } });
      const formatted = formatZodIssueWithRoot(error.issues[0]!);
      expect(formatted).toMatch(/^deep\.value:/);
    });
  });

  describe('isZodError', () => {
    it('returns true for ZodError', () => {
      const error = getZodError(z.string(), 123);
      expect(isZodError(error)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isZodError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isZodError(undefined)).toBe(false);
    });

    it('returns false for regular Error', () => {
      expect(isZodError(new Error('test'))).toBe(false);
    });

    it('returns false for string', () => {
      expect(isZodError('error message')).toBe(false);
    });

    it('returns false for object without issues', () => {
      expect(isZodError({ message: 'error' })).toBe(false);
    });

    it('returns false for object with non-array issues', () => {
      expect(isZodError({ issues: 'not an array' })).toBe(false);
    });

    it('returns true for object with array issues (duck typing)', () => {
      // This tests the duck-typing behavior
      const fakeZodError = { issues: [] };
      expect(isZodError(fakeZodError)).toBe(true);
    });

    it('returns false for number', () => {
      expect(isZodError(42)).toBe(false);
    });

    it('returns false for boolean', () => {
      expect(isZodError(true)).toBe(false);
    });

    it('returns false for function', () => {
      expect(isZodError(() => {})).toBe(false);
    });
  });
});
