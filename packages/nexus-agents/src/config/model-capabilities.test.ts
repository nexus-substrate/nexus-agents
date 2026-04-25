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
import { CLI_NAMES, MODEL_IDS } from './model-capabilities-types.js';

// ---------------------------------------------------------------------------
// DEFAULT_MODEL_CAPABILITIES
// ---------------------------------------------------------------------------

describe('DEFAULT_MODEL_CAPABILITIES', () => {
  it('should contain exactly 13 models', () => {
    expect(DEFAULT_MODEL_CAPABILITIES.models).toHaveLength(15);
  });

  it('should have version 3', () => {
    expect(DEFAULT_MODEL_CAPABILITIES.version).toBe(3);
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

  it('every CLI-bound model declares a cliModelName', () => {
    // Without cliModelName, getCliModelName() falls back to cliAlias ?? modelId,
    // which passes the registry id (e.g. "codex-5.2") to the CLI — usually not
    // a valid upstream model identifier.
    for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
      if (model.cliName !== undefined) {
        expect(
          model.cliModelName,
          `model ${model.id} has cliName=${model.cliName} but no cliModelName`
        ).toBeTruthy();
      }
    }
  });

  it('all providers should be represented', () => {
    const providers = new Set(DEFAULT_MODEL_CAPABILITIES.models.map((m) => m.provider));
    expect(providers).toEqual(
      new Set(['anthropic', 'google', 'openai', 'custom-openai', 'openrouter'])
    );
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
    expect(results).toHaveLength(15);
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
    expect(results).toHaveLength(15);
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
    expect(results).toHaveLength(15);
  });

  it('claude and custom-openai models support mcp', () => {
    const results = findModelsByToolCapability('mcp');
    expect(results).toHaveLength(6);
    const providers = new Set(results.map((m) => m.provider));
    expect(providers).toEqual(new Set(['anthropic', 'custom-openai']));
  });
});

// ---------------------------------------------------------------------------
// findModelsByFeature
// ---------------------------------------------------------------------------

describe('findModelsByFeature', () => {
  it('multiple models support streaming', () => {
    const results = findModelsByFeature('streaming');
    expect(results).toHaveLength(15);
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

  it('returns 2 custom-openai models', () => {
    const results = findModelsByProvider('custom-openai');
    expect(results).toHaveLength(2);
    const ids = results.map((m) => m.id);
    expect(ids).toContain('opencode-custom-opus');
    expect(ids).toContain('opencode-custom-sonnet');
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
  it('returns claude-opus for text (1M context)', () => {
    const result = findBestModelForOutput('text');
    expect(result).toBeDefined();
    expect(result?.id).toBe('claude-opus');
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

  it('returns true when context window requirement met (1M >= 500K)', () => {
    const result = modelSupportsAll('claude-opus', {
      minContextWindow: 500_000,
    });
    expect(result).toBe(true);
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

// ---------------------------------------------------------------------------
// aliases field (epic #2199 Child 1)
//
// Optional `aliases: readonly string[]` lets the registry hold the legacy
// version-suffixed names that adapters currently maintain in their own
// parallel registries (companion epic #2200). Schema-only addition; no
// migration of existing aliases happens in this child.
// ---------------------------------------------------------------------------

describe('aliases schema field (#2199)', () => {
  it('accepts model without aliases field (backward compatible)', () => {
    const base = DEFAULT_MODEL_CAPABILITIES.models[0];
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts model with aliases array of strings', () => {
    const base = {
      ...DEFAULT_MODEL_CAPABILITIES.models[0],
      aliases: ['claude-opus-4', 'claude-opus-4-5-20251101'],
    };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aliases).toEqual(['claude-opus-4', 'claude-opus-4-5-20251101']);
    }
  });

  it('accepts model with empty aliases array', () => {
    const base = { ...DEFAULT_MODEL_CAPABILITIES.models[0], aliases: [] };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects model with non-string alias entries', () => {
    const base = { ...DEFAULT_MODEL_CAPABILITIES.models[0], aliases: ['ok', 42] };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('rejects model with empty-string alias', () => {
    const base = { ...DEFAULT_MODEL_CAPABILITIES.models[0], aliases: ['valid', ''] };
    const result = ModelCapabilitySchema.safeParse(base);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Data Integrity (cross-project learning from tsundoku)
// ---------------------------------------------------------------------------

describe('data integrity', () => {
  const models = DEFAULT_MODEL_CAPABILITIES.models;

  it('has no duplicate model IDs', () => {
    const ids = models.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('pricing coherence: input < output for all models', () => {
    for (const model of models) {
      if (model.pricing) {
        expect(model.pricing.inputPer1M).toBeLessThanOrEqual(model.pricing.outputPer1M);
      }
    }
  });

  it('every model has a cliName', () => {
    for (const model of models) {
      expect(model.cliName).toBeDefined();
    }
  });

  it('quality scores are integers in 1-10 range', () => {
    for (const model of models) {
      if (model.qualityScores === undefined) continue;
      const scoreValues = Object.values(model.qualityScores);
      for (const val of scoreValues) {
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(10);
        expect(Number.isInteger(val)).toBe(true);
      }
    }
  });

  it('every CLI in CLI_NAMES has a default model', () => {
    for (const cli of CLI_NAMES) {
      const defaultModel = DEFAULT_MODEL_PER_CLI[cli];
      expect(defaultModel).toBeDefined();
      const exists = models.some((m) => m.id === defaultModel);
      expect(exists).toBe(true);
    }
  });

  it('context window > max output tokens', () => {
    for (const model of models) {
      if (model.maxOutputTokens !== undefined && model.maxOutputTokens > 0) {
        expect(model.contextWindow).toBeGreaterThan(model.maxOutputTokens);
      }
    }
  });

  it('MODEL_IDS matches actual model data', () => {
    const dataIds = new Set(models.map((m) => m.id));
    const enumIds = new Set(MODEL_IDS);
    expect(dataIds).toEqual(enumIds);
  });
});
