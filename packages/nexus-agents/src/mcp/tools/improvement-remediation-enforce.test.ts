/**
 * Tests for the OFF-BY-DEFAULT auto-invoke enforcement path (#3540 inc.2h / #3618).
 * Fail-closed at every gate; audit mode is provably write-free; enforce wires all
 * the merged safety primitives.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runAutoRemediation,
  resolveAutoRemediateMode,
  AUTO_REMEDIATE_LEASE_KEY,
  type AutoRemediationDeps,
  type AcquiredLease,
} from './improvement-remediation-enforce.js';
import { RemediationGuard } from './improvement-remediation-guard.js';
import type { ImprovementSignal } from './improvement-review.js';
import type { EnforceReadinessEvidence } from './improvement-enforce-readiness.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex model-quality 30% on docs',
    body: 'Observed model-quality floor breach.',
    evidence: {},
    ...over,
  };
}

function rawPlanFor(s: ImprovementSignal): unknown {
  return {
    signalKey: s.signalKey,
    category: s.category,
    summary: 'Remediate the surfaced signal.',
    steps: [{ kind: 'add-test', description: 'cover the regressed path' }],
  };
}

function readyEvidence(): EnforceReadinessEvidence {
  return {
    shadowSelections: 25,
    judgedSelections: 22,
    judgedSound: 21,
    evaluator: 'rev@example',
    owner: 'williamzujkowski',
  };
}

function makeDeps(over: Partial<AutoRemediationDeps> = {}): {
  deps: AutoRemediationDeps;
  released: { n: number };
} {
  const released = { n: 0 };
  const lease: AcquiredLease = {
    release: vi.fn(async () => {
      released.n++;
      return Promise.resolve();
    }),
  };
  const deps: AutoRemediationDeps = {
    acquireLease: vi.fn(async () => Promise.resolve(lease)),
    readinessEvidence: vi.fn(async () => Promise.resolve(readyEvidence())),
    research: vi.fn(async (s: ImprovementSignal) => Promise.resolve(rawPlanFor(s))),
    implement: vi.fn(async (plan: RemediationPlan) =>
      Promise.resolve({ branch: `auto-remediation/${plan.signalKey}`, prUrl: 'https://pr/1' })
    ),
    audit: vi.fn(),
    ...over,
  };
  return { deps, released };
}

/** Fresh enforce config per call — never share a guard across tests (state leaks). */
function enf(): { mode: 'enforce'; now: number; guard: RemediationGuard } {
  return { mode: 'enforce', now: 0, guard: new RemediationGuard() };
}

describe('resolveAutoRemediateMode', () => {
  it('exact-matches enforce/audit, everything else is off', () => {
    expect(resolveAutoRemediateMode('enforce')).toBe('enforce');
    expect(resolveAutoRemediateMode('audit')).toBe('audit');
    expect(resolveAutoRemediateMode('ENFORCE')).toBe('off'); // case-sensitive
    expect(resolveAutoRemediateMode('on')).toBe('off');
    expect(resolveAutoRemediateMode('true')).toBe('off');
    expect(resolveAutoRemediateMode(undefined)).toBe('off');
  });
});

describe('runAutoRemediation — off (default)', () => {
  it('is a complete no-op: no research, no lease, no implement', async () => {
    const { deps } = makeDeps();
    const r = await runAutoRemediation([signal()], deps, { mode: 'off' });
    expect(r.mode).toBe('off');
    expect(r.remediated).toEqual([]);
    expect(deps.research).not.toHaveBeenCalled();
    expect(deps.acquireLease).not.toHaveBeenCalled();
    expect(deps.implement).not.toHaveBeenCalled();
  });
});

describe('runAutoRemediation — audit (write-free)', () => {
  it('runs RESEARCH + plan but NEVER implements, leases, or writes (#3618 audit gate)', async () => {
    const { deps } = makeDeps();
    const r = await runAutoRemediation([signal()], deps, {
      mode: 'audit',
      now: 0,
      guard: new RemediationGuard(),
    });
    expect(r.mode).toBe('audit');
    expect(deps.research).toHaveBeenCalledTimes(1);
    expect(r.plans).toHaveLength(1);
    // The write-free guarantee: no lease acquired, no implement, no PRs.
    expect(deps.acquireLease).not.toHaveBeenCalled();
    expect(deps.implement).not.toHaveBeenCalled();
    expect(r.remediated).toEqual([]);
  });
});

