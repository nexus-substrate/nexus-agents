/**
 * Tests for default model-source registration (#3404).
 */
import { describe, it, expect, afterEach } from 'vitest';

import { AvailableModelsCache } from './available-models-cache.js';
import { isDynamicModelsEnabled, registerDefaultModelSources } from './register-model-sources.js';

afterEach(() => {
  delete process.env['NEXUS_DYNAMIC_MODELS'];
});

describe('isDynamicModelsEnabled (#3404)', () => {
  it('is false by default (opt-in)', () => {
    expect(isDynamicModelsEnabled()).toBe(false);
  });

  it('is true only for the exact string "true"', () => {
    process.env['NEXUS_DYNAMIC_MODELS'] = 'true';
    expect(isDynamicModelsEnabled()).toBe(true);
    process.env['NEXUS_DYNAMIC_MODELS'] = '1';
    expect(isDynamicModelsEnabled()).toBe(false);
  });
});

describe('registerDefaultModelSources (#3404)', () => {
  it('registers an adapter listModels() as a CLI-named source', async () => {
    const cache = new AvailableModelsCache({ sources: [] });
    const adapters = new Map<string, unknown>([
      ['opencode', { listModels: () => Promise.resolve([{ id: 'qwen/qwen3-coder:free' }]) }],
      ['claude', {}], // no listModels → skipped, no throw
    ]);
    registerDefaultModelSources(cache, adapters, { includeOpenRouter: false });

    const all = await cache.getAll();
    expect(all.some((m) => m.id === 'qwen/qwen3-coder:free' && m.source === 'opencode')).toBe(true);
  });

  it('is fail-open: one adapter throwing does not poison the others', async () => {
    const cache = new AvailableModelsCache({ sources: [] });
    const adapters = new Map<string, unknown>([
      ['opencode', { listModels: () => Promise.reject(new Error('cli down')) }],
      ['gemini', { listModels: () => Promise.resolve([{ id: 'gemini-3-pro' }]) }],
    ]);
    registerDefaultModelSources(cache, adapters, { includeOpenRouter: false });

    const all = await cache.getAll();
    expect(all.map((m) => m.id)).toContain('gemini-3-pro');
  });

  it('skips adapters without a listModels method', async () => {
    const cache = new AvailableModelsCache({ sources: [] });
    const adapters = new Map<string, unknown>([['codex', { execute: () => undefined }]]);
    registerDefaultModelSources(cache, adapters, { includeOpenRouter: false });

    expect(await cache.getAll()).toEqual([]);
  });
});
