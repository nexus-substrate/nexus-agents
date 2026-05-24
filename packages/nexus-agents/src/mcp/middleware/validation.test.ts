/**
 * nexus-agents/mcp - Validation Middleware Tests
 *
 * Tests for input and output validation functions.
 * Issue #547: Add output validation for MCP tools.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateToolInput, createValidator, isZodError } from './validation.js';

describe('validateToolInput', () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    count: z.number().int().positive(),
  });

  it('should return ok for valid input', () => {
    const result = validateToolInput(TestSchema, { name: 'test', count: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'test', count: 5 });
    }
  });

  it('should return error for missing required field', () => {
    const result = validateToolInput(TestSchema, { name: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid tool input');
      expect(result.error.message).toContain('count');
    }
  });

  it('should return error for invalid type', () => {
    const result = validateToolInput(TestSchema, { name: 'test', count: 'five' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid tool input');
    }
  });

  it('should return error for constraint violation', () => {
    const result = validateToolInput(TestSchema, { name: '', count: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid tool input');
    }
  });

  it('should include validation issues in error context', () => {
    const result = validateToolInput(TestSchema, { name: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const context = result.error.context as { issues?: unknown[] };
      expect(context.issues).toBeDefined();
      expect(Array.isArray(context.issues)).toBe(true);
    }
  });
});

describe('createValidator', () => {
  it('should create a reusable validator function', () => {
    const schema = z.object({ id: z.string() });
    const validate = createValidator(schema);

    const validResult = validate({ id: 'abc' });
    expect(validResult.ok).toBe(true);

    const invalidResult = validate({ id: 123 });
    expect(invalidResult.ok).toBe(false);
  });
});

describe('isZodError', () => {
  it('should return true for Zod errors', () => {
    const schema = z.string();
    const result = schema.safeParse(123);
    if (!result.success) {
      expect(isZodError(result.error)).toBe(true);
    }
  });

  it('should return false for regular errors', () => {
    expect(isZodError(new Error('test'))).toBe(false);
  });

  it('should return false for null', () => {
    expect(isZodError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isZodError(undefined)).toBe(false);
  });

  it('should return false for objects without issues', () => {
    expect(isZodError({ message: 'error' })).toBe(false);
  });

  it('should return false for objects with non-array issues', () => {
    expect(isZodError({ issues: 'not an array' })).toBe(false);
  });
});
