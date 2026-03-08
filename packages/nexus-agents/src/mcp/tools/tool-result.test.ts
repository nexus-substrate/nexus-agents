import { describe, it, expect } from 'vitest';
import { toolError, toolSuccess, toolSuccessStructured } from './tool-result.js';
import type { ToolResult } from './tool-result.js';

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
    it('creates an error result with isError true', () => {
      const result: ToolResult = toolError('something failed');
      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'something failed' }],
      });
    });

    it('sets isError to true', () => {
      const result = toolError('err');
      expect(result.isError).toBe(true);
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
