/**
 * Tests for core/logger.ts
 *
 * Covers sanitize, sanitizeDeep, createLogger, and secret redaction.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sanitize, sanitizeDeep, createLogger } from './logger.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from './time-provider.js';
import {
  FAKE_OPENAI_KEY,
  FAKE_BEARER_TOKEN,
  FAKE_GITHUB_PAT,
  FAKE_AWS_KEY_ID,
} from '../testing/test-secrets.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
  return () => {
    resetTimeProvider();
  };
});

// ============================================================================
// sanitize
// ============================================================================

describe('sanitize', () => {
  it('redacts OpenAI API keys', () => {
    const text = `key: ${FAKE_OPENAI_KEY}`;
    expect(sanitize(text)).toContain('[REDACTED]');
    expect(sanitize(text)).not.toContain('sk-TESTFAKE');
  });

  it('redacts Bearer tokens', () => {
    const text = `Authorization: ${FAKE_BEARER_TOKEN}`;
    expect(sanitize(text)).toContain('[REDACTED]');
    expect(sanitize(text)).not.toContain('eyTEST');
  });

  it('redacts GitHub personal access tokens', () => {
    const text = `token: ${FAKE_GITHUB_PAT}`;
    expect(sanitize(text)).toContain('[REDACTED]');
    expect(sanitize(text)).not.toContain('ghp_');
  });

  it('redacts AWS access key IDs', () => {
    const text = `key: ${FAKE_AWS_KEY_ID}`;
    expect(sanitize(text)).toContain('[REDACTED]');
    expect(sanitize(text)).not.toContain('AKIATEST');
  });

  it('redacts password assignments', () => {
    const text = 'password=my-secret-pass123';
    expect(sanitize(text)).toContain('[REDACTED]');
    expect(sanitize(text)).not.toContain('my-secret');
  });

  it('redacts Google AI API keys', () => {
    const text = 'key: AIzaSyTEST-FAKE-KEY-NOT-REAL-0000000000';
    expect(sanitize(text)).toContain('[REDACTED]');
    expect(sanitize(text)).not.toContain('AIzaSy');
  });

  it('preserves non-secret text', () => {
    const text = 'This is a normal log message with no secrets.';
    expect(sanitize(text)).toBe(text);
  });
});

// ============================================================================
// sanitizeDeep
// ============================================================================

describe('sanitizeDeep', () => {
  it('returns null for null', () => {
    expect(sanitizeDeep(null)).toBeNull();
  });

  it('returns undefined for undefined', () => {
    expect(sanitizeDeep(undefined)).toBeUndefined();
  });

  it('passes through numbers', () => {
    expect(sanitizeDeep(42)).toBe(42);
  });

  it('passes through booleans', () => {
    expect(sanitizeDeep(true)).toBe(true);
  });

  it('sanitizes strings', () => {
    expect(sanitizeDeep(FAKE_OPENAI_KEY)).toContain('[REDACTED]');
  });

  it('sanitizes arrays', () => {
    const result = sanitizeDeep(['normal', FAKE_OPENAI_KEY]);
    expect(result).toEqual(['normal', expect.stringContaining('[REDACTED]')]);
  });

  it('redacts sensitive field names', () => {
    const result = sanitizeDeep({ password: 'secret123', name: 'safe' });
    expect(result).toEqual({ password: '[REDACTED]', name: 'safe' });
  });

  it('redacts nested sensitive fields', () => {
    const result = sanitizeDeep({
      user: { name: 'John', apiKey: 'my-key-123', level: 5 },
    });
    const sanitized = result as Record<string, Record<string, unknown>>;
    expect(sanitized.user?.apiKey).toBe('[REDACTED]');
    expect(sanitized.user?.name).toBe('John');
    expect(sanitized.user?.level).toBe(5);
  });

  it('redacts x-api-key field names', () => {
    const result = sanitizeDeep({ 'x-api-key': 'some-key-value' });
    expect(result).toEqual({ 'x-api-key': '[REDACTED]' });
  });

  it('handles circular references', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };

    obj.self = obj;
    const result = sanitizeDeep(obj) as Record<string, unknown>;
    expect(result.self).toEqual({ _circular: '[Circular]' });
  });

  it('formats non-primitive types', () => {
    expect(sanitizeDeep(Symbol('test'))).toBe('[symbol]');
  });
});

// ============================================================================
// createLogger
// ============================================================================

describe('createLogger', () => {
  it('creates logger with default level', () => {
    const logger = createLogger({ component: 'test' });
    expect(logger).toBeDefined();
    expect(logger.debug).toBeTypeOf('function');
    expect(logger.info).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
  });

  it('creates child logger with merged context', () => {
    const parent = createLogger({ component: 'parent' });
    const child = parent.child({ subComponent: 'child' });
    expect(child).toBeDefined();
    expect(child.debug).toBeTypeOf('function');
  });

  it('supports setLevel', () => {
    const logger = createLogger({ component: 'test' });
    expect(() => {
      logger.setLevel('error');
    }).not.toThrow();
  });

  it('does not throw when logging at any level', () => {
    const logger = createLogger({ component: 'test' });
    logger.setLevel('debug');
    expect(() => {
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg', new Error('test'));
    }).not.toThrow();
  });
});
