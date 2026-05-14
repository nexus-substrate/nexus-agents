import { describe, it, expect } from 'vitest';
import {
  toolError,
  toolSuccess,
  toolSuccessStructured,
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
      expect(parseToolErrorEnvelope(result.structuredContent)).toEqual({
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
      expect(parseToolErrorEnvelope(result.structuredContent)).toEqual({
        errorCategory: 'transient',
        isRetryable: true,
        message: 'rate limited',
      });
    });
  });

  describe('toolSuccessStructured', () => {
    it('creates result with both text and structuredContent', () => {
      const data = { count: 3, items: ['a', 'b', 'c'] };
      const result: ToolResult = toolSuccessStructured(data);

      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(data, null, 2) }]);
      expect(result.structuredContent).toEqual(data);
    });

    it('does not set isError', () => {
      const result = toolSuccessStructured({ ok: true });
      expect(result.isError).toBeUndefined();
    });
  });
});
