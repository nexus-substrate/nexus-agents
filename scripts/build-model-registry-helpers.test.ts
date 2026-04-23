/**
 * Tests for build-model-registry helpers.
 *
 * Offline, fixture-driven — no network calls. Exercises the parsing,
 * merging, and bounds-validation logic that the orchestration script
 * layers a fetch + write over.
 */

import { describe, expect, it } from 'vitest';

import type { LiteLlmResponse, ModelsDevResponse } from './build-model-registry-types.js';
import {
  ALLOWED_MODELS_DEV_PROVIDERS,
  LITELLM_PROVIDER_CANONICAL,
  mapLiteLlmEntry,
  mapModelsDevEntry,
  mergeEntries,
  outOfRangeReason,
  parseLiteLlm,
  parseModelsDev,
  shouldIncludeLiteLlmEntry,
  shouldIncludeModelsDevEntry,
} from './build-model-registry-helpers.js';

const CTX = { fetchedAt: '2026-04-22T22:00:00-04:00' };

// ---------------------------------------------------------------------------
// shouldIncludeModelsDevEntry
// ---------------------------------------------------------------------------

describe('shouldIncludeModelsDevEntry', () => {
  it('keeps entries from allowed providers with a context window', () => {
    expect(
      shouldIncludeModelsDevEntry('anthropic', {
        id: 'claude-opus-4-5-20251101',
        limit: { context: 200_000 },
      })
    ).toBe(true);
  });

  it('drops entries from disallowed providers', () => {
    expect(
      shouldIncludeModelsDevEntry('some-unknown-vendor', {
        id: 'x',
        limit: { context: 10_000 },
      })
    ).toBe(false);
  });

  it('drops entries with no pricing, context, or max-output', () => {
    expect(shouldIncludeModelsDevEntry('anthropic', { id: 'mystery-model' })).toBe(false);
  });

  it('keeps entries with pricing but no explicit context window', () => {
    expect(
      shouldIncludeModelsDevEntry('anthropic', {
        id: 'x',
        cost: { input: 5, output: 25 },
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldIncludeLiteLlmEntry
// ---------------------------------------------------------------------------

describe('shouldIncludeLiteLlmEntry', () => {
  it('drops the sample_spec pseudo-entry', () => {
    expect(shouldIncludeLiteLlmEntry('sample_spec', {})).toBe(false);
  });

  it('drops entries without a known litellm_provider', () => {
    expect(
      shouldIncludeLiteLlmEntry('unknown/x', {
        litellm_provider: 'some-new-vendor',
        max_input_tokens: 1000,
      })
    ).toBe(false);
  });

  it('drops image-generation / embedding modes', () => {
    expect(
      shouldIncludeLiteLlmEntry('dall-e-3', {
        litellm_provider: 'openai',
        mode: 'image_generation',
        input_cost_per_token: 0.00001,
      })
    ).toBe(false);
  });

  it('keeps chat-mode Bedrock entries', () => {
    expect(
      shouldIncludeLiteLlmEntry('bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0', {
        litellm_provider: 'bedrock',
        mode: 'chat',
        max_input_tokens: 200_000,
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
      })
    ).toBe(true);
  });

  it('keeps vertex chat entries', () => {
    expect(
      shouldIncludeLiteLlmEntry('vertex/gemini-2.5-pro', {
        litellm_provider: 'vertex_ai',
        mode: 'chat',
        max_input_tokens: 1_000_000,
        input_cost_per_token: 0.00000125,
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapModelsDevEntry
// ---------------------------------------------------------------------------

describe('mapModelsDevEntry', () => {
  it('maps a pricing + context entry correctly', () => {
    const mapped = mapModelsDevEntry(
      'anthropic',
      {
        id: 'claude-opus-4-5',
        name: 'Claude Opus 4.5',
        limit: { context: 200_000, output: 64_000 },
        cost: { input: 5, output: 25 },
      },
      CTX
    );
    expect(mapped).toBeDefined();
    expect(mapped?.id).toBe('anthropic/claude-opus-4-5');
    expect(mapped?.provider).toBe('anthropic');
    expect(mapped?.contextWindow).toBe(200_000);
    expect(mapped?.maxOutputTokens).toBe(64_000);
    expect(mapped?.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
    expect(mapped?.provenance.source).toBe('models.dev');
  });

  it('returns undefined when there is no context window', () => {
    const mapped = mapModelsDevEntry('anthropic', { id: 'x', cost: { input: 5, output: 25 } }, CTX);
    expect(mapped).toBeUndefined();
  });

  it('rejects entries over the context-window sanity ceiling', () => {
    const mapped = mapModelsDevEntry(
      'anthropic',
      {
        id: 'absurd-ctx',
        limit: { context: 99_999_999_999 },
        cost: { input: 1, output: 1 },
      },
      CTX
    );
    expect(mapped).toBeUndefined();
  });

  it('rejects entries over the pricing sanity ceiling', () => {
    const mapped = mapModelsDevEntry(
      'anthropic',
      {
        id: 'expensive',
        limit: { context: 1000 },
        cost: { input: 9999, output: 9999 },
      },
      CTX
    );
    expect(mapped).toBeUndefined();
  });

  it('omits pricing when only one side is known', () => {
    const mapped = mapModelsDevEntry(
      'anthropic',
      {
        id: 'partial',
        limit: { context: 1000 },
        cost: { input: 5 },
      },
      CTX
    );
    expect(mapped).toBeDefined();
    expect(mapped?.pricing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mapLiteLlmEntry
// ---------------------------------------------------------------------------

describe('mapLiteLlmEntry', () => {
  it('converts per-token pricing to per-1M', () => {
    const mapped = mapLiteLlmEntry(
      'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      {
        litellm_provider: 'bedrock',
        mode: 'chat',
        max_input_tokens: 200_000,
        max_output_tokens: 8_192,
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
      },
      CTX
    );
    expect(mapped).toBeDefined();
    expect(mapped?.provider).toBe('amazon-bedrock');
    expect(mapped?.pricing).toEqual({ inputPer1M: 3, outputPer1M: 15 });
    expect(mapped?.contextWindow).toBe(200_000);
    expect(mapped?.maxOutputTokens).toBe(8_192);
  });

  it('marks entries with a deprecation_date as deprecated', () => {
    const mapped = mapLiteLlmEntry(
      'legacy',
      {
        litellm_provider: 'anthropic',
        max_input_tokens: 1000,
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
        deprecation_date: '2025-12-31',
      },
      CTX
    );
    expect(mapped?.deprecated).toBe(true);
  });

  it('returns undefined when the provider is unmapped', () => {
    const mapped = mapLiteLlmEntry(
      'x',
      { litellm_provider: 'some-vendor', max_input_tokens: 1000 },
      CTX
    );
    expect(mapped).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseModelsDev (bulk)
// ---------------------------------------------------------------------------

describe('parseModelsDev', () => {
  const SAMPLE: ModelsDevResponse = {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      models: {
        'claude-opus-4-5': {
          id: 'claude-opus-4-5',
          name: 'Claude Opus 4.5',
          limit: { context: 200_000, output: 64_000 },
          cost: { input: 5, output: 25 },
        },
      },
    },
    'excluded-vendor': {
      id: 'excluded-vendor',
      name: 'Not in allow-list',
      models: {
        'some-model': {
          id: 'some-model',
          limit: { context: 8_000 },
        },
      },
    },
  };

  it('returns only entries from allowed providers', () => {
    const entries = parseModelsDev(SAMPLE, CTX);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('anthropic/claude-opus-4-5');
  });
});

// ---------------------------------------------------------------------------
// parseLiteLlm (bulk)
// ---------------------------------------------------------------------------

describe('parseLiteLlm', () => {
  const SAMPLE: LiteLlmResponse = {
    sample_spec: { max_input_tokens: 1 },
    'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0': {
      litellm_provider: 'bedrock',
      mode: 'chat',
      max_input_tokens: 200_000,
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
    },
    'dall-e-3': {
      litellm_provider: 'openai',
      mode: 'image_generation',
      input_cost_per_token: 0.00001,
    },
  };

  it('drops sample_spec and non-chat modes, keeps Bedrock chat entries', () => {
    const entries = parseLiteLlm(SAMPLE, CTX);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.provider).toBe('amazon-bedrock');
  });
});

// ---------------------------------------------------------------------------
// mergeEntries
// ---------------------------------------------------------------------------

describe('mergeEntries', () => {
  const primary = [
    {
      id: 'anthropic/claude-opus',
      displayName: 'Claude Opus',
      provider: 'anthropic',
      contextWindow: 200_000,
      provenance: {
        source: 'models.dev' as const,
        fetchedAt: CTX.fetchedAt,
        upstreamUrl: 'https://models.dev/api.json',
      },
    },
  ];
  const secondary = [
    {
      id: 'anthropic/claude-opus',
      displayName: 'LiteLLM Claude Opus',
      provider: 'anthropic',
      contextWindow: 100_000,
      provenance: {
        source: 'litellm' as const,
        fetchedAt: CTX.fetchedAt,
        upstreamUrl:
          'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      },
    },
    {
      id: 'amazon-bedrock/claude-3-5-sonnet',
      displayName: 'Bedrock Sonnet',
      provider: 'amazon-bedrock',
      contextWindow: 200_000,
      provenance: {
        source: 'litellm' as const,
        fetchedAt: CTX.fetchedAt,
        upstreamUrl:
          'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      },
    },
  ];

  it('primary wins on id collision', () => {
    const merged = mergeEntries(primary, secondary);
    const opus = merged.find((e) => e.id === 'anthropic/claude-opus');
    expect(opus?.contextWindow).toBe(200_000);
    expect(opus?.provenance.source).toBe('models.dev');
  });

  it('fills coverage gaps from secondary', () => {
    const merged = mergeEntries(primary, secondary);
    expect(merged).toHaveLength(2);
    expect(merged.map((e) => e.id)).toContain('amazon-bedrock/claude-3-5-sonnet');
  });

  it('returns a stable, sorted-by-id array', () => {
    const merged = mergeEntries(primary, secondary);
    const ids = merged.map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
  });
});

// ---------------------------------------------------------------------------
// outOfRangeReason
// ---------------------------------------------------------------------------

describe('outOfRangeReason', () => {
  const base = {
    id: 'x/y',
    displayName: 'Y',
    provider: 'x',
    contextWindow: 1000,
    provenance: {
      source: 'models.dev' as const,
      fetchedAt: CTX.fetchedAt,
      upstreamUrl: 'https://models.dev/api.json',
    },
  };

  it('returns undefined for in-range entries', () => {
    expect(outOfRangeReason(base)).toBeUndefined();
  });

  it('flags excessive context windows', () => {
    expect(outOfRangeReason({ ...base, contextWindow: 999_999_999 })).toMatch(/contextWindow/);
  });

  it('flags excessive pricing', () => {
    expect(
      outOfRangeReason({
        ...base,
        pricing: { inputPer1M: 5_000, outputPer1M: 10 },
      })
    ).toMatch(/inputPer1M/);
  });
});

// ---------------------------------------------------------------------------
// Constants exposed for documentation stability
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('includes the frontier providers + Bedrock/Vertex/Azure gateway entries', () => {
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('anthropic');
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('google');
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('openai');
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('amazon-bedrock');
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('google-vertex');
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('azure-openai');
    expect(ALLOWED_MODELS_DEV_PROVIDERS).toContain('openrouter');
  });

  it('maps LiteLLM bedrock variants to amazon-bedrock', () => {
    expect(LITELLM_PROVIDER_CANONICAL['bedrock']).toBe('amazon-bedrock');
    expect(LITELLM_PROVIDER_CANONICAL['bedrock_converse']).toBe('amazon-bedrock');
  });

  it('maps LiteLLM vertex variants to google-vertex', () => {
    expect(LITELLM_PROVIDER_CANONICAL['vertex_ai']).toBe('google-vertex');
    expect(LITELLM_PROVIDER_CANONICAL['vertex_ai-anthropic_models']).toBe('google-vertex');
  });
});
