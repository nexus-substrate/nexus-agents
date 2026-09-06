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
  guardExecuteEnvelope,
  ExecuteEnvelopeRefusalError,
} from './authority-tier-guard.js';
import { AUTHORITY_TIERS } from './strategy-manifest.js';
import { getStrategyManifest, STRATEGY_MANIFEST_REGISTRY } from './strategy-manifest-registry.js';
import type { AuthorityTier } from './strategy-manifest.js';

describe('ACTION_CLASSES derives from AUTHORITY_TIERS (#5711)', () => {
  it('is the same ordering, by construction rather than by comment', () => {
    // The two arrays were declared independently while AUTHORITY_TIERS' JSDoc
    // claimed to be "the single ordered source" both consumers derive from.
    // Nothing enforced that, so the orderings were free to drift silently.
    expect([...ACTION_CLASSES]).toEqual([...AUTHORITY_TIERS]);
  });

  it('ranks every tier the schema accepts', () => {
    for (const tier of AUTHORITY_TIERS) {
      expect(authorityRank(tier)).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(AUTHORITY_TIERS.map((t) => authorityRank(t))).size).toBe(AUTHORITY_TIERS.length);
  });
});

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

describe('execute-path dispatch floor invariant (#3925)', () => {
  // The `suggest` dispatch floor (`dispatchActionClass`) is safe ONLY while every
  // strategy reachable on the execute path is inert/advisory — its output is a
  // recommendation / non-blocking vote that does NOT merge, deploy, or gate until a
  // human or governor acts. These are the tiers safe under that floor; `enforce` is
  // deliberately EXCLUDED: it is the only side-effecting tier, and the `suggest`
  // floor would under-classify (and thus under-require authority for) an enforce
  // strategy. This converts the previously asserted-but-untested assumption (#3924
  // deferral, #3925) into a machine-checked, fail-closed gate.
  const INERT_UNDER_SUGGEST_FLOOR: ReadonlySet<AuthorityTier> = new Set([
    'observe',
    'suggest',
    'advisory',
  ]);

  it('pins the dispatch floor the invariant rests on (suggest)', () => {
    expect(dispatchActionClass('route')).toBe('suggest');
    expect(dispatchActionClass('execute')).toBe('suggest');
  });

  it('every live registry strategy is inert under the suggest floor — no silent enforce', () => {
    for (const manifest of STRATEGY_MANIFEST_REGISTRY.manifests) {
      // Fail-closed: an undeclared tier acts as the lowest rung (`observe`),
      // mirroring permitsAction.
      const tier: AuthorityTier = manifest.authorityTier ?? 'observe';
      expect(
        INERT_UNDER_SUGGEST_FLOOR.has(tier),
        `Strategy "${manifest.strategy}" declares authorityTier "${tier}", which is NOT ` +
          `inert under the 'suggest' execute dispatch floor. A side-effecting (enforce) ` +
          `strategy must NOT rely on the suggest floor to gate it — raise ` +
          `dispatchActionClass for its dispatch mode (and update this invariant) before ` +
          `adding it (#3925).`
      ).toBe(true);
    }
  });

  it('covers a non-empty registry (the invariant is not vacuously true)', () => {
    expect(STRATEGY_MANIFEST_REGISTRY.manifests.length).toBeGreaterThan(0);
  });
});

describe('execute-envelope guard (#4655)', () => {
  // The point of #4655: before this, NEITHER authority refusal code could fire
  // in production. `above_declared_tier` needed an action above `suggest`, and
  // both dispatch modes floored at `suggest`; `tier_undeclared` needed a
  // strategy with no manifest, and the union is exactly the 8 that have one.
  // A guard that cannot refuse is not a guard. These tests exercise
  // `guardExecuteEnvelope` — the function the router actually calls — so they
  // cover the production path rather than a pure helper beside it.

  it('permits a strategy that has declared an envelope, and returns it', () => {
    expect(guardExecuteEnvelope('dev-pipeline')).toEqual({
      filesystem: 'repo',
      spawn: 'dev-tooling',
      network: ['llm-provider', 'web'],
      vcs: 'none',
    });
  });

  it('REFUSES a strategy with no declared envelope — the reachable refusal', () => {
    // `spec` has no wired executor and therefore no envelope.
    let refusal: unknown;
    try {
      guardExecuteEnvelope('spec');
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(ExecuteEnvelopeRefusalError);
    const typed = refusal as ExecuteEnvelopeRefusalError;
    expect(typed.code).toBe('envelope_undeclared');
    expect(typed.strategy).toBe('spec');
    // Absence must read as "cannot execute", never as permission.
    expect(typed.message).toContain('never "unbounded"');
  });

  it('refuses every strategy that has no wired executor', () => {
    for (const s of ['single-shot', 'graph-workflow', 'orchestrate', 'spec'] as const) {
      expect(() => guardExecuteEnvelope(s), `'${s}' must be refused`).toThrow(
        ExecuteEnvelopeRefusalError
      );
    }
  });

  it('every executable strategy clears the gate, so nothing working is broken', () => {
    for (const s of ['dev-pipeline', 'pipeline', 'consensus', 'research'] as const) {
      expect(() => guardExecuteEnvelope(s), `'${s}' must still execute`).not.toThrow();
    }
  });
});
