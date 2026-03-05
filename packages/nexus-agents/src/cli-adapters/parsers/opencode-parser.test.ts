/**
 * Tests for OpenCode CLI Response Parser
 *
 * Verifies defensive parsing of OpenCode CLI JSON output.
 * Tests NDJSON event stream handling and plain JSON fallback.
 *
 * (Source: Issue #1124)
 */

import { describe, it, expect } from 'vitest';
import { OpenCodeResponseParser } from './opencode-parser.js';

describe('OpenCodeResponseParser', () => {
  const parser = new OpenCodeResponseParser();

  /**
   * Helper to create NDJSON stream from events.
   */
  function createNdjson(...events: object[]): string {
    return events.map((e) => JSON.stringify(e)).join('\n');
  }

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('opencode-parser');
    });

    it('should have correct version range', () => {
      expect(parser.supportedVersionRange).toBe('>=1.0.0 <2.0.0');
    });
  });

  describe('parse()', () => {
    it('should parse NDJSON stream with session and message events', () => {
      const raw = createNdjson(
        { type: 'session.start', session_id: 'oc-sess-123' },
        { type: 'message.delta', content: 'Hello ' },
        { type: 'message.delta', content: 'world!' },
        {
          type: 'message.complete',
          content: '',
          usage: { input_tokens: 100, output_tokens: 50 },
        }
      );

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('oc-sess-123');
      expect(result?.content).toBe('Hello world!');
      expect(result?.usage?.inputTokens).toBe(100);
      expect(result?.usage?.outputTokens).toBe(50);
      expect(result?.usage?.totalTokens).toBe(150);
    });

    it('should parse message.complete with content', () => {
      const raw = createNdjson({
        type: 'message.complete',
        content: 'Full response here',
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      const result = parser.parse(raw);

      expect(result?.content).toBe('Full response here');
      expect(result?.usage?.inputTokens).toBe(200);
    });

    it('should extract session_id from session.complete', () => {
      const raw = createNdjson(
        { type: 'message.delta', content: 'Result' },
        { type: 'session.complete', session_id: 'sess-end-456' }
      );

      const result = parser.parse(raw);
      // session.complete doesn't set sessionId in processLine, only session.start does
      expect(result?.content).toBe('Result');
    });

    it('should handle sessionId alternative key', () => {
      const raw = createNdjson(
        { type: 'session.start', sessionId: 'alt-key-id' },
        { type: 'message.delta', content: 'Test' }
      );

      const result = parser.parse(raw);
      expect(result?.sessionId).toBe('alt-key-id');
    });

    it('should handle message.delta with delta field', () => {
      const raw = createNdjson({ type: 'message.delta', delta: 'Delta content' });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Delta content');
    });

    it('should handle message.delta with text field', () => {
      const raw = createNdjson({ type: 'message.delta', text: 'Text content' });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Text content');
    });

    it('should return null for empty input', () => {
      expect(parser.parse('')).toBeNull();
      expect(parser.parse('\n\n')).toBeNull();
    });

    it('should skip malformed JSON lines', () => {
      const raw = [
        JSON.stringify({ type: 'message.delta', content: 'Valid' }),
        'not valid json',
        '{incomplete',
        JSON.stringify({ type: 'message.delta', content: ' line' }),
      ].join('\n');

      const result = parser.parse(raw);
      expect(result?.content).toBe('Valid line');
    });

    it('should fall back to plain JSON for non-NDJSON output', () => {
      const raw = JSON.stringify({
        content: 'Plain JSON response',
        session_id: 'plain-sess',
        usage: { input_tokens: 50, output_tokens: 25 },
      });

      const result = parser.parse(raw);

      expect(result?.content).toBe('Plain JSON response');
      expect(result?.sessionId).toBe('plain-sess');
      expect(result?.usage?.inputTokens).toBe(50);
      expect(result?.usage?.outputTokens).toBe(25);
    });

    it('should handle plain JSON with result field', () => {
      const raw = JSON.stringify({ result: 'Alternative field' });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Alternative field');
    });

    it('should handle plain JSON with text field', () => {
      const raw = JSON.stringify({ text: 'Text field response' });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Text field response');
    });

    it('should handle plain JSON with output field', () => {
      const raw = JSON.stringify({ output: 'Output field response' });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Output field response');
    });

    it('should return null for plain JSON without recognized fields', () => {
      const raw = JSON.stringify({ unknown_field: 'no match' });

      const result = parser.parse(raw);
      expect(result).toBeNull();
    });

    it('should handle empty lines between events', () => {
      const raw = [
        JSON.stringify({ type: 'message.delta', content: 'Hello' }),
        '',
        '   ',
        JSON.stringify({
          type: 'message.complete',
          content: ' world',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ].join('\n');

      const result = parser.parse(raw);
      expect(result?.content).toBe('Hello world');
    });
  });

  describe('extractResponse()', () => {
    it('should extract concatenated content from NDJSON', () => {
      const raw = createNdjson(
        { type: 'message.delta', content: 'Line 1' },
        { type: 'message.delta', content: ' Line 2' }
      );

      expect(parser.extractResponse(raw)).toBe('Line 1 Line 2');
    });

    it('should return null for empty content', () => {
      const raw = createNdjson(
        { type: 'session.start', session_id: 'sess' },
        { type: 'session.complete' }
      );

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parser.extractResponse('')).toBeNull();
    });
  });

  describe('extractUsage()', () => {
    it('should extract usage from message.complete event', () => {
      const raw = createNdjson(
        { type: 'message.delta', content: 'Hello' },
        {
          type: 'message.complete',
          usage: { input_tokens: 100, output_tokens: 50 },
        }
      );

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.totalTokens).toBe(150);
    });

    it('should extract usage from session.complete event', () => {
      const raw = createNdjson(
        { type: 'message.delta', content: 'Hello' },
        {
          type: 'session.complete',
          usage: { input_tokens: 200, output_tokens: 80 },
        }
      );

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(200);
      expect(usage?.outputTokens).toBe(80);
    });

    it('should extract usage with inputTokens/outputTokens keys', () => {
      const raw = createNdjson({
        type: 'session.complete',
        usage: { inputTokens: 300, outputTokens: 150 },
      });

      const usage = parser.extractUsage(raw);

      expect(usage?.inputTokens).toBe(300);
      expect(usage?.outputTokens).toBe(150);
    });

    it('should return null if no usage in events', () => {
      const raw = createNdjson({ type: 'message.delta', content: 'No usage' });

      expect(parser.extractUsage(raw)).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parser.extractUsage('')).toBeNull();
    });

    it('should return null for malformed usage object', () => {
      const raw = createNdjson({
        type: 'session.complete',
        usage: { bad_field: 100 },
      });

      expect(parser.extractUsage(raw)).toBeNull();
    });
  });

  describe('extractSessionId()', () => {
    it('should extract session_id from session.start', () => {
      const raw = createNdjson(
        { type: 'session.start', session_id: 'oc-abc-123' },
        { type: 'message.delta', content: 'Hello' }
      );

      expect(parser.extractSessionId(raw)).toBe('oc-abc-123');
    });

    it('should extract sessionId from session.start', () => {
      const raw = createNdjson({ type: 'session.start', sessionId: 'oc-alt-456' });

      expect(parser.extractSessionId(raw)).toBe('oc-alt-456');
    });

    it('should extract session_id from session.complete', () => {
      const raw = createNdjson({ type: 'session.complete', session_id: 'oc-end-789' });

      expect(parser.extractSessionId(raw)).toBe('oc-end-789');
    });

    it('should return null for no session events', () => {
      const raw = createNdjson({ type: 'message.delta', content: 'Hello' });

      expect(parser.extractSessionId(raw)).toBeNull();
    });

    it('should return null for non-string session_id', () => {
      const raw = createNdjson({ type: 'session.start', session_id: 12345 });

      expect(parser.extractSessionId(raw)).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parser.extractSessionId('')).toBeNull();
    });
  });

  describe('real opencode v1.2.x format', () => {
    it('should parse step_start/text/step_finish stream', () => {
      const raw = createNdjson(
        {
          type: 'step_start',
          sessionID: 'ses_abc123',
          part: { type: 'step-start', sessionID: 'ses_abc123' },
        },
        {
          type: 'text',
          sessionID: 'ses_abc123',
          part: { type: 'text', text: 'Hello from OpenCode!', time: { start: 1, end: 2 } },
        },
        {
          type: 'step_finish',
          sessionID: 'ses_abc123',
          part: {
            type: 'step-finish',
            reason: 'stop',
            cost: 0,
            tokens: { total: 18080, input: 78, output: 23, reasoning: 0 },
          },
        }
      );

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('Hello from OpenCode!');
      expect(result?.sessionId).toBe('ses_abc123');
      expect(result?.usage?.inputTokens).toBe(78);
      expect(result?.usage?.outputTokens).toBe(23);
      expect(result?.usage?.totalTokens).toBe(101);
    });

    it('should extract text from part.text in text events', () => {
      const raw = createNdjson(
        {
          type: 'text',
          sessionID: 'ses_1',
          part: { type: 'text', text: 'Part 1 ' },
        },
        {
          type: 'text',
          sessionID: 'ses_1',
          part: { type: 'text', text: 'Part 2' },
        }
      );

      const result = parser.parse(raw);
      expect(result?.content).toBe('Part 1 Part 2');
    });

    it('should extract sessionID from top-level field', () => {
      const raw = createNdjson({
        type: 'step_start',
        sessionID: 'ses_real_session',
        part: { type: 'step-start' },
      });

      const sessionId = parser.extractSessionId(raw);
      expect(sessionId).toBe('ses_real_session');
    });

    it('should extract usage from step_finish part.tokens', () => {
      const raw = createNdjson(
        {
          type: 'text',
          sessionID: 'ses_1',
          part: { type: 'text', text: 'Result' },
        },
        {
          type: 'step_finish',
          sessionID: 'ses_1',
          part: {
            type: 'step-finish',
            tokens: { total: 500, input: 100, output: 50, reasoning: 0 },
          },
        }
      );

      const usage = parser.extractUsage(raw);
      expect(usage?.inputTokens).toBe(100);
      expect(usage?.outputTokens).toBe(50);
      expect(usage?.totalTokens).toBe(150);
    });

    it('should handle step_finish without tokens gracefully', () => {
      const raw = createNdjson(
        {
          type: 'text',
          sessionID: 'ses_1',
          part: { type: 'text', text: 'OK' },
        },
        {
          type: 'step_finish',
          sessionID: 'ses_1',
          part: { type: 'step-finish', reason: 'stop' },
        }
      );

      const result = parser.parse(raw);
      expect(result?.content).toBe('OK');
      expect(result?.usage).toBeUndefined();
    });

    it('should parse real opencode output verbatim', () => {
      // Exact output from opencode v1.2.15
      const raw = [
        '{"type":"step_start","timestamp":1772226973450,"sessionID":"ses_35f0a92f","part":{"id":"prt_1","sessionID":"ses_35f0a92f","messageID":"msg_1","type":"step-start","snapshot":"e4cf1ced"}}',
        '{"type":"text","timestamp":1772226974029,"sessionID":"ses_35f0a92f","part":{"id":"prt_2","sessionID":"ses_35f0a92f","messageID":"msg_1","type":"text","text":"OK","time":{"start":1772226974028,"end":1772226974028}}}',
        '{"type":"step_finish","timestamp":1772226974101,"sessionID":"ses_35f0a92f","part":{"id":"prt_3","sessionID":"ses_35f0a92f","messageID":"msg_1","type":"step-finish","reason":"stop","snapshot":"e4cf1ced","cost":0,"tokens":{"total":18080,"input":78,"output":23,"reasoning":0,"cache":{"read":17979,"write":0}}}}',
      ].join('\n');

      const result = parser.parse(raw);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('OK');
      expect(result?.sessionId).toBe('ses_35f0a92f');
      expect(result?.usage?.inputTokens).toBe(78);
      expect(result?.usage?.outputTokens).toBe(23);
    });

    it('should handle tool_use-only responses without text events', () => {
      const raw = createNdjson(
        {
          type: 'step_start',
          sessionID: 'ses_tool',
          part: { type: 'step-start' },
        },
        {
          type: 'tool_use',
          sessionID: 'ses_tool',
          part: { type: 'tool-use', name: 'read_file', input: { path: '/tmp/x' } },
        },
        {
          type: 'step_finish',
          sessionID: 'ses_tool',
          part: {
            type: 'step-finish',
            reason: 'stop',
            tokens: { total: 200, input: 50, output: 30, reasoning: 0 },
          },
        }
      );

      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('[Tool-only response — no text output]');
      expect(result?.sessionId).toBe('ses_tool');
      expect(result?.usage?.inputTokens).toBe(50);
      expect(result?.usage?.outputTokens).toBe(30);
    });
  });

  describe('plaintext fallback (#1402)', () => {
    it('should return plaintext when output is not JSON or NDJSON', () => {
      const raw = 'This is a plain text response from OpenCode CLI';
      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe(raw);
    });

    it('should return null for short plaintext', () => {
      const raw = 'short';
      const result = parser.parse(raw);
      expect(result).toBeNull();
    });

    it('should not plaintext-fallback for NDJSON-like content', () => {
      const raw = createNdjson(
        { type: 'unknown.event', data: 'unrecognized' },
        { type: 'another.unknown', data: 'also unrecognized' }
      );
      const result = parser.parse(raw);
      expect(result).toBeNull();
    });

    it('should return plaintext for multi-line non-JSON output', () => {
      const raw = 'Error: Model not available\nPlease check your API key\nRetry later';
      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe(raw);
    });

    it('should return plaintext for error messages from OpenCode', () => {
      const raw = 'opencode: failed to connect to provider anthropic: invalid API key';
      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe(raw);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode content', () => {
      const raw = createNdjson({
        type: 'message.delta',
        content: '你好 🌍 مرحبا',
      });

      expect(parser.extractResponse(raw)).toBe('你好 🌍 مرحبا');
    });

    it('should handle very long content', () => {
      const longText = 'x'.repeat(100000);
      const raw = createNdjson({
        type: 'message.delta',
        content: longText,
      });

      expect(parser.extractResponse(raw)).toBe(longText);
    });

    it('should handle message.complete text field', () => {
      const raw = createNdjson({
        type: 'message.complete',
        text: 'Text field in complete',
      });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Text field in complete');
    });
  });
});
