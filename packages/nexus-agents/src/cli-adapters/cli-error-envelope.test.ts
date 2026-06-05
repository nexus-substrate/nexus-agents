/**
 * Tests for parseCliErrorEnvelope (#2440).
 */

import { describe, it, expect } from 'vitest';
import {
  parseCliErrorEnvelope,
  authRemediation,
  classifyExtractedError,
} from './cli-error-envelope.js';

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

  // #2455 ask 1: widened auth regex set
  describe('widened NOT_AUTHENTICATED patterns (#2455)', () => {
    it('matches "API key expired"', () => {
      const env = JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'API key expired. Generate a new one in the console.',
      });
      const result = parseCliErrorEnvelope(env, 'claude');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
      expect(result?.hint).toContain('claude /login');
    });

    it('matches "API key revoked"', () => {
      const env = JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'API key revoked',
      });
      const result = parseCliErrorEnvelope(env, 'codex');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
      expect(result?.hint).toContain('codex login');
    });

    it('matches "API key missing"', () => {
      const env = JSON.stringify({ error: 'API key missing — set ANTHROPIC_API_KEY' });
      const result = parseCliErrorEnvelope(env, 'claude');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
    });

    it('matches "api-key expired" (hyphenated form)', () => {
      const env = JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'api-key expired, please re-authenticate',
      });
      const result = parseCliErrorEnvelope(env, 'claude');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
    });

    it('matches "Token expired" without "unauthorized" keyword', () => {
      const env = JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Token expired. Please re-authenticate.',
      });
      const result = parseCliErrorEnvelope(env, 'claude');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
    });

    it('matches "token revoked"', () => {
      const env = JSON.stringify({ error: 'token revoked by issuer' });
      const result = parseCliErrorEnvelope(env, 'codex');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
    });

    it('does NOT match "permission denied" (authz, not authn — see #2455 ask 1)', () => {
      const env = JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Permission denied: workspace requires admin access',
      });
      const result = parseCliErrorEnvelope(env, 'claude');
      expect(result?.code).toBe('EXECUTION_ERROR');
      expect(result?.hint).toBeUndefined();
    });
  });

  // #3350: stale-OAuth refresh-token rotation must classify as auth and yield
  // a `<cli> login` remediation, not a raw fail-closed error string.
  describe('stale OAuth refresh-token rotation (#3350)', () => {
    const refreshTokenMsg =
      'Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.';

    it('classifies the codex refresh-token-rotation error as NOT_AUTHENTICATED', () => {
      const env = JSON.stringify({ error: refreshTokenMsg });
      const result = parseCliErrorEnvelope(env, 'codex');
      expect(result?.code).toBe('NOT_AUTHENTICATED');
      expect(result?.hint).toContain('codex login');
    });

    it('authRemediation returns a codex-login remediation for the refresh-token error', () => {
      const remediation = authRemediation(refreshTokenMsg, 'codex');
      expect(remediation).not.toBeNull();
      expect(remediation).toContain('codex login');
    });

    it('authRemediation normalizes a "cli-codex" providerId form', () => {
      const remediation = authRemediation(refreshTokenMsg, 'cli-codex');
      expect(remediation).toContain('codex login');
    });

    it('authRemediation returns null for a benign (non-auth) error', () => {
      expect(authRemediation('rate limit exceeded', 'codex')).toBeNull();
    });

    it('authRemediation returns null for an unknown CLI name even on an auth error', () => {
      expect(authRemediation(refreshTokenMsg, 'totally-unknown-cli')).toBeNull();
    });
  });

  describe('classifyExtractedError (error-only stream classification)', () => {
    it('classifies an upstream 401 as NOT_AUTHENTICATED with a login hint', () => {
      // The exact message an OpenCode error-only NDJSON event surfaces.
      const result = classifyExtractedError(
        'Unauthorized: {"detail":"Not authenticated"}',
        'opencode'
      );
      expect(result.code).toBe('NOT_AUTHENTICATED');
      expect(result.hint).toContain('opencode auth login');
    });

    it('classifies a rate-limit message as RATE_LIMITED (no auth hint)', () => {
      const result = classifyExtractedError(
        '429 Too Many Requests: rate limit exceeded',
        'opencode'
      );
      expect(result.code).toBe('RATE_LIMITED');
      expect(result.hint).toBeUndefined();
    });

    it('falls back to EXECUTION_ERROR for an unclassifiable message', () => {
      const result = classifyExtractedError('the model produced an internal error', 'opencode');
      expect(result.code).toBe('EXECUTION_ERROR');
      expect(result.hint).toBeUndefined();
    });

    it('classifies auth but omits the hint for an unknown CLI name', () => {
      const result = classifyExtractedError('Unauthorized', 'totally-unknown-cli');
      expect(result.code).toBe('NOT_AUTHENTICATED');
      expect(result.hint).toBeUndefined();
    });

    it('trims surrounding whitespace from the message', () => {
      expect(classifyExtractedError('  Unauthorized  ', 'opencode').message).toBe('Unauthorized');
    });
  });
});
