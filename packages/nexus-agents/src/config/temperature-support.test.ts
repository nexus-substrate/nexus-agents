/**
 * Tests for {@link temperatureUnsupportedForModel} (#4061).
 *
 * Ground truth (installed @anthropic-ai/sdk messages.d.ts): Claude models released
 * after Opus 4.6 reject any non-1.0 `temperature` with a 400. The predicate decides
 * whether an adapter must drop the param before sending.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on the module logger so the loud-drop warning (#4066 layer 3) is assertable.
const { warnSpy, debugSpy } = vi.hoisted(() => ({ warnSpy: vi.fn(), debugSpy: vi.fn() }));
vi.mock('../core/index.js', () => ({
  createLogger: () => ({ warn: warnSpy, debug: debugSpy, info: vi.fn(), error: vi.fn() }),
}));

import {
  temperatureUnsupportedForModel,
  warnTemperatureDropped,
  _resetTemperatureWarnings,
} from './temperature-support.js';

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

  describe('OpenAI reasoning models → unsupported (#4062)', () => {
    const reasoning = [
      'o1',
      'o1-preview',
      'o1-mini',
      'o3',
      'o3-mini',
      'o4-mini',
      'gpt-5',
      'gpt-5.6-terra',
      'gpt-5.2-codex',
      'codex-5.3', // internal id; resolves to gpt-5.6-terra but match either way
      'openai/o3-mini', // provider-prefixed → last segment matched
    ];
    it.each(reasoning)('%s → true', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(true);
    });
  });

  describe('non-reasoning models → supported (never touched)', () => {
    const supported = [
      'gpt-4o',
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'gpt-5-chat-latest', // the documented non-reasoning GPT-5 carve-out
      'gpt-50', // over-match guard: NOT gpt-5 (anchored after the 5)
      'gpt-512', // over-match guard
      'gemini-3-pro',
      'gemini-2.5-flash',
      'openrouter/qwen-coder',
      'openrouter-nemotron-super',
      'nemotron-super',
    ];
    it.each(supported)('%s → false', (id) => {
      expect(temperatureUnsupportedForModel(id)).toBe(false);
    });
  });

  it('is case-insensitive', () => {
    expect(temperatureUnsupportedForModel('Claude-Opus-4-8')).toBe(true);
    expect(temperatureUnsupportedForModel('CLAUDE-OPUS-4-6')).toBe(false);
  });
});

describe('warnTemperatureDropped — fail loudly on a dropped behavioral param (#4066 layer 3)', () => {
  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    _resetTemperatureWarnings();
  });

  it('warns LOUDLY (once) the first time temperature is dropped for a model', () => {
    warnTemperatureDropped('claude-opus-4-8');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, context] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain('claude-opus-4-8');
    expect(message).toMatch(/temperature/i);
    expect(context).toMatchObject({
      modelId: 'claude-opus-4-8',
      parameter: 'temperature',
      severity: 'behavioral',
    });
  });

  it('dedupes per model: repeat drops for the same model log at debug, not warn', () => {
    warnTemperatureDropped('o3-mini');
    warnTemperatureDropped('o3-mini');
    warnTemperatureDropped('o3-mini');
    expect(warnSpy).toHaveBeenCalledTimes(1); // loud once
    expect(debugSpy).toHaveBeenCalledTimes(2); // quiet thereafter
  });

  it('warns separately for distinct models', () => {
    warnTemperatureDropped('claude-opus-4-8');
    warnTemperatureDropped('gpt-5.6-terra');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
