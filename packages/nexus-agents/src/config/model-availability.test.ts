/**
 * Tests for Model Availability Probes & Fallback Chains
 *
 * @module config/model-availability.test
 * (Source: Issue #869)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AvailabilityCache,
  resolveFallback,
  getFallbackChain,
  getCliForModelId,
  getAvailabilityCache,
  resetAvailabilityCache,
  filterAvailableModels,
  resolveCliSlot,
} from './model-availability.js';
import type { ProbeResult } from './model-availability.js';
import type { ModelId } from './model-capabilities-types.js';

describe('AvailabilityCache', () => {
  let cache: AvailabilityCache;

  beforeEach(() => {
    cache = new AvailabilityCache({ ttlMs: 1000, maxEntries: 5 });
  });

  it('returns undefined for unknown model', () => {
    expect(cache.get('claude-opus')).toBeUndefined();
  });

  it('stores and retrieves probe result', () => {
    const result: ProbeResult = {
      modelId: 'claude-opus',
      available: true,
      latencyMs: 42,
      checkedAt: Date.now(),
    };
    cache.set(result);
    expect(cache.get('claude-opus')).toEqual(result);
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    cache.markAvailable('claude-opus', 50);
    expect(cache.get('claude-opus')).toBeDefined();

    vi.advanceTimersByTime(1001);
    expect(cache.get('claude-opus')).toBeUndefined();
    vi.useRealTimers();
  });

  it('evicts oldest entry when at capacity', () => {
    const ids: ModelId[] = [
      'claude-opus',
      'claude-sonnet',
      'claude-haiku',
      'gemini-pro',
      'gemini-flash',
    ];
    for (const id of ids) {
      cache.markAvailable(id, 10);
    }
    expect(cache.size).toBe(5);

    cache.markAvailable('codex-5.3', 10);
    expect(cache.size).toBe(5);
    // Oldest (claude-opus) should be evicted
    expect(cache.get('claude-opus')).toBeUndefined();
    expect(cache.get('codex-5.3')).toBeDefined();
  });

  it('does not evict when updating existing entry', () => {
    cache.markAvailable('claude-opus', 10);
    cache.markAvailable('claude-sonnet', 20);
    cache.markAvailable('claude-opus', 30);
    expect(cache.size).toBe(2);
    const entry = cache.get('claude-opus');
    expect(entry?.latencyMs).toBe(30);
  });

  it('markUnavailable sets correct fields', () => {
    cache.markUnavailable('gemini-pro', 'API 503');
    const entry = cache.get('gemini-pro');
    expect(entry?.available).toBe(false);
    expect(entry?.error).toBe('API 503');
  });

  it('isKnownUnavailable returns true for unavailable models', () => {
    cache.markUnavailable('claude-haiku', 'timeout');
    expect(cache.isKnownUnavailable('claude-haiku')).toBe(true);
  });

  it('isKnownUnavailable returns false for available models', () => {
    cache.markAvailable('claude-haiku', 10);
    expect(cache.isKnownUnavailable('claude-haiku')).toBe(false);
  });

  it('isKnownUnavailable returns false for unknown models', () => {
    expect(cache.isKnownUnavailable('claude-opus')).toBe(false);
  });

  it('entries returns all cached results', () => {
    cache.markAvailable('claude-opus', 10);
    cache.markUnavailable('gemini-pro', 'err');
    const all = cache.entries();
    expect(all).toHaveLength(2);
  });

  it('clear removes all entries', () => {
    cache.markAvailable('claude-opus', 10);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('resolveFallback', () => {
  let cache: AvailabilityCache;

  beforeEach(() => {
    cache = new AvailabilityCache();
  });

  it('returns next model in chain when primary is down', () => {
    cache.markUnavailable('claude-opus', 'down');
    const fb = resolveFallback('claude-opus', cache);
    expect(fb).not.toBeNull();
    expect(fb?.modelId).toBe('claude-sonnet');
  });

  it('skips unavailable models in chain', () => {
    cache.markUnavailable('claude-opus', 'down');
    cache.markUnavailable('claude-sonnet', 'down');
    const fb = resolveFallback('claude-opus', cache);
    expect(fb?.modelId).toBe('claude-haiku');
  });

  it('returns null when all models in chain are unavailable', () => {
    cache.markUnavailable('claude-opus', 'down');
    cache.markUnavailable('claude-sonnet', 'down');
    cache.markUnavailable('claude-haiku', 'down');
    const fb = resolveFallback('claude-opus', cache);
    expect(fb).toBeNull();
  });

  it('works for gemini chain', () => {
    cache.markUnavailable('gemini-3-pro', 'down');
    const fb = resolveFallback('gemini-3-pro', cache);
    expect(fb?.modelId).toBe('gemini-pro');
  });

  it('works for codex chain', () => {
    cache.markUnavailable('codex-5.3', 'down');
    const fb = resolveFallback('codex-5.3', cache);
    expect(fb?.modelId).toBe('codex-5.2');
  });

  it('includes reason in fallback entry', () => {
    cache.markUnavailable('claude-opus', 'rate limited');
    const fb = resolveFallback('claude-opus', cache);
    expect(fb?.reason).toContain('claude-opus');
    expect(fb?.reason).toContain('claude-sonnet');
  });
});

describe('getFallbackChain', () => {
  it('returns claude chain', () => {
    const chain = getFallbackChain('claude');
    expect(chain).toContain('claude-opus');
    expect(chain).toContain('claude-sonnet');
    expect(chain).toContain('claude-haiku');
  });

  it('returns gemini chain', () => {
    const chain = getFallbackChain('gemini');
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0]).toBe('gemini-3-pro');
  });

  it('returns codex chain', () => {
    const chain = getFallbackChain('codex');
    expect(chain).toContain('codex-5.3');
  });

  it('returns opencode chain with custom models first', () => {
    const chain = getFallbackChain('opencode');
    expect(chain).toContain('opencode-custom-opus');
    expect(chain).toContain('opencode-custom-sonnet');
    expect(chain).toContain('opencode-default');
    expect(chain[0]).toBe('opencode-custom-opus');
  });
});

describe('getCliForModelId', () => {
  it('resolves claude models', () => {
    expect(getCliForModelId('claude-opus')).toBe('claude');
    expect(getCliForModelId('claude-sonnet')).toBe('claude');
  });

  it('resolves gemini models', () => {
    expect(getCliForModelId('gemini-pro')).toBe('gemini');
    expect(getCliForModelId('gemini-3-pro')).toBe('gemini');
  });

  it('resolves codex models', () => {
    expect(getCliForModelId('codex-5.3')).toBe('codex');
  });

  it('resolves opencode custom models', () => {
    expect(getCliForModelId('opencode-default')).toBe('opencode');
    expect(getCliForModelId('opencode-custom-opus')).toBe('opencode');
    expect(getCliForModelId('opencode-custom-sonnet')).toBe('opencode');
  });
});

describe('getAvailabilityCache / resetAvailabilityCache', () => {
  afterEach(() => {
    resetAvailabilityCache();
  });

  it('returns a singleton cache', () => {
    const a = getAvailabilityCache();
    const b = getAvailabilityCache();
    expect(a).toBe(b);
  });

  it('reset creates a fresh instance', () => {
    const a = getAvailabilityCache();
    a.markAvailable('claude-opus', 10);
    resetAvailabilityCache();
    const b = getAvailabilityCache();
    expect(b.size).toBe(0);
  });
});

describe('filterAvailableModels', () => {
  let cache: AvailabilityCache;

  beforeEach(() => {
    cache = new AvailabilityCache();
  });

  it('keeps all models when none are unavailable', () => {
    const ids = ['claude-opus', 'gemini-pro'];
    const result = filterAvailableModels(ids, cache);
    expect(result.available).toEqual(ids);
    expect(result.removed).toEqual([]);
  });

  it('filters out unavailable models', () => {
    cache.markUnavailable('claude-opus', 'down');
    const ids = ['claude-opus', 'claude-sonnet', 'gemini-pro'];
    const result = filterAvailableModels(ids, cache);
    expect(result.available).toEqual(['claude-sonnet', 'gemini-pro']);
    expect(result.removed).toEqual(['claude-opus']);
  });

  it('filters out multiple unavailable models', () => {
    cache.markUnavailable('claude-opus', 'down');
    cache.markUnavailable('gemini-pro', '503');
    const ids = ['claude-opus', 'claude-sonnet', 'gemini-pro'];
    const result = filterAvailableModels(ids, cache);
    expect(result.available).toEqual(['claude-sonnet']);
    expect(result.removed).toHaveLength(2);
  });
});

describe('resolveCliSlot (#3317/#3293 — slot for any model, incl. new/API)', () => {
  it('resolves a known curated model to its exact slot', () => {
    expect(resolveCliSlot('claude-opus')).toBe(getCliForModelId('claude-opus'));
    expect(resolveCliSlot('gemini-3-pro')).toBe(getCliForModelId('gemini-3-pro'));
  });

  it('falls back to the vendor slot for UNKNOWN models (the api-mode/new-release gap)', () => {
    // brand-new releases not yet in the registry
    expect(resolveCliSlot('claude-5-ultra')).toBe('claude'); // anthropic → claude
    expect(resolveCliSlot('gpt-6-turbo')).toBe('codex'); // openai → codex
    expect(resolveCliSlot('gemini-4-pro')).toBe('gemini'); // google → gemini
  });

  it('routes non-big-3 / unknown vendors to the opencode catch-all slot', () => {
    expect(resolveCliSlot('qwen-max-9')).toBe('opencode');
    expect(resolveCliSlot('deepseek-v9')).toBe('opencode');
    expect(resolveCliSlot('some-totally-unknown-model')).toBe('opencode');
  });

  it('returns undefined only when no model is present (no execution to attribute)', () => {
    expect(resolveCliSlot(undefined)).toBeUndefined();
    expect(resolveCliSlot('')).toBeUndefined();
  });
});
