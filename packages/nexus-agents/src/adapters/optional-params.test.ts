/**
 * Characterization tests for the shared optional-parameter decision seam
 * (#4068, epic #4066 layer 2). Pins the temperature drop-decision that the
 * claude/openai/sdk adapters previously inlined identically. The provider-specific
 * adapter tests (claude/openai/sdk-adapter.test.ts) remain the behavior-preservation
 * safety net; these assert the seam in isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { planOptionalParams } from './optional-params.js';
import { _resetTemperatureWarnings } from '../config/temperature-support.js';
import { modelSupportsParameter } from '../config/model-parameter-support.js';
import type { CompletionRequest } from '../core/index.js';

function makeRequest(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  };
}

// Models the layer-1 resolver knows reject `temperature` (Claude after Opus 4.6;
// OpenAI o-series; codex routes are GPT-5-reasoning-based).
const UNSUPPORTED_IDS = ['claude-opus-4-8', 'o3-mini', 'codex-5.3'];
// Models that accept a custom `temperature`.
const SUPPORTED_IDS = ['claude-opus-4-6', 'gpt-4o', 'gemini-3-pro'];

describe('planOptionalParams', () => {
  beforeEach(() => {
    // Reset the once-per-model warning dedupe so each drop-case warns deterministically.
    _resetTemperatureWarnings();
  });

  describe('temperature drop for unsupported models', () => {
    for (const modelId of UNSUPPORTED_IDS) {
      it(`drops temperature for ${modelId} and records it in dropped[]`, () => {
        const plan = planOptionalParams(makeRequest({ temperature: 0.3 }), modelId);
        expect(plan.temperature).toBeUndefined();
        expect('temperature' in plan).toBe(false);
        expect(plan.dropped).toHaveLength(1);
        expect(plan.dropped[0]).toMatchObject({ param: 'temperature' });
        expect(plan.dropped[0]?.reason).toContain(modelId);
      });
    }
  });

  describe('temperature pass-through for supported models', () => {
    for (const modelId of SUPPORTED_IDS) {
      it(`keeps temperature for ${modelId} and leaves dropped[] empty`, () => {
        const plan = planOptionalParams(makeRequest({ temperature: 0.5 }), modelId);
        expect(plan.temperature).toBe(0.5);
        expect(plan.dropped).toHaveLength(0);
      });
    }
  });

  it('omits temperature entirely when the request has no temperature', () => {
    const plan = planOptionalParams(makeRequest(), 'claude-opus-4-8');
    expect(plan.temperature).toBeUndefined();
    expect('temperature' in plan).toBe(false);
    expect(plan.dropped).toHaveLength(0);
  });

  it('passes through temperature 0 (falsy but defined)', () => {
    const plan = planOptionalParams(makeRequest({ temperature: 0 }), 'gpt-4o');
    expect(plan.temperature).toBe(0);
    expect(plan.dropped).toHaveLength(0);
  });

  describe('regex-false-match guard (documents why gemini/ollama are out of scope)', () => {
    it('gemini-3-pro supports temperature — would never be dropped', () => {
      expect(modelSupportsParameter('gemini-3-pro', 'temperature')).toBe(true);
      const plan = planOptionalParams(makeRequest({ temperature: 0.7 }), 'gemini-3-pro');
      expect(plan.temperature).toBe(0.7);
    });

    it('an ollama-style id supports temperature — would never be dropped', () => {
      expect(modelSupportsParameter('llama3.1:8b', 'temperature')).toBe(true);
      const plan = planOptionalParams(makeRequest({ temperature: 0.7 }), 'llama3.1:8b');
      expect(plan.temperature).toBe(0.7);
    });
  });

  it('is deterministic — same inputs yield an equal plan', () => {
    const a = planOptionalParams(makeRequest({ temperature: 0.5 }), 'gpt-4o');
    const b = planOptionalParams(makeRequest({ temperature: 0.5 }), 'gpt-4o');
    expect(a).toEqual(b);
  });

  it('always returns transformed as an empty array (reserved for #4069)', () => {
    expect(planOptionalParams(makeRequest({ temperature: 0.5 }), 'gpt-4o').transformed).toEqual([]);
    expect(
      planOptionalParams(makeRequest({ temperature: 0.3 }), 'claude-opus-4-8').transformed
    ).toEqual([]);
    expect(planOptionalParams(makeRequest(), 'gpt-4o').transformed).toEqual([]);
  });
});
