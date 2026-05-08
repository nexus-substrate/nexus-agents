/**
 * Tests for parseCliErrorEnvelope (#2440).
 */

import { describe, it, expect } from 'vitest';
import { parseCliErrorEnvelope } from './cli-error-envelope.js';

describe('parseCliErrorEnvelope (#2440)', () => {
  // Real-world example from the round-14 audit report.
  const claudeNotLoggedIn = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: true,
    api_error_status: null,
    duration_ms: 116,
    duration_api_ms: 0,
    num_turns: 1,
    result: 'Not logged in · Please run /login',
    stop_reason: 'stop_sequence',
    session_id: '2aa32fa2-deadbeef',
  });

  it('unwraps Claude "Not logged in" envelope and classifies as NOT_AUTHENTICATED', () => {
    const result = parseCliErrorEnvelope(claudeNotLoggedIn, 'claude');
    expect(result).not.toBeNull();
    expect(result?.message).toContain('Not logged in');
    expect(result?.code).toBe('NOT_AUTHENTICATED');
    expect(result?.hint).toContain('claude /login');
  });

  it('appends a per-CLI login hint for codex', () => {
    const codexEnv = JSON.stringify({ error: 'authentication required' });
    const result = parseCliErrorEnvelope(codexEnv, 'codex');
    expect(result?.code).toBe('NOT_AUTHENTICATED');
    expect(result?.hint).toContain('codex login');
  });

  it('appends a per-CLI login hint for gemini', () => {
    const geminiEnv = JSON.stringify({ error: 'invalid api key' });
    const result = parseCliErrorEnvelope(geminiEnv, 'gemini');
    expect(result?.code).toBe('NOT_AUTHENTICATED');
    expect(result?.hint).toContain('gemini');
  });

  it('classifies a non-auth error envelope as EXECUTION_ERROR (not retryable)', () => {
    const env = JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'Model returned 500: temporary upstream issue',
    });
    const result = parseCliErrorEnvelope(env, 'claude');
    expect(result?.code).toBe('EXECUTION_ERROR');
    expect(result?.hint).toBeUndefined();
  });

  it('returns null for non-JSON stdout (caller falls back)', () => {
    expect(parseCliErrorEnvelope('hello world', 'claude')).toBeNull();
    expect(parseCliErrorEnvelope('', 'claude')).toBeNull();
    expect(parseCliErrorEnvelope('  \n  ', 'claude')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseCliErrorEnvelope('{not real json', 'claude')).toBeNull();
  });

  it('returns null for JSON without an error envelope shape', () => {
    expect(parseCliErrorEnvelope(JSON.stringify({ ok: true, data: 42 }), 'claude')).toBeNull();
  });

  it('returns null for Claude envelope with is_error: false', () => {
    expect(
      parseCliErrorEnvelope(
        JSON.stringify({ type: 'result', is_error: false, result: 'normal output' }),
        'claude'
      )
    ).toBeNull();
  });

  it('truncates very long error messages to 240 chars', () => {
    const long = 'X'.repeat(1000);
    const env = JSON.stringify({ type: 'result', is_error: true, result: long });
    const result = parseCliErrorEnvelope(env, 'claude');
    expect(result?.message.length).toBeLessThanOrEqual(240);
  });

  it('takes only the first line of multi-line error messages', () => {
    const env = JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'first line of error\nsecond line with stack trace\nthird line',
    });
    const result = parseCliErrorEnvelope(env, 'claude');
    expect(result?.message).toBe('first line of error');
  });

  it('handles NDJSON (multi-line JSON) by trying the last line', () => {
    const ndjson = [
      JSON.stringify({ type: 'log', message: 'starting' }),
      JSON.stringify({ type: 'log', message: 'thinking' }),
      JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in' }),
    ].join('\n');
    const result = parseCliErrorEnvelope(ndjson, 'claude');
    expect(result?.message).toContain('Not logged in');
    expect(result?.code).toBe('NOT_AUTHENTICATED');
  });

  it('matches "unauthorized" anywhere in the message', () => {
    const env = JSON.stringify({
      type: 'result',
      is_error: true,
      result: '401 Unauthorized: token expired',
    });
    const result = parseCliErrorEnvelope(env, 'claude');
    expect(result?.code).toBe('NOT_AUTHENTICATED');
  });

  it('matches "invalid API key"', () => {
    const env = JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'Invalid API key. Get one at https://console.anthropic.com',
    });
    const result = parseCliErrorEnvelope(env, 'claude');
    expect(result?.code).toBe('NOT_AUTHENTICATED');
  });
});
