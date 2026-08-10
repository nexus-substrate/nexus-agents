/**
 * Tests for canonical model equivalence (#4390).
 *
 * @module config/model-equivalence.test
 */

import { describe, it, expect } from 'vitest';
import { canonicalModelKey, countDistinctModels } from './model-equivalence.js';

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
