/**
 * Tests for the auto-remediation cycle entry point (#3671).
 * Off-by-default short-circuit; audit drives the full path on injected signals/deps.
 */

import { describe, it, expect, vi } from 'vitest';
import { runAutoRemediationCycle } from './auto-remediation-cycle.js';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
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

describe('runAutoRemediationCycle', () => {
  it('off mode is a complete no-op — never collects signals', async () => {
    const collectSignals = vi.fn(async () => Promise.resolve([signal()]));
    const r = await runAutoRemediationCycle({ mode: 'off' }, { collectSignals });
    expect(r.mode).toBe('off');
    expect(collectSignals).not.toHaveBeenCalled();
  });

  it('audit mode collects signals and runs the path (zero writes)', async () => {
    const collectSignals = vi.fn(async () => Promise.resolve([signal()]));
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const r = await runAutoRemediationCycle({ mode: 'audit' }, { collectSignals, deps });
    expect(collectSignals).toHaveBeenCalledTimes(1);
    expect(r.mode).toBe('audit');
    expect(r.plans).toHaveLength(1); // research+vote ran
    expect(r.remediated).toEqual([]); // audit writes nothing
  });

  it('forwards every collected signal to the run', async () => {
    const signals = [signal({ signalKey: 'a' }), signal({ signalKey: 'b' })];
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const r = await runAutoRemediationCycle(
      { mode: 'audit' },
      { collectSignals: async () => Promise.resolve(signals), deps }
    );
    expect(r.considered).toBe(2);
  });
});
