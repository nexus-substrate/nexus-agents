/**
 * Tests for request-context.ts
 *
 * Covers request ID generation, session ID generation, context creation,
 * caller info extraction, logging format, and type guard.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateRequestId,
  generateSessionId,
  createRequestContext,
  extractCallerInfo,
  contextForLogging,
  isRequestContext,
} from './request-context.js';

// ============================================================================
// generateRequestId
// ============================================================================

describe('generateRequestId', () => {
  it('starts with "req_" prefix', () => {
    expect(generateRequestId()).toMatch(/^req_/);
  });

  it('has 16 hex characters after prefix', () => {
    expect(generateRequestId()).toMatch(/^req_[0-9a-f]{16}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateRequestId()));
    expect(ids.size).toBe(20);
  });
});

// ============================================================================
// generateSessionId
// ============================================================================

describe('generateSessionId', () => {
  it('starts with "sess_" prefix', () => {
    expect(generateSessionId()).toMatch(/^sess_/);
  });

  it('has 12 hex characters after prefix', () => {
    expect(generateSessionId()).toMatch(/^sess_[0-9a-f]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSessionId()));
    expect(ids.size).toBe(20);
  });
});

// ============================================================================
// createRequestContext
// ============================================================================

describe('createRequestContext', () => {
  it('creates context with required fields', () => {
    const ctx = createRequestContext({ toolName: 'orchestrate' });
    expect(ctx.requestId).toMatch(/^req_/);
    expect(ctx.timestamp).toBeDefined();
    expect(ctx.toolName).toBe('orchestrate');
    expect(ctx.caller).toBeDefined();
  });

  it('includes caller info when provided', () => {
    const ctx = createRequestContext({
      toolName: 'test',
      caller: { clientId: 'claude-cli', sessionId: 'sess_abc' },
    });
    expect(ctx.caller.clientId).toBe('claude-cli');
    expect(ctx.caller.sessionId).toBe('sess_abc');
  });

  it('defaults caller to empty object', () => {
    const ctx = createRequestContext({ toolName: 'test' });
    expect(ctx.caller).toEqual({});
  });

  it('includes traceId when provided', () => {
    const ctx = createRequestContext({ toolName: 'test', traceId: 'trace-1' });
    expect(ctx.traceId).toBe('trace-1');
  });

  it('includes parentSpanId when provided', () => {
    const ctx = createRequestContext({ toolName: 'test', parentSpanId: 'span-1' });
    expect(ctx.parentSpanId).toBe('span-1');
  });

  it('omits traceId when not provided', () => {
    const ctx = createRequestContext({ toolName: 'test' });
    expect('traceId' in ctx).toBe(false);
  });

  it('returns frozen (immutable) context', () => {
    const ctx = createRequestContext({ toolName: 'test' });
    expect(Object.isFrozen(ctx)).toBe(true);
  });
});

// ============================================================================
// extractCallerInfo
// ============================================================================

describe('extractCallerInfo', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns empty caller for no metadata', () => {
    expect(extractCallerInfo()).toEqual({});
  });

  it('extracts clientId from metadata', () => {
    const info = extractCallerInfo({ clientId: 'claude-cli' });
    expect(info.clientId).toBe('claude-cli');
  });

  it('extracts userAgent from metadata', () => {
    const info = extractCallerInfo({ userAgent: 'TestAgent/1.0' });
    expect(info.userAgent).toBe('TestAgent/1.0');
  });

  it('extracts sessionId from metadata', () => {
    const info = extractCallerInfo({ sessionId: 'sess-123' });
    expect(info.sessionId).toBe('sess-123');
  });

  it('extracts multiple metadata fields together', () => {
    const info = extractCallerInfo({
      clientId: 'claude-cli',
      userAgent: 'TestAgent/1.0',
      sessionId: 'sess-123',
    });
    expect(info.clientId).toBe('claude-cli');
    expect(info.userAgent).toBe('TestAgent/1.0');
    expect(info.sessionId).toBe('sess-123');
  });

  it('ignores non-string metadata values', () => {
    const info = extractCallerInfo({ clientId: 42, userAgent: true });
    expect(info.clientId).toBeUndefined();
    expect(info.userAgent).toBeUndefined();
  });

  it('falls back to CLAUDE_SESSION_ID env var', () => {
    process.env = { ...originalEnv, CLAUDE_SESSION_ID: 'env-sess-1' };
    const info = extractCallerInfo();
    expect(info.clientId).toBe('claude-cli');
    expect(info.sessionId).toBe('env-sess-1');
  });

  it('falls back to GEMINI_SESSION_ID env var', () => {
    process.env = { ...originalEnv, GEMINI_SESSION_ID: 'gem-sess-1' };
    const info = extractCallerInfo();
    expect(info.clientId).toBe('gemini-cli');
    expect(info.sessionId).toBe('gem-sess-1');
  });

  it('prefers metadata over env vars', () => {
    process.env = { ...originalEnv, CLAUDE_SESSION_ID: 'env-sess' };
    const info = extractCallerInfo({ clientId: 'custom-client' });
    expect(info.clientId).toBe('custom-client');
  });
});

// ============================================================================
// contextForLogging
// ============================================================================

describe('contextForLogging', () => {
  it('includes requestId and toolName', () => {
    const ctx = createRequestContext({ toolName: 'orchestrate' });
    const log = contextForLogging(ctx);
    expect(log['requestId']).toBe(ctx.requestId);
    expect(log['toolName']).toBe('orchestrate');
  });

  it('includes clientId when present', () => {
    const ctx = createRequestContext({
      toolName: 'test',
      caller: { clientId: 'claude-cli' },
    });
    const log = contextForLogging(ctx);
    expect(log['clientId']).toBe('claude-cli');
  });

  it('omits clientId when not present', () => {
    const ctx = createRequestContext({ toolName: 'test' });
    const log = contextForLogging(ctx);
    expect('clientId' in log).toBe(false);
  });

  it('includes traceId when present', () => {
    const ctx = createRequestContext({ toolName: 'test', traceId: 'trace-1' });
    const log = contextForLogging(ctx);
    expect(log['traceId']).toBe('trace-1');
  });
});

// ============================================================================
// isRequestContext
// ============================================================================

describe('isRequestContext', () => {
  it('returns true for valid request context', () => {
    const ctx = createRequestContext({ toolName: 'test' });
    expect(isRequestContext(ctx)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRequestContext(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isRequestContext('string')).toBe(false);
    expect(isRequestContext(42)).toBe(false);
  });

  it('returns false for missing requestId', () => {
    expect(isRequestContext({ timestamp: 'x', toolName: 'y', caller: {} })).toBe(false);
  });

  it('returns false for invalid requestId prefix', () => {
    expect(
      isRequestContext({ requestId: 'bad_prefix', timestamp: 'x', toolName: 'y', caller: {} })
    ).toBe(false);
  });

  it('returns false for missing toolName', () => {
    expect(isRequestContext({ requestId: 'req_abc', timestamp: 'x', caller: {} })).toBe(false);
  });

  it('returns false for missing caller', () => {
    expect(isRequestContext({ requestId: 'req_abc', timestamp: 'x', toolName: 'y' })).toBe(false);
  });

  it('validates all required fields together', () => {
    const valid: Record<string, unknown> = {
      requestId: 'req_1234567890abcdef',
      timestamp: '2026-01-01T00:00:00-05:00',
      toolName: 'orchestrate',
      caller: {},
    };
    expect(isRequestContext(valid)).toBe(true);
  });
});
