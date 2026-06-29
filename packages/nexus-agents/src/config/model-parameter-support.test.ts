/**
 * Tests for the data-driven model request-parameter resolver (#4067, epic #4066
 * layer 1) and the now-shimmed {@link temperatureUnsupportedForModel}.
 *
 * The load-bearing test is PARITY: the shim must return the SAME boolean as the
 * pre-#4067 regex predicate for a representative id table. The expected column was
 * authored from the CURRENT (pre-refactor) regex behavior — Claude after Opus 4.6,
 * OpenAI o-series / GPT-5 family / codex reject `temperature`; everything else does
 * not. Registered codex models additionally exercise the DATA path.
 */

import { describe, it, expect } from 'vitest';

import {
  unsupportedParametersForModel,
  modelSupportsParameter,
  getMaxTokensParamForModel,
} from './model-parameter-support.js';
import { temperatureUnsupportedForModel } from './temperature-support.js';

describe('PARITY — temperatureUnsupportedForModel shim preserves pre-#4067 regex behavior', () => {
  // [modelId, expected] — verified against the CURRENT regex logic before refactor.
  const parity: ReadonlyArray<readonly [string, boolean]> = [
    // Claude: after Opus 4.6 → true; 4.6 and legacy (1/2/3) → false
    ['claude-opus-4-8', true],
    ['claude-opus-4-6', false],
    ['claude-3-5-sonnet', false],
    // OpenAI reasoning families → true
    ['o1', true],
    ['o3-mini', true],
    ['codex-5.3', true], // registered → DATA path; regex would also catch it
    ['gpt-5', true],
    ['gpt-5-chat', false], // non-reasoning GPT-5 variant
    // Non-reasoning / other vendors → false
    ['gemini-3-pro', false],
    ['gpt-4o', false],
    ['some-unknown-model', false],
  ];

  it.each(parity)('%s → %s', (id, expected) => {
    expect(temperatureUnsupportedForModel(id)).toBe(expected);
  });

  it('shim agrees with modelSupportsParameter inverse', () => {
    for (const [id] of parity) {
      expect(temperatureUnsupportedForModel(id)).toBe(!modelSupportsParameter(id, 'temperature'));
    }
  });
});

describe('DATA path — registered codex models read capability data, not just regex', () => {
  const codexIds = ['codex-5.3', 'codex-5.2', 'codex-5.1-mini'] as const;

  it.each(codexIds)('%s rejects temperature via unsupportedParameters', (id) => {
    expect(unsupportedParametersForModel(id)).toContain('temperature');
    expect(modelSupportsParameter(id, 'temperature')).toBe(false);
  });

  it.each(codexIds)('%s expects max_completion_tokens via maxTokensParam', (id) => {
    // maxTokensParam has NO temperature-style regex of its own for short ids like
    // `codex-5.3` (regexIsOpenAiReasoning matches on `codex`, so data + fallback
    // agree here); this asserts the registry data is wired and surfaced.
    expect(getMaxTokensParamForModel(id)).toBe('max_completion_tokens');
  });
});

describe('FALLBACK path — UNREGISTERED ids resolve via regex', () => {
  it('Claude after Opus 4.6 (unregistered exact id) → temperature unsupported', () => {
    expect(unsupportedParametersForModel('claude-opus-4-8')).toContain('temperature');
  });

  it('bare o-series (unregistered) → temperature unsupported', () => {
    expect(unsupportedParametersForModel('o3-mini')).toContain('temperature');
  });

  it('o-series → max_completion_tokens via regex fallback', () => {
    expect(getMaxTokensParamForModel('o3-mini')).toBe('max_completion_tokens');
  });

  it('non-reasoning model → max_tokens via regex fallback', () => {
    expect(getMaxTokensParamForModel('gpt-4o')).toBe('max_tokens');
    expect(getMaxTokensParamForModel('claude-opus-4-8')).toBe('max_tokens');
    expect(getMaxTokensParamForModel('gemini-3-pro')).toBe('max_tokens');
  });

  it('models that reject nothing return an empty list', () => {
    expect(unsupportedParametersForModel('gpt-4o')).toEqual([]);
    expect(unsupportedParametersForModel('gemini-3-pro')).toEqual([]);
  });
});

describe('modelSupportsParameter', () => {
  it('a param nothing rejects (top_p) is supported everywhere', () => {
    for (const id of ['claude-opus-4-8', 'o3-mini', 'codex-5.3', 'gpt-4o', 'gemini-3-pro']) {
      expect(modelSupportsParameter(id, 'top_p')).toBe(true);
    }
  });

  it('inverse of unsupportedParametersForModel', () => {
    expect(modelSupportsParameter('codex-5.3', 'temperature')).toBe(false);
    expect(modelSupportsParameter('gpt-4o', 'temperature')).toBe(true);
  });
});

describe('determinism — same id yields the same result twice', () => {
  it.each(['codex-5.3', 'claude-opus-4-8', 'o3-mini', 'gpt-4o'])('%s', (id) => {
    expect(unsupportedParametersForModel(id)).toEqual(unsupportedParametersForModel(id));
    expect(getMaxTokensParamForModel(id)).toBe(getMaxTokensParamForModel(id));
  });
});
