/**
 * Tests for the Antigravity (`agy`) model-slug mapping (#4346).
 *
 * @module config/agy-model-map.test
 */

import { describe, it, expect } from 'vitest';
import {
  toAgyModelSlug,
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

  it('maps every canonical gemini model to a slug agy accepts', () => {
    // The mapping must be total over the registry: an unmapped id would reach
    // agy and come back as status:ERROR with exit code 0.
    const geminiIds = DEFAULT_MODEL_CAPABILITIES.models
      .filter((m) => m.cliName === 'gemini')
      .map((m) => m.id);

    expect(geminiIds.length).toBeGreaterThan(0);
    for (const id of geminiIds) {
      expect(isAgyModelSlug(toAgyModelSlug(id))).toBe(true);
    }
  });

  it('maps the strongest registry entry to the strongest pro tier', () => {
    expect(toAgyModelSlug('gemini-3-pro')).toBe('gemini-3.1-pro-high');
  });

  it('maps a 2.5-generation entry agy does not serve to a surviving tier', () => {
    // agy serves no 2.5 models at all. Dropping these would break routing that
    // already selects them.
    expect(isAgyModelSlug(toAgyModelSlug('gemini-pro'))).toBe(true);
    expect(isAgyModelSlug(toAgyModelSlug('gemini-flash'))).toBe(true);
  });

  it('falls back to a valid slug for an unknown model', () => {
    expect(toAgyModelSlug('some-model-that-does-not-exist')).toBe(DEFAULT_AGY_MODEL);
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
});
