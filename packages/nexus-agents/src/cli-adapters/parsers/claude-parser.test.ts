/**
 * Tests for Claude CLI Response Parser
 *
 * Verifies defensive parsing of Claude CLI JSON output.
 * Tests edge cases and malformed inputs for robustness.
 */

import { describe, it, expect } from 'vitest';
import { ClaudeResponseParser } from './claude-parser.js';

describe('ClaudeResponseParser', () => {
  const parser = new ClaudeResponseParser();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('claude-parser');
    });

    it('should have correct version range', () => {
      expect(parser.supportedVersionRange).toBe('>=2.0.0 <3.0.0');
    });
  });

  describe('parse()', () => {
    it('should parse valid Claude response', () => {
      const raw = JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Hello, world!',
        session_id: 'sess_123',
        duration_ms: 1500,
        total_cost_usd: 0.0015,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
        },
      });

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.result).toBe('Hello, world!');
      expect(result?.session_id).toBe('sess_123');
      expect(result?.is_error).toBe(false);
    });

    it('should return null for invalid JSON', () => {
      expect(parser.parse('not json')).toBeNull();
      expect(parser.parse('{')).toBeNull();
      expect(parser.parse('')).toBeNull();
    });

    it('should return null for missing result field', () => {
      const raw = JSON.stringify({
        type: 'result',
        is_error: false,
      });

      expect(parser.parse(raw)).toBeNull();
    });

    it('should return null for non-object response', () => {
      expect(parser.parse('"string"')).toBeNull();
      expect(parser.parse('123')).toBeNull();
      expect(parser.parse('null')).toBeNull();
      expect(parser.parse('[]')).toBeNull();
    });
  });

  describe('extractResponse()', () => {
    it('should extract result text from valid response', () => {
      const raw = JSON.stringify({
        result: 'The answer is 42',
      });

      expect(parser.extractResponse(raw)).toBe('The answer is 42');
    });

    it('should return null for missing result', () => {
      const raw = JSON.stringify({
        type: 'result',
      });

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('should return null for non-string result', () => {
      const raw = JSON.stringify({
        result: 123,
      });

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('should handle empty result string', () => {
      const raw = JSON.stringify({
        result: '',
      });

      expect(parser.extractResponse(raw)).toBe('');
    });
  });

  describe('extractUsage()', () => {
    it('should extract token usage', () => {
      const raw = JSON.stringify({
        result: 'test',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage).not.toBeNull();
      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.cachedInputTokens).toBe(20);
      expect(usage?.totalTokens).toBe(150);
    });

    it('should return null if usage missing', () => {
      const raw = JSON.stringify({
        result: 'test',
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should return null if input_tokens missing', () => {
      const raw = JSON.stringify({
        result: 'test',
        usage: {
          output_tokens: 50,
        },
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should return null if output_tokens missing', () => {
      const raw = JSON.stringify({
        result: 'test',
        usage: {
          input_tokens: 100,
        },
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should handle missing cache tokens', () => {
      const raw = JSON.stringify({
        result: 'test',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage).not.toBeNull();
      expect(usage?.cachedInputTokens).toBeUndefined();
    });
  });

  describe('extractSessionId()', () => {
    it('should extract session_id', () => {
      const raw = JSON.stringify({
        result: 'test',
        session_id: 'sess_abc123',
      });

      expect(parser.extractSessionId(raw)).toBe('sess_abc123');
    });

    it('should return null if session_id missing', () => {
      const raw = JSON.stringify({
        result: 'test',
      });

      expect(parser.extractSessionId(raw)).toBeNull();
    });

    it('should return null for non-string session_id', () => {
      const raw = JSON.stringify({
        result: 'test',
        session_id: 123,
      });

      expect(parser.extractSessionId(raw)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle extra fields gracefully', () => {
      const raw = JSON.stringify({
        result: 'test',
        unknown_field: 'ignored',
        nested: { deep: 'value' },
      });

      expect(parser.extractResponse(raw)).toBe('test');
    });

    it('should handle unicode in result', () => {
      const raw = JSON.stringify({
        result: '你好世界 🌍 مرحبا',
      });

      expect(parser.extractResponse(raw)).toBe('你好世界 🌍 مرحبا');
    });

    it('should handle very long result', () => {
      const longText = 'x'.repeat(100000);
      const raw = JSON.stringify({
        result: longText,
      });

      expect(parser.extractResponse(raw)).toBe(longText);
    });

    it('should handle newlines and special characters', () => {
      const raw = JSON.stringify({
        result: 'line1\nline2\ttab\r\nwindows',
      });

      expect(parser.extractResponse(raw)).toBe('line1\nline2\ttab\r\nwindows');
    });
  });
});
