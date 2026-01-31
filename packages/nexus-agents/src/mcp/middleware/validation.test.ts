/**
 * nexus-agents/mcp - Validation Middleware Tests
 *
 * Tests for input and output validation functions.
 * Issue #547: Add output validation for MCP tools.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateToolInput,
  validateToolOutput,
  createValidator,
  createOutputValidator,
  isZodError,
} from './validation.js';

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

describe('validateToolOutput', () => {
  const OutputSchema = z.object({
    success: z.boolean(),
    data: z.string(),
  });

  it('should return ok for valid output', () => {
    const result = validateToolOutput(OutputSchema, { success: true, data: 'result' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ success: true, data: 'result' });
    }
  });

  it('should return error for missing required field', () => {
    const result = validateToolOutput(OutputSchema, { success: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid tool output');
      expect(result.error.message).toContain('data');
    }
  });

  it('should return error for invalid type', () => {
    const result = validateToolOutput(OutputSchema, { success: 'yes', data: 'result' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid tool output');
    }
  });

  it('should include output type in error context', () => {
    const result = validateToolOutput(OutputSchema, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const context = result.error.context as { outputType?: string };
      expect(context.outputType).toBe('object'); // null is typeof 'object'
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

describe('createOutputValidator', () => {
  it('should create a reusable output validator function', () => {
    const schema = z.object({ result: z.number() });
    const validate = createOutputValidator(schema);

    const validResult = validate({ result: 42 });
    expect(validResult.ok).toBe(true);

    const invalidResult = validate({ result: 'forty-two' });
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
