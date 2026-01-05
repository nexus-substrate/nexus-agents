/**
 * Tests for Codex CLI Response Parser
 *
 * Verifies defensive parsing of Codex CLI NDJSON output.
 * Tests stream event handling and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { CodexResponseParser } from './codex-parser.js';

describe('CodexResponseParser', () => {
  const parser = new CodexResponseParser();

  /**
   * Helper to create NDJSON stream from events
   */
  function createNdjson(...events: object[]): string {
    return events.map((e) => JSON.stringify(e)).join('\n');
  }

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('codex-parser');
    });

    it('should have correct version range', () => {
      expect(parser.supportedVersionRange).toBe('>=0.70.0 <1.0.0');
    });
  });

  describe('parse()', () => {
    it('should parse complete NDJSON stream', () => {
      const raw = createNdjson(
        { type: 'thread.started', thread_id: 'thread_123' },
        { type: 'turn.started' },
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Hello!' },
        },
        {
          type: 'turn.completed',
          usage: { input_tokens: 100, output_tokens: 50 },
        }
      );

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.threadId).toBe('thread_123');
      expect(result?.messages).toEqual(['Hello!']);
      expect(result?.usage?.inputTokens).toBe(100);
      expect(result?.usage?.outputTokens).toBe(50);
    });

    it('should extract multiple messages', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'First' },
        },
        {
          type: 'item.completed',
          item: { id: 'msg_2', type: 'agent_message', text: 'Second' },
        }
      );

      const result = parser.parse(raw);

      expect(result?.messages).toEqual(['First', 'Second']);
    });

    it('should extract reasoning traces', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'reason_1', type: 'reasoning', text: 'Thinking...' },
        },
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Result' },
        }
      );

      const result = parser.parse(raw);

      expect(result?.reasoning).toEqual(['Thinking...']);
      expect(result?.messages).toEqual(['Result']);
    });

    it('should return null for empty stream', () => {
      expect(parser.parse('')).toBeNull();
      expect(parser.parse('\n\n')).toBeNull();
    });

    it('should return null for stream with no messages or reasoning', () => {
      const raw = createNdjson(
        { type: 'thread.started', thread_id: 'thread_123' },
        { type: 'turn.started' },
        { type: 'turn.completed' }
      );

      expect(parser.parse(raw)).toBeNull();
    });

    it('should skip malformed lines', () => {
      const raw = [
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Valid' },
        }),
        'not valid json',
        '{incomplete',
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg_2', type: 'agent_message', text: 'Also valid' },
        }),
      ].join('\n');

      const result = parser.parse(raw);

      expect(result?.messages).toEqual(['Valid', 'Also valid']);
    });
  });

  describe('extractResponse()', () => {
    it('should extract concatenated agent_message texts', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Line 1' },
        },
        {
          type: 'item.completed',
          item: { id: 'msg_2', type: 'agent_message', text: 'Line 2' },
        }
      );

      expect(parser.extractResponse(raw)).toBe('Line 1\nLine 2');
    });

    it('should return null for no messages', () => {
      const raw = createNdjson(
        { type: 'thread.started', thread_id: 'thread_123' },
        {
          type: 'item.completed',
          item: { id: 'reason_1', type: 'reasoning', text: 'Thinking...' },
        }
      );

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('should ignore non-agent_message items', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'tool_1', type: 'tool_call', text: 'Ignored' },
        },
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Included' },
        }
      );

      expect(parser.extractResponse(raw)).toBe('Included');
    });
  });

  describe('extractUsage()', () => {
    it('should extract usage from turn.completed event', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
        },
        {
          type: 'turn.completed',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cached_input_tokens: 20,
          },
        }
      );

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.cachedInputTokens).toBe(20);
      expect(usage?.totalTokens).toBe(150);
    });

    it('should return null if no turn.completed event', () => {
      const raw = createNdjson({
        type: 'item.completed',
        item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should return null if usage missing in turn.completed', () => {
      const raw = createNdjson({ type: 'turn.completed' });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should not include cachedInputTokens if null', () => {
      const raw = createNdjson({
        type: 'turn.completed',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.cachedInputTokens).toBeUndefined();
    });
  });

  describe('extractSessionId()', () => {
    it('should extract thread_id from thread.started event', () => {
      const raw = createNdjson(
        { type: 'thread.started', thread_id: 'thread_abc123' },
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
        }
      );

      expect(parser.extractSessionId(raw)).toBe('thread_abc123');
    });

    it('should return null if no thread.started event', () => {
      const raw = createNdjson({
        type: 'item.completed',
        item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
      });

      expect(parser.extractSessionId(raw)).toBeNull();
    });

    it('should return null for non-string thread_id', () => {
      const raw = createNdjson({ type: 'thread.started', thread_id: 123 });

      expect(parser.extractSessionId(raw)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty lines in stream', () => {
      const raw = [
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
        }),
        '',
        '   ',
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 50 } }),
      ].join('\n');

      const result = parser.parse(raw);

      expect(result?.messages).toEqual(['Hello']);
      expect(result?.usage?.inputTokens).toBe(100);
    });

    it('should handle unicode in messages', () => {
      const raw = createNdjson({
        type: 'item.completed',
        item: { id: 'msg_1', type: 'agent_message', text: '你好 🌍 مرحبا' },
      });

      expect(parser.extractResponse(raw)).toBe('你好 🌍 مرحبا');
    });

    it('should handle very long messages', () => {
      const longText = 'x'.repeat(100000);
      const raw = createNdjson({
        type: 'item.completed',
        item: { id: 'msg_1', type: 'agent_message', text: longText },
      });

      expect(parser.extractResponse(raw)).toBe(longText);
    });

    it('should handle missing item in item.completed', () => {
      const raw = createNdjson(
        { type: 'item.completed' }, // Missing item
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 'Valid' },
        }
      );

      expect(parser.extractResponse(raw)).toBe('Valid');
    });

    it('should handle missing text in item', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message' }, // Missing text
        },
        {
          type: 'item.completed',
          item: { id: 'msg_2', type: 'agent_message', text: 'Valid' },
        }
      );

      expect(parser.extractResponse(raw)).toBe('Valid');
    });

    it('should handle non-string text in item', () => {
      const raw = createNdjson(
        {
          type: 'item.completed',
          item: { id: 'msg_1', type: 'agent_message', text: 123 }, // Non-string
        },
        {
          type: 'item.completed',
          item: { id: 'msg_2', type: 'agent_message', text: 'Valid' },
        }
      );

      expect(parser.extractResponse(raw)).toBe('Valid');
    });
  });
});
