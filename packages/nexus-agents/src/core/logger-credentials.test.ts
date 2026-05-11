/**
 * Tests for the logger sanitization patterns.
 * (Source: Issue #185 Phase 1 - Deep object sanitization)
 */

import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeDeep } from './logger.js';
import { FAKE_OPENAI_KEY, FAKE_BEARER_TOKEN, FAKE_AWS_KEY_ID } from './../testing/test-secrets.js';

describe('Logger sanitize', () => {
  describe('API keys', () => {
    it('should redact OpenAI API keys', () => {
      expect(sanitize(`key: ${FAKE_OPENAI_KEY}`)).toBe('key: [REDACTED]');
    });

    it('should redact Anthropic API keys', () => {
      expect(sanitize('Using sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('Using [REDACTED]');
    });
  });

  describe('Bearer tokens', () => {
    it('should redact Bearer tokens', () => {
      expect(sanitize(`Authorization: ${FAKE_BEARER_TOKEN}`)).toBe('Authorization: [REDACTED]');
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
      expect(sanitize(FAKE_AWS_KEY_ID)).toBe('[REDACTED]');
      expect(sanitize(`key: ${FAKE_AWS_KEY_ID}`)).toBe('key: [REDACTED]');
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

describe('Logger sanitizeDeep', () => {
  describe('primitive values', () => {
    it('should return null unchanged', () => {
      expect(sanitizeDeep(null)).toBe(null);
    });

    it('should return undefined unchanged', () => {
      expect(sanitizeDeep(undefined)).toBe(undefined);
    });

    it('should return numbers unchanged', () => {
      expect(sanitizeDeep(42)).toBe(42);
      expect(sanitizeDeep(3.14)).toBe(3.14);
    });

    it('should return booleans unchanged', () => {
      expect(sanitizeDeep(true)).toBe(true);
      expect(sanitizeDeep(false)).toBe(false);
    });

    it('should sanitize strings', () => {
      expect(sanitizeDeep('password=secret')).toBe('[REDACTED]');
      expect(sanitizeDeep('hello world')).toBe('hello world');
    });
  });

  describe('nested objects', () => {
    it('should sanitize nested string values', () => {
      const input = {
        level1: {
          level2: {
            value: 'password=secret123',
          },
        },
      };
      const result = sanitizeDeep(input) as Record<string, unknown>;
      expect((result['level1'] as Record<string, unknown>)['level2']).toEqual({
        value: '[REDACTED]',
      });
    });

    it('should redact sensitive field names regardless of value', () => {
      const input = {
        config: {
          apiKey: 'not-really-a-secret',
          password: 'hunter2',
          token: 'abc123',
        },
      };
      const result = sanitizeDeep(input) as Record<string, unknown>;
      const config = result['config'] as Record<string, unknown>;
      expect(config['apiKey']).toBe('[REDACTED]');
      expect(config['password']).toBe('[REDACTED]');
      expect(config['token']).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive fields', () => {
      const input = {
        user: {
          name: 'John',
          age: 30,
          active: true,
        },
      };
      const result = sanitizeDeep(input);
      expect(result).toEqual(input);
    });
  });

  describe('arrays', () => {
    it('should sanitize string elements in arrays', () => {
      const input = ['password=abc', 'hello', 'api_key=xyz'];
      const result = sanitizeDeep(input);
      expect(result).toEqual(['[REDACTED]', 'hello', '[REDACTED]']);
    });

    it('should sanitize objects within arrays', () => {
      const input = [{ apiKey: 'secret1' }, { apiKey: 'secret2' }];
      const result = sanitizeDeep(input) as Array<Record<string, unknown>>;
      expect(result[0]?.['apiKey']).toBe('[REDACTED]');
      expect(result[1]?.['apiKey']).toBe('[REDACTED]');
    });
  });

  describe('circular references', () => {
    it('should handle circular references safely', () => {
      const obj: Record<string, unknown> = { name: 'test' };
      obj['self'] = obj;
      const result = sanitizeDeep(obj) as Record<string, unknown>;
      expect(result['name']).toBe('test');
      // Circular objects return a marker object
      expect(result['self']).toEqual({ _circular: '[Circular]' });
    });
  });

  describe('sensitive field names (OWASP)', () => {
    it('should redact all standard credential field names', () => {
      const input = {
        password: 'x',
        passwd: 'x',
        pwd: 'x',
        secret: 'x',
        apikey: 'x',
        api_key: 'x',
        token: 'x',
        accessToken: 'x',
        refreshToken: 'x',
        authorization: 'x',
        credential: 'x',
        privateKey: 'x',
        session: 'x',
        cookie: 'x',
      };
      const result = sanitizeDeep(input) as Record<string, unknown>;
      for (const key of Object.keys(input)) {
        expect(result[key]).toBe('[REDACTED]');
      }
    });

    it('should redact PII field names', () => {
      const input = {
        ssn: '123-45-6789',
        creditcard: '4111111111111111',
        card_number: '4111111111111111',
        cvv: '123',
        pin: '1234',
      };
      const result = sanitizeDeep(input) as Record<string, unknown>;
      for (const key of Object.keys(input)) {
        expect(result[key]).toBe('[REDACTED]');
      }
    });
  });

  describe('special types', () => {
    it('should handle functions by returning type description', () => {
      const fn = (): void => {};
      expect(sanitizeDeep(fn)).toBe('[function]');
    });

    it('should handle symbols by returning type description', () => {
      const sym = Symbol('test');
      expect(sanitizeDeep(sym)).toBe('[symbol]');
    });
  });

  describe('real-world scenarios', () => {
    it('should sanitize HTTP headers object', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer eyJhbGc...',
        'x-api-key': FAKE_OPENAI_KEY,
      };
      const result = sanitizeDeep(headers) as Record<string, unknown>;
      expect(result['Content-Type']).toBe('application/json');
      expect(result['Authorization']).toBe('[REDACTED]');
      expect(result['x-api-key']).toBe('[REDACTED]');
    });

    it('should sanitize config object with nested credentials', () => {
      const config = {
        database: {
          host: 'localhost',
          port: 5432,
          // Note: 'credentials' is a sensitive field name, so entire value is redacted
          credentials: {
            username: 'admin',
            password: 'supersecret',
          },
        },
        api: {
          baseUrl: 'https://api.example.com',
          apiKey: 'sk-prod-key-1234567890abcdef12',
        },
      };
      const result = sanitizeDeep(config) as Record<string, unknown>;
      const db = result['database'] as Record<string, unknown>;
      // 'credentials' field is fully redacted due to sensitive field name
      expect(db['credentials']).toBe('[REDACTED]');
      expect(db['host']).toBe('localhost');
      expect(db['port']).toBe(5432);
      const api = result['api'] as Record<string, unknown>;
      expect(api['baseUrl']).toBe('https://api.example.com');
      expect(api['apiKey']).toBe('[REDACTED]');
    });

    it('should sanitize nested objects with non-sensitive parent names', () => {
      const config = {
        database: {
          host: 'localhost',
          port: 5432,
          connection: {
            username: 'admin',
            password: 'supersecret',
          },
        },
      };
      const result = sanitizeDeep(config) as Record<string, unknown>;
      const db = result['database'] as Record<string, unknown>;
      const conn = db['connection'] as Record<string, unknown>;
      // 'connection' is not sensitive, so we traverse into it
      expect(conn['username']).toBe('admin');
      // 'password' inside is sensitive and redacted
      expect(conn['password']).toBe('[REDACTED]');
    });
  });
});
