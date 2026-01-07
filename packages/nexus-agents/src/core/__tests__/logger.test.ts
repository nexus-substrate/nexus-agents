/**
 * Tests for the logger sanitization patterns.
 */

import { describe, it, expect } from 'vitest';
import { sanitize } from '../logger.js';

describe('Logger sanitize', () => {
  describe('API keys', () => {
    it('should redact OpenAI API keys', () => {
      expect(sanitize('key: sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234')).toBe(
        'key: [REDACTED]'
      );
    });

    it('should redact Anthropic API keys', () => {
      expect(sanitize('Using sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('Using [REDACTED]');
    });
  });

  describe('Bearer tokens', () => {
    it('should redact Bearer tokens', () => {
      expect(sanitize('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz')).toBe(
        'Authorization: [REDACTED]'
      );
    });
  });

  describe('generic credentials', () => {
    it('should redact password fields', () => {
      expect(sanitize('password: mysecretpass123')).toBe('[REDACTED]');
      expect(sanitize('password=hunter2')).toBe('[REDACTED]');
      // JSON-style password field - matches pattern including quotes
      expect(sanitize('"password": "secret"')).toContain('[REDACTED]');
    });

    it('should redact api_key fields', () => {
      expect(sanitize('api_key: abc123')).toBe('[REDACTED]');
      expect(sanitize('apiKey=xyz789')).toBe('[REDACTED]');
    });

    it('should redact secret fields', () => {
      expect(sanitize('secret: myvalue')).toBe('[REDACTED]');
    });

    it('should redact token fields', () => {
      expect(sanitize('token: abc123xyz')).toBe('[REDACTED]');
    });
  });

  describe('AWS credentials', () => {
    it('should redact AWS access key IDs', () => {
      expect(sanitize('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED]');
      expect(sanitize('key: AKIAIOSFODNN7EXAMPL2')).toBe('key: [REDACTED]');
    });

    it('should redact AWS secret access keys', () => {
      expect(sanitize('aws_secret_access_key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(
        '[REDACTED]'
      );
      expect(sanitize('aws_secret_access_key=mysecretkey123')).toBe('[REDACTED]');
    });

    it('should redact AWS session tokens', () => {
      // Pattern matches field name + value
      expect(sanitize('aws_session_token: FwoGZXIvYXdzEC0aDMYwi')).toContain('[REDACTED]');
      expect(sanitize('aws_session_token: FwoGZXIvYXdzEC0aDMYwi')).not.toContain(
        'FwoGZXIvYXdzEC0aDMYwi'
      );
    });
  });

  describe('Azure credentials', () => {
    it('should redact Azure account keys', () => {
      expect(sanitize('AccountKey=dGhpc2lzYXRlc3RrZXk=')).toBe('[REDACTED]');
    });

    it('should redact Azure SAS tokens', () => {
      // Pattern matches SharedAccessSignature= followed by alphanumeric/% chars
      const result = sanitize('SharedAccessSignature=sv%3D2021');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Azure connection strings', () => {
      // Pattern matches AccountKey= portion
      const result = sanitize(
        'DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=mykey123='
      );
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('mykey123');
    });
  });

  describe('GCP credentials', () => {
    it('should redact GCP private keys', () => {
      const input =
        '"private_key": "-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----"';
      expect(sanitize(input)).toBe('[REDACTED]');
    });

    it('should redact GCP private key IDs', () => {
      expect(sanitize('"private_key_id": "abc123def456"')).toBe('[REDACTED]');
    });
  });

  describe('GitHub tokens', () => {
    it('should redact GitHub personal access tokens (classic)', () => {
      expect(sanitize('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[REDACTED]');
    });

    it('should redact GitHub fine-grained tokens', () => {
      expect(sanitize('github_pat_11ABCDEFG_xxxxxxxxxxxxxxxxxxxx')).toBe('[REDACTED]');
    });

    it('should redact GitHub OAuth tokens', () => {
      expect(sanitize('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[REDACTED]');
    });

    it('should redact GitHub user-to-server tokens', () => {
      expect(sanitize('ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[REDACTED]');
    });

    it('should redact GitHub server-to-server tokens', () => {
      expect(sanitize('ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[REDACTED]');
    });

    it('should redact GitHub refresh tokens', () => {
      expect(sanitize('ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[REDACTED]');
    });
  });

  describe('mixed content', () => {
    it('should redact multiple secrets in one string', () => {
      const input = 'Config: api_key=abc123 and password=secret and token=xyz';
      const result = sanitize(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('abc123');
      expect(result).not.toContain('secret');
      expect(result).not.toContain('xyz');
    });

    it('should preserve non-sensitive content', () => {
      expect(sanitize('User logged in successfully')).toBe('User logged in successfully');
      expect(sanitize('Error: connection timeout')).toBe('Error: connection timeout');
    });
  });
});
