/**
 * Tests for Secure Handler Audit Integration
 *
 * @module audit/secure-handler-audit.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  actorFromContext,
  resultToOutcome,
  logToolInvocationAudit,
  logPolicyAudit,
  logRateLimitAudit,
} from './secure-handler-audit.js';
import type { IAuditLogger, AuditActor } from './audit-types.js';
import type { RequestContext } from '../mcp/middleware/request-context.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(clientId?: string, userAgent?: string) {
  return {
    requestId: 'req-1',
    caller: {
      clientId,
      userAgent,
    },
    startTime: Date.now(),
    toolName: 'test-tool',
  } as RequestContext;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockAuditLogger() {
  return {
    log: vi.fn(),
    logToolInvocation: vi.fn(),
    logPolicyDecision: vi.fn(),
    logSecurityEvent: vi.fn(),
    logRateLimitViolation: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  } satisfies IAuditLogger;
}

// ============================================================================
// actorFromContext
// ============================================================================

describe('actorFromContext', () => {
  it('returns external type for api-prefixed clientId', () => {
    const actor = actorFromContext(makeContext('api-key-123'));
    expect(actor.type).toBe('external');
    expect(actor.id).toBe('api-key-123');
  });

  it('returns agent type for cli-prefixed clientId', () => {
    const actor = actorFromContext(makeContext('cli-agent-1'));
    expect(actor.type).toBe('agent');
    expect(actor.id).toBe('cli-agent-1');
  });

  it('returns user type for other clientId', () => {
    const actor = actorFromContext(makeContext('user-123'));
    expect(actor.type).toBe('user');
    expect(actor.id).toBe('user-123');
  });

  it('includes userAgent as name', () => {
    const actor = actorFromContext(makeContext('api-key', 'TestAgent/1.0'));
    expect(actor.name).toBe('TestAgent/1.0');
  });

  it('returns fallback when clientId is undefined', () => {
    const fallback: AuditActor = { type: 'system', id: 'fallback-1' };
    const actor = actorFromContext(makeContext(undefined), fallback);
    expect(actor).toEqual(fallback);
  });

  it('returns fallback when clientId is empty', () => {
    const fallback: AuditActor = { type: 'system', id: 'fb' };
    const actor = actorFromContext(makeContext(''), fallback);
    expect(actor).toEqual(fallback);
  });

  it('returns default actor when no fallback and no clientId', () => {
    const actor = actorFromContext(makeContext(undefined));
    expect(actor.type).toBe('system');
    expect(actor.id).toBe('unknown');
  });
});

// ============================================================================
// resultToOutcome
// ============================================================================

describe('resultToOutcome', () => {
  it('returns denied when policy denied', () => {
    expect(resultToOutcome(false, true)).toBe('denied');
  });

  it('returns denied even if isError is true', () => {
    expect(resultToOutcome(true, true)).toBe('denied');
  });

  it('returns failure when isError is true', () => {
    expect(resultToOutcome(true, false)).toBe('failure');
  });

  it('returns success when no error and not denied', () => {
    expect(resultToOutcome(false, false)).toBe('success');
  });

  it('returns success when isError is undefined and not denied', () => {
    expect(resultToOutcome(undefined, false)).toBe('success');
  });
});

// ============================================================================
// logToolInvocationAudit
// ============================================================================

describe('logToolInvocationAudit', () => {
  it('calls auditLogger.logToolInvocation with correct args', () => {
    const logger = makeMockAuditLogger();
    const actor: AuditActor = { type: 'agent', id: 'agent-1' };

    logToolInvocationAudit({
      auditLogger: logger,
      toolName: 'orchestrate',
      outcome: 'success',
      actor,
      requestId: 'req-1',
      durationMs: 500,
    });

    expect(logger.logToolInvocation).toHaveBeenCalledWith({
      toolName: 'orchestrate',
      outcome: 'success',
      actor,
      requestId: 'req-1',
      durationMs: 500,
      errorMessage: undefined,
    });
  });
});

// ============================================================================
// logPolicyAudit
// ============================================================================

describe('logPolicyAudit', () => {
  it('calls auditLogger.logPolicyDecision', () => {
    const logger = makeMockAuditLogger();
    const actor: AuditActor = { type: 'user', id: 'user-1' };

    logPolicyAudit({
      auditLogger: logger,
      policyName: 'rate-limit',
      decision: 'deny',
      reason: 'Rate exceeded',
      toolName: 'orchestrate',
      actor,
      requestId: 'req-2',
    });

    expect(logger.logPolicyDecision).toHaveBeenCalledWith({
      policyName: 'rate-limit',
      decision: 'deny',
      reason: 'Rate exceeded',
      toolName: 'orchestrate',
      actor,
      requestId: 'req-2',
    });
  });
});

// ============================================================================
// logRateLimitAudit
// ============================================================================

describe('logRateLimitAudit', () => {
  it('calls auditLogger.logRateLimitViolation', () => {
    const logger = makeMockAuditLogger();
    const actor: AuditActor = { type: 'external', id: 'api-1' };

    logRateLimitAudit({
      auditLogger: logger,
      toolName: 'orchestrate',
      actor,
      currentRate: 15,
      limitRate: 10,
      requestId: 'req-3',
    });

    expect(logger.logRateLimitViolation).toHaveBeenCalledWith({
      toolName: 'orchestrate',
      actor,
      currentRate: 15,
      limitRate: 10,
      requestId: 'req-3',
    });
  });
});
