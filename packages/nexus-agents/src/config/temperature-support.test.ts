/**
 * Tests for {@link temperatureUnsupportedForModel} (#4061).
 *
 * Ground truth (installed @anthropic-ai/sdk messages.d.ts): Claude models released
 * after Opus 4.6 reject any non-1.0 `temperature` with a 400. The predicate decides
 * whether an adapter must drop the param before sending.
 */

import { describe, it, expect } from 'vitest';

import { temperatureUnsupportedForModel } from './temperature-support.js';

describe('temperatureUnsupportedForModel (#4061)', () => {
  describe('Claude models AFTER Opus 4.6 → unsupported (drop temperature)', () => {
    const after46 = [
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-sonnet-4-7',
      'claude-haiku-4-7',
      'claude-opus-4-10', // 4.10 is ABOVE 4.6 — integer-tuple compare, not parseFloat
      'claude-opus-5-0',
      'claude-opus-5',
      // gateway / provider-prefixed / underscore variants
      'claude_4_8',
      'anthropic/claude-opus-4-8',
      'custom/claude-opus-4-7',
      'claude-opus-4-8-20260115', // dated suffix must not shadow the 4-8 version
    ];
    it.each(after46)('%s → true', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(true);
    });
  });

  describe('Claude Fable 5 and unrecognized Claude families → unsupported (safe-drop)', () => {
    // Contrarian-review condition (#4061): the rule is temporal ("after 4.6"), so a
    // post-4.6 Claude family with no 4.x version (Fable 5, future families) must
    // safe-drop rather than be wrongly treated as supported.
    const unrecognizedClaude = ['claude-fable-5', 'claude-fable', 'claude-newfamily-x'];
    it.each(unrecognizedClaude)('%s → true', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(true);
    });
  });

  describe('Claude models AT/BEFORE Opus 4.6 → supported (keep temperature)', () => {
    const upTo46 = [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
      'claude-opus-4-0',
      'custom/claude-opus-4-6',
      'anthropic/claude-sonnet-4-6',
      // bare major 4 (= 4.0) with an 8-digit snapshot date: the date must NOT be
      // parsed as the minor version (#4061 adversarial-review regression guard).
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
    ];
    it.each(upTo46)('%s → false', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(false);
    });
  });

  describe('legacy Claude families (≤ 3.x) → supported', () => {
    const legacy = [
      'claude-3-5-sonnet-20241022', // parses 3.5 → supported
      'claude-3-7-sonnet',
      'claude-3-opus',
      'claude-2',
      'claude-2.1',
      'claude-instant-1',
    ];
    it.each(legacy)('%s → false', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(false);
    });
  });

  describe('non-Claude models → supported (never touched)', () => {
    const nonClaude = [
      'gpt-5.4',
      'gpt-4o',
      'o1-preview', // OpenAI reasoning models also reject temp, but are OUT OF SCOPE here
      'gemini-3-pro',
      'gemini-2.5-flash',
      'openrouter/qwen-coder',
      'nemotron-super',
    ];
    it.each(nonClaude)('%s → false', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(false);
    });
  });

  it('is case-insensitive', () => {
    expect(temperatureUnsupportedForModel('Claude-Opus-4-8')).toBe(true);
    expect(temperatureUnsupportedForModel('CLAUDE-OPUS-4-6')).toBe(false);
  });
});
