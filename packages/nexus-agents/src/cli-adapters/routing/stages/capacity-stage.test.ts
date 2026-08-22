/**
 * Tests for CapacityFilterStage (#4373, #4351 criterion 3).
 *
 * The capacity-semantics cases here are ported from the deleted
 * `context/work-balancer.test.ts` (#4378) — the vote that removed WorkBalancer
 * bound its capacity assertions to survive as this stage's specification. The
 * queueing/dispatch half was deliberately not carried over.
 *
 * The `observed`-flag cases are NEW and are the point of the design: an
 * unobserved CapacityStatus is a set of defaults, not a measurement (#4374).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CapacityFilterStage,
  createCapacityStage,
  CAPACITY_EXHAUSTED,
  assessCapacity,
} from './capacity-stage.js';
import { createRoutingContext, getRemainingCandidates } from '../router-stage.js';
import type { RoutingArmId, CapacityStatus, ICliAdapter } from '../../types.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../../core/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A capacity reading. Defaults describe a healthy, *observed* adapter so each
 * test states only the field it is about.
 */
function capacity(overrides: Partial<CapacityStatus> = {}): CapacityStatus {
  return {
    remainingTokens: 100_000,
    remainingRequests: 1_000,
    resetTime: new Date('2026-01-01T00:00:00Z'),
    utilizationPercent: 10,
    rateLimited: false,
    exhausted: false,
    quotaExhausted: false,
    observed: true,
    ...overrides,
  };
}

/** Minimal ICliAdapter stub — only getCapacity() is exercised by this stage. */
function adapterWith(status: CapacityStatus | Error): ICliAdapter {
  return {
    getCapacity: vi.fn(() =>
      status instanceof Error ? Promise.reject(status) : Promise.resolve(status)
    ),
  } as unknown as ICliAdapter;
}

function adapters(entries: Record<string, CapacityStatus | Error>): Map<RoutingArmId, ICliAdapter> {
  return new Map(Object.entries(entries).map(([id, s]) => [id as RoutingArmId, adapterWith(s)]));
}

const CLIS = ['claude', 'gemini'] as const;

/**
 * The shipped default is signal-only (see DEFAULT_CONFIG). Exclusion tests must
 * opt in explicitly — otherwise every "does not exclude" assertion below would
 * pass trivially and prove nothing.
 */
const ENFORCING = { enforceHardLimits: true } as const;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(1_700_000_000_000));
});

afterEach(() => {
  resetTimeProvider();
});

// ---------------------------------------------------------------------------

