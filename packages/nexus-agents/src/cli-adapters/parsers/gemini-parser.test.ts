/**
 * Tests for Gemini CLI Response Parser
 *
 * Verifies defensive parsing of Gemini CLI JSON output.
 * Tests model aggregation and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { GeminiResponseParser } from './gemini-parser.js';

describe('GeminiResponseParser', () => {
  const parser = new GeminiResponseParser();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('gemini-parser');
    });

    it('should have correct version range', () => {
      expect(parser.supportedVersionRange).toBe('>=0.20.0 <1.0.0');
    });
  });

  describe('parse()', () => {
    it('should parse valid Gemini response', () => {
      const raw = JSON.stringify({
        session_id: 'gem_123',
        response: 'Hello from Gemini!',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: {
                input: 100,
                candidates: 50,
              },
            },
          },
        },
      });

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.response).toBe('Hello from Gemini!');
      expect(result?.session_id).toBe('gem_123');
    });

    it('should return null for invalid JSON', () => {
      expect(parser.parse('not json')).toBeNull();
      expect(parser.parse('{')).toBeNull();
      expect(parser.parse('')).toBeNull();
    });

    it('should return null for missing response field', () => {
      const raw = JSON.stringify({
        session_id: 'gem_123',
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
    it('should extract response text', () => {
      const raw = JSON.stringify({
        response: 'The answer is 42',
      });

      expect(parser.extractResponse(raw)).toBe('The answer is 42');
    });

    it('should return null for missing response', () => {
      const raw = JSON.stringify({
        session_id: 'gem_123',
      });

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('should return null for non-string response', () => {
      const raw = JSON.stringify({
        response: 123,
      });

      expect(parser.extractResponse(raw)).toBeNull();
    });
  });

  describe('extractUsage()', () => {
    it('should extract and aggregate token usage from single model', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: {
                input: 100,
                candidates: 50,
                cached: 20,
              },
            },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage).not.toBeNull();
      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.cachedInputTokens).toBe(20);
      expect(usage?.totalTokens).toBe(150);
    });

    it('should aggregate tokens across multiple models', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: {
                input: 100,
                candidates: 50,
              },
            },
            'gemini-2.5-pro': {
              tokens: {
                input: 200,
                candidates: 100,
              },
            },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage).not.toBeNull();
      expect(usage?.inputTokens).toBe(300);
      expect(usage?.outputTokens).toBe(150);
      expect(usage?.totalTokens).toBe(450);
    });

    it('should return null if stats missing', () => {
      const raw = JSON.stringify({
        response: 'test',
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should return null if models missing', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {},
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should return null if no tokens found', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {},
          },
        },
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should skip models without tokens', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: {
                input: 100,
                candidates: 50,
              },
            },
            'gemini-2.5-pro': {
              api: { totalRequests: 1 },
            },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
    });

    it('should not include cachedInputTokens if zero', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: {
                input: 100,
                candidates: 50,
              },
            },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.cachedInputTokens).toBeUndefined();
    });
  });

  describe('extractSessionId()', () => {
    it('should extract session_id', () => {
      const raw = JSON.stringify({
        response: 'test',
        session_id: 'gem_abc123',
      });

      expect(parser.extractSessionId(raw)).toBe('gem_abc123');
    });

    it('should return null if session_id missing', () => {
      const raw = JSON.stringify({
        response: 'test',
      });

      expect(parser.extractSessionId(raw)).toBeNull();
    });

    it('should return null for non-string session_id', () => {
      const raw = JSON.stringify({
        response: 'test',
        session_id: 123,
      });

      expect(parser.extractSessionId(raw)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle extra fields gracefully', () => {
      const raw = JSON.stringify({
        response: 'test',
        unknown_field: 'ignored',
      });

      expect(parser.extractResponse(raw)).toBe('test');
    });

    it('should handle deeply nested stats structure', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {
              api: {
                totalRequests: 1,
                totalErrors: 0,
                totalLatencyMs: 500,
              },
              tokens: {
                input: 100,
                prompt: 80,
                candidates: 50,
                total: 150,
                cached: 10,
                thoughts: 20,
                tool: 5,
              },
            },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.cachedInputTokens).toBe(10);
    });
  });
});
