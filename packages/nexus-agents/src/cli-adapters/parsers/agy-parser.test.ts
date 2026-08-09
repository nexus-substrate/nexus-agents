/**
 * Tests for the Antigravity (`agy`) CLI response parser (#4346).
 *
 * The load-bearing property is fail-closed classification. `agy` **exits 0 even
 * on failure** — a bad model returns
 * `{"status":"ERROR","response":"","error":"invalid model selection ..."}` with
 * exit code 0 — so an adapter that classifies on exit status would read every
 * agy failure as a success. That is the fail-open class #4350/#4354/#4362/#4363
 * just removed from this repo, and reintroducing it through a new adapter would
 * undo that work.
 *
 * Fixtures are verbatim captures from `agy` v1.1.9 on 2026-08-09.
 *
 * @module cli-adapters/parsers/agy-parser.test
 */

import { describe, it, expect } from 'vitest';
import { AgyResponseParser } from './agy-parser.js';

const parser = new AgyResponseParser();

/** Verbatim capture: `agy --print "Reply with exactly: OK" --output-format json`. */
const SUCCESS_RAW = JSON.stringify({
  conversation_id: 'f1f8db42-c436-42ef-a568-148385671f86',
  status: 'SUCCESS',
  response: 'OK\n',
  duration_seconds: 1.199020029,
  num_turns: 1,
  usage: {
    input_tokens: 16397,
    output_tokens: 5,
    thinking_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 16402,
  },
});

/** Verbatim capture: `agy --print "hi" --model no-such-model` — EXIT CODE 0. */
const ERROR_RAW = JSON.stringify({
  conversation_id: '',
  status: 'ERROR',
  response: '',
  error:
    'invalid model selection (--model "no-such-model" --effort ""): model no-such-model is not recognized',
  duration_seconds: 0,
  num_turns: 0,
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 0,
  },
});

describe('AgyResponseParser', () => {
  describe('successful responses', () => {
    it('extracts the response text', () => {
      expect(parser.extractResponse(SUCCESS_RAW)).toBe('OK\n');
    });

    it('parses the envelope', () => {
      const parsed = parser.parse(SUCCESS_RAW);

      expect(parsed?.status).toBe('SUCCESS');
      expect(parsed?.conversation_id).toBe('f1f8db42-c436-42ef-a568-148385671f86');
    });

    it('reports no error message', () => {
      expect(parser.extractErrorMessage(SUCCESS_RAW)).toBeNull();
    });
  });

  describe('fail closed — agy exits 0 on failure', () => {
    it('does NOT return response text for an ERROR envelope', () => {
      // The whole point: exit code 0 plus this payload must not read as success.
      expect(parser.extractResponse(ERROR_RAW)).toBeNull();
    });

    it('surfaces the error message so the adapter can classify it', () => {
      expect(parser.extractErrorMessage(ERROR_RAW)).toContain('invalid model selection');
    });

    it('treats an absent status field as failure, not success', () => {
      const raw = JSON.stringify({ response: 'looks fine', conversation_id: 'x' });

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('treats an unrecognized status as failure', () => {
      const raw = JSON.stringify({ status: 'PARTIAL', response: 'half an answer' });

      expect(parser.extractResponse(raw)).toBeNull();
    });

    it('treats unparseable output as failure', () => {
      expect(parser.parse('not json at all')).toBeNull();
      expect(parser.extractResponse('not json at all')).toBeNull();
    });

    it('treats truncated JSON as failure', () => {
      const truncated = SUCCESS_RAW.slice(0, SUCCESS_RAW.length / 2);

      expect(parser.extractResponse(truncated)).toBeNull();
    });

    it('treats empty output as failure', () => {
      expect(parser.extractResponse('')).toBeNull();
    });

    it('rejects a SUCCESS envelope whose response is not a string', () => {
      const raw = JSON.stringify({ status: 'SUCCESS', response: { text: 'nested' } });

      expect(parser.extractResponse(raw)).toBeNull();
    });
  });

  describe('token usage', () => {
    it('maps agy usage onto TokenUsage', () => {
      expect(parser.extractUsage(SUCCESS_RAW)).toEqual({
        inputTokens: 16397,
        outputTokens: 5,
        totalTokens: 16402,
      });
    });

    it('folds thinking tokens into output rather than dropping them', () => {
      // agy reports `thinking_tokens` separately. TokenUsage has no field for
      // them, and silently discarding billable tokens would understate cost in
      // the outcome data the routing loop learns from.
      const raw = JSON.stringify({
        status: 'SUCCESS',
        response: 'x',
        usage: {
          input_tokens: 100,
          output_tokens: 10,
          thinking_tokens: 40,
          cache_read_tokens: 7,
          total_tokens: 150,
        },
      });

      expect(parser.extractUsage(raw)).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it('returns null when usage is absent', () => {
      expect(parser.extractUsage(JSON.stringify({ status: 'SUCCESS', response: 'x' }))).toBeNull();
    });

    it('returns null for unparseable output', () => {
      expect(parser.extractUsage('garbage')).toBeNull();
    });
  });
});
