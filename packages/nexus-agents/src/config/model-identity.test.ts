/**
 * Tests for the model-identity resolver (#2529).
 */
import { describe, it, expect, vi } from 'vitest';

import { ok } from '../core/index.js';
import type { IModelAdapter, ModelMetadata } from '../core/types/model.js';

import { parseModelId, resolveModelIdentity, resolveModelIdentitySync } from './model-identity.js';

function makeAdapter(
  modelId: string,
  listModels?: () => Promise<readonly ModelMetadata[]>
): IModelAdapter {
  return {
    providerId: 'openai',
    modelId,
    capabilities: [],
    complete: vi.fn() as never,
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ok(undefined),
    ...(listModels !== undefined && { listModels }),
  };
}

describe('parseModelId — clean upstream names', () => {
  it('classifies claude-sonnet-4-6', () => {
    const r = parseModelId('claude-sonnet-4-6');
    expect(r.vendor).toBe('anthropic');
    expect(r.family).toBe('claude-sonnet');
    expect(r.version).toBe('4-6');
  });

  it('classifies gpt-4o', () => {
    const r = parseModelId('gpt-4o');
    expect(r.vendor).toBe('openai');
    expect(r.family).toBe('gpt-4o');
  });

  it('classifies gemini-2.0-flash', () => {
    const r = parseModelId('gemini-2.0-flash');
    expect(r.vendor).toBe('google');
    expect(r.family).toBe('gemini-flash');
  });

  it('classifies o1-preview as reasoning', () => {
    const r = parseModelId('o1-preview');
    expect(r.vendor).toBe('openai');
    expect(r.family).toBe('o-reasoning');
  });

  it('classifies o3-mini as reasoning', () => {
    const r = parseModelId('o3-mini');
    expect(r.vendor).toBe('openai');
    expect(r.family).toBe('o-reasoning');
    expect(r.quirks).toContain('small');
  });
});

describe('parseModelId — vendor-prefixed', () => {
  it('classifies anthropic/claude-sonnet-4-6', () => {
    const r = parseModelId('anthropic/claude-sonnet-4-6');
    expect(r.vendor).toBe('anthropic');
    expect(r.family).toBe('claude-sonnet');
  });

  it('classifies meta-llama/llama-3.3-70b-instruct', () => {
    const r = parseModelId('meta-llama/llama-3.3-70b-instruct');
    expect(r.vendor).toBe('meta');
    expect(r.family).toBe('llama-3');
    expect(r.quirks).toContain('instruct');
    expect(r.quirks).toContain('sized-suffix');
  });
});

describe('parseModelId — wild names', () => {
  it('handles 2025-claude-opus-4_0_high', () => {
    const r = parseModelId('2025-claude-opus-4_0_high');
    expect(r.vendor).toBe('anthropic');
    expect(r.family).toBe('claude-opus');
    expect(r.quirks).toContain('high-variant');
  });

  it('handles workspace-claude-prod (gateway-renamed, no family signal)', () => {
    const r = parseModelId('workspace-claude-prod');
    expect(r.vendor).toBe('anthropic');
    expect(r.family).toBeUndefined();
  });

  it('handles gpt-4o-mini-2024-08', () => {
    const r = parseModelId('gpt-4o-mini-2024-08');
    expect(r.vendor).toBe('openai');
    expect(r.family).toBe('gpt-4o');
    expect(r.quirks).toContain('small');
  });

  it('flags text-embedding-3-large as embedding (not chat)', () => {
    const r = parseModelId('text-embedding-3-large');
    expect(r.quirks).toContain('embedding');
    expect(r.quirks).toContain('large');
  });

  it('handles nemotron-70b', () => {
    const r = parseModelId('nemotron-70b');
    expect(r.vendor).toBe('nvidia');
  });

  it('handles internal-fast-model (totally opaque)', () => {
    const r = parseModelId('internal-fast-model');
    expect(r.vendor).toBeUndefined();
    expect(r.family).toBeUndefined();
  });

  it('handles claude-3-5-sonnet-20241022', () => {
    const r = parseModelId('claude-3-5-sonnet-20241022');
    expect(r.vendor).toBe('anthropic');
    expect(r.family).toBe('claude-sonnet');
    expect(r.quirks).toContain('dated');
  });

  it('detects thinking quirk', () => {
    const r = parseModelId('claude-opus-4-1-thinking');
    expect(r.quirks).toContain('thinking');
  });

  it('detects coder quirk', () => {
    const r = parseModelId('qwen-2.5-coder-32b-instruct');
    expect(r.vendor).toBe('qwen');
    expect(r.quirks).toContain('coder');
    expect(r.quirks).toContain('instruct');
  });

  it('handles mixtral-8x22b-instruct-v0.1', () => {
    const r = parseModelId('mixtral-8x22b-instruct-v0.1');
    expect(r.vendor).toBe('mistral');
    expect(r.family).toBe('mixtral');
  });

  it('handles command-r-plus-2024-08', () => {
    const r = parseModelId('command-r-plus-2024-08');
    expect(r.vendor).toBe('cohere');
  });
});

