/**
 * Tests for Resilient Gemini CLI Response Parser
 *
 * Verifies multiple parsing strategies and fallback behavior
 * for handling various Gemini CLI output formats.
 *
 * (Source: Issue #366)
 */

import { describe, it, expect } from 'vitest';
import { ResilientGeminiParser, createResilientGeminiParser } from './gemini-parser-resilient.js';

describe('ResilientGeminiParser', () => {
  const parser = new ResilientGeminiParser();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('gemini-resilient-parser');
    });

    it('should have correct version range', () => {
      expect(parser.supportedVersionRange).toBe('>=0.20.0 <1.0.0');
    });
  });

  describe('factory function', () => {
    it('should create parser instance', () => {
      const instance = createResilientGeminiParser();
      expect(instance).toBeInstanceOf(ResilientGeminiParser);
    });
  });

  describe('Strategy 1: JSON parsing', () => {
    it('should parse valid JSON response', () => {
      const raw = JSON.stringify({
        session_id: 'gem_abc123',
        response: 'Hello from Gemini!',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: { input: 100, candidates: 50 },
            },
          },
        },
      });

      const result = parser.parseResilient(raw);

      expect(result).not.toBeNull();
      expect(result?.response).toBe('Hello from Gemini!');
      expect(result?.sessionId).toBe('gem_abc123');
      expect(result?.parseStrategy).toBe('json');
      expect(result?.usage?.inputTokens).toBe(100);
      expect(result?.usage?.outputTokens).toBe(50);
    });

    it('should parse minimal JSON with just response', () => {
      const raw = JSON.stringify({ response: 'Minimal response' });

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('Minimal response');
      expect(result?.parseStrategy).toBe('json');
    });
  });

  describe('Strategy 2: JSON extraction', () => {
    it('should extract JSON from mixed output', () => {
      const raw = `
Some debug output here
{"response": "Extracted response", "session_id": "gem_extracted"}
More trailing output
      `;

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('Extracted response');
      expect(result?.sessionId).toBe('gem_extracted');
      expect(result?.parseStrategy).toBe('json-extracted');
    });

    it('should extract JSON with stats from mixed output', () => {
      const raw = `
Log: Starting execution...
{"response": "Test", "stats": {"models": {"gemini-2.5-flash": {"tokens": {"input": 50, "candidates": 25}}}}}
Done.
      `;

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('Test');
      expect(result?.usage?.inputTokens).toBe(50);
    });
  });

  describe('Strategy 3: Markdown extraction', () => {
    it('should extract JSON from markdown code blocks', () => {
      const raw = `
Here is the response:

\`\`\`json
{"response": "From code block", "session_id": "gem_md"}
\`\`\`

Additional notes...
      `;

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('From code block');
      expect(result?.sessionId).toBe('gem_md');
      // Note: JSON extraction strategy finds this first (more reliable)
      expect(['json-extracted', 'markdown-code-block']).toContain(result?.parseStrategy);
    });

    it('should extract text content from markdown', () => {
      const raw = `
# Response

This is the main content of the response.

\`\`\`
Some code example
\`\`\`

More text here.
      `;

      const result = parser.parseResilient(raw);

      expect(result).not.toBeNull();
      expect(result?.parseStrategy).toBe('markdown-code-block');
    });
  });

  describe('Strategy 4: Plain text fallback', () => {
    it('should accept plain text as response', () => {
      const raw = 'This is a plain text response from Gemini CLI.';

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe(raw);
      expect(result?.parseStrategy).toBe('plain-text');
    });

    it('should handle multiline plain text', () => {
      const raw = `Line 1 of the response.
Line 2 continues here.
Line 3 concludes.`;

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe(raw);
      expect(result?.parseStrategy).toBe('plain-text');
    });

    it('should trim whitespace from plain text', () => {
      const raw = '   Response with whitespace   ';

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('Response with whitespace');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parser.parseResilient('')).toBeNull();
    });

    it('should return null for whitespace only', () => {
      expect(parser.parseResilient('   \n\t  ')).toBeNull();
    });

    it('should handle JSON without response field', () => {
      const raw = JSON.stringify({ session_id: 'gem_123', other: 'data' });

      // Falls through to plain text
      const result = parser.parseResilient(raw);
      expect(result?.parseStrategy).toBe('plain-text');
    });
  });

  describe('extractResponse()', () => {
    it('should extract response from JSON', () => {
      const raw = JSON.stringify({ response: 'Test response' });
      expect(parser.extractResponse(raw)).toBe('Test response');
    });

    it('should extract response from plain text', () => {
      expect(parser.extractResponse('Plain text')).toBe('Plain text');
    });

    it('should return null for empty input', () => {
      expect(parser.extractResponse('')).toBeNull();
    });
  });

  describe('extractUsage()', () => {
    it('should extract usage from JSON', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: { input: 100, candidates: 50, cached: 10 },
            },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.cachedInputTokens).toBe(10);
    });

    it('should aggregate usage across multiple models', () => {
      const raw = JSON.stringify({
        response: 'test',
        stats: {
          models: {
            'gemini-2.5-flash': { tokens: { input: 100, candidates: 50 } },
            'gemini-2.5-pro': { tokens: { input: 200, candidates: 100 } },
          },
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(300);
      expect(usage?.outputTokens).toBe(150);
    });

    it('should return null for plain text', () => {
      expect(parser.extractUsage('Plain text response')).toBeNull();
    });
  });

  describe('extractSessionId()', () => {
    it('should extract session_id from JSON', () => {
      const raw = JSON.stringify({ response: 'test', session_id: 'gem_abc123' });
      expect(parser.extractSessionId(raw)).toBe('gem_abc123');
    });

    it('should extract session ID from text pattern', () => {
      const raw = 'Session ID: gem_xyz789\nResponse: Hello';
      expect(parser.extractSessionId(raw)).not.toBeNull();
    });

    it('should return null when no session ID present', () => {
      expect(parser.extractSessionId('Just plain text')).toBeNull();
    });
  });

  describe('extractError()', () => {
    it('should detect timeout errors', () => {
      const raw = 'Error: Request timed out after 60 seconds';

      const error = parser.extractError(raw);

      expect(error?.type).toBe('timeout');
    });

    it('should detect authentication errors', () => {
      const raw = 'Error: Unauthorized - authentication required';

      const error = parser.extractError(raw);

      expect(error?.type).toBe('auth');
    });

    it('should detect rate limit errors', () => {
      const raw = 'Error: Rate limit exceeded. Please retry later.';

      const error = parser.extractError(raw);

      expect(error?.type).toBe('rate-limit');
    });

    it('should detect generic API errors', () => {
      const raw = 'Error: API request failed with status 500';

      const error = parser.extractError(raw);

      expect(error?.type).toBe('api-error');
    });

    it('should return null for non-error output', () => {
      const raw = 'This is a normal response.';

      expect(parser.extractError(raw)).toBeNull();
    });
  });

  describe('parse() compatibility', () => {
    it('should return GeminiCliResponse compatible object', () => {
      const raw = JSON.stringify({
        response: 'Compatible response',
        session_id: 'gem_compat',
      });

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.response).toBe('Compatible response');
      expect(result?.session_id).toBe('gem_compat');
    });

    it('should include stats when usage available', () => {
      const raw = JSON.stringify({
        response: 'With stats',
        stats: {
          models: {
            'gemini-2.5-flash': {
              tokens: { input: 100, candidates: 50 },
            },
          },
        },
      });

      const result = parser.parse(raw);

      expect(result?.stats).toBeDefined();
    });
  });

  describe('complex real-world scenarios', () => {
    it('should handle response with ANSI color codes', () => {
      const raw = '\x1b[32mSuccess:\x1b[0m Response text here';

      const result = parser.parseResilient(raw);

      expect(result).not.toBeNull();
      expect(result?.parseStrategy).toBe('plain-text');
    });

    it('should handle response with Unicode characters', () => {
      const raw = JSON.stringify({ response: 'Hello 世界! 🌍' });

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('Hello 世界! 🌍');
    });

    it('should handle very long responses', () => {
      const longText = 'x'.repeat(10000);
      const raw = JSON.stringify({ response: longText });

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe(longText);
    });

    it('should handle nested JSON in response', () => {
      const raw = JSON.stringify({
        response: '{"nested": "json", "in": "response"}',
      });

      const result = parser.parseResilient(raw);

      expect(result?.response).toBe('{"nested": "json", "in": "response"}');
    });
  });
});
