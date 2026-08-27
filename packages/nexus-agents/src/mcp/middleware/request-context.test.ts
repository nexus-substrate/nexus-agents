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
  deriveTrustTier,
  extractCallerInfo,
  contextForLogging,
  isRequestContext,
  measuredTrustTier,
  runWithRequestContext,
  getCurrentRequestContext,
} from './request-context.js';
import type { RequestContext } from './request-context.js';

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
// deriveTrustTier (Issue #828)
// ============================================================================

describe('deriveTrustTier', () => {
  it('returns Tier 1 for stdio transport', () => {
    expect(deriveTrustTier({ transport: 'stdio' })).toBe('1');
  });

  it('returns Tier 1 for authenticated known CLI client', () => {
    expect(deriveTrustTier({ authenticated: true, clientId: 'claude-cli' })).toBe('1');
    expect(deriveTrustTier({ authenticated: true, clientId: 'gemini-cli' })).toBe('1');
    expect(deriveTrustTier({ authenticated: true, clientId: 'codex-cli' })).toBe('1');
  });

  it('returns Tier 2 for authenticated unknown client', () => {
    expect(deriveTrustTier({ authenticated: true, clientId: 'custom-client' })).toBe('2');
    expect(deriveTrustTier({ authenticated: true })).toBe('2');
  });

  it('returns Tier 3 for unauthenticated requests', () => {
    expect(deriveTrustTier({})).toBe('3');
    expect(deriveTrustTier({ authenticated: false })).toBe('3');
    expect(deriveTrustTier({ clientId: 'claude-cli' })).toBe('3');
  });

  it('prioritizes stdio over authentication', () => {
    expect(deriveTrustTier({ transport: 'stdio', authenticated: false })).toBe('1');
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
    expect(ctx.trustTier).toBeDefined();
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

  it('includes trustTier', () => {
    const ctx = createRequestContext({ toolName: 'test' });
    const log = contextForLogging(ctx);
    expect(log['trustTier']).toBeDefined();
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
      trustTier: '1',
    };
    expect(isRequestContext(valid)).toBe(true);
  });

  it('returns false for missing trustTier', () => {
    const missing: Record<string, unknown> = {
      requestId: 'req_1234567890abcdef',
      timestamp: '2026-01-01T00:00:00-05:00',
      toolName: 'orchestrate',
      caller: {},
    };
    expect(isRequestContext(missing)).toBe(false);
  });

  it('returns false for invalid trustTier', () => {
    const invalid: Record<string, unknown> = {
      requestId: 'req_1234567890abcdef',
      timestamp: '2026-01-01T00:00:00-05:00',
      toolName: 'orchestrate',
      caller: {},
      trustTier: '5',
    };
    expect(isRequestContext(invalid)).toBe(false);
  });
});

describe('measuredTrustTier (#4733)', () => {
  // #4738 review: `extractCallerInfo` can return `{ sessionId }` or
  // `{ userAgent }` alone. Neither is an input to `deriveTrustTier`, so a
  // "caller object is non-empty" test would have labelled the '3' fallback a
  // measurement the moment a producer supplied only those.
  it('does not treat a caller with only sessionId as measured', () => {
    const context = createRequestContext({ toolName: 'test', caller: { sessionId: 'abc123' } });

    expect(measuredTrustTier(context)).toBeUndefined();
  });

  it('does not treat a caller with only userAgent as measured', () => {
    const context = createRequestContext({ toolName: 'test', caller: { userAgent: 'curl/8' } });

    expect(measuredTrustTier(context)).toBeUndefined();
  });

  it('treats a caller with a derivation input as measured', () => {
    const context = createRequestContext({ toolName: 'test', caller: { transport: 'stdio' } });

    expect(measuredTrustTier(context)).toBe('1');
  });

  // `createRequestContext` falls back to `caller = {}`, and `deriveTrustTier({})`
  // returns '3'. Since nothing supplies callerInfo today, EVERY tier is that
  // fallback — so recording `context.trustTier` records a constant that reads
  // as a measurement. That is what #4699 shipped.

  it('returns undefined when no caller info was supplied — the shipped reality', () => {
    const ctx = createRequestContext({ toolName: 'run_pipeline' });
    // The raw field looks like a measurement...
    expect(ctx.trustTier).toBe('3');
    // ...and is not one.
    expect(measuredTrustTier(ctx)).toBeUndefined();
  });

  it('returns the tier once caller info exists', () => {
    const ctx = createRequestContext({
      toolName: 'run_pipeline',
      caller: { transport: 'stdio' },
    });
    expect(measuredTrustTier(ctx)).toBe('1');
  });

  // The exact shape `extractCallerInfo` returns on its CLAUDE_SESSION_ID path.
  // A previous version of the guard accepted `clientId` as a derivation input,
  // but `deriveTrustTier` reads it only inside `authenticated === true` — so
  // this shape yields the '3' fallback and must NOT be reported as measured.
  it('does not treat a clientId-only caller as measured', () => {
    const context = createRequestContext({
      toolName: 'run_pipeline',
      caller: { clientId: 'claude-cli', sessionId: 'sess_abc' },
    });

    expect(context.trustTier).toBe('3');
    expect(measuredTrustTier(context)).toBeUndefined();
  });

  it('distinguishes a genuine tier 3 from the fallback tier 3', () => {
    // The case the raw field cannot express: an authenticated caller with an
    // unknown client is really tier 3, and must not be conflated with "we did
    // not measure".
    const real = createRequestContext({
      toolName: 'run_pipeline',
      caller: { authenticated: false, clientId: 'something-unknown' },
    });
    expect(real.trustTier).toBe('3');
    expect(measuredTrustTier(real)).toBe('3');

    const fallback = createRequestContext({ toolName: 'run_pipeline' });
    expect(fallback.trustTier).toBe('3');
    expect(measuredTrustTier(fallback)).toBeUndefined();
  });
});

describe('ambient request context (#4981)', () => {
  it('has no ambient context outside runWithRequestContext', () => {
    expect(getCurrentRequestContext()).toBeUndefined();
  });

  it('exposes the context to arbitrarily nested async work', async () => {
    const ctx = createRequestContext({ toolName: 'outer_tool' });

    const seen = await runWithRequestContext(ctx, async () => {
      // An intermediary that drops its arguments entirely — the shape that
      // defeated argument threading (withPrerequisite wrappers are 1-arity).
      await Promise.resolve();
      return ((): RequestContext | undefined => getCurrentRequestContext())();
    });

    expect(seen).toBe(ctx);
  });

  it('unsets the ambient context once the call resolves', async () => {
    const ctx = createRequestContext({ toolName: 'outer_tool' });
    await runWithRequestContext(ctx, () => Promise.resolve());

    expect(getCurrentRequestContext()).toBeUndefined();
  });

  it('lets an inner run shadow an outer one', async () => {
    const outer = createRequestContext({ toolName: 'outer_tool' });
    const inner = createRequestContext({ toolName: 'inner_tool' });

    const seen = await runWithRequestContext(outer, () =>
      runWithRequestContext(inner, () => Promise.resolve(getCurrentRequestContext()))
    );

    expect(seen).toBe(inner);
    expect(seen?.requestId).not.toBe(outer.requestId);
  });
});

describe('ambient context liveness (#4981 review)', () => {
  it('stops being ambient for work that outlives the call', async () => {
    const ctx = createRequestContext({ toolName: 'outer_tool' });
    let deferred: RequestContext | undefined;
    let duringCall: RequestContext | undefined;

    const seen = new Promise<void>((resolve) => {
      void runWithRequestContext(ctx, () => {
        duringCall = getCurrentRequestContext();
        // Detached work scheduled inside the scope but running after it — the
        // shape runAsJob uses when it fires a job body from the handler.
        setTimeout(() => {
          deferred = getCurrentRequestContext();
          resolve();
        }, 5);
        return Promise.resolve();
      });
    });

    await seen;

    // Identity is not liveness: the store is still reachable from the timer,
    // so this only holds because the holder is marked settled.
    expect(duringCall).toBe(ctx);
    expect(deferred).toBeUndefined();
  });
});
