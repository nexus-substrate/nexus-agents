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
