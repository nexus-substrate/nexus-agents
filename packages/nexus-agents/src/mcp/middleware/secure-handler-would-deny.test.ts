/**
 * Warn-mode policy near-misses must reach the durable chain (#4991).
 *
 * `PolicyFirewall.handleDenial` in warn mode returns `{ allowed: true, reason:
 * '[WARN MODE] Would be denied: …', ruleName }` — the call proceeds, but a rule
 * DID fire. `checkPolicy` returned a `ToolResult` only on a real denial, and the
 * emit was gated on that result, so a would-be denial produced one ephemeral
 * `logger.warn` and nothing in the hash chain.
 *
 * The consequence is the one that matters: a reviewer running
 * `verify_audit_chain` over the warn-mode soak window saw a clean chain and
 * would conclude zero rules fired, while stderr held every near-miss. #4988's
 * enforce decision is read from exactly that window.
 */
import { describe, it, expect, vi } from 'vitest';

import { createSecureHandler } from './secure-handler.js';
import type { IPolicyFirewall, PolicyDecision } from './policy.js';
import type { IAuditLogger } from '../../audit/audit-types.js';

/** A firewall whose rule fires but is overridden by warn mode. */
function warnModeFirewall(): IPolicyFirewall {
  const decision: PolicyDecision = {
    allowed: true,
    reason: '[WARN MODE] Would be denied: path outside allowlist',
    ruleName: 'sandbox-paths',
    overriddenByWarnMode: true,
  };
  return {
    evaluate: vi.fn((): PolicyDecision => decision),
    addRule: vi.fn(),
    removeRule: vi.fn((): boolean => true),
    getRules: vi.fn((): readonly [] => []),
    setMode: vi.fn(),
    getMode: vi.fn((): 'warn' => 'warn'),
  };
}

/** An ordinary allow: no rule fired, so `ruleName` is absent. */
function allowFirewall(): IPolicyFirewall {
  const decision: PolicyDecision = { allowed: true, reason: 'All policy rules passed' };
  return {
    evaluate: vi.fn((): PolicyDecision => decision),
    addRule: vi.fn(),
    removeRule: vi.fn((): boolean => true),
    getRules: vi.fn((): readonly [] => []),
    setMode: vi.fn(),
    getMode: vi.fn((): 'enforce' => 'enforce'),
  };
}

/**
 * An ordinary ALLOW that names the rule which permitted it — e.g. an
 * `admin-override`. Legal today and ordinary access-control practice.
 */
function namedAllowFirewall(): IPolicyFirewall {
  const decision: PolicyDecision = {
    allowed: true,
    reason: 'Permitted by admin override',
    ruleName: 'admin-override',
  };
  return {
    evaluate: vi.fn((): PolicyDecision => decision),
    addRule: vi.fn(),
    removeRule: vi.fn((): boolean => true),
    getRules: vi.fn((): readonly [] => []),
    setMode: vi.fn(),
    getMode: vi.fn((): 'enforce' => 'enforce'),
  };
}

function denyFirewall(): IPolicyFirewall {
  const decision: PolicyDecision = {
    allowed: false,
    reason: 'Forbidden path',
    ruleName: 'sandbox-paths',
  };
  return {
    evaluate: vi.fn((): PolicyDecision => decision),
    addRule: vi.fn(),
    removeRule: vi.fn((): boolean => true),
    getRules: vi.fn((): readonly [] => []),
    setMode: vi.fn(),
    getMode: vi.fn((): 'enforce' => 'enforce'),
  };
}

function mockAuditLogger(): IAuditLogger {
  return {
    log: vi.fn(),
    logToolInvocation: vi.fn(),
    logPolicyDecision: vi.fn(),
    logSecurityEvent: vi.fn(),
    logRateLimitViolation: vi.fn(),
    logTierTransition: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
  } as unknown as IAuditLogger;
}

const okHandler = (): Promise<{ content: { type: 'text'; text: string }[] }> =>
  Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });

describe('warn-mode policy near-misses reach the chain (#4991)', () => {
  it('records would_deny when a rule fires but warn mode allows the call', async () => {
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger,
    });

    await handler({});

    expect(auditLogger.logPolicyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'would_deny', toolName: 'writer' })
    );
  });

  it('still lets the call through in warn mode', async () => {
    // The point of warn mode. If this regressed, the "fix" would have silently
    // turned the soak into an enforcement rollout.
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger: mockAuditLogger(),
    });

    const result = await handler({});
    expect(JSON.stringify(result)).toContain('ok');
  });

  it('records deny — not would_deny — when the call is actually blocked', async () => {
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: denyFirewall(),
      auditLogger,
    });

    await handler({});

    expect(auditLogger.logPolicyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'deny' })
    );
  });

  it('names the empty case: an ordinary allow emits NOTHING', async () => {
    // This is what keeps a clean chain meaningful. If every allow emitted, the
    // soak signal would drown; if would_deny were detected by anything looser
    // than "a rule fired", ordinary traffic would be logged as near-misses and
    // #4988 would read a wildly inflated number.
    //
    // Detection reads the evaluator's explicit `overriddenByWarnMode` flag, so
    // an ordinary allow — no rule denied, no override — emits nothing. This
    // comment previously described the REJECTED structural form
    // (`allowed === true && ruleName !== undefined`) as current, contradicting
    // the adjacent test below; a stale comment in a change about record
    // fidelity is the same defect one level up.
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'reader',
      policyFirewall: allowFirewall(),
      auditLogger,
    });

    await handler({});

    expect(auditLogger.logPolicyDecision).not.toHaveBeenCalled();
  });

  it('does not mistake an allow that NAMES its rule for a near-miss', async () => {
    // The regression the unanimous panel rejected the first implementation
    // over. Detection originally read `allowed === true && ruleName !==
    // undefined`, which is true of today's code only because
    // `allowWithReason` happens not to set `ruleName`. Naming the rule that
    // PERMITTED an action (`admin-override` vs `default-allow`) is ordinary
    // access-control practice — the day an allow rule does it, every
    // authorized call it covers would have been recorded as `would_deny`, and
    // #4988 would read those near-misses as evidence for enforcing.
    //
    // Detection now reads the evaluator's explicit `overriddenByWarnMode`, so
    // this decision — allowed, with a ruleName, no override flag — emits
    // nothing.
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'admin_tool',
      policyFirewall: namedAllowFirewall(),
      auditLogger,
    });

    await handler({});

    expect(auditLogger.logPolicyDecision).not.toHaveBeenCalled();
  });
});
