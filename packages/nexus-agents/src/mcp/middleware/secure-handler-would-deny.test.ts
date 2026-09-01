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
import { resetWouldDenySampler } from './would-deny-sampler.js';

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

/**
 * The dissent on #5228 named the cost of #4991: a warn-mode near-miss lets the
 * call proceed, so an agent looping against the same rule writes one chain
 * record per iteration. These pin the sampling that answers it, at the seam —
 * the sampler's own unit tests prove the arithmetic, but only this proves the
 * arithmetic is actually wired to the audit logger.
 */
describe('a looping near-miss does not grow the chain without bound (#5228)', () => {
  it('writes the first occurrence, then samples', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger,
    });

    for (let i = 0; i < 100; i++) await handler({});

    // 1, 2, 4, 8, 16, 32, 64 — not 100.
    expect(vi.mocked(auditLogger.logPolicyDecision)).toHaveBeenCalledTimes(7);
  });

  it('never samples a real denial', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: denyFirewall(),
      auditLogger,
    });

    for (let i = 0; i < 20; i++) await handler({});

    // A deny halts the call, so it is already self-limiting — and dropping one
    // would lose the record of an action that was actually blocked.
    expect(vi.mocked(auditLogger.logPolicyDecision)).toHaveBeenCalledTimes(20);
  });

  it('states the ordinal on a sampled record, so the chain reads as a floor', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger,
    });

    for (let i = 0; i < 64; i++) await handler({});

    const reasons = vi
      .mocked(auditLogger.logPolicyDecision)
      .mock.calls.map((c) => (c[0] as { reason: string }).reason);

    // Without the ordinal the chain would say "this fired 7 times".
    expect(reasons[reasons.length - 1]).toContain('64');
    // The first carries no ordinal — nothing has been suppressed yet.
    expect(reasons[0]).not.toContain('occurrence');
  });

  it('carries the ordinal as a typed field, not only as prose', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger,
    });

    for (let i = 0; i < 64; i++) await handler({});

    const calls = vi
      .mocked(auditLogger.logPolicyDecision)
      .mock.calls.map((c) => c[0] as { occurrence?: number });

    // Two reviewers rejected the prose-only form: a consumer counting records
    // would read 14 records as 14 near-misses when 10,000 occurred. The record
    // has to represent its own partial coverage structurally, which is the same
    // requirement this PR exists to satisfy one field over.
    expect(calls.map((c) => c.occurrence)).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });

  it('omits the ordinal on a real denial, where nothing was sampled', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: denyFirewall(),
      auditLogger,
    });

    await handler({});

    const first = vi.mocked(auditLogger.logPolicyDecision).mock.calls[0]?.[0] as {
      occurrence?: number;
    };
    // Absent means "every occurrence was recorded" — distinct from `1`.
    expect(first.occurrence).toBeUndefined();
  });

  it('marks every executed near-miss on its invocation record, sampled or not', async () => {
    // The review's sharpest objection: a `would_deny` lets the call EXECUTE, so
    // sampling the policy record would leave the actions that actually ran
    // indistinguishable from calls no rule touched — restoring the silent-allow
    // inference the whole change exists to break.
    //
    // The two facts are therefore separated. The POLICY record carries the
    // detail and is sampled; the INVOCATION record says "this call was not
    // clean" on every single occurrence.
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger,
    });

    for (let i = 0; i < 20; i++) await handler({});

    const invocations = vi
      .mocked(auditLogger.logToolInvocation)
      .mock.calls.map((c) => c[0] as { policyDecision?: string });

    expect(invocations).toHaveLength(20);
    expect(invocations.every((i) => i.policyDecision === 'would_deny')).toBe(true);

    // Meanwhile the policy records ARE sampled — that is the bounded half.
    expect(vi.mocked(auditLogger.logPolicyDecision)).toHaveBeenCalledTimes(5);
  });

  it('leaves an ordinary allow unmarked', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const handler = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: allowFirewall(),
      auditLogger,
    });

    await handler({});

    const first = vi.mocked(auditLogger.logToolInvocation).mock.calls[0]?.[0] as {
      policyDecision?: string;
    };
    // No rule fired, so the record must claim nothing.
    expect(first.policyDecision).toBeUndefined();
  });

  it('does not let one rule suppress another rule on the same tool', async () => {
    resetWouldDenySampler();
    const auditLogger = mockAuditLogger();
    const noisy = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: warnModeFirewall(),
      auditLogger,
    });
    for (let i = 0; i < 50; i++) await noisy({});

    const before = vi.mocked(auditLogger.logPolicyDecision).mock.calls.length;

    const other = createSecureHandler(okHandler, {
      toolName: 'writer',
      policyFirewall: otherRuleWarnFirewall(),
      auditLogger,
    });
    await other({});

    // A different rule's FIRST occurrence must always be recorded.
    expect(vi.mocked(auditLogger.logPolicyDecision).mock.calls.length).toBe(before + 1);
  });
});

/** A second warn-mode rule on the same tool, for the cross-suppression test. */
function otherRuleWarnFirewall(): IPolicyFirewall {
  const decision: PolicyDecision = {
    allowed: true,
    reason: '[WARN MODE] Would be denied: secret in payload',
    ruleName: 'secret-scan',
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
