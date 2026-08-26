/**
 * Tests for canonical model equivalence (#4390).
 *
 * @module config/model-equivalence.test
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalModelKey,
  countDistinctModels,
  assessPanelIndependence,
  UNRESOLVED_MODEL_ID,
} from './model-equivalence.js';

describe('canonicalModelKey', () => {
  it('collapses gateway-prefixed forms of one model', () => {
    // The defect: these are three strings for one set of weights, and the
    // panel diversity check counted them as three distinct models.
    const keys = [
      canonicalModelKey('claude-sonnet-4-6'),
      canonicalModelKey('anthropic/claude-sonnet-4-6'),
      canonicalModelKey('custom/claude-sonnet-4-6'),
    ];

    expect(keys[0]).not.toBeNull();
    expect(new Set(keys).size).toBe(1);
  });

  it('keeps different versions of one family distinct', () => {
    expect(canonicalModelKey('claude-sonnet-4-6')).not.toBe(canonicalModelKey('claude-sonnet-4-5'));
  });

  it('keeps different families of one vendor distinct', () => {
    expect(canonicalModelKey('claude-sonnet-4-6')).not.toBe(canonicalModelKey('claude-opus-4-6'));
  });

  it('keeps different vendors distinct', () => {
    expect(canonicalModelKey('claude-sonnet-4-6')).not.toBe(canonicalModelKey('gpt-5.5'));
  });

  describe('unresolvable identities', () => {
    it('returns null rather than a shared placeholder', () => {
      // `sonnet` is a real value the claude CLI adapter can report. It carries
      // no vendor, so nothing can be concluded from it.
      expect(canonicalModelKey('sonnet')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(canonicalModelKey('')).toBeNull();
    });
  });
});

describe('countDistinctModels', () => {
  it('counts one model reached through three gateways as one', () => {
    expect(
      countDistinctModels([
        'claude-sonnet-4-6',
        'anthropic/claude-sonnet-4-6',
        'custom/claude-sonnet-4-6',
      ])
    ).toBe(1);
  });

  it('counts genuinely different models separately', () => {
    expect(countDistinctModels(['claude-sonnet-4-6', 'claude-opus-4-6', 'gpt-5.5'])).toBe(3);
  });

  it('never claims two unresolvable models are the same', () => {
    // The inverse error, and the worse one: collapsing distinct models because
    // neither could be identified would UNDER-report diversity and silence a
    // warning that should fire. Each unresolvable entry counts as its own.
    expect(countDistinctModels(['sonnet', 'opus'])).toBe(2);
  });

  it('does not let an unresolvable entry merge into a resolvable one', () => {
    expect(countDistinctModels(['claude-sonnet-4-6', 'sonnet'])).toBe(2);
  });

  it('counts repeated unresolvable strings by their raw value', () => {
    // Identical strings ARE the same adapter config, even when unidentifiable.
    expect(countDistinctModels(['sonnet', 'sonnet'])).toBe(1);
  });

  it('returns 0 for an empty panel', () => {
    expect(countDistinctModels([])).toBe(0);
  });

  it('is order-independent', () => {
    const a = ['claude-sonnet-4-6', 'anthropic/claude-sonnet-4-6', 'gpt-5.5'];
    expect(countDistinctModels(a)).toBe(countDistinctModels([...a].reverse()));
  });
});

// ---------------------------------------------------------------------------
// assessPanelIndependence (#4983)
// ---------------------------------------------------------------------------

describe('assessPanelIndependence', () => {
  it('reports a genuinely collapsed panel', () => {
    // The condition #4390 exists to catch: three arms, one set of weights.
    const result = assessPanelIndependence([
      'claude-sonnet-4-6',
      'anthropic/claude-sonnet-4-6',
      'custom/claude-sonnet-4-6',
    ]);
    expect(result).toEqual({ kind: 'collapsed', model: 'claude-sonnet-4-6' });
  });

  it('reports a diverse panel', () => {
    const result = assessPanelIndependence(['claude-sonnet-4-6', 'gpt-5.5', 'gemini-3-pro']);
    expect(result).toEqual({ kind: 'diverse', distinct: 3 });
  });

  it('refuses to judge a panel whose adapters have not detected their model', () => {
    // The live defect: lazy detection (#811) means every CLI adapter reports
    // the same placeholder, which an equality check reads as one model.
    const result = assessPanelIndependence([
      UNRESOLVED_MODEL_ID,
      UNRESOLVED_MODEL_ID,
      UNRESOLVED_MODEL_ID,
      UNRESOLVED_MODEL_ID,
    ]);
    expect(result).toEqual({ kind: 'unmeasured', unresolved: 4, total: 4 });
  });

  it('refuses to judge when only some adapters have resolved', () => {
    // The resolved two collide, but the unresolved one could be anything —
    // concluding either way would be inventing a measurement.
    const result = assessPanelIndependence([
      'claude-sonnet-4-6',
      'anthropic/claude-sonnet-4-6',
      UNRESOLVED_MODEL_ID,
    ]);
    expect(result).toEqual({ kind: 'unmeasured', unresolved: 1, total: 3 });
  });

  it('treats an adapter reporting no model id at all as unresolved', () => {
    // Reachable: an adapter built without a model reports `undefined` despite
    // the `string` in the interface, and this classifier runs after the votes
    // are collected — throwing there would throw away the panel's results.
    const result = assessPanelIndependence(['gpt-5.5', undefined]);
    expect(result).toEqual({ kind: 'unmeasured', unresolved: 1, total: 2 });
  });

  it('calls an empty panel unmeasured rather than diverse', () => {
    // Absence must not render as health: no adapters is not a diverse panel.
    expect(assessPanelIndependence([])).toEqual({ kind: 'unmeasured', unresolved: 0, total: 0 });
  });
});
