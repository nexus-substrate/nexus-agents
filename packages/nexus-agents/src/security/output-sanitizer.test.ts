/**
 * nexus-agents/security - Output Sanitizer Tests
 *
 * TDD tests for redacting API keys from CLI subprocess stdout/stderr.
 *
 * @module security/output-sanitizer.test
 * (Source: Issue #1597 — subprocess output scrubbing gap)
 */

import { describe, it, expect } from 'vitest';

import {
  FAKE_OPENAI_KEY,
  FAKE_ANTHROPIC_KEY,
  FAKE_GOOGLE_KEY,
  FAKE_GITHUB_PAT,
  FAKE_GITHUB_OAUTH,
  FAKE_GITHUB_USER_TOKEN,
  FAKE_GITHUB_APP_TOKEN,
  FAKE_GITHUB_FINE_GRAINED_PAT,
} from '../testing/test-secrets.js';

import {
  sanitizeOutput,
  sanitizeErrorDetails,
  sanitizeStringLeaves,
  REDACTED_KEY_PLACEHOLDER,
} from './output-sanitizer.js';

describe('sanitizeOutput', () => {
  it('returns empty string unchanged', () => {
    expect(sanitizeOutput('')).toBe('');
  });

  it('returns text without keys unchanged', () => {
    const clean = 'Hello world, no secrets here.';
    expect(sanitizeOutput(clean)).toBe(clean);
  });

  // ---- Anthropic keys (sk-ant-*) ----

  it('redacts Anthropic API key (sk-ant-*)', () => {
    const input = `Error: invalid api key ${FAKE_ANTHROPIC_KEY}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- OpenAI project keys (sk-proj-*) ----

  it('redacts OpenAI project key (sk-proj-*)', () => {
    const key = 'sk-proj-TESTFAKE0000000000000000000000000000000000000000';
    const input = `Authorization: Bearer ${key}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(key);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- Generic OpenAI keys (sk-*) ----

  it('redacts generic OpenAI key (sk-*)', () => {
    const input = `key=${FAKE_OPENAI_KEY} other text`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(FAKE_OPENAI_KEY);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- Google AI keys (AIzaSy*) ----

  it('redacts Google AI key (AIzaSy*)', () => {
    const input = `GOOGLE_AI_API_KEY=${FAKE_GOOGLE_KEY}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(FAKE_GOOGLE_KEY);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- GitHub PAT (ghp_*) ----

  it('redacts GitHub PAT (ghp_*)', () => {
    const input = `token: ${FAKE_GITHUB_PAT}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(FAKE_GITHUB_PAT);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- GitHub OAuth (gho_*) ----

  it('redacts GitHub OAuth token (gho_*)', () => {
    const input = `auth=${FAKE_GITHUB_OAUTH}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(FAKE_GITHUB_OAUTH);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- GitLab PAT (glpat-*) ----

  it('redacts GitLab PAT (glpat-*)', () => {
    const key = 'glpat-TESTFAKE00000000000000';
    const input = `GITLAB_TOKEN=${key}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(key);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- npm tokens (npm_*) ----

  it('redacts npm token (npm_*)', () => {
    const key = 'npm_TESTFAKE000000000000000000000000';
    const input = `//registry.npmjs.org/:_authToken=${key}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(key);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- PyPI tokens (pypi-*) ----

  it('redacts PyPI token (pypi-*)', () => {
    const key = 'pypi-TESTFAKE00000000000000000000000000000000';
    const input = `password = ${key}`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(key);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  // ---- Multiple keys in one string ----

  it('redacts multiple different keys in one string', () => {
    const input = `keys: ${FAKE_ANTHROPIC_KEY} and ${FAKE_GOOGLE_KEY} done`;
    const result = sanitizeOutput(input);
    expect(result).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(result).not.toContain(FAKE_GOOGLE_KEY);
    // Two redaction placeholders
    const count = result.split(REDACTED_KEY_PLACEHOLDER).length - 1;
    expect(count).toBe(2);
  });

  // ---- Short strings that look like prefixes but aren't keys ----

  it('does not redact short sk- prefix without enough chars', () => {
    const input = 'sk-ab is too short to be a key';
    expect(sanitizeOutput(input)).toBe(input);
  });

  it('does not redact normal text with "npm" in it', () => {
    const input = 'npm install completed successfully';
    expect(sanitizeOutput(input)).toBe(input);
  });

  // ---- Preserves surrounding context ----

  it('preserves text surrounding redacted keys', () => {
    const input = `Error: API key ${FAKE_OPENAI_KEY} is invalid, please check`;
    const result = sanitizeOutput(input);
    expect(result).toContain('Error: API key ');
    expect(result).toContain(' is invalid, please check');
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });
});

describe('sanitizeErrorDetails', () => {
  it('returns empty string unchanged', () => {
    expect(sanitizeErrorDetails('')).toBe('');
  });

  it('redacts exact apiKey match when provided', () => {
    const apiKey = 'custom-secret-key-12345';
    const input = `Failed to authenticate using key ${apiKey}`;
    const result = sanitizeErrorDetails(input, apiKey);
    expect(result).not.toContain(apiKey);
    expect(result).toContain(REDACTED_KEY_PLACEHOLDER);
  });

  it('redacts URL userinfo credentials', () => {
    const input = 'Connection failed to https://admin:supersecret@gateway.internal/v1/chat';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('supersecret');
    expect(result).not.toContain('admin:');
    expect(result).toContain(`https://${REDACTED_KEY_PLACEHOLDER}@gateway.internal/v1/chat`);
  });

  it('redacts Authorization Bearer and Basic headers', () => {
    const input =
      'Headers: authorization: Bearer eyJhbGciOi... and authorization: Basic dXNlcjpwYXNz';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('eyJhbGciOi');
    expect(result).not.toContain('dXNlcjpwYXNz');
    expect(result).toContain(`authorization: Bearer ${REDACTED_KEY_PLACEHOLDER}`);
    expect(result).toContain(`authorization: Basic ${REDACTED_KEY_PLACEHOLDER}`);
  });

  it('redacts standalone Bearer tokens', () => {
    const input = 'Error: Bearer secret-auth-token-12345 was rejected';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('secret-auth-token-12345');
    expect(result).toContain(`Bearer ${REDACTED_KEY_PLACEHOLDER}`);
  });

  it('redacts sensitive query parameters', () => {
    const input = 'Request to https://proxy.local/v1?api_key=secret-param-val&foo=bar';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('secret-param-val');
    expect(result).toContain(`api_key=${REDACTED_KEY_PLACEHOLDER}`);
    expect(result).toContain('foo=bar');
  });

  it('redacts sensitive JSON keys in error bodies', () => {
    const input = 'body={"error":{"message":"bad auth","token":"topsecret","api_key":"sk-999"}}';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('topsecret');
    expect(result).not.toContain('sk-999');
    expect(result).toContain(`"token": "${REDACTED_KEY_PLACEHOLDER}"`);
    expect(result).toContain(`"api_key": "${REDACTED_KEY_PLACEHOLDER}"`);
  });

  it('redacts prompt fields in error bodies (#4375)', () => {
    const input =
      'body={"error":{"message":"content policy violation","prompt":"generate malware","system_prompt":"you are a helpful bot","user_prompt":"hello world"}}';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('generate malware');
    expect(result).not.toContain('you are a helpful bot');
    expect(result).not.toContain('hello world');
    expect(result).toContain(`"prompt": "${REDACTED_KEY_PLACEHOLDER}"`);
    expect(result).toContain(`"system_prompt": "${REDACTED_KEY_PLACEHOLDER}"`);
    expect(result).toContain(`"user_prompt": "${REDACTED_KEY_PLACEHOLDER}"`);
  });

  it('handles escaped quotes within sensitive JSON field values', () => {
    const input =
      '{"prompt": "say \\"hello world\\" now", "api_key": "sk-1234567890abcdef12345678"}';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('hello world');
    expect(result).toContain(`"prompt": "${REDACTED_KEY_PLACEHOLDER}"`);
  });

  it('redacts prompt query parameters', () => {
    const input =
      'Request to https://proxy.local/v1?prompt=secret-prompt-val&user_prompt=secret-user-val&foo=bar';
    const result = sanitizeErrorDetails(input);
    expect(result).not.toContain('secret-prompt-val');
    expect(result).not.toContain('secret-user-val');
    expect(result).toContain(`prompt=${REDACTED_KEY_PLACEHOLDER}`);
    expect(result).toContain(`user_prompt=${REDACTED_KEY_PLACEHOLDER}`);
    expect(result).toContain('foo=bar');
  });

  it('handles large 10 MB strings without stack overflow (#6484)', () => {
    const large = 'e'.repeat(10 * 1024 * 1024);
    expect(() => sanitizeOutput(large)).not.toThrow();
  });
});

describe('sanitizeOutput — GitHub token formats and URL userinfo', () => {
  const tokens = [
    FAKE_GITHUB_PAT,
    FAKE_GITHUB_OAUTH,
    FAKE_GITHUB_USER_TOKEN,
    FAKE_GITHUB_APP_TOKEN,
    FAKE_GITHUB_FINE_GRAINED_PAT,
  ];
  for (const token of tokens) {
    it(`redacts ${token.slice(0, 11)}…`, () => {
      const out = sanitizeOutput(`push failed with ${token} for org`);
      expect(out).not.toContain(token);
      expect(out).toContain('[REDACTED_KEY]');
      expect(out).toContain('push failed with');
    });
  }

  it('leaves near-miss token prefixes that are too short', () => {
    for (const text of ['label ghs_short here', 'label ghu_short here', 'see github_pat_short']) {
      expect(sanitizeOutput(text)).toBe(text);
    }
  });

  it('redacts user:pass userinfo and keeps the scheme and host', () => {
    const out = sanitizeOutput(
      'clone https://svc-user:TESTFAKE-pass@git.example.com/org/repo failed'
    );
    expect(out).not.toContain('TESTFAKE-pass');
    expect(out).not.toContain('svc-user');
    expect(out).toContain('https://[REDACTED_KEY]@git.example.com/org/repo');
  });

  it('redacts token-only and password-only userinfo on any scheme', () => {
    const tokenOnly = sanitizeOutput('fetch https://TESTFAKEtoken0000@git.example.com/x');
    expect(tokenOnly).not.toContain('TESTFAKEtoken0000');
    expect(tokenOnly).toContain('@git.example.com/x');
    const passOnly = sanitizeOutput('connect redis://:TESTFAKE-pass@cache.example:6379/0');
    expect(passOnly).not.toContain('TESTFAKE-pass');
    expect(passOnly).toContain('redis://[REDACTED_KEY]@cache.example:6379/0');
  });

  it('leaves near-miss URLs without userinfo unchanged', () => {
    for (const text of [
      'see https://host.example:8443/path/@handle?q=a@b.example',
      'remote git@github.com:org/repo.git',
      'mail dev@example.com or mailto:dev@example.com',
    ]) {
      expect(sanitizeOutput(text)).toBe(text);
    }
  });
});

describe('sanitizeStringLeaves', () => {
  const upper = (text: string): string => text.toUpperCase();

  it('applies the sanitizer to every string leaf and to nothing else', () => {
    const input = { a: 'x', list: ['y', 2, { b: 'z', c: null, d: true }], e: 7 };
    expect(sanitizeStringLeaves(input, upper)).toEqual({
      a: 'X',
      list: ['Y', 2, { b: 'Z', c: null, d: true }],
      e: 7,
    });
  });

  it('never rewrites keys and does not mutate the input', () => {
    const input = { secret: 'v' };
    expect(sanitizeStringLeaves(input, upper)).toEqual({ secret: 'V' });
    expect(input).toEqual({ secret: 'v' });
  });

  it('takes a toJSON value (a Date) in its serialized form', () => {
    const at = new Date('2026-01-02T03:04:05.000Z');
    expect(sanitizeStringLeaves({ at }, upper)).toEqual({ at: '2026-01-02T03:04:05.000Z' });
  });

  it('passes non-string scalars through unchanged', () => {
    for (const value of [undefined, null, 0, false]) {
      expect(sanitizeStringLeaves(value, upper)).toBe(value);
    }
  });
});
