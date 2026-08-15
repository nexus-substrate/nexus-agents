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
import { CapacityFilterStage, createCapacityStage, CAPACITY_EXHAUSTED } from './capacity-stage.js';
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
    exhausted: false,
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
        adapters({ claude: capacity({ exhausted: true, remainingTokens: 0 }), gemini: capacity() })
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
        adapters({ claude: capacity({ exhausted: false, remainingTokens: 0 }), gemini: capacity() })
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(true);
    });

    it('uses a normalized capacity_exhausted diagnostic as the filter reason', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ exhausted: true }), gemini: capacity() })
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
          claude: capacity({ observed: false, exhausted: true, remainingTokens: 0 }),
          gemini: capacity(),
        })
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
      expect(result.value.context.signals.join(' ')).not.toContain('capacity:unmeasured-0');
    });
  });

  describe('warn-only mode', () => {
    it('annotates without filtering when enforceHardLimits is false', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ exhausted: true }), gemini: capacity() }),
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
          claude: capacity({ exhausted: true }),
          gemini: capacity({ exhausted: true }),
        })
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
        adapters({ claude: new Error('probe failed'), gemini: capacity() })
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
        ])
      );

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
      expect(getRemainingCandidates(result.value.context)).toEqual(['claude', 'gemini']);
      expect(result.value.context.signals.join(' ')).toContain('capacity:unmeasured-1');
    });

    it('does not exclude a candidate that has no registered adapter', async () => {
      const stage = new CapacityFilterStage(adapters({ gemini: capacity() }));

      const result = await stage.route(createRoutingContext('t', CLIS));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.filtered.has('claude')).toBe(false);
    });

    it('skips candidates already filtered by an earlier stage', async () => {
      const stage = new CapacityFilterStage(
        adapters({ claude: capacity({ exhausted: true }), gemini: capacity() })
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