describe('CapacityFilterStage', () => {
  describe('exclusion on measured exhaustion', () => {
    it('excludes an adapter whose capacity is observed and exhausted', async () => {
      const stage = new CapacityFilterStage(
        adapters({
          claude: capacity({ quotaExhausted: true, remainingTokens: 0 }),
          gemini: capacity(),
        }),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(true);
      expect(getRemainingCandidates(result.value.context)).toEqual(['gemini']);
    });

    it('excludes on remainingTokens <= 0 even when the exhausted flag is false', async () => {
      // The deleted WorkBalancer guarded `exhausted || remainingTokens <= 0`
      // independently (work-balancer.ts:378). A provider can report zero
      // remaining without setting the flag; the stricter form is ported.
      const stage = new CapacityFilterStage(
        adapters({
          claude: capacity({ exhausted: false, remainingTokens: 0 }),
          gemini: capacity(),
        }),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(true);
    });

    it('uses a normalized capacity_exhausted diagnostic as the filter reason', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ quotaExhausted: true }), gemini: capacity() }),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.get('claude')).toContain(CAPACITY_EXHAUSTED);
    });

    it('does not exclude a healthy observed adapter', async () => {
      const stage = new CapacityFilterStage(adapters({ claude: capacity(), gemini: capacity() }));

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.size).toBe(0);
    });
  });

  describe('unobserved capacity is not a measurement (#4374)', () => {
    it('never excludes an unobserved adapter, even when it reports exhausted', async () => {
      // Fail OPEN on absent data: exclusion is destructive and an unobserved
      // reading is a default, not evidence.
      const stage = new CapacityFilterStage(
        adapters({
          claude: capacity({ observed: false, quotaExhausted: true, remainingTokens: 0 }),
          gemini: capacity(),
        }),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
    });

    it('does not report an unobserved adapter as healthy', async () => {
      // The inverse error, and the one #4436 was about: absence must not be
      // laundered into a positive signal. The trace must distinguish
      // "not excluded because measured healthy" from "not excluded because
      // never measured".
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ observed: false }), gemini: capacity() })
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.signals.join(' ')).toContain('capacity:unmeasured-1');
    });

    it('emits no unmeasured signal at all when every candidate was measured', async () => {
      // The real complement of the case above. A previous version asserted
      // `not.toContain('capacity:unmeasured-0')` inside the unmeasured===1 test,
      // which no implementation could fail — a tautology, not coverage.
      const stage = new CapacityFilterStage(adapters({ claude: capacity(), gemini: capacity() }));

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.signals.join(' ')).not.toContain('capacity:unmeasured');
    });
  });

  describe('shipped default is signal-only', () => {
    it('does NOT exclude an exhausted adapter unless enforcement is opted into', async () => {
      // The available `exhausted` flag is a rolling-60s rate heuristic against
      // hardcoded per-minute estimates (capacity-tracker.ts:22-37), not quota
      // exhaustion. Hard-excluding on it would let an ordinary burst empty the
      // pool and fail routing closed for a condition that self-clears. See #4456.
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ quotaExhausted: true }), gemini: capacity() })
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.size).toBe(0);
      expect(getRemainingCandidates(result.value.context)).toEqual(['claude', 'gemini']);
      // ...but it is still reported, so the signal is available as evidence.
      expect(result.value.context.signals.join(' ')).toContain(CAPACITY_EXHAUSTED);
    });
  });

  describe('probe timeout', () => {
    it('treats a hanging getCapacity() as unmeasured rather than stalling routing', async () => {
      const hanging = { getCapacity: () => new Promise<CapacityStatus>(() => {}) };
      const stage = new CapacityFilterStage(
        new Map<RoutingArmId, ICliAdapter>([
          ['claude', hanging as unknown as ICliAdapter],
          ['gemini', adapterWith(capacity())],
        ]),
        { ...ENFORCING, probeTimeoutMs: 10 }
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
      expect(result.value.context.signals.join(' ')).toContain('capacity:unmeasured-1');
    });
  });

  describe('warn-only mode', () => {
    it('annotates without filtering when enforceHardLimits is false', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ quotaExhausted: true }), gemini: capacity() }),
        { enforceHardLimits: false }
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.size).toBe(0);
      expect(result.value.context.signals.join(' ')).toContain(CAPACITY_EXHAUSTED);
    });
  });

  describe('all candidates exhausted', () => {
    it('stops the pipeline without fabricating a StageError', async () => {
      // Mirrors BudgetFilterStage: the stage reports continuesPipeline=false and
      // lets the pipeline own the no_candidates verdict.
      const stage = new CapacityFilterStage(
        adapters({
          claude: capacity({ quotaExhausted: true }),
          gemini: capacity({ quotaExhausted: true }),
        }),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.continuesPipeline).toBe(false);
      expect(getRemainingCandidates(result.value.context)).toEqual([]);
    });
  });

  describe('resilience', () => {
    it('does not exclude an adapter whose getCapacity() rejects', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: new Error('probe failed'), gemini: capacity() }),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
    });

    it('survives an adapter that does not implement getCapacity at all', async () => {
      // Regression: `adapter.getCapacity()` on a partial adapter throws a
      // TypeError SYNCHRONOUSLY inside .map(), which escapes Promise.allSettled
      // and previously rejected the entire routing call — a partially
      // implemented adapter took down routing for every candidate. Caught by
      // pipeline-e2e.test.ts, whose mock adapter omits getCapacity.
      const partial = { name: 'claude' } as unknown as ICliAdapter;
      const stage = new CapacityFilterStage(
        new Map<RoutingArmId, ICliAdapter>([
          ['claude', partial],
          ['gemini', adapterWith(capacity())],
        ]),
        ENFORCING
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
      expect(getRemainingCandidates(result.value.context)).toEqual(['claude', 'gemini']);
      expect(result.value.context.signals.join(' ')).toContain('capacity:unmeasured-1');
    });

    it('does not exclude a candidate that has no registered adapter', async () => {
      const stage = new CapacityFilterStage(adapters({ gemini: capacity() }), ENFORCING);

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
    });

    it('skips candidates already filtered by an earlier stage', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ quotaExhausted: true }), gemini: capacity() }),
        ENFORCING
      );
      const ctx = createRoutingContext('t', CLIS);
      const preFiltered = { ...ctx, filtered: new Map([['claude' as const, 'budget']]) };

      const result = await stage.route(preFiltered);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Reason stays the earlier stage's — capacity must not overwrite it.
      expect(result.value.context.filtered.get('claude')).toBe('budget');
    });
  });

  describe('stage contract', () => {
    it('reports canHandle false when no candidates remain', () => {
      const stage = new CapacityFilterStage(adapters({ claude: capacity() }));
      const ctx = createRoutingContext('t', CLIS);
      const allFiltered = {
        ...ctx,
        filtered: new Map([
          ['claude' as const, 'x'],
          ['gemini' as const, 'y'],
        ]),
      };

      expect(stage.canHandle(allFiltered)).toBe(false);
      expect(stage.canHandle(ctx)).toBe(true);
    });

    it('records a trace entry naming the stage', async () => {
      const stage = new CapacityFilterStage(adapters({ claude: capacity() }));

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.trace.some((t) => t.stageName === 'capacity-filter')).toBe(true);
    });

    it('createCapacityStage builds the stage', () => {
      const stage = createCapacityStage(adapters({ claude: capacity() }));
      expect(stage).toBeInstanceOf(CapacityFilterStage);
      expect(stage.name).toBe('capacity-filter');
    });
  });
});

