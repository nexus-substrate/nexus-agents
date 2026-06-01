/**
 * Tests for the security → durable audit bridge (#3291, epic #3288 item 3).
 */

import { describe, it, expect, vi } from 'vitest';
import { securityAuditEventToInput, createDurableAuditSink } from './audit-bridge.js';
import { AuditTrail } from './audit-trail.js';
import type { AuditEvent as SecurityAuditEvent } from './audit-trail.js';
import type { AuditEventInput, IAuditLogger } from '../audit/audit-types.js';
import { AuditEventInputSchema } from '../audit/audit-types.js';

const base = { id: 'audit-1', timestamp: '2026-06-01T00:00:00Z', component: 'firewall' };

const samples: Record<SecurityAuditEvent['type'], SecurityAuditEvent> = {
  trust_classification: {
    ...base,
    type: 'trust_classification',
    username: 'alice',
    assignedTier: '3',
    userRole: 'contributor',
    isAllowlisted: false,
    wasDowngraded: true,
    reason: 'unknown user',
  },
  policy_gate: {
    ...base,
    type: 'policy_gate',
    actionType: 'GeneratePatchPlan',
    allowed: false,
    requiresApproval: true,
    inputTrustTier: '3',
    violationRules: ['rule_of_two', 'write_requires_t1'],
  },
  corroboration: {
    ...base,
    type: 'corroboration',
    actionType: 'GeneratePatchPlan',
    satisfied: false,
    sourceCount: 1,
    missingRequirements: ['second_source'],
  },
  reputation: {
    ...base,
    type: 'reputation',
    username: 'bob',
    reputationScore: 0.2,
    isSuspicious: true,
    effectiveTier: '4',
    signalCount: 5,
  },
  sanitization: {
    ...base,
    type: 'sanitization',
    source: 'github-issue',
    wasModified: true,
    strippedCount: 2,
    injectionFlagCount: 1,
    strippedElements: [{ tag: '<script>', reason: 'injection vector' }],
  },
  graph_execution: {
    ...base,
    type: 'graph_execution',
    graphEvent: 'node_start',
    nodeId: 'n1',
    stepNumber: 3,
    detail: 'executing node n1',
  },
};

describe('securityAuditEventToInput (#3291)', () => {
  it('maps every security event type to a schema-valid durable AuditEventInput', () => {
    for (const event of Object.values(samples)) {
      const input = securityAuditEventToInput(event);
      const parsed = AuditEventInputSchema.safeParse(input);
      expect(parsed.success, `${event.type} should map to a valid input`).toBe(true);
      expect(input.action).toBe(`security.${event.type}`);
    }
  });

  it('maps a denied policy_gate to outcome=denied with the violation rules', () => {
    const input = securityAuditEventToInput(samples.policy_gate);
    expect(input.outcome).toBe('denied');
    expect(input.policyDecision).toBe('deny');
    expect(input.violationType).toContain('rule_of_two');
    expect(input.severity).toBe('warning');
  });

  it('flags a downgraded trust classification as a warning', () => {
    expect(securityAuditEventToInput(samples.trust_classification).severity).toBe('warning');
  });

  it('flags suspicious reputation + injection sanitization as warnings', () => {
    expect(securityAuditEventToInput(samples.reputation).severity).toBe('warning');
    expect(securityAuditEventToInput(samples.sanitization).severity).toBe('warning');
  });

  it('carries the user identity into the actor for user-scoped events', () => {
    expect(securityAuditEventToInput(samples.trust_classification).actor).toMatchObject({
      type: 'user',
      id: 'alice',
    });
    expect(securityAuditEventToInput(samples.reputation).actor).toMatchObject({
      type: 'user',
      id: 'bob',
    });
  });
});

function captureLogger(logImpl?: (i: AuditEventInput) => void): {
  logger: IAuditLogger;
  logged: AuditEventInput[];
} {
  const logged: AuditEventInput[] = [];
  const logger: IAuditLogger = {
    log: (i: AuditEventInput) => {
      if (logImpl) logImpl(i);
      logged.push(i);
    },
    logToolInvocation: vi.fn(),
    logPolicyDecision: vi.fn(),
    logSecurityEvent: vi.fn(),
    logRateLimitViolation: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  return { logger, logged };
}

describe('createDurableAuditSink (#3291)', () => {
  it('forwards a mapped input to the durable logger', () => {
    const { logger, logged } = captureLogger();
    createDurableAuditSink(logger)(samples.policy_gate);
    expect(logged).toHaveLength(1);
    expect(logged[0]?.action).toBe('security.policy_gate');
  });

  it('swallows logger errors (durable mirroring must not break the pipeline)', () => {
    const { logger } = captureLogger(() => {
      throw new Error('disk full');
    });
    const sink = createDurableAuditSink(logger);
    expect(() => {
      sink(samples.reputation);
    }).not.toThrow();
  });
});

describe('AuditTrail → durable sink end-to-end parity (#3291)', () => {
  it('keeps the in-memory trail AND mirrors every appended decision to the durable sink', () => {
    const { logger, logged } = captureLogger();
    const trail = new AuditTrail(createDurableAuditSink(logger));

    // append() takes Omit<AuditEvent,'id'|'timestamp'>; passing the full sample
    // is fine (the extra id/timestamp are reassigned inside append).
    trail.append(samples.policy_gate);

    // in-memory unchanged
    expect(trail.query({ type: 'policy_gate' })).toHaveLength(1);
    // durably mirrored, mapped to the converged schema
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ action: 'security.policy_gate', outcome: 'denied' });
  });

  it('a trail with no sink is in-memory only (default behavior unchanged)', () => {
    const { logger, logged } = captureLogger();
    const trail = new AuditTrail();
    trail.append(samples.reputation);
    expect(trail.query()).toHaveLength(1);
    expect(logged).toHaveLength(0);
    expect(logger.log).toBeDefined();
  });
});
