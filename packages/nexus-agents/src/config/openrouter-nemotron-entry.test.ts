/**
 * Registry entry for `openrouter-nemotron-super` (#4416).
 *
 * The entry dispatches `nvidia/nemotron-3-super-120b-a12b:free` but took its
 * `contextWindow` from the *paid* variant of the same model. models.dev lists
 * both, and they differ:
 *
 *   nvidia/nemotron-3-super-120b-a12b        0.085 / 0.4   1,000,000
 *   nvidia/nemotron-3-super-120b-a12b:free   0     / 0       262,144
 *
 * Unlike #4410 the model is live — this is a metadata mismatch, not a dead
 * pointer, which is why nothing surfaced it. `contextWindow` is what context
 * budgeting and eligibility filtering read, so a task assembling between 262K
 * and 1M tokens passed the local check and was then rejected by the provider,
 * after the context had already been built.
 *
 * Kept on the free variant deliberately: repointing to the paid id would empty
 * the zero-cost tier, which #4410 just reduced to this single entry.
 *
 * @module config/openrouter-nemotron-entry.test
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL_CAPABILITIES } from './in-tree-data.js';

const entry = DEFAULT_MODEL_CAPABILITIES.models.find((m) => m.id === 'openrouter-nemotron-super');

describe('openrouter-nemotron-super entry (#4416)', () => {
  it('still exists in the registry', () => {
    expect(entry).toBeDefined();
  });

  it('advertises the context the dispatched variant actually serves', () => {
    // The paid variant's 1,000,000 is the wrong number for a `:free` dispatch.
    expect(entry?.contextWindow).toBe(262_144);
  });

  it('still dispatches the free variant', () => {
    // The fix corrects the metadata, not the SKU — this is the only remaining
    // zero-cost entry and switching it would silently retire the free tier.
    expect(entry?.cliModelName).toBe('nvidia/nemotron-3-super-120b-a12b:free');
  });

  it('is still priced at zero, consistent with the :free SKU', () => {
    expect(entry?.pricing?.inputPer1M).toBe(0);
    expect(entry?.pricing?.outputPer1M).toBe(0);
  });

  it('does not claim more context than its max output allows for', () => {
    // Sanity: an entry whose maxOutputTokens exceeds its window is incoherent.
    expect(entry?.maxOutputTokens ?? 0).toBeLessThan(entry?.contextWindow ?? 0);
  });
});

describe('paid/free metadata split across the registry (#4416)', () => {
  it('no entry dispatching a :free SKU claims a seven-figure context', () => {
    // The generalized shape of this bug: copying a paid variant's headline
    // context onto a free-tier dispatch. Cheap to assert, catches a repeat.
    const overclaiming = DEFAULT_MODEL_CAPABILITIES.models.filter(
      (m) => (m.cliModelName ?? '').endsWith(':free') && m.contextWindow >= 1_000_000
    );

    expect(overclaiming.map((m) => m.id)).toEqual([]);
  });
});
