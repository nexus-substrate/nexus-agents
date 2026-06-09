/**
 * Tests for the pre-push secret scan (#3669). Fail-closed; value-free findings.
 */

import { describe, it, expect } from 'vitest';
import { scanForSecrets, describeSecretFindings } from './diff-secret-scan.js';

describe('scanForSecrets', () => {
  it('clean text has zero findings', () => {
    const r = scanForSecrets('# Remediation plan\n\n1. adjust routing weight for docs\n');
    expect(r.clean).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it('catches common secret shapes (fail-closed)', () => {
    const cases: Array<[string, string]> = [
      ['-----BEGIN OPENSSH PRIVATE KEY-----', 'private-key-block'],
      ['AKIAIOSFODNN7EXAMPLE', 'aws-access-key-id'],
      ['ghp_' + 'a'.repeat(36), 'github-token'],
      ['xoxb-123456789012-abcdefghABCD', 'slack-token'],
      ['sk-ant-' + 'a'.repeat(24), 'anthropic-key'],
      ['const apiKey = "ABCDEFGHIJKLMNOP1234"', 'generic-credential-assignment'],
    ];
    for (const [text, expected] of cases) {
      const r = scanForSecrets(text);
      expect(r.clean, `should flag: ${text}`).toBe(false);
      expect(r.findings.map((f) => f.pattern)).toContain(expected);
    }
  });

  it('catches newer OpenAI key prefixes that the classic sk- pattern misses (#3752)', () => {
    // The classic `sk-[A-Za-z0-9]{32,}` class breaks at the hyphen in these prefixes.
    const cases: Array<[string, string]> = [
      ['sk-proj-' + 'a'.repeat(40), 'openai-key'],
      ['sk-svcacct-' + 'b'.repeat(40), 'openai-key'],
      ['sk-admin-' + 'c'.repeat(40), 'openai-key'],
      // bodies legitimately contain - and _ (base64url); must still match
      ['sk-proj-' + 'aB1_-'.repeat(10), 'openai-key'],
    ];
    for (const [text, expected] of cases) {
      const r = scanForSecrets(text);
      expect(r.clean, `should flag: ${text}`).toBe(false);
      expect(r.findings.map((f) => f.pattern)).toContain(expected);
    }
  });

  it('catches base64 credential values with = padding (#3752)', () => {
    // base64 of a 16-byte value ends in '==' — the generic class omitted '='.
    const r = scanForSecrets('const token = "YWJjZGVmZ2hpamtsbW5vcA=="');
    expect(r.clean).toBe(false);
    expect(r.findings.map((f) => f.pattern)).toContain('generic-credential-assignment');
  });

  it('still ignores ordinary hyphenated prose after the prefix widening (#3752)', () => {
    // Guard against the widened openai pattern over-matching short / non-key strings.
    expect(scanForSecrets('use the sk- prefix for OpenAI keys in docs').clean).toBe(true);
    expect(scanForSecrets('the well-documented multi-step build-and-test flow').clean).toBe(true);
  });

  it('reports the line number, never the secret value', () => {
    const r = scanForSecrets(`line one\nAKIAIOSFODNN7EXAMPLE\nline three`);
    expect(r.findings[0]?.line).toBe(2);
    expect(describeSecretFindings(r)).toBe('aws-access-key-id@L2');
    // value-free: the summary must not contain the secret
    expect(describeSecretFindings(r)).not.toContain('AKIA');
  });

  it('describeSecretFindings on a clean scan', () => {
    expect(describeSecretFindings(scanForSecrets('all good'))).toBe('no secrets detected');
  });

  it('does not flag ordinary prose / short tokens', () => {
    expect(
      scanForSecrets('the token bus carries events; api key rotation is documented').clean
    ).toBe(true);
  });
});