describe('parseModelId — no false positives', () => {
  it('does not match claudia (only claude with word boundary)', () => {
    const r = parseModelId('claudia-7b');
    expect(r.vendor).toBeUndefined();
  });

  it('does not match opus inside an unrelated model', () => {
    const r = parseModelId('llama-opus-music-7b');
    // Vendor wins on llama. Family lookup is scoped to vendor=meta:
    // there's no `llama-3` substring here, so family is undefined.
    // The point of this test: 'opus' (which matches claude-opus
    // family for vendor=anthropic) does NOT leak across vendor.
    expect(r.vendor).toBe('meta');
    expect(r.family).toBeUndefined();
  });
});

describe('resolveModelIdentity — async with probe', () => {
  it('calls listModels and uses owned_by when adapter exposes it', async () => {
    const listModels = vi.fn(() =>
      Promise.resolve([{ id: 'opaque', ownedBy: 'anthropic-research' }] as readonly ModelMetadata[])
    );
    const adapter = makeAdapter('opaque', listModels);
    const identity = await resolveModelIdentity(adapter);
    expect(identity.vendor).toBe('anthropic');
    expect(identity.source).toBe('probe');
  });

  it('falls back to modelId parse when probe fails', async () => {
    const listModels = vi.fn(() => {
      throw new Error('endpoint not supported');
    });
    const adapter = makeAdapter('claude-opus-4-6', listModels);
    const identity = await resolveModelIdentity(adapter);
    expect(identity.vendor).toBe('anthropic');
    expect(identity.source).toBe('modelIdParse');
  });

  it('falls back to modelId parse when adapter has no listModels', async () => {
    const adapter = makeAdapter('claude-sonnet-4-6');
    const identity = await resolveModelIdentity(adapter);
    expect(identity.vendor).toBe('anthropic');
    expect(identity.source).toBe('modelIdParse');
  });

  it('respects skipProbe option', async () => {
    const listModels = vi.fn(() => Promise.resolve([] as readonly ModelMetadata[]));
    const adapter = makeAdapter('claude-sonnet-4-6', listModels);
    const identity = await resolveModelIdentity(adapter, { skipProbe: true });
    expect(listModels).not.toHaveBeenCalled();
    expect(identity.source).toBe('modelIdParse');
  });

  it('hints override probe and parse', async () => {
    const listModels = vi.fn(() =>
      Promise.resolve([{ id: 'm', ownedBy: 'meta' }] as readonly ModelMetadata[])
    );
    const adapter = makeAdapter('claude-opus', listModels);
    const identity = await resolveModelIdentity(adapter, {
      hints: { vendor: 'cohere' },
    });
    expect(identity.vendor).toBe('cohere');
    expect(identity.source).toBe('modelHints');
  });

  it('hints fill only specified fields; others fall through', async () => {
    const adapter = makeAdapter('claude-opus-4-6');
    const identity = await resolveModelIdentity(adapter, {
      hints: { quirks: ['custom-tag'] },
    });
    expect(identity.vendor).toBe('anthropic');
    expect(identity.family).toBe('claude-opus');
    expect(identity.quirks).toContain('custom-tag');
  });

  it('returns unknown vendor + family for opaque model with no probe', async () => {
    const adapter = makeAdapter('mystery-fast-7');
    const identity = await resolveModelIdentity(adapter);
    expect(identity.vendor).toBe('unknown');
    expect(identity.family).toBe('unknown');
    expect(identity.source).toBe('default');
  });

  it('records rawModelId regardless of source', async () => {
    const adapter = makeAdapter('weird-string-23');
    const identity = await resolveModelIdentity(adapter);
    expect(identity.rawModelId).toBe('weird-string-23');
  });
});

describe('resolveModelIdentitySync', () => {
  it('produces same result as async without probe', () => {
    const sync = resolveModelIdentitySync('gpt-4o');
    expect(sync.vendor).toBe('openai');
    expect(sync.family).toBe('gpt-4o');
    expect(sync.source).toBe('modelIdParse');
  });

  it('honors hints', () => {
    const sync = resolveModelIdentitySync('whatever', { vendor: 'cohere' });
    expect(sync.vendor).toBe('cohere');
    expect(sync.source).toBe('modelHints');
  });
});
