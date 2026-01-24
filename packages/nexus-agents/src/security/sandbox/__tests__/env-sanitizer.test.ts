/**
 * Environment Sanitizer Tests
 *
 * Tests for environment variable filtering and secret prevention.
 * Verifies that sensitive environment variables are blocked.
 *
 * @module security/sandbox/__tests__/env-sanitizer.test
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeEnvironment,
  validateEnvVar,
  createMinimalEnv,
  looksLikeSecret,
  SAFE_ENV_VARS,
  DENIED_ENV_PREFIXES,
  DENIED_ENV_PATTERNS,
} from '../env-sanitizer.js';

describe('Environment Sanitizer', () => {
  describe('sanitizeEnvironment', () => {
    describe('basic filtering', () => {
      it('should pass through allowed environment variables', () => {
        const sourceEnv = {
          PATH: '/usr/bin',
          HOME: '/home/user',
          NODE_ENV: 'production',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.env).toHaveProperty('PATH', '/usr/bin');
        expect(result.env).toHaveProperty('HOME', '/home/user');
        expect(result.env).toHaveProperty('NODE_ENV', 'production');
        expect(result.blocked).toHaveLength(0);
        expect(result.violations).toHaveLength(0);
      });

      it('should block variables not in allowlist', () => {
        const sourceEnv = {
          PATH: '/usr/bin',
          CUSTOM_VAR: 'value',
        };

        const result = sanitizeEnvironment(sourceEnv, ['PATH']);

        expect(result.env).toHaveProperty('PATH');
        expect(result.env).not.toHaveProperty('CUSTOM_VAR');
        expect(result.blocked).toContain('CUSTOM_VAR');
      });

      it('should skip undefined values', () => {
        const sourceEnv = {
          PATH: '/usr/bin',
          UNDEFINED_VAR: undefined,
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.env).toHaveProperty('PATH');
        expect(result.env).not.toHaveProperty('UNDEFINED_VAR');
      });

      it('should use SAFE_ENV_VARS when allowedVars is empty', () => {
        const sourceEnv = {
          PATH: '/usr/bin',
          NODE_ENV: 'production',
        };

        const result = sanitizeEnvironment(sourceEnv, []);

        expect(result.env).toHaveProperty('PATH');
        expect(result.env).toHaveProperty('NODE_ENV');
      });
    });

    describe('secret detection by prefix', () => {
      it('should block API key prefixes', () => {
        const sourceEnv = {
          API_KEY: 'secret123',
          API_TOKEN: 'token456',
          AUTH_TOKEN: 'auth789',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.env).not.toHaveProperty('API_KEY');
        expect(result.env).not.toHaveProperty('API_TOKEN');
        expect(result.env).not.toHaveProperty('AUTH_TOKEN');
        expect(result.blocked).toContain('API_KEY');
        expect(result.blocked).toContain('API_TOKEN');
        expect(result.blocked).toContain('AUTH_TOKEN');
      });

      it('should block cloud provider prefixes', () => {
        const sourceEnv = {
          AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
          AWS_SECRET_ACCESS_KEY: 'secret',
          AZURE_CLIENT_SECRET: 'secret',
          GCP_SERVICE_ACCOUNT: 'account',
          GOOGLE_APPLICATION_CREDENTIALS: '/path/to/creds',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('AWS_ACCESS_KEY_ID');
        expect(result.blocked).toContain('AWS_SECRET_ACCESS_KEY');
        expect(result.blocked).toContain('AZURE_CLIENT_SECRET');
        expect(result.blocked).toContain('GCP_SERVICE_ACCOUNT');
        expect(result.blocked).toContain('GOOGLE_APPLICATION_CREDENTIALS');
      });

      it('should block AI/ML service prefixes', () => {
        const sourceEnv = {
          ANTHROPIC_API_KEY: 'sk-ant-...',
          OPENAI_API_KEY: 'sk-...',
          HUGGINGFACE_TOKEN: 'hf_...',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('ANTHROPIC_API_KEY');
        expect(result.blocked).toContain('OPENAI_API_KEY');
        expect(result.blocked).toContain('HUGGINGFACE_TOKEN');
      });

      it('should block database connection prefixes', () => {
        const sourceEnv = {
          DATABASE_URL: 'postgres://...',
          DB_PASSWORD: 'secret',
          REDIS_URL: 'redis://...',
          MONGO_URI: 'mongodb://...',
          POSTGRES_PASSWORD: 'secret',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('DATABASE_URL');
        expect(result.blocked).toContain('DB_PASSWORD');
        expect(result.blocked).toContain('REDIS_URL');
        expect(result.blocked).toContain('MONGO_URI');
        expect(result.blocked).toContain('POSTGRES_PASSWORD');
      });

      it('should block VCS token prefixes', () => {
        const sourceEnv = {
          GITHUB_TOKEN: 'ghp_...',
          GH_TOKEN: 'ghp_...',
          GITLAB_TOKEN: 'glpat-...',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('GITHUB_TOKEN');
        expect(result.blocked).toContain('GH_TOKEN');
        expect(result.blocked).toContain('GITLAB_TOKEN');
      });
    });

    describe('secret detection by suffix pattern', () => {
      it('should block variables ending in TOKEN', () => {
        const sourceEnv = {
          MY_CUSTOM_TOKEN: 'secret',
          ACCESS_TOKEN: 'secret',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('MY_CUSTOM_TOKEN');
        expect(result.blocked).toContain('ACCESS_TOKEN');
      });

      it('should block variables ending in SECRET', () => {
        const sourceEnv = {
          CLIENT_SECRET: 'secret',
          APP_SECRET: 'secret',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('CLIENT_SECRET');
        expect(result.blocked).toContain('APP_SECRET');
      });

      it('should block variables ending in PASSWORD', () => {
        const sourceEnv = {
          USER_PASSWORD: 'secret',
          ADMIN_PASSWORD: 'secret',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('USER_PASSWORD');
        expect(result.blocked).toContain('ADMIN_PASSWORD');
      });

      it('should block variables ending in KEY', () => {
        const sourceEnv = {
          ENCRYPTION_KEY: 'secret',
          SIGNING_KEY: 'secret',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('ENCRYPTION_KEY');
        expect(result.blocked).toContain('SIGNING_KEY');
      });

      it('should block case-insensitively', () => {
        const sourceEnv = {
          my_token: 'secret',
          MY_TOKEN: 'secret',
          My_ToKeN: 'secret',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.blocked).toContain('my_token');
        expect(result.blocked).toContain('MY_TOKEN');
        expect(result.blocked).toContain('My_ToKeN');
      });
    });

    describe('additional environment handling', () => {
      it('should merge additional env with source env', () => {
        const sourceEnv = {
          PATH: '/usr/bin',
        };
        const additionalEnv = {
          CUSTOM_VAR: 'value',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS, additionalEnv);

        expect(result.env).toHaveProperty('PATH');
        expect(result.env).toHaveProperty('CUSTOM_VAR', 'value');
      });

      it('should still block secrets in additional env', () => {
        const sourceEnv = {
          PATH: '/usr/bin',
        };
        const additionalEnv = {
          API_KEY: 'secret',
          SAFE_VAR: 'value',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS, additionalEnv);

        expect(result.env).not.toHaveProperty('API_KEY');
        expect(result.env).toHaveProperty('SAFE_VAR');
        expect(result.blocked).toContain('API_KEY');
      });

      it('should allow additional env to bypass allowlist (but not deny list)', () => {
        const sourceEnv = {};
        const additionalEnv = {
          MY_CUSTOM_VAR: 'value', // Not in SAFE_ENV_VARS but should pass
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS, additionalEnv);

        expect(result.env).toHaveProperty('MY_CUSTOM_VAR', 'value');
      });
    });

    describe('violation tracking', () => {
      it('should record violations for blocked variables', () => {
        const sourceEnv = {
          API_KEY: 'secret',
          AUTH_TOKEN: 'token',
        };

        const result = sanitizeEnvironment(sourceEnv, SAFE_ENV_VARS);

        expect(result.violations).toHaveLength(2);
        expect(result.violations[0]?.type).toBe('env');
        expect(result.violations[0]?.denied).toBe('API_KEY');
        expect(result.violations[1]?.denied).toBe('AUTH_TOKEN');
      });
    });
  });

  describe('validateEnvVar', () => {
    it('should return null for allowed variables', () => {
      const result = validateEnvVar('PATH', SAFE_ENV_VARS);
      expect(result).toBeNull();
    });

    it('should return violation for denied prefix', () => {
      const result = validateEnvVar('AWS_SECRET_KEY', SAFE_ENV_VARS);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('env');
      expect(result?.reason).toContain('prefix');
    });

    it('should return violation for denied pattern', () => {
      const result = validateEnvVar('MY_SECRET', SAFE_ENV_VARS);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('env');
    });

    it('should return violation for non-allowlisted variable', () => {
      const result = validateEnvVar('UNKNOWN_VAR', ['PATH', 'HOME']);
      expect(result).not.toBeNull();
      expect(result?.reason).toContain('not in the allowlist');
    });
  });

  describe('createMinimalEnv', () => {
    beforeEach(() => {
      vi.stubEnv('PATH', '/usr/local/bin:/usr/bin:/bin');
      vi.stubEnv('HOME', '/home/testuser');
      vi.stubEnv('USER', 'testuser');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should create minimal environment with essential variables', () => {
      const env = createMinimalEnv();

      expect(env).toHaveProperty('PATH');
      expect(env).toHaveProperty('HOME');
      expect(env).toHaveProperty('USER');
      expect(env).toHaveProperty('SHELL', '/bin/sh');
      expect(env).toHaveProperty('TERM', 'xterm-256color');
      expect(env).toHaveProperty('LANG', 'en_US.UTF-8');
      expect(env).toHaveProperty('LC_ALL', 'en_US.UTF-8');
      expect(env).toHaveProperty('NODE_ENV', 'production');
      expect(env).toHaveProperty('NO_COLOR', '1');
      expect(env).toHaveProperty('CI', 'true');
    });

    it('should use provided cwd for PWD', () => {
      const env = createMinimalEnv('/custom/path');

      expect(env).toHaveProperty('PWD', '/custom/path');
    });

    it('should use process.cwd() when no cwd provided', () => {
      const env = createMinimalEnv();

      expect(env).toHaveProperty('PWD', process.cwd());
    });

    it('should use fallback values when process.env is empty', () => {
      vi.stubEnv('PATH', '');
      vi.stubEnv('HOME', '');
      vi.stubEnv('USER', '');

      const env = createMinimalEnv();

      // Should have fallback or empty values
      expect(env.PATH).toBeDefined();
      expect(env.HOME).toBeDefined();
      expect(env.USER).toBeDefined();
    });
  });

  describe('looksLikeSecret', () => {
    describe('base64 patterns', () => {
      it('should detect long base64 strings', () => {
        const base64Secret = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=';
        expect(looksLikeSecret(base64Secret)).toBe(true);
      });

      it('should not flag short base64 strings', () => {
        const shortBase64 = 'YWJj';
        expect(looksLikeSecret(shortBase64)).toBe(false);
      });
    });

    describe('hex patterns', () => {
      it('should detect long hex strings (like API keys)', () => {
        const hexKey = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
        expect(looksLikeSecret(hexKey)).toBe(true);
      });

      it('should not flag short hex strings', () => {
        const shortHex = 'a1b2c3';
        expect(looksLikeSecret(shortHex)).toBe(false);
      });
    });

    describe('JWT tokens', () => {
      it('should detect JWT format', () => {
        const jwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        expect(looksLikeSecret(jwt)).toBe(true);
      });
    });

    describe('AWS keys', () => {
      it('should detect AWS access key format', () => {
        const awsKey = 'AKIAIOSFODNN7EXAMPLE';
        expect(looksLikeSecret(awsKey)).toBe(true);
      });
    });

    describe('GitHub tokens', () => {
      it('should detect GitHub PAT format', () => {
        const ghToken = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        expect(looksLikeSecret(ghToken)).toBe(true);
      });

      it('should detect GitHub secret format', () => {
        const ghSecret = 'ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        expect(looksLikeSecret(ghSecret)).toBe(true);
      });
    });

    describe('generic long random strings', () => {
      it('should detect long random alphanumeric strings', () => {
        const randomString = 'abcdefghijklmnopqrstuvwxyz1234567890ABCD';
        expect(looksLikeSecret(randomString)).toBe(true);
      });
    });

    describe('non-secrets', () => {
      it('should not flag normal values', () => {
        expect(looksLikeSecret('hello')).toBe(false);
        expect(looksLikeSecret('production')).toBe(false);
        expect(looksLikeSecret('/usr/bin')).toBe(false);
        expect(looksLikeSecret('true')).toBe(false);
        expect(looksLikeSecret('12345')).toBe(false);
      });
    });
  });

  describe('constants', () => {
    describe('SAFE_ENV_VARS', () => {
      it('should include system essentials', () => {
        expect(SAFE_ENV_VARS).toContain('PATH');
        expect(SAFE_ENV_VARS).toContain('HOME');
        expect(SAFE_ENV_VARS).toContain('USER');
        expect(SAFE_ENV_VARS).toContain('SHELL');
        expect(SAFE_ENV_VARS).toContain('TERM');
        expect(SAFE_ENV_VARS).toContain('LANG');
      });

      it('should include Node.js variables', () => {
        expect(SAFE_ENV_VARS).toContain('NODE_ENV');
        expect(SAFE_ENV_VARS).toContain('NODE_OPTIONS');
        expect(SAFE_ENV_VARS).toContain('NODE_PATH');
      });

      it('should include CI/build variables', () => {
        expect(SAFE_ENV_VARS).toContain('CI');
        expect(SAFE_ENV_VARS).toContain('DEBUG');
      });

      it('should not include secret-related variables', () => {
        expect(SAFE_ENV_VARS).not.toContain('API_KEY');
        expect(SAFE_ENV_VARS).not.toContain('SECRET');
        expect(SAFE_ENV_VARS).not.toContain('PASSWORD');
        expect(SAFE_ENV_VARS).not.toContain('TOKEN');
      });
    });

    describe('DENIED_ENV_PREFIXES', () => {
      it('should include credential prefixes', () => {
        expect(DENIED_ENV_PREFIXES).toContain('API_');
        expect(DENIED_ENV_PREFIXES).toContain('AUTH_');
        expect(DENIED_ENV_PREFIXES).toContain('TOKEN_');
        expect(DENIED_ENV_PREFIXES).toContain('SECRET_');
        expect(DENIED_ENV_PREFIXES).toContain('PASSWORD_');
      });

      it('should include cloud provider prefixes', () => {
        expect(DENIED_ENV_PREFIXES).toContain('AWS_');
        expect(DENIED_ENV_PREFIXES).toContain('AZURE_');
        expect(DENIED_ENV_PREFIXES).toContain('GCP_');
        expect(DENIED_ENV_PREFIXES).toContain('GOOGLE_');
      });

      it('should include AI service prefixes', () => {
        expect(DENIED_ENV_PREFIXES).toContain('ANTHROPIC_');
        expect(DENIED_ENV_PREFIXES).toContain('OPENAI_');
      });

      it('should include database prefixes', () => {
        expect(DENIED_ENV_PREFIXES).toContain('DATABASE_');
        expect(DENIED_ENV_PREFIXES).toContain('DB_');
        expect(DENIED_ENV_PREFIXES).toContain('REDIS_');
        expect(DENIED_ENV_PREFIXES).toContain('MONGO_');
      });
    });

    describe('DENIED_ENV_PATTERNS', () => {
      it('should be an array of RegExp patterns', () => {
        expect(Array.isArray(DENIED_ENV_PATTERNS)).toBe(true);
        for (const pattern of DENIED_ENV_PATTERNS) {
          expect(pattern).toBeInstanceOf(RegExp);
        }
      });

      it('should match credential suffixes', () => {
        const patterns = DENIED_ENV_PATTERNS;
        const testVar = 'MY_TOKEN';

        const matches = patterns.some((p) => p.test(testVar));
        expect(matches).toBe(true);
      });
    });
  });
});
