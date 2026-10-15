/** Captured AGY 1.3.5 transport contract, observed 2026-10-15 (#7423). */
import { describe, expect, it } from 'vitest';
import {
  AGY_MODEL_SLUGS,
  DEFAULT_AGY_MODEL,
  toAgyModelSlug,
  fromAgyModelSlug,
} from './agy-model-map.js';
import { getDefaultModelForCli, getCliModelName } from './model-config-helpers.js';

const nativeGemini = ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low'];

describe('measured AGY native models (#7423)', () => {
  it('advertises exactly the nonempty measured Gemini table', () => {
    expect(nativeGemini).toHaveLength(3);
    expect([...AGY_MODEL_SLUGS].sort()).toEqual([...nativeGemini].sort());
  });

  it('aligns the canonical CLI default and transport default with registered Flash', () => {
    expect(getDefaultModelForCli('gemini')).toBe('gemini-3.8-flash');
    expect(DEFAULT_AGY_MODEL).toBe('gemini-3.8-flash-high');
    expect(nativeGemini).toContain(
      toAgyModelSlug(getCliModelName(getDefaultModelForCli('gemini')))
    );
  });

  it.each([
    'gemini-3-pro',
    'gemini-pro',
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro',
    'gemini-3.1-pro-high',
    'not-a-model',
    'constructor',
    '__proto__',
    'toString',
  ])('refuses unsupported explicit pin %s instead of silently substituting Flash', (id) => {
    expect(() => toAgyModelSlug(id)).toThrow(/unsupported.*agy|agy.*unsupported/i);
  });

  it.each(nativeGemini)('preserves an exact supported native pin %s', (id) => {
    expect(toAgyModelSlug(id)).toBe(id);
    expect(fromAgyModelSlug(id)).toBe('gemini-3.8-flash');
  });

  it.each([
    ['gemini-3.7-flash', 'gemini-3.8-flash-high'],
    ['gemini-3.5-flash', 'gemini-3.8-flash-medium'],
    ['gemini-3-flash', 'gemini-3.8-flash-low'],
    ['gemini-flash', 'gemini-3.8-flash-low'],
  ])(
    'documents Flash-family migration %s to %s without aliasing selected identity backward',
    (id, slug) => {
      expect(toAgyModelSlug(id)).toBe(slug);
      expect(fromAgyModelSlug(slug)).toBe('gemini-3.8-flash');
    }
  );

  it('retains Google API Pro model identifiers', () => {
    expect(getCliModelName('gemini-3-pro')).toBe('gemini-3.1-pro-preview');
    expect(getCliModelName('gemini-pro')).toBe('gemini-2.5-pro');
  });
});
