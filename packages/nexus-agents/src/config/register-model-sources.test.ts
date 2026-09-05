/**
 * Tests for default model-source registration (#3404).
 */
import { describe, it, expect, afterEach } from 'vitest';

import { AvailableModelsCache } from './available-models-cache.js';
import {
  isDynamicModelsEnabled,
  registerDefaultModelSources,
  buildDefaultModelSources,
} from './register-model-sources.js';

afterEach(() => {
  delete process.env['NEXUS_DYNAMIC_MODELS'];
});

describe('isDynamicModelsEnabled (#3404)', () => {
  it('is false by default (opt-in)', () => {
    expect(isDynamicModelsEnabled()).toBe(false);
  });

  it('accepts the parseBoolEnv set: true|1 enable, false|0 disable (#5155)', () => {
    // Previously pinned `'1'` → false as intended behaviour: the flag read
    // `=== 'true'` while its siblings read `=== '1'`, so an operator who set
    // NEXUS_DYNAMIC_MODELS=1 was silently left disabled.
    process.env['NEXUS_DYNAMIC_MODELS'] = 'true';
    expect(isDynamicModelsEnabled()).toBe(true);
    process.env['NEXUS_DYNAMIC_MODELS'] = '1';
    expect(isDynamicModelsEnabled()).toBe(true);
    process.env['NEXUS_DYNAMIC_MODELS'] = 'false';
    expect(isDynamicModelsEnabled()).toBe(false);
    process.env['NEXUS_DYNAMIC_MODELS'] = '0';
    expect(isDynamicModelsEnabled()).toBe(false);
  });

  it('stays disabled for a value outside the accept-set (yes → default)', () => {
    process.env['NEXUS_DYNAMIC_MODELS'] = 'yes';
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
    // The isolation is unchanged — it just lives in the cache now rather than
    // in the source wrapper (#5059), which is what lets a failed probe be told
    // apart from an empty one.
    const cache = new AvailableModelsCache({ sources: [] });
    const adapters = new Map<string, unknown>([
      ['opencode', { listModels: () => Promise.reject(new Error('cli down')) }],
      ['gemini', { listModels: () => Promise.resolve([{ id: 'gemini-3-pro' }]) }],
    ]);
    registerDefaultModelSources(cache, adapters, { includeOpenRouter: false });

    const all = await cache.getAll();
    expect(all.map((m) => m.id)).toContain('gemini-3-pro');
  });

  it('lets an adapter probe failure reach the cache (#5059)', async () => {
    // The wrapper used to catch and return `[]`, which the cache reads as a
    // SUCCESSFUL empty probe: a good catalog is overwritten and stamped fresh
    // for the whole TTL. Asserted at the source, because at the cache boundary
    // the two are — by construction — indistinguishable.
    const cache = new AvailableModelsCache({ sources: [] });
    const adapters = new Map<string, unknown>([
      ['opencode', { listModels: () => Promise.reject(new Error('cli down')) }],
    ]);
    registerDefaultModelSources(cache, adapters, { includeOpenRouter: false });

    const source = buildDefaultModelSources(adapters, { includeOpenRouter: false }).find(
      (x) => x.name === 'opencode'
    );
    expect(source).toBeDefined();
    await expect(source?.listModels()).rejects.toThrow('cli down');
  });

  it('skips adapters without a listModels method', async () => {
    const cache = new AvailableModelsCache({ sources: [] });
    const adapters = new Map<string, unknown>([['codex', { execute: () => undefined }]]);
    registerDefaultModelSources(cache, adapters, { includeOpenRouter: false });

    expect(await cache.getAll()).toEqual([]);
  });
});

describe('buildDefaultModelSources (#3406)', () => {
  it('builds an OpenRouter source + a source per listModels-capable adapter', () => {
    const adapters = new Map<string, unknown>([
      ['opencode', { listModels: () => Promise.resolve([]) }],
      ['claude', { listModels: () => Promise.resolve([]) }],
      ['codex', {}], // skipped
    ]);
    const names = buildDefaultModelSources(adapters).map((s) => s.name);
    expect(names).toContain('openrouter');
    expect(names).toContain('opencode');
    expect(names).toContain('claude');
    expect(names).not.toContain('codex');
  });

  it('omits the OpenRouter source when includeOpenRouter is false', () => {
    const names = buildDefaultModelSources(new Map(), { includeOpenRouter: false }).map(
      (s) => s.name
    );
    expect(names).not.toContain('openrouter');
    expect(names).toEqual([]);
  });

  it('collapses an api:* arm key to its display slot — no api:* leaks into source names (#3425)', () => {
    // The router's adapter map can be keyed by api:* arm ids (#3422). The source
    // must be named for the display CLI slot, never the raw arm id.
    const adapters = new Map<string, unknown>([
      ['api:anthropic', { listModels: () => Promise.resolve([{ id: 'claude-opus' }]) }],
      ['api:openai', { listModels: () => Promise.resolve([{ id: 'gpt-5' }]) }],
    ]);
    const names = buildDefaultModelSources(adapters, { includeOpenRouter: false }).map(
      (s) => s.name
    );
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names.some((n) => n.startsWith('api:'))).toBe(false);
  });
});
