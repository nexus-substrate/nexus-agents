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
import { RemediationCircuitBreaker } from './remediation-circuit-breaker.js';
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
    vote: vi.fn(async () => Promise.resolve({ approved: true, approvalPercentage: 100 })),
    dryRun: vi.fn(async () => Promise.resolve({ ok: true, detail: 'green' })),
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
  it('exact-matches off/enforce; default (unset/unrecognized) is audit (#3769)', () => {
    expect(resolveAutoRemediateMode('enforce')).toBe('enforce');
    expect(resolveAutoRemediateMode('audit')).toBe('audit');
    expect(resolveAutoRemediateMode('off')).toBe('off'); // explicit opt-out respected
    expect(resolveAutoRemediateMode('ENFORCE')).toBe('audit'); // case-sensitive → default audit
    expect(resolveAutoRemediateMode('on')).toBe('audit');
    expect(resolveAutoRemediateMode('true')).toBe('audit');
    expect(resolveAutoRemediateMode(undefined)).toBe('audit'); // the flip: default audit
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

  it('security signal → p0: requires a UNANIMOUS vote + dry-run, then remediates (#3653)', async () => {
    const { deps } = makeDeps();
    const r = await runAutoRemediation(
      [signal({ category: 'security', signalKey: 'sec-1' })],
      deps,
      enf()
    );
    expect(r.remediated).toHaveLength(1);
    expect(deps.vote).toHaveBeenCalledWith(expect.objectContaining({ algorithm: 'unanimous' }));
    expect(deps.dryRun).toHaveBeenCalledTimes(1); // p0 dry-run gate
  });

  it('a rejected consensus vote leaves the signal as an issue (no remediation)', async () => {
    const { deps } = makeDeps({
      vote: vi.fn(async () => Promise.resolve({ approved: false, approvalPercentage: 40 })),
    });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.remediated).toEqual([]);
    expect(r.skipped[0]?.reason).toMatch(/consensus .* not reached/);
    expect(deps.implement).not.toHaveBeenCalled();
  });

  it('an errored contrarian (absolute_quorum no_quorum) leaves the signal as an issue — NO write (#4138)', async () => {
    // The load-bearing security test (vote condition (ii)): a degraded panel under
    // absolute_quorum degrades to no_quorum; it must NEVER be executed. Persistent
    // no_quorum (both attempts) → EXPLICIT terminal skip, zero writes.
    const vote = vi.fn(async () =>
      Promise.resolve({ approved: false, approvalPercentage: 0, decision: 'no_quorum' as const })
    );
    const { deps } = makeDeps({ vote });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.remediated).toEqual([]);
    expect(r.skipped[0]?.reason).toMatch(/no_quorum/);
    expect(r.skipped[0]?.reason).toMatch(/left as an issue/);
    expect(deps.implement).not.toHaveBeenCalled(); // the security guarantee: no write
    expect(vote).toHaveBeenCalledTimes(2); // initial + exactly 1 bounded re-run
  });

  it('a no_quorum that RECOVERS to approved on the bounded re-run proceeds to remediate (#4138)', async () => {
    const vote = vi
      .fn()
      .mockResolvedValueOnce({ approved: false, approvalPercentage: 0, decision: 'no_quorum' })
      .mockResolvedValueOnce({ approved: true, approvalPercentage: 100, decision: 'approved' });
    const { deps } = makeDeps({ vote });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.remediated).toHaveLength(1); // transient blip absorbed
    expect(deps.implement).toHaveBeenCalledTimes(1);
    expect(vote).toHaveBeenCalledTimes(2); // initial no_quorum + one recovering re-run
  });

  it('a no_quorum that RECOVERS to rejected on the re-run leaves the signal as an issue (#4138)', async () => {
    const vote = vi
      .fn()
      .mockResolvedValueOnce({ approved: false, approvalPercentage: 0, decision: 'no_quorum' })
      .mockResolvedValueOnce({ approved: false, approvalPercentage: 30, decision: 'rejected' });
    const { deps } = makeDeps({ vote });
    const r = await runAutoRemediation([signal()], deps, enf());
    expect(r.remediated).toEqual([]);
    expect(r.skipped[0]?.reason).toMatch(/not reached/); // genuine reject, not no_quorum
    expect(deps.implement).not.toHaveBeenCalled();
    expect(vote).toHaveBeenCalledTimes(2);
  });

  it('p0 fail-closes when no dry-run capability is available', async () => {
    const { deps } = makeDeps();
    delete (deps as { dryRun?: unknown }).dryRun; // no dry-run capability
    const r = await runAutoRemediation(
      [signal({ category: 'security', signalKey: 'sec-2' })],
      deps,
      enf()
    );
    expect(r.skipped[0]?.reason).toMatch(/dry-run/);
    expect(deps.implement).not.toHaveBeenCalled();
  });

  it('a non-security warning signal uses the p2 higher_order algorithm', async () => {
    const { deps } = makeDeps();
    await runAutoRemediation([signal({ severity: 'warning' })], deps, enf());
    expect(deps.vote).toHaveBeenCalledWith(expect.objectContaining({ algorithm: 'higher_order' }));
    expect(deps.dryRun).not.toHaveBeenCalled(); // dry-run is p0-only
  });

  it('a tripped circuit-breaker aborts the run (#3653)', async () => {
    const { deps } = makeDeps();
    const breaker = new RemediationCircuitBreaker({ threshold: 1 });
    breaker.recordFailure(); // tripped
    const r = await runAutoRemediation([signal()], deps, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      breaker,
    });
    expect(r.aborted).toMatch(/circuit breaker tripped/);
    expect(deps.research).not.toHaveBeenCalled();
  });

  it('records a rejected vote as a breaker failure (sustained-wrongness tracking)', async () => {
    const { deps } = makeDeps({
      vote: vi.fn(async () => Promise.resolve({ approved: false, approvalPercentage: 10 })),
    });
    const breaker = new RemediationCircuitBreaker({ threshold: 3 });
    await runAutoRemediation([signal()], deps, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      breaker,
    });
    expect(breaker.state().consecutiveFailures).toBe(1);
  });

  it('trip → abort → re-vote reset() → resume: a reset breaker re-enables the run (#3779)', async () => {
    // A broken reset would strand enforce permanently-off after one bad streak.
    // The recovery path is reset() (wired to the consensus re-vote), NOT a bare
    // success — recordSuccess clears the streak but never un-trips (see the breaker
    // unit test). This drives the full round-trip through the real enforce path.
    const breaker = new RemediationCircuitBreaker({ threshold: 1 });

    // 1. A rejected vote trips the breaker (threshold 1).
    const { deps: rejecting } = makeDeps({
      vote: vi.fn(async () => Promise.resolve({ approved: false, approvalPercentage: 10 })),
    });
    await runAutoRemediation([signal()], rejecting, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      breaker,
    });
    expect(breaker.isTripped()).toBe(true);

    // 2. While tripped, the next run auto-reverts to off — aborts before research.
    const { deps: blocked } = makeDeps();
    const abortedRun = await runAutoRemediation([signal()], blocked, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      breaker,
    });
    expect(abortedRun.aborted).toMatch(/circuit breaker tripped/);
    expect(blocked.research).not.toHaveBeenCalled();

    // 3. The consensus re-vote re-enables the path: reset() un-trips the breaker.
    breaker.reset();
    expect(breaker.isTripped()).toBe(false);

    // 4. A subsequent SUCCESS path RESUMES — it remediates and stays healthy
    //    (recordSuccess keeps the streak clear; no re-trip).
    const { deps: approving } = makeDeps();
    const resumed = await runAutoRemediation([signal()], approving, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      breaker,
    });
    expect(resumed.aborted).toBeUndefined();
    expect(resumed.remediated).toHaveLength(1);
    expect(approving.implement).toHaveBeenCalledTimes(1);
    expect(breaker.isTripped()).toBe(false);
    expect(breaker.state().consecutiveFailures).toBe(0);
  });

  it('refuses to auto-remediate a plan that targets a protected path (self-mod guard)', async () => {
    const { deps } = makeDeps({
      research: vi.fn(async (s: ImprovementSignal) =>
        Promise.resolve({
          signalKey: s.signalKey,
          category: s.category,
          summary: 'touch the rails',
          steps: [{ kind: 'refactor', description: 'edit', targetPath: 'src/consensus/engine.ts' }],
        })
      ),
    });
    const breaker = new RemediationCircuitBreaker({ threshold: 3 });
    const r = await runAutoRemediation([signal()], deps, {
      mode: 'enforce',
      now: 0,
      guard: new RemediationGuard(),
      breaker,
    });
    expect(r.skipped[0]?.reason).toMatch(/protected path/);
    expect(deps.implement).not.toHaveBeenCalled();
    expect(deps.vote).not.toHaveBeenCalled(); // blocked before the vote
    expect(breaker.state().consecutiveFailures).toBe(0); // a correct decline is neutral
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