describe('#4456: rate limiting is graded apart from quota exhaustion', () => {
  it('grades a local rate limit as throttled, not exhausted', () => {
    expect(assessCapacity(capacity({ rateLimited: true }))).toBe('throttled');
  });

  it('grades a provider-asserted quota exhaustion as exhausted', () => {
    expect(assessCapacity(capacity({ quotaExhausted: true }))).toBe('exhausted');
  });

  it('does NOT exclude a merely rate-limited adapter, even under enforcement', async () => {
    // The regression this issue exists for. `rateLimited` is this process's
    // own rolling-60s arithmetic against an estimated constant — a 7-voter
    // panel trips it while plenty of provider quota remains. Excluding on it
    // would empty the candidate pool for a condition that clears within the
    // minute, which is why enforcement shipped switched off.
    const stage = new CapacityFilterStage(
      adapters({ claude: capacity({ rateLimited: true }), gemini: capacity() }),
      ENFORCING
    );

    const result = await stage.route(createRoutingContext('t', CLIS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context.filtered.has('claude')).toBe(false);
    expect(getRemainingCandidates(result.value.context)).toEqual(CLIS);
  });

  it('still refuses to act on an unobserved reading, whatever the flags say', () => {
    // Absence of a reading is not a reading (#4374) — unchanged by this issue.
    expect(assessCapacity(capacity({ observed: false, quotaExhausted: true }))).toBe('unmeasured');
  });
});

describe('#4456 follow-up: a throttled candidate is reported, not silently dropped', () => {
  it('emits a throttled signal so the state is visible in a trace', async () => {
    // The grade existed in the type and nowhere in the output: `route()` sent
    // throttled down the same `continue` as healthy, so a rate-limited
    // candidate was indistinguishable from a healthy one everywhere downstream.
    const stage = new CapacityFilterStage(
      adapters({ claude: capacity({ rateLimited: true }), gemini: capacity() }),
      ENFORCING
    );

    const result = await stage.route(createRoutingContext('t', CLIS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context.signals).toContain('capacity:throttled-1');
  });

  it('counts throttled candidates in the stage stats', async () => {
    const stage = new CapacityFilterStage(
      adapters({ claude: capacity({ rateLimited: true }), gemini: capacity() }),
      ENFORCING
    );

    await stage.route(createRoutingContext('t', CLIS));

    expect(stage.getStats()['throttledCount']).toBe(1);
  });

  it('emits no throttled signal when nothing is throttled', async () => {
    // Absence of the signal has to mean something, so it must not be emitted
    // at zero — same contract as capacity:unmeasured-N.
    const stage = new CapacityFilterStage(
      adapters({ claude: capacity(), gemini: capacity() }),
      ENFORCING
    );

    const result = await stage.route(createRoutingContext('t', CLIS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context.signals.some((s) => s.startsWith('capacity:throttled'))).toBe(
      false
    );
  });

  it('still does not exclude the throttled candidate', async () => {
    const stage = new CapacityFilterStage(
      adapters({ claude: capacity({ rateLimited: true }), gemini: capacity() }),
      ENFORCING
    );

    const result = await stage.route(createRoutingContext('t', CLIS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getRemainingCandidates(result.value.context)).toEqual(CLIS);
  });
});
