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
} from '../testing/test-secrets.js';

import {
  sanitizeOutput,
  sanitizeErrorDetails,
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
});
