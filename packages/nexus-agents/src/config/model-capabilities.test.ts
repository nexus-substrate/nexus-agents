/**
 * Tests for config/model-capabilities.ts
 *
 * Pure function tests against constant data — no mocks needed.
 *
 * @module config/model-capabilities.test
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_MODEL_CAPABILITIES,
  DEFAULT_MODEL_PER_CLI,
  getModelCapabilities,
  findModelsByOutputModality,
  findModelsByInputModality,
  findModelsByToolCapability,
  findModelsByFeature,
  findModelsByProvider,
  findBestModelForOutput,
  modelSupportsAll,
  ModelCapabilitySchema,
} from './model-capabilities.js';

// ---------------------------------------------------------------------------
// DEFAULT_MODEL_CAPABILITIES
// ---------------------------------------------------------------------------

describe('DEFAULT_MODEL_CAPABILITIES', () => {
  it('should contain exactly 11 models', () => {
    expect(DEFAULT_MODEL_CAPABILITIES.models).toHaveLength(11);
  });

  it('should have version 2', () => {
    expect(DEFAULT_MODEL_CAPABILITIES.version).toBe(2);
  });

  it('all models should have required fields', () => {
    for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
      expect(model.id).toBeTruthy();
      expect(model.displayName).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.pricing).toBeDefined();
      expect(model.pricing?.inputPer1M).toBeGreaterThanOrEqual(0);
      expect(model.pricing?.outputPer1M).toBeGreaterThanOrEqual(0);
      expect(model.qualityScores).toBeDefined();
    }
  });

  it('all providers should be represented', () => {
    const providers = new Set(DEFAULT_MODEL_CAPABILITIES.models.map((m) => m.provider));
    expect(providers).toEqual(new Set(['anthropic', 'google', 'openai']));
  });

  it('all quality scores should be in range 1-10', () => {
    for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
      const scores = model.qualityScores;
      expect(scores).toBeDefined();
      if (scores) {
        expect(scores.reasoning).toBeGreaterThanOrEqual(1);
        expect(scores.reasoning).toBeLessThanOrEqual(10);
        expect(scores.codeGeneration).toBeGreaterThanOrEqual(1);
        expect(scores.codeGeneration).toBeLessThanOrEqual(10);
        expect(scores.speed).toBeGreaterThanOrEqual(1);
        expect(scores.speed).toBeLessThanOrEqual(10);
        expect(scores.cost).toBeGreaterThanOrEqual(1);
        expect(scores.cost).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_MODEL_PER_CLI
// ---------------------------------------------------------------------------

describe('DEFAULT_MODEL_PER_CLI', () => {
  it('should map claude to claude-opus', () => {
    expect(DEFAULT_MODEL_PER_CLI.claude).toBe('claude-opus');
  });

  it('should map gemini to gemini-3-pro', () => {
    expect(DEFAULT_MODEL_PER_CLI.gemini).toBe('gemini-3-pro');
  });

  it('should map codex to codex-5.3', () => {
    expect(DEFAULT_MODEL_PER_CLI.codex).toBe('codex-5.3');
  });
});

// ---------------------------------------------------------------------------
// getModelCapabilities
// ---------------------------------------------------------------------------

describe('getModelCapabilities', () => {
  it('returns model for valid ID', () => {
    const result = getModelCapabilities('claude-opus');
    expect(result).toBeDefined();
    expect(result?.id).toBe('claude-opus');
    expect(result?.provider).toBe('anthropic');
  });

  it('returns undefined for invalid ID', () => {
    const result = getModelCapabilities('nonexistent-model');
    expect(result).toBeUndefined();
  });

  it('uses default matrix when none provided', () => {
    const withDefault = getModelCapabilities('claude-sonnet');
    const withExplicit = getModelCapabilities('claude-sonnet', DEFAULT_MODEL_CAPABILITIES);
    expect(withDefault).toEqual(withExplicit);
  });
});

// ---------------------------------------------------------------------------
// findModelsByOutputModality
// ---------------------------------------------------------------------------

describe('findModelsByOutputModality', () => {
  it('returns models supporting text output', () => {
    const results = findModelsByOutputModality('text');
    expect(results).toHaveLength(11);
  });

  it('returns subset for image_png (only gemini models)', () => {
    const results = findModelsByOutputModality('image_png');
    expect(results).toHaveLength(4);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('gemini-3-pro');
    expect(ids).toContain('gemini-pro');
    expect(ids).toContain('gemini-3-flash');
    expect(ids).toContain('gemini-flash');
  });
});

// ---------------------------------------------------------------------------
// findModelsByInputModality
// ---------------------------------------------------------------------------

describe('findModelsByInputModality', () => {
  it('all models support text input', () => {
    const results = findModelsByInputModality('text');
    expect(results).toHaveLength(11);
  });

  it('only gemini supports video input', () => {
    const results = findModelsByInputModality('video');
    expect(results).toHaveLength(4);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('gemini-3-pro');
    expect(ids).toContain('gemini-pro');
    expect(ids).toContain('gemini-3-flash');
    expect(ids).toContain('gemini-flash');
  });
});

// ---------------------------------------------------------------------------
// findModelsByToolCapability
// ---------------------------------------------------------------------------

describe('findModelsByToolCapability', () => {
  it('all models support function_calling', () => {
    const results = findModelsByToolCapability('function_calling');
    expect(results).toHaveLength(11);
  });

  it('only claude models support mcp', () => {
    const results = findModelsByToolCapability('mcp');
    expect(results).toHaveLength(4);
    for (const model of results) {
      expect(model.provider).toBe('anthropic');
    }
  });
});

// ---------------------------------------------------------------------------
// findModelsByFeature
// ---------------------------------------------------------------------------

describe('findModelsByFeature', () => {
  it('multiple models support streaming', () => {
    const results = findModelsByFeature('streaming');
    expect(results).toHaveLength(11);
  });

  it('gemini pro models support deep_research', () => {
    const results = findModelsByFeature('deep_research');
    expect(results).toHaveLength(2);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('gemini-3-pro');
    expect(ids).toContain('gemini-pro');
  });
});

// ---------------------------------------------------------------------------
// findModelsByProvider
// ---------------------------------------------------------------------------

describe('findModelsByProvider', () => {
  it('returns 4 anthropic models', () => {
    const results = findModelsByProvider('anthropic');
    expect(results).toHaveLength(4);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('claude-opus');
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('claude-haiku');
    expect(ids).toContain('opencode-default');
  });

  it('returns 4 google models', () => {
    const results = findModelsByProvider('google');
    expect(results).toHaveLength(4);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('gemini-3-pro');
    expect(ids).toContain('gemini-pro');
    expect(ids).toContain('gemini-3-flash');
    expect(ids).toContain('gemini-flash');
  });

  it('returns 3 openai models', () => {
    const results = findModelsByProvider('openai');
    expect(results).toHaveLength(3);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('codex-5.3');
    expect(ids).toContain('codex-5.2');
    expect(ids).toContain('codex-5.1-mini');
  });
});

// ---------------------------------------------------------------------------
// findBestModelForOutput
// ---------------------------------------------------------------------------

describe('findBestModelForOutput', () => {
  it('returns a gemini model for text (1M context)', () => {
    const result = findBestModelForOutput('text');
    expect(result).toBeDefined();
    expect(result?.id).toBe('gemini-3-pro');
    expect(result?.contextWindow).toBe(1_000_000);
  });

  it('returns undefined for nonexistent modality', () => {
    const result = findBestModelForOutput('hologram' as never);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// modelSupportsAll
// ---------------------------------------------------------------------------

describe('modelSupportsAll', () => {
  it('returns true when all requirements met', () => {
    const result = modelSupportsAll('claude-opus', {
      outputModalities: ['text', 'code'],
      inputModalities: ['text', 'image'],
      toolCapabilities: ['mcp', 'function_calling'],
      specialFeatures: ['streaming'],
      minContextWindow: 100_000,
    });
    expect(result).toBe(true);
  });

  it('returns false for unknown model', () => {
    const result = modelSupportsAll('nonexistent' as never, {
      outputModalities: ['text'],
    });
    expect(result).toBe(false);
  });

  it('returns false when context window too small', () => {
    const result = modelSupportsAll('claude-opus', {
      minContextWindow: 500_000,
    });
    expect(result).toBe(false);
  });

  it('returns false when missing tool capability', () => {
    const result = modelSupportsAll('gemini-pro', {
      toolCapabilities: ['mcp'],
    });
    expect(result).toBe(false);
  });

  it('returns true when no requirements specified', () => {
    const result = modelSupportsAll('claude-haiku', {});
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema Deprecation Fields (#891)
// ---------------------------------------------------------------------------

describe('deprecation schema fields', () => {
  it('accepts model without deprecation fields', () => {
    const base = DEFAULT_MODEL_CAPABILITIES.models[0];
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts model with deprecated: true', () => {
    const base = { ...DEFAULT_MODEL_CAPABILITIES.models[0], deprecated: true };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts model with all deprecation fields', () => {
    const base = {
      ...DEFAULT_MODEL_CAPABILITIES.models[0],
      deprecated: true,
      deprecatedAt: '2026-01-15',
      replacedBy: 'claude-sonnet' as const,
    };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects invalid replacedBy value', () => {
    const base = {
      ...DEFAULT_MODEL_CAPABILITIES.models[0],
      deprecated: true,
      replacedBy: 'nonexistent-model',
    };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('no current models are deprecated', () => {
    for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
      expect(model.deprecated).toBeUndefined();
    }
  });
});
