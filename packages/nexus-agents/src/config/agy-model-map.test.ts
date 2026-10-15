/**
 * Tests for the Antigravity (`agy`) model-slug mapping (#4346).
 *
 * @module config/agy-model-map.test
 */

import { describe, it, expect } from 'vitest';
import {
  toAgyModelSlug,
  fromAgyModelSlug,
  isAgyModelSlug,
  AGY_MODEL_SLUGS,
  DEFAULT_AGY_MODEL,
} from './agy-model-map.js';
import { DEFAULT_MODEL_CAPABILITIES } from './in-tree-data.js';

describe('agy model slugs', () => {
  it('accepts an already-valid agy slug unchanged', () => {
    for (const slug of AGY_MODEL_SLUGS) {
      expect(toAgyModelSlug(slug)).toBe(slug);
    }
  });

  it('maps registered Flash models and refuses unavailable registered Pro models', () => {
    const gemini = DEFAULT_MODEL_CAPABILITIES.models.filter(
      (m) => m.cliName === 'gemini' && !m.id.includes('pro')
    );
    expect(gemini.length).toBeGreaterThan(0);
    for (const model of gemini) {
      if (model.id.includes('pro'))
        expect(() => toAgyModelSlug(model.id)).toThrow(/Unsupported AGY/);
      else expect(isAgyModelSlug(toAgyModelSlug(model.id))).toBe(true);
    }
  });

  it('lists no gemini-3.5 slug, which agy 1.3.1 rejects (#7217)', () => {
    // agy 1.3.1 answers a 3.5 slug with status:ERROR "invalid model selection"
    // and exit 0. Keeping it listed makes isAgyModelSlug accept it, so the
    // DEFAULT_AGY_MODEL fallback never applies.
    expect(AGY_MODEL_SLUGS.filter((s) => s.startsWith('gemini-3.5'))).toEqual([]);
  });

  it('maps the 3.x flash entries to flash slugs, keeping their effort tier (#7217, #7101, #7375)', () => {
    expect(toAgyModelSlug('gemini-3.8-flash')).toBe('gemini-3.8-flash-high');
    expect(toAgyModelSlug('gemini-3.7-flash')).toBe('gemini-3.8-flash-high');
    expect(toAgyModelSlug('gemini-3.5-flash')).toBe('gemini-3.8-flash-medium');
    expect(toAgyModelSlug('gemini-3-flash')).toBe('gemini-3.8-flash-low');
  });

  it('maps a 2.5-generation entry agy does not serve to a surviving tier', () => {
    // agy serves no 2.5 models at all. Dropping these would break routing that
    // already selects them.
    expect(() => toAgyModelSlug('gemini-pro')).toThrow(/Unsupported AGY/);
    expect(isAgyModelSlug(toAgyModelSlug('gemini-flash'))).toBe(true);
  });

  it('refuses an unknown model without substituting the default', () => {
    expect(() => toAgyModelSlug('some-model-that-does-not-exist')).toThrow(/Unsupported AGY/);
    expect(isAgyModelSlug(DEFAULT_AGY_MODEL)).toBe(true);
  });

  it('never returns a Google API model id', () => {
    // The API-side `cliModelName` values (gemini-2.5-flash, …) are a different
    // namespace; returning one would make agy reject the call.
    expect(toAgyModelSlug('gemini-2.5-flash')).not.toBe('gemini-2.5-flash');
    expect(isAgyModelSlug(toAgyModelSlug('gemini-2.5-flash'))).toBe(true);
  });

  it('does not map agy’s non-Gemini models', () => {
    // agy also fronts Claude and GPT-OSS. The `gemini` arm means Gemini-family
    // models; those are routed through their own adapters (#4346, 7/0 vote).
    expect(AGY_MODEL_SLUGS.every((s) => s.startsWith('gemini-'))).toBe(true);
  });

  describe('reverse mapping (#4395)', () => {
    it('round-trips every canonical gemini model', () => {
      const geminiIds = DEFAULT_MODEL_CAPABILITIES.models
        .filter((m) => m.cliName === 'gemini' && !m.id.includes('pro'))
        .map((m) => m.id);

      for (const id of geminiIds) {
        const slug = toAgyModelSlug(id);
        // Effort is native transport metadata; reverse identity is the selected
        // Flash model, irrespective of the legacy alias that requested it.
        const back = fromAgyModelSlug(slug);
        expect(back).not.toBeNull();
        expect(back).toBe('gemini-3.8-flash');
      }
    });

    it('returns null for a slug with no registry entry', () => {
      // Retired native pins do not describe a currently supported selection.
      expect(fromAgyModelSlug('gemini-3.6-flash-high')).toBeNull();
    });

    it('returns null for a string that is not an agy slug at all', () => {
      expect(fromAgyModelSlug('claude-sonnet-4-6')).toBeNull();
    });

    it('honours a pinned registry cliModelName instead of silently defaulting', () => {
      // #4395: callers pin Google API ids like `gemini-2.5-pro` (the registry's
      // cliModelName for `gemini-pro`). Falling through to the default here
      // would silently run a different model than the caller asked for.
      expect(() => toAgyModelSlug('gemini-2.5-pro')).toThrow(/Unsupported AGY/);
      expect(toAgyModelSlug('gemini-2.5-flash')).toBe(toAgyModelSlug('gemini-flash'));
    });

    it('resolves a reversed slug to real registry pricing', () => {
      // The point of the reverse map: an invoked slug must be priceable.
      const canonical = fromAgyModelSlug('gemini-3.8-flash-high');

      expect(canonical).toBe('gemini-3.8-flash');
    });
  });
});
