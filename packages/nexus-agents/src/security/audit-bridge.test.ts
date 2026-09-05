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
    truncated: true,
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
  clawguard_violation: {
    ...base,
    component: 'clawguard-audit',
    type: 'clawguard_violation',
    toolName: 'write_file',
    warning: 'tool write_file not in derived allowlist',
    policySource: 'llm',
    mode: 'audit',
    requestId: 'req-42',
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

  it('round-trips pipeline-policy mode/ruleIds/stageType into the durable metadata (#3710)', () => {
    const pipelinePolicy = {
      ...base,
      type: 'policy_gate' as const,
      component: 'pipeline-policy-evaluator',
      // No actionType — pipeline path is stage-driven, not AgentAction-driven.
      allowed: true,
      requiresApproval: false,
      inputTrustTier: '4' as const,
      violationRules: ['trust-tier'],
      mode: 'warn' as const,
      ruleIds: ['trust-tier'],
      stageType: 'execute',
    };
    const input = securityAuditEventToInput(pipelinePolicy);
    // The soak/enforce signal + rules + stage survive the mapping.
    expect(input.metadata?.['mode']).toBe('warn');
    expect(input.metadata?.['ruleIds']).toEqual(['trust-tier']);
    expect(input.metadata?.['stageType']).toBe('execute');
    // No actionType key when the source event has none.
    expect(input.metadata && 'actionType' in input.metadata).toBe(false);
    // Still schema-valid.
    expect(AuditEventInputSchema.safeParse(input).success).toBe(true);
  });

  it('security policy_gate path keeps its actionType and omits the pipeline fields', () => {
    const input = securityAuditEventToInput(samples.policy_gate);
    expect(input.metadata?.['actionType']).toBe('GeneratePatchPlan');
    expect(input.metadata && 'mode' in input.metadata).toBe(false);
    expect(input.metadata && 'stageType' in input.metadata).toBe(false);
  });

  it('maps a clawguard_violation to a success-outcome warning with the metadata (#4097)', () => {
    const input = securityAuditEventToInput(samples.clawguard_violation);
    expect(input.action).toBe('security.clawguard_violation');
    // Audit mode ALLOWED the call → success, not denied; flagged as a warning.
    expect(input.outcome).toBe('success');
    expect(input.severity).toBe('warning');
    expect(input.category).toBe('authorization');
    expect(input.actor).toMatchObject({ type: 'system', id: 'clawguard-audit' });
    expect(input.metadata).toMatchObject({
      toolName: 'write_file',
      warning: 'tool write_file not in derived allowlist',
      policySource: 'llm',
      mode: 'audit',
      requestId: 'req-42',
    });
    expect(AuditEventInputSchema.safeParse(input).success).toBe(true);
  });

  it('flags a downgraded trust classification as a warning', () => {
    expect(securityAuditEventToInput(samples.trust_classification).severity).toBe('warning');
  });

  it('flags suspicious reputation + injection sanitization as warnings', () => {
    expect(securityAuditEventToInput(samples.reputation).severity).toBe('warning');
    expect(securityAuditEventToInput(samples.sanitization).severity).toBe('warning');
  });

  it('carries sanitization truncation into durable metadata', () => {
    const input = securityAuditEventToInput(samples.sanitization);

    expect(input.metadata?.['truncated']).toBe(true);
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
    logTierTransition: vi.fn(),
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

describe('trust events without a measured allowlist (#4992)', () => {
  it('omits isAllowlisted from the durable metadata when the event does not carry it', () => {
    const unmeasured: SecurityAuditEvent = {
      ...base,
      type: 'trust_classification',
      username: 'alice',
      assignedTier: '3',
      userRole: 'contributor',
      wasDowngraded: false,
      reason: 'Role contributor → Tier 3 (no allowlist consulted)',
    };
    const input = securityAuditEventToInput(unmeasured);
    expect(input.metadata).toBeDefined();
    expect('isAllowlisted' in (input.metadata ?? {})).toBe(false);
    expect(AuditEventInputSchema.safeParse(input).success).toBe(true);
  });
});
