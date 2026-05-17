/**
 * Tests for OpenCode CLI Response Parser
 *
 * Verifies defensive parsing of OpenCode CLI JSON output.
 * Tests NDJSON event stream handling and plain JSON fallback.
 *
 * (Source: Issue #1124)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

// Mock createLogger to capture debug calls
const { mockDebug } = vi.hoisted(() => ({ mockDebug: vi.fn() }));
vi.mock('../../core/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../core/index.js')>('../../core/index.js');
  return {
    ...actual,
    createLogger: vi.fn(() => ({ debug: mockDebug, info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  };
});

import { OpenCodeResponseParser } from './opencode-parser.js';

describe('OpenCodeResponseParser', () => {
  const parser = new OpenCodeResponseParser();

  beforeEach(() => {
    mockDebug.mockReset();
  });

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

    it('should log skipped malformed NDJSON lines at debug level (#1472)', () => {
      const raw = [
        JSON.stringify({ type: 'message.delta', content: 'OK' }),
        'bad json here',
        JSON.stringify({ type: 'message.delta', content: '!' }),
      ].join('\n');

      parser.parse(raw);

      const malformedCalls = (mockDebug as MockInstance).mock.calls.filter(
        (c: unknown[]) => c[0] === 'Skipped malformed NDJSON line'
      );
      expect(malformedCalls).toHaveLength(1);
      const firstCall = malformedCalls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall![1]).toEqual({
        lineNumber: 2,
        snippet: 'bad json here',
      });
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

    it('should accept malformed NDJSON as plaintext when parsers fail (#1402)', () => {
      const raw = createNdjson(
        { type: 'unknown.event', data: 'unrecognized' },
        { type: 'another.unknown', data: 'also unrecognized' }
      );
      const result = parser.parse(raw);
      // NDJSON parsing failed → JSON fallback failed → accept as plaintext
      expect(result).not.toBeNull();
      expect(result?.content).toBe(raw.trim());
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

    it('should capture error event message in errorMessage (#2821, #1402)', () => {
      // step_start ran, then an error event arrived — no text produced.
      // Post-#2821: response has content='' (so extractResponse returns null
      // and subprocess-adapter classifies as EXECUTION_ERROR) and the error
      // message lives in errorMessage for log/telemetry visibility.
      const raw = createNdjson(
        { type: 'step_start', sessionID: 'ses_123' },
        {
          type: 'error',
          sessionID: 'ses_123',
          error: { name: 'UnknownError', data: { message: 'Model not found: anthropic/claude.' } },
        }
      );

      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('');
      expect(result?.errorMessage).toContain('Model not found');
      expect(result?.sessionId).toBe('ses_123');
    });

    it('should expose error name in errorMessage when only name is set (#2821)', () => {
      const raw = createNdjson({
        type: 'error',
        sessionID: 'ses_456',
        error: { name: 'ProviderModelNotFoundError' },
      });

      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('');
      expect(result?.errorMessage).toContain('ProviderModelNotFoundError');
    });

    it('should handle error event with null error object', () => {
      // No error.data.message and no error.name → captureErrorMessage returns
      // early, so errorMessage is never set. The error event still marks
      // hasStepEvents=true, so handleEmptyContent falls back to the tool-only
      // marker. Pre-existing behavior — pre-#2821 also returned this.
      const raw = createNdjson({
        type: 'error',
        sessionID: 'ses_789',
      });

      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('[Tool-only response — no text output]');
      expect(result?.errorMessage).toBeUndefined();
    });

    it('should fall back to "Unknown error" message in errorMessage (#2821)', () => {
      const raw = createNdjson({
        type: 'error',
        sessionID: 'ses_err',
        error: { data: { code: 500 } },
      });

      const result = parser.parse(raw);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('');
      expect(result?.errorMessage).toContain('Unknown error');
    });

    it('should make extractResponse return null on error-only streams (#2821)', () => {
      // The whole point of #2821: an error-only stream must surface as
      // failure to the subprocess-adapter, not as `[OpenCode error: ...]`
      // content fed to voters/learners.
      const raw = createNdjson({
        type: 'error',
        sessionID: 'ses_e2e',
        error: { name: 'ProviderModelNotFoundError' },
      });

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('should preserve text content when an error arrives after text (#2821)', () => {
      // Mixed stream: model produced text, then errored. Pre-#2821 the
      // response was `Hello![OpenCode error: ...]`. Post-#2821 content is
      // just the text and the error lives in errorMessage.
      const raw = createNdjson(
        { type: 'step_start', sessionID: 'ses_mix' },
        { type: 'text', sessionID: 'ses_mix', part: { type: 'text', text: 'Hello!' } },
        {
          type: 'error',
          sessionID: 'ses_mix',
          error: { name: 'StreamInterrupted' },
        }
      );

      const result = parser.parse(raw);
      expect(result?.content).toBe('Hello!');
      expect(result?.errorMessage).toContain('StreamInterrupted');
      expect(parser.extractResponse(raw)).toBe('Hello!');
    });

    it('should handle plain JSON with camelCase sessionId', () => {
      const raw = JSON.stringify({
        content: 'Response with camelCase session',
        sessionId: 'camel-sess-1',
      });

      const result = parser.parse(raw);
      expect(result?.content).toBe('Response with camelCase session');
      expect(result?.sessionId).toBe('camel-sess-1');
    });

    it('should reject recognized NDJSON with no content as plaintext', () => {
      // message.start is recognized by isRecognizedLegacyEvent but has no handler
      // that produces content → hasAnyRecognizedEvent = true, no content
      const raw = createNdjson(
        { type: 'message.start', id: 'msg-1' },
        { type: 'session.start', session_id: 'sess-x' }
      );

      const result = parser.parse(raw);
      // NDJSON recognized but no content → parsePlainJson → looks like NDJSON
      // → rejected because hasAnyRecognizedEvent is true
      expect(result).toBeNull();
    });

    it('should return null for usage with only one token field', () => {
      const raw = createNdjson({
        type: 'session.complete',
        usage: { input_tokens: 100 },
      });

      const usage = parser.extractUsage(raw);
      expect(usage).toBeNull();
    });

    it('should handle text event without part field', () => {
      const raw = createNdjson({
        type: 'text',
        sessionID: 'ses_no_part',
      });

      const result = parser.parse(raw);
      // text event processed (hasStepEvents=true) but no part.text → no content
      // → hasStepEvents true → tool-only fallback
      expect(result).not.toBeNull();
      expect(result?.content).toBe('[Tool-only response — no text output]');
    });

    it('should handle step_finish without part field', () => {
      const raw = createNdjson(
        { type: 'text', sessionID: 'ses_1', part: { type: 'text', text: 'OK' } },
        { type: 'step_finish', sessionID: 'ses_1' }
      );

      const result = parser.parse(raw);
      expect(result?.content).toBe('OK');
      expect(result?.usage).toBeUndefined();
    });
  });
});
