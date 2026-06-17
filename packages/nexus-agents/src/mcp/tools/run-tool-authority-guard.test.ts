/**
 * Regression tests for #3920 — the authority-tier runtime guard must fire on a
 * REAL production dispatch path (`routeGoal` / `executeGoal`), not only when a
 * test hand-builds a `MetaOrchestratorInput` with `requiredAuthority` set.
 *
 * The bug (#3920): `guardAuthority`'s only non-test caller was gated on
 * `input.requiredAuthority !== undefined`, but NO production path set it
 * (`toMetaInput` omitted it on both the route-only and execute:true paths). So the
 * ADR-0017 router refusal was dead code: an above-tier action was never refused at
 * runtime. The fix derives `requiredAuthority` from the dispatch MODE
 * (`dispatchActionClass`, floored at `suggest`) and threads it through
 * `toMetaInput`, so the guard now fires at the router.
 *
 * Deliberate-breakage fixture: every LIVE strategy is declared `suggest`/`advisory`
 * (≥ the `suggest` dispatch floor), so none can prove an above-tier refusal on the
 * real registry. We therefore mock the manifest registry's `getStrategyManifest`
 * (the seam the guard reads) to DOWNGRADE one strategy below the floor:
 *  - `single-shot` → declared `observe` (below `suggest`) ⇒ `above_declared_tier`,
 *  - `graph-workflow` → NO declared tier (undefined) ⇒ `tier_undeclared` backstop.
 * Every other strategy keeps its real, correctly-declared tier, proving normal
 * dispatch is unaffected.
 *
 * Without the fix these tests are RED: with `requiredAuthority` never written, the
 * guard never runs and `routeGoal`/`executeGoal` return normally instead of
 * refusing. With the fix they are GREEN.
 */

import { describe, it, expect, vi } from 'vitest';
import type { StrategyManifest } from '../../orchestration/strategy-manifest.js';
import type { ExecutionStrategy } from '../../orchestration/meta-orchestrator.js';

// Mock ONLY getStrategyManifest (the guard's tier source) — keep entrypointToolFor
// and the rest of the registry real so routing/recommended-tool resolution is
// unaffected. The downgrade map is the deliberate-breakage fixture (#3841 evidence
// requirement: a below-tier manifest attempting a dispatch action must be refused).
vi.mock('../../orchestration/strategy-manifest-registry.js', async (importActual) => {
  const actual =
    await importActual<typeof import('../../orchestration/strategy-manifest-registry.js')>();
  return {
    ...actual,
    getStrategyManifest: (strategy: ExecutionStrategy): StrategyManifest | undefined => {
      const real = actual.getStrategyManifest(strategy);
      if (real === undefined) return undefined;
      if (strategy === 'single-shot') {
        return { ...real, authorityTier: 'observe' };
      }
      if (strategy === 'graph-workflow') {
        const withoutTier: StrategyManifest = { ...real };
        delete (withoutTier as { authorityTier?: unknown }).authorityTier;
        return withoutTier;
      }
      return real;
    },
  };
});

const { routeGoal, executeGoal } = await import('./run-tool.js');
const { AuthorityRefusalError } = await import('../../orchestration/authority-tier-guard.js');
const { MetaDispatchError } = await import('../../orchestration/meta-dispatcher.js');

describe('run authority-ladder guard fires on a real dispatch path (#3920)', () => {
  describe('route-only path (routeGoal, execute:false)', () => {
    it('REFUSES an above-tier dispatch: observe-tier strategy, suggest-class route', () => {
      let thrown: unknown;
      try {
        routeGoal({ goal: 'anything', forceStrategy: 'single-shot' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AuthorityRefusalError);
      const refusal = thrown as InstanceType<typeof AuthorityRefusalError>;
      expect(refusal.code).toBe('above_declared_tier');
      expect(refusal.strategy).toBe('single-shot');
      expect(refusal.declaredTier).toBe('observe');
      expect(refusal.attemptedAction).toBe('suggest');
    });

    it('REFUSES fail-closed when the strategy has NO declared tier (tier_undeclared backstop)', () => {
      let thrown: unknown;
      try {
        routeGoal({ goal: 'implement the feature', forceStrategy: 'graph-workflow' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AuthorityRefusalError);
      expect((thrown as InstanceType<typeof AuthorityRefusalError>).code).toBe('tier_undeclared');
    });

    it('PROCEEDS unchanged for a correctly-declared at/below-tier strategy (consensus@advisory)', () => {
      const r = routeGoal({ goal: 'should we adopt A or B', requiresConsensus: true });
      expect(r.strategy).toBe('consensus');
      expect(r.recommendedTool).toBe('consensus_vote');
    });

    it('PROCEEDS unchanged for a normal suggest-tier dispatch (dev-pipeline@suggest)', () => {
      // dev-pipeline keeps its real `suggest` tier in the fixture; a suggest-class
      // route is at-tier, so it is NOT refused.
      const r = routeGoal({ goal: 'implement the feature', forceStrategy: 'dev-pipeline' });
      expect(r.strategy).toBe('dev-pipeline');
      expect(r.recommendedTool).toBe('run_dev_pipeline');
    });
  });

  describe('inline-execute path (executeGoal, execute:true)', () => {
    it('REFUSES an above-tier dispatch BEFORE any executor runs', async () => {
      const executor = vi.fn(() => Promise.resolve({ ran: true }));
      let thrown: unknown;
      try {
        await executeGoal(
          { goal: 'anything', forceStrategy: 'single-shot', execute: true },
          { executors: { 'single-shot': executor } }
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(AuthorityRefusalError);
      expect((thrown as InstanceType<typeof AuthorityRefusalError>).code).toBe(
        'above_declared_tier'
      );
      // Fail-closed: the refusal is at the router, so the executor never runs.
      expect(executor).not.toHaveBeenCalled();
    });

    it('PROCEEDS unchanged for a normal suggest-tier execute (dev-pipeline@suggest)', async () => {
      const executor = vi.fn(() => Promise.resolve({ completed: true }));
      const res = await executeGoal(
        { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
        { executors: { 'dev-pipeline': executor } }
      );
      expect(res.executed).toBe(true);
      expect(res.strategy).toBe('dev-pipeline');
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('still fails closed with MetaDispatchError for an at-tier strategy with no wired executor', async () => {
      // Proves the authority guard does not swallow / pre-empt the existing
      // no-executor fail-closed path for a correctly-declared strategy.
      let thrown: unknown;
      try {
        await executeGoal(
          { goal: 'decide A or B', forceStrategy: 'consensus', execute: true },
          { executors: {} }
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(MetaDispatchError);
      expect((thrown as InstanceType<typeof MetaDispatchError>).code).toBe('no_executor');
    });
  });
});
