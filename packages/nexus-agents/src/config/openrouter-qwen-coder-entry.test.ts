/**
 * Registry entry for `openrouter-qwen-coder` (#4410).
 *
 * The entry pointed at `qwen/qwen3-coder-480b-a35b:free`, an id absent from the
 * live models.dev catalogue in every form. Routing that selected it dispatched
 * an unservable `--model` at opencode, and because the entry was priced 0/0 the
 * cost-aware stages saw a free option that was really a guaranteed failure.
 *
 * `resolve-live-model.ts` looks like it would paper over this, but it needs a
 * populated available-models catalogue to fire and is itself slated for removal
 * (#4408) — so the registry is the only durable place to fix it.
 *
 * Vote: 7/0 for repointing to `qwen/qwen3-coder` (higher_order). The quality
 * scores carry over because the live id is the SAME checkpoint — models.dev
 * reports `name: "Qwen3 Coder 480B A35B"`, context 262,144 — not because the
 * name looks similar.
 *
 * @module config/openrouter-qwen-coder-entry.test
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL_CAPABILITIES } from './in-tree-data.js';

const entry = DEFAULT_MODEL_CAPABILITIES.models.find((m) => m.id === 'openrouter-qwen-coder');

describe('openrouter-qwen-coder entry (#4410)', () => {
  it('still exists in the registry', () => {
    expect(entry).toBeDefined();
  });

  it('points at an id OpenRouter actually serves', () => {
    // The retired `:free` SKU is the whole bug. Assert the live id explicitly
    // rather than "not the old one" — the latter passes for any typo.
    expect(entry?.cliModelName).toBe('qwen/qwen3-coder');
  });

  it('no longer claims a free tier that does not exist', () => {
    // 0/0 is not a neutral default: it is a positive claim that steers the
    // cost-aware stages toward a model that would fail on dispatch.
    expect(entry?.pricing?.inputPer1M).toBeGreaterThan(0);
    expect(entry?.pricing?.outputPer1M).toBeGreaterThan(0);
  });

  it('carries the catalogue list price', () => {
    expect(entry?.pricing?.inputPer1M).toBeCloseTo(0.3, 5);
    expect(entry?.pricing?.outputPer1M).toBeCloseTo(1, 5);
  });

  it('does not advertise "free" in user-facing text', () => {
    const text = `${entry?.displayName ?? ''} ${entry?.notes ?? ''}`.toLowerCase();

    expect(text).not.toContain('free');
  });

  it('keeps the 262K context the live id reports', () => {
    expect(entry?.contextWindow).toBe(262_144);
  });

  it('keeps the coding quality scores (same checkpoint)', () => {
    // Verified equivalence is what licenses carrying these over; a different
    // checkpoint would have made them fabricated data.
    expect(entry?.qualityScores?.codeGeneration).toBe(8);
    expect(entry?.qualityScores?.reasoning).toBe(7);
  });

  it('no longer scores cost as free-tier-perfect', () => {
    // 10 is reserved for genuinely 0/0 entries. At 0.3/1 this is the cheapest
    // *paid* entry, which the scale puts at 9 (cf. gemini-flash at 0.3/2.5).
    expect(entry?.qualityScores?.cost).toBe(9);
  });
});

describe('zero-cost tier after #4410', () => {
  it('contains only entries actually priced at zero', () => {
    const zeroCost = DEFAULT_MODEL_CAPABILITIES.models.filter(
      (m) => m.pricing?.inputPer1M === 0 && m.pricing?.outputPer1M === 0
    );

    expect(zeroCost.map((m) => m.id)).toEqual(['openrouter-nemotron-super']);
  });
});
