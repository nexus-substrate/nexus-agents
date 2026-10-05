import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  toolError,
  toolSuccess,
  structuredToolSuccess,
  toolStructuredError,
} from './tool-result.js';
import type { ToolResult } from './tool-result.js';
import { parseToolErrorEnvelope } from '../error-envelope.js';

describe('tool-result helpers', () => {
  describe('toolSuccess', () => {
    it('creates a successful result with text content', () => {
      const result: ToolResult = toolSuccess('hello');
      expect(result).toEqual({
        content: [{ type: 'text', text: 'hello' }],
      });
    });

    it('does not set isError', () => {
      const result = toolSuccess('ok');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('toolError', () => {
    it('creates an error result carrying a structured internal envelope (#2649)', () => {
      const result: ToolResult = toolError('something failed');
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'something failed' }]);
      expect(result.structuredContent).toBeUndefined();
      expect(parseToolErrorEnvelope(result._meta)).toEqual({
        errorCategory: 'internal',
        isRetryable: false,
        message: 'something failed',
      });
    });

    it('sets isError to true', () => {
      const result = toolError('err');
      expect(result.isError).toBe(true);
    });
  });

  describe('toolStructuredError', () => {
    it('creates an error result with the requested category and derived retryability', () => {
      const result: ToolResult = toolStructuredError({
        errorCategory: 'transient',
        message: 'rate limited',
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'rate limited' }]);
      expect(result.structuredContent).toBeUndefined();
      expect(parseToolErrorEnvelope(result._meta)).toEqual({
        errorCategory: 'transient',
        isRetryable: true,
        message: 'rate limited',
      });
    });
  });

  describe('toolSuccessStructured', () => {
    it('creates result with both text and structuredContent', () => {
      const data = { count: 3, items: ['a', 'b', 'c'] };
      const result: ToolResult = structuredToolSuccess(
        z.object({ count: z.number(), items: z.array(z.string()) }),
        data
      );

      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(data, null, 2) }]);
      expect(result.structuredContent).toEqual(data);
    });

    it('requires structured content to match the schema at compile time', () => {
      const schema = z.object({ count: z.number() });
      const handlerResult = { count: 0, undeclared: true };
      // @ts-expect-error — undeclared fields on handler variables also fail
      structuredToolSuccess(schema, handlerResult);
      if (false) {
        // @ts-expect-error — missing declared required field
        structuredToolSuccess(schema, {});
        // @ts-expect-error — incorrect declared field type
        structuredToolSuccess(schema, { count: 'drift' });
        // @ts-expect-error — undeclared literal field
        structuredToolSuccess(schema, { count: 0, undeclared: true });
      }
      expect(structuredToolSuccess(schema, { count: 0 }).structuredContent).toEqual({ count: 0 });
    });

    it('does not set isError', () => {
      const result = structuredToolSuccess(z.object({ ok: z.boolean() }), { ok: true });
      expect(result.isError).toBeUndefined();
    });
  });
});
