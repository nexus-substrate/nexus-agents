/**
 * Tests for the auto-remediation deps assembly (#3671).
 * Audit-ready (research+vote wired); enforce fail-closed (stub implement,
 * not-ready readiness, null lease when unconfigured).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import { runAutoRemediation } from './improvement-remediation-enforce.js';
import { RemediationGuard } from './improvement-remediation-guard.js';
import { parseRemediationPlan, CapabilityLedger } from './improvement-remediation-capability.js';
import type { ImprovementSignal } from './improvement-review.js';

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

describe('buildAutoRemediationDeps', () => {
  it('research produces a strict, parseable typed plan', async () => {
    const deps = buildAutoRemediationDeps();
    const raw = await deps.research(signal(), new CapabilityLedger());
    expect(() => parseRemediationPlan(raw)).not.toThrow();
  });

  it('implement is fail-closed until the Option B adapter lands (#3669)', async () => {
    const deps = buildAutoRemediationDeps();
    await expect(
      deps.implement(
        parseRemediationPlan(await deps.research(signal(), new CapabilityLedger())),
        new CapabilityLedger()
      )
    ).rejects.toThrow(/not wired yet/);
  });

  it('lease is null (fail-closed) without a configured repo/sha', async () => {
    const deps = buildAutoRemediationDeps();
    expect(await deps.acquireLease('auto-remediation')).toBeNull();
  });

  it('readiness defaults to not-ready (enforce blocked until evidence is wired)', async () => {
    const deps = buildAutoRemediationDeps();
    const ev = await deps.readinessEvidence();
    expect(ev.shadowSelections).toBe(0);
  });

  it('drives a full AUDIT run end-to-end on built pieces (soak data, zero writes)', async () => {
    // audit: research + vote, stop before implement. Inject an approving vote runner.
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const implementSpy = vi.spyOn(deps, 'implement');
    const r = await runAutoRemediation([signal()], deps, {
      mode: 'audit',
      now: 0,
      guard: new RemediationGuard(),
    });
    expect(r.mode).toBe('audit');
    expect(r.plans).toHaveLength(1); // research+vote ran
    expect(r.remediated).toEqual([]); // no writes in audit
    expect(implementSpy).not.toHaveBeenCalled();
  });
});
