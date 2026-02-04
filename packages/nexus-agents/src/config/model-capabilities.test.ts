/**
 * Tests for model capabilities matrix.
 * @module config/model-capabilities.test
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL_CAPABILITIES,
  getModelCapabilities,
  findModelsByOutputModality,
  findModelsByInputModality,
  findModelsByToolCapability,
  findModelsByFeature,
  findModelsByProvider,
  findBestModelForOutput,
  modelSupportsAll,
  ModelCapabilitiesMatrixSchema,
  MODEL_IDS,
} from './model-capabilities.js';

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('ModelCapabilitiesMatrix schema', () => {
  it('validates the default matrix', () => {
    const result = ModelCapabilitiesMatrixSchema.safeParse(DEFAULT_MODEL_CAPABILITIES);
    expect(result.success).toBe(true);
  });

  it('contains all MODEL_IDS', () => {
    const ids = DEFAULT_MODEL_CAPABILITIES.models.map((m) => m.id);
    for (const id of MODEL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('has version 1 and updatedAt date', () => {
    expect(DEFAULT_MODEL_CAPABILITIES.version).toBe(1);
    expect(DEFAULT_MODEL_CAPABILITIES.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// getModelCapabilities
// ---------------------------------------------------------------------------

describe('getModelCapabilities', () => {
  it('returns capability data for valid model ID', () => {
    const cap = getModelCapabilities('claude-opus');
    expect(cap).toBeDefined();
    expect(cap?.provider).toBe('anthropic');
    expect(cap?.contextWindow).toBe(200_000);
  });

  it('returns undefined for unknown model ID', () => {
    expect(getModelCapabilities('nonexistent')).toBeUndefined();
  });

  it('returns Gemini Pro with 1M context', () => {
    const cap = getModelCapabilities('gemini-pro');
    expect(cap?.contextWindow).toBe(1_000_000);
    expect(cap?.provider).toBe('google');
  });

  it('returns Codex 5.2 with 400K context', () => {
    const cap = getModelCapabilities('codex-5.2');
    expect(cap?.contextWindow).toBe(400_000);
    expect(cap?.provider).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// findModelsByOutputModality
// ---------------------------------------------------------------------------

describe('findModelsByOutputModality', () => {
  it('finds all models for text output', () => {
    const models = findModelsByOutputModality('text');
    expect(models.length).toBe(DEFAULT_MODEL_CAPABILITIES.models.length);
  });

  it('finds only Gemini models for image_png output', () => {
    const models = findModelsByOutputModality('image_png');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('google');
    }
  });

  it('finds only Gemini Pro for audio_pcm output', () => {
    const models = findModelsByOutputModality('audio_pcm');
    expect(models.length).toBe(1);
    expect(models[0]?.id).toBe('gemini-pro');
  });

  it('returns empty for unsupported modality', () => {
    const models = findModelsByOutputModality('video_mp4');
    expect(models.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findModelsByInputModality
// ---------------------------------------------------------------------------

describe('findModelsByInputModality', () => {
  it('finds all models for text input', () => {
    const models = findModelsByInputModality('text');
    expect(models.length).toBe(DEFAULT_MODEL_CAPABILITIES.models.length);
  });

  it('finds only Gemini models for video input', () => {
    const models = findModelsByInputModality('video');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('google');
    }
  });
});

// ---------------------------------------------------------------------------
// findModelsByToolCapability
// ---------------------------------------------------------------------------

describe('findModelsByToolCapability', () => {
  it('finds models with MCP support', () => {
    const models = findModelsByToolCapability('mcp');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('anthropic');
    }
  });

  it('finds models with code_execution_sandbox', () => {
    const models = findModelsByToolCapability('code_execution_sandbox');
    expect(models.length).toBeGreaterThanOrEqual(3);
  });

  it('finds models with apply_patch', () => {
    const models = findModelsByToolCapability('apply_patch');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('openai');
    }
  });
});

// ---------------------------------------------------------------------------
// findModelsByFeature
// ---------------------------------------------------------------------------

describe('findModelsByFeature', () => {
  it('finds models with extended_thinking', () => {
    const models = findModelsByFeature('extended_thinking');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('anthropic');
    }
  });

  it('finds models with deep_research', () => {
    const models = findModelsByFeature('deep_research');
    expect(models.length).toBe(1);
    expect(models[0]?.id).toBe('gemini-pro');
  });
});

// ---------------------------------------------------------------------------
// findModelsByProvider
// ---------------------------------------------------------------------------

describe('findModelsByProvider', () => {
  it('finds 3 Anthropic models', () => {
    expect(findModelsByProvider('anthropic').length).toBe(3);
  });

  it('finds 2 Google models', () => {
    expect(findModelsByProvider('google').length).toBe(2);
  });

  it('finds 2 OpenAI models', () => {
    expect(findModelsByProvider('openai').length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// findBestModelForOutput
// ---------------------------------------------------------------------------

describe('findBestModelForOutput', () => {
  it('returns model with largest context for text', () => {
    const best = findBestModelForOutput('text');
    expect(best).toBeDefined();
    expect(best?.contextWindow).toBe(1_000_000);
  });

  it('returns gemini for image_png', () => {
    const best = findBestModelForOutput('image_png');
    expect(best).toBeDefined();
    expect(best?.provider).toBe('google');
  });

  it('returns undefined for video_mp4', () => {
    expect(findBestModelForOutput('video_mp4')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// modelSupportsAll
// ---------------------------------------------------------------------------

describe('modelSupportsAll', () => {
  it('claude-opus supports text + image input + MCP', () => {
    expect(
      modelSupportsAll('claude-opus', {
        outputModalities: ['text'],
        inputModalities: ['text', 'image'],
        toolCapabilities: ['mcp'],
      })
    ).toBe(true);
  });

  it('claude-opus does not support image_png output', () => {
    expect(
      modelSupportsAll('claude-opus', {
        outputModalities: ['image_png'],
      })
    ).toBe(false);
  });

  it('gemini-pro supports image output + deep research', () => {
    expect(
      modelSupportsAll('gemini-pro', {
        outputModalities: ['image_png'],
        specialFeatures: ['deep_research'],
      })
    ).toBe(true);
  });

  it('codex-5.2 supports 400K context requirement', () => {
    expect(modelSupportsAll('codex-5.2', { minContextWindow: 400_000 })).toBe(true);
  });

  it('claude-haiku fails 500K context requirement', () => {
    expect(modelSupportsAll('claude-haiku', { minContextWindow: 500_000 })).toBe(false);
  });

  it('returns false for unknown model', () => {
    expect(modelSupportsAll('nonexistent' as 'claude-opus', { outputModalities: ['text'] })).toBe(
      false
    );
  });
});
