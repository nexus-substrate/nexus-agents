/**
 * nexus-agents/orchestration - Authority-tier guard tests (#3841, ADR-0017).
 *
 * Proves the enforcement contract: an action above a strategy's declared tier is
 * REFUSED (fail-closed) and an at/below-tier action is PERMITTED. The tier→action
 * mapping is exercised directly (the pure {@link permitsAction}) and through the
 * registry-backed {@link evaluateAuthority} / {@link guardAuthority}.
 *
 * @module orchestration/authority-tier-guard.test
 * (Source: ADR-0017, Issue #3841)
 */

import { describe, it, expect } from 'vitest';
import {
  ACTION_CLASSES,
  authorityRank,
  permitsAction,
  evaluateAuthority,
  guardAuthority,
  dispatchActionClass,
  AuthorityRefusalError,
  type ActionClass,
} from './authority-tier-guard.js';
import { getStrategyManifest } from './strategy-manifest-registry.js';
import type { AuthorityTier } from './strategy-manifest.js';

describe('authority-tier guard — tier→action mapping (#3841)', () => {
  it('orders the action classes least→most authoritative', () => {
    expect([...ACTION_CLASSES]).toEqual(['observe', 'suggest', 'advisory', 'enforce']);
    expect(authorityRank('observe')).toBeLessThan(authorityRank('suggest'));
    expect(authorityRank('suggest')).toBeLessThan(authorityRank('advisory'));
    expect(authorityRank('advisory')).toBeLessThan(authorityRank('enforce'));
  });

  it('permits an action at or below the declared tier', () => {
    // advisory-tier may take observe/suggest/advisory-class actions.
    expect(permitsAction('advisory', 'observe')).toBe(true);
    expect(permitsAction('advisory', 'suggest')).toBe(true);
    expect(permitsAction('advisory', 'advisory')).toBe(true);
  });

  it('refuses an action above the declared tier', () => {
    // advisory-tier may NOT take an enforce-class action.
    expect(permitsAction('advisory', 'enforce')).toBe(false);
    expect(permitsAction('suggest', 'advisory')).toBe(false);
    expect(permitsAction('suggest', 'enforce')).toBe(false);
    expect(permitsAction('observe', 'suggest')).toBe(false);
  });

  it('fail-closes an undeclared tier to the observe floor (permits only observe)', () => {
    expect(permitsAction(undefined, 'observe')).toBe(true);
    expect(permitsAction(undefined, 'suggest')).toBe(false);
    expect(permitsAction(undefined, 'enforce')).toBe(false);
  });

  it('is exhaustive over every tier×action pair (rank monotonicity)', () => {
    const tiers: AuthorityTier[] = ['observe', 'suggest', 'advisory', 'enforce'];
    for (const tier of tiers) {
      for (const action of ACTION_CLASSES) {
        const expected = authorityRank(action) <= authorityRank(tier);
        expect(permitsAction(tier, action)).toBe(expected);
      }
    }
  });
});

describe('authority-tier guard — registry-backed enforcement (#3841)', () => {
  // `consensus` is declared advisory; the work-producing strategies are suggest.
  it('PERMITS an at-tier action (consensus@advisory takes an advisory action)', () => {
    expect(getStrategyManifest('consensus')?.authorityTier).toBe('advisory');
    const decision = evaluateAuthority('consensus', 'advisory');
    expect(decision.permitted).toBe(true);
    expect(() => {
      guardAuthority('consensus', 'advisory');
    }).not.toThrow();
  });

  it('PERMITS a below-tier action (consensus@advisory takes a suggest action)', () => {
    const decision = evaluateAuthority('consensus', 'suggest');
    expect(decision.permitted).toBe(true);
  });

  it('REFUSES an above-tier action (consensus@advisory attempts enforce) fail-closed', () => {
    const decision = evaluateAuthority('consensus', 'enforce');
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) {
      expect(decision.refusal).toBeInstanceOf(AuthorityRefusalError);
      expect(decision.refusal.code).toBe('above_declared_tier');
      expect(decision.refusal.strategy).toBe('consensus');
      expect(decision.refusal.declaredTier).toBe('advisory');
      expect(decision.refusal.attemptedAction).toBe('enforce');
    }
  });

  it('REFUSES an above-tier action from a suggest-tier strategy (dev-pipeline→advisory)', () => {
    expect(getStrategyManifest('dev-pipeline')?.authorityTier).toBe('suggest');
    const decision = evaluateAuthority('dev-pipeline', 'advisory');
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) {
      expect(decision.refusal.code).toBe('above_declared_tier');
    }
  });

  it('guardAuthority THROWS the typed refusal for an above-tier action', () => {
    expect(() => {
      guardAuthority('dev-pipeline', 'enforce');
    }).toThrow(AuthorityRefusalError);
    try {
      guardAuthority('dev-pipeline', 'enforce');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorityRefusalError);
      const refusal = err as AuthorityRefusalError;
      expect(refusal.code).toBe('above_declared_tier');
      expect(refusal.attemptedAction).toBe('enforce');
    }
  });

  it('every action class is permitted by the matching declared tier (no false refusal)', () => {
    // Sanity: each tier permits exactly its own class for a strategy declared there.
    const byTier: Partial<Record<ActionClass, string>> = {
      suggest: 'research', // declared suggest
      advisory: 'consensus', // declared advisory
    };
    for (const [action, strategy] of Object.entries(byTier)) {
      const decision = evaluateAuthority(strategy as never, action as ActionClass);
      expect(decision.permitted, `${strategy}@${action} should be permitted`).toBe(true);
    }
  });
});

describe('dispatchActionClass — dispatch-mode → action-class map (#3920)', () => {
  it("maps the route-only dispatch to a 'suggest'-class action (recommendation)", () => {
    expect(dispatchActionClass('route')).toBe('suggest');
  });

  it("maps the inline-execute dispatch to a 'suggest'-class action (inert result)", () => {
    expect(dispatchActionClass('execute')).toBe('suggest');
  });

  it('floors both modes at suggest so every live suggest+/advisory strategy passes', () => {
    // The conservative #3920 interpretation: both dispatch modes floor at
    // `suggest`. Every live strategy is declared `suggest`+, so a dispatch-class
    // action is at/below tier for all of them — the guard fires only on a genuine
    // above-tier (observe / undeclared) strategy.
    for (const mode of ['route', 'execute'] as const) {
      expect(permitsAction('suggest', dispatchActionClass(mode))).toBe(true);
      expect(permitsAction('advisory', dispatchActionClass(mode))).toBe(true);
      // An observe-tier strategy is BELOW the floor — refused.
      expect(permitsAction('observe', dispatchActionClass(mode))).toBe(false);
    }
  });
});
