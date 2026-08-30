/**
 * Tests for the concern-registry ratchet (#5123).
 *
 * The diff logic is simple; the risk is all in the drift semantics and in the
 * guards that stop the gate from passing vacuously. Pattern tuning is covered
 * by the real registry running in CI, which is what caught the twelfth cost
 * path (#5186) the #5122 audit missed.
 */
import { describe, it, expect } from 'vitest';

import { computeDrift } from './check-concern-registry.js';

function concern(overrides: {
  canonical?: string;
  alternates?: { path: string; trackedBy?: string }[];
}): Parameters<typeof computeDrift>[0] {
  return {
    concern: 'compute-token-cost-in-usd',
    question: 'What do I call to turn token counts into a USD figure?',
    canonical: overrides.canonical ?? 'src/learning/token-cost-core.ts',
    detect: { roots: ['src'], pattern: 'x' },
    alternates: overrides.alternates ?? [],
  };
}

describe('computeDrift', () => {
  it('accepts the canonical implementation matching its own pattern', () => {
    // The canonical file MUST match — it is the implementation. Flagging it
    // would make the gate impossible to satisfy.
    const drift = computeDrift(concern({}), ['src/learning/token-cost-core.ts']);
    expect(drift.unregistered).toEqual([]);
    expect(drift.staleAlternates).toEqual([]);
  });

  it('flags a new implementation that is neither canonical nor a known alternate', () => {
    const drift = computeDrift(concern({}), [
      'src/learning/token-cost-core.ts',
      'src/somewhere/new-cost-math.ts',
    ]);
    expect(drift.unregistered).toEqual(['src/somewhere/new-cost-math.ts']);
  });

  it('accepts a registered alternate without complaint', () => {
    const drift = computeDrift(
      concern({ alternates: [{ path: 'src/legacy/old-cost.ts', trackedBy: '#1' }] }),
      ['src/learning/token-cost-core.ts', 'src/legacy/old-cost.ts']
    );
    expect(drift.unregistered).toEqual([]);
    expect(drift.staleAlternates).toEqual([]);
  });

  it('flags a registered alternate that no longer matches, so the debt count stays honest', () => {
    // Without this the baseline only ever grows: a migrated path would linger
    // as recorded debt forever and the number would stop meaning anything.
    const drift = computeDrift(
      concern({ alternates: [{ path: 'src/legacy/migrated.ts', trackedBy: '#1' }] }),
      ['src/learning/token-cost-core.ts']
    );
    expect(drift.staleAlternates).toEqual(['src/legacy/migrated.ts']);
  });

  it('reports both failure modes at once rather than stopping at the first', () => {
    const drift = computeDrift(
      concern({ alternates: [{ path: 'src/legacy/gone.ts', trackedBy: '#1' }] }),
      ['src/learning/token-cost-core.ts', 'src/new/fork.ts']
    );
    expect(drift.unregistered).toEqual(['src/new/fork.ts']);
    expect(drift.staleAlternates).toEqual(['src/legacy/gone.ts']);
  });

  it('names the empty case: no matches at all yields no drift from this function', () => {
    // computeDrift is pure set arithmetic. The "pattern matched nothing" guard
    // lives in main(), because an empty match set here is indistinguishable
    // from a concern whose implementations were all deleted.
    const drift = computeDrift(concern({}), []);
    expect(drift.unregistered).toEqual([]);
    expect(drift.staleAlternates).toEqual([]);
  });

  it('treats the canonical path as known even when also listed as an alternate', () => {
    // Defensive: a hand-edited registry could list both. It must not then
    // report the canonical file as stale.
    const drift = computeDrift(
      concern({ alternates: [{ path: 'src/learning/token-cost-core.ts' }] }),
      ['src/learning/token-cost-core.ts']
    );
    expect(drift.unregistered).toEqual([]);
    expect(drift.staleAlternates).toEqual([]);
  });
});