describe('runAutoRemediation — enforce', () => {
  it('readiness → lease → research → implement → PR, then releases the lease', async () => {
    const { deps, released } = makeDeps();
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.remediated).toHaveLength(1);
    expect(r.remediated[0]?.prUrl).toBe('https://pr/1');
    expect(deps.acquireLease).toHaveBeenCalledWith(AUTO_REMEDIATE_LEASE_KEY);
    expect(deps.implement).toHaveBeenCalledTimes(1);
    expect(released.n).toBe(1); // lease always released
  });

  it('aborts (no lease, no research) when not ready', async () => {
    const { deps } = makeDeps({
      readinessEvidence: vi.fn(async () =>
        Promise.resolve({ shadowSelections: 1, judgedSelections: 0, judgedSound: 0 })
      ),
    });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.aborted).toMatch(/not ready/);
    expect(deps.acquireLease).not.toHaveBeenCalled();
    expect(deps.research).not.toHaveBeenCalled();
  });

  it('aborts when the lease is already held (cross-run single-flight)', async () => {
    const { deps } = makeDeps({ acquireLease: vi.fn(async () => Promise.resolve(null)) });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.aborted).toMatch(/lease/);
    expect(deps.research).not.toHaveBeenCalled();
  });

  it('human-gates a security signal (never auto-remediated)', async () => {
    const { deps } = makeDeps();
    const r = await runAutoRemediation(
      [signal({ category: 'security', signalKey: 'sec-1' })],
      deps,
      enf()
    );
    expect(r.remediated).toEqual([]);
    expect(r.skipped[0]?.reason).toMatch(/human-gated/);
    expect(deps.implement).not.toHaveBeenCalled();
  });

  it('human-gates a mis-categorized security signal via keyword (fail-closed #3615)', async () => {
    const { deps } = makeDeps();
    const r = await runAutoRemediation(
      [signal({ category: 'bug', signalKey: 'bug:auth-x', title: 'authentication bypass' })],
      deps,
      enf()
    );
    expect(r.skipped[0]?.reason).toMatch(/human-gated/);
    expect(deps.implement).not.toHaveBeenCalled();
  });

  it('skips a signal blocked by the runaway guard', async () => {
    const guard = new RemediationGuard({ cooldownMs: 10_000 });
    guard.recordAttempt('routing:cli-floor:codex:docs', 0);
    const { deps } = makeDeps();
    const r = await runAutoRemediation([signal()], deps, { mode: 'enforce', now: 1, guard });
    expect(r.skipped[0]?.reason).toMatch(/runaway guard/);
    expect(deps.implement).not.toHaveBeenCalled();
  });

  it('fail-closes a signal whose plan is invalid (strict boundary)', async () => {
    const { deps } = makeDeps({
      research: vi.fn(async () => Promise.resolve({ signalKey: 'x', bogus: true })),
    });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.remediated).toEqual([]);
    expect(r.skipped[0]?.reason).toMatch(/research\/plan failed/);
    expect(deps.implement).not.toHaveBeenCalled();
  });

  it('enforces the per-run rate cap', async () => {
    const { deps } = makeDeps();
    const signals = Array.from({ length: 8 }, (_, i) =>
      signal({ signalKey: `routing:floor:${String(i)}` })
    );
    const r = await runAutoRemediation(signals, deps, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      maxPerRun: 3,
    });
    expect(r.remediated).toHaveLength(3);
    expect(deps.implement).toHaveBeenCalledTimes(3);
    expect(r.skipped.some((s) => s.reason.includes('rate cap'))).toBe(true);
  });

  it('releases the lease even if implement throws', async () => {
    const { deps, released } = makeDeps({
      implement: vi.fn(async () => Promise.reject(new Error('pipeline boom'))),
    });
    await expect(runAutoRemediation([signal()], deps, enf())).rejects.toThrow('pipeline boom');
    expect(released.n).toBe(1);
  });
});
