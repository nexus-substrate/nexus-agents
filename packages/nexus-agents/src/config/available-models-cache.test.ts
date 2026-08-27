/**
 * Tests for AvailableModelsCache (#2540 PR 6).
 */
import { describe, it, expect, vi } from 'vitest';
import { AvailableModelsCache, type AvailableModelsSource } from './available-models-cache.js';

function source(name: string, ids: string[], providerHint?: string): AvailableModelsSource {
  const list = vi.fn(() => Promise.resolve(ids.map((id) => ({ id }))));
  return providerHint !== undefined
    ? { name, providerHint, listModels: list }
    : { name, listModels: list };
}

function failingSource(name: string, message = 'boom'): AvailableModelsSource {
  return { name, listModels: () => Promise.reject(new Error(message)) };
}

describe('AvailableModelsCache (#2540)', () => {
  it('unions ids across sources and tags by provider', async () => {
    const claude = source('claude', ['claude-opus-4-7'], 'anthropic');
    const opencode = source('opencode', ['opencode/big-pickle', 'anthropic/claude-haiku-3.5']);
    const cache = new AvailableModelsCache({ sources: [claude, opencode] });
    const all = await cache.getAll();
    expect(all).toHaveLength(3);
    expect(all.find((m) => m.id === 'claude-opus-4-7')?.provider).toBe('anthropic');
    expect(all.find((m) => m.id === 'opencode/big-pickle')?.provider).toBe('opencode');
    expect(all.find((m) => m.id === 'anthropic/claude-haiku-3.5')?.provider).toBe('anthropic');
  });

  it('caches within TTL — second call does not re-probe', async () => {
    const probe = vi.fn(() => Promise.resolve([{ id: 'gpt-4o' }]));
    const src: AvailableModelsSource = { name: 'gateway', listModels: probe };
    const cache = new AvailableModelsCache({ sources: [src] });
    await cache.getAll();
    await cache.getAll();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('serves stale value while kicking a background refresh', async () => {
    let calls = 0;
    let now = 1_000_000;
    const probe = vi.fn(() => {
      calls += 1;
      return Promise.resolve([{ id: `v${String(calls)}` }]);
    });
    const src: AvailableModelsSource = { name: 'gateway', listModels: probe };
    const cache = new AvailableModelsCache({
      sources: [src],
      ttlMs: 100,
      staleTtlMs: 1000,
      now: () => now,
    });
    const first = await cache.getAll();
    expect(first[0]?.id).toBe('v1');
    now += 200; // beyond ttlMs (100), within staleTtlMs (1000)
    const second = await cache.getAll();
    expect(second[0]?.id).toBe('v1'); // served stale
    // background refresh is now in flight or completed; await microtasks
    await new Promise((r) => setTimeout(r, 0));
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('blocks on refresh when fully expired', async () => {
    let now = 1_000_000;
    const probe = vi.fn(() => Promise.resolve([{ id: 'v' }]));
    const src: AvailableModelsSource = { name: 'g', listModels: probe };
    const cache = new AvailableModelsCache({
      sources: [src],
      ttlMs: 100,
      staleTtlMs: 1000,
      now: () => now,
    });
    await cache.getAll();
    now += 5000; // past stale TTL
    await cache.getAll();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('one failing source does not poison the union', async () => {
    const ok = source('ok', ['a']);
    const bad = failingSource('bad');
    const cache = new AvailableModelsCache({ sources: [ok, bad] });
    const all = await cache.getAll();
    expect(all).toEqual([{ id: 'a', source: 'ok' }]);
  });

  it('byProvider filters by source name', async () => {
    const a = source('a', ['x']);
    const b = source('b', ['y']);
    const cache = new AvailableModelsCache({ sources: [a, b] });
    expect(await cache.byProvider('a')).toEqual([{ id: 'x', source: 'a' }]);
  });

  it('has() returns true iff a source reports the id', async () => {
    const cache = new AvailableModelsCache({ sources: [source('a', ['x'])] });
    expect(await cache.has('x')).toBe(true);
    expect(await cache.has('y')).toBe(false);
  });

  it('refresh() invalidates every source and re-probes', async () => {
    const probe = vi.fn(() => Promise.resolve([{ id: 'x' }]));
    const cache = new AvailableModelsCache({
      sources: [{ name: 'a', listModels: probe }],
    });
    await cache.getAll();
    await cache.getAll();
    expect(probe).toHaveBeenCalledTimes(1);
    await cache.refresh();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('shares the in-flight probe across concurrent callers', async () => {
    let resolveFn: (v: { id: string }[]) => void = () => {};
    const probe = vi.fn(
      () =>
        new Promise<{ id: string }[]>((r) => {
          resolveFn = r;
        })
    );
    const cache = new AvailableModelsCache({
      sources: [{ name: 'a', listModels: probe }],
    });
    const a = cache.getAll();
    const b = cache.getAll();
    resolveFn([{ id: 'x' }]);
    await Promise.all([a, b]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Dynamic source registration (#2549)
  // ============================================================================

  describe('addSource / removeSource (#2549)', () => {
    it('addSource appends to the union after construction', async () => {
      const cache = new AvailableModelsCache({ sources: [] });
      expect(await cache.getAll()).toHaveLength(0);

      cache.addSource(source('anthropic', ['claude-opus-4-7'], 'anthropic'));
      const all = await cache.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe('claude-opus-4-7');
    });

    it('addSource is idempotent by name', async () => {
      const cache = new AvailableModelsCache({ sources: [] });
      const probe = vi.fn(() => Promise.resolve([{ id: 'gpt-4o' }]));
      cache.addSource({ name: 'gateway', listModels: probe });
      cache.addSource({ name: 'gateway', listModels: probe });
      const all = await cache.getAll();
      // Single source registered → single probe call after dedup.
      expect(probe).toHaveBeenCalledTimes(1);
      expect(all).toHaveLength(1);
    });

    it('removeSource drops the source from subsequent probes', async () => {
      const probe = vi.fn(() => Promise.resolve([{ id: 'gpt-4o' }]));
      const cache = new AvailableModelsCache({
        sources: [{ name: 'gateway', listModels: probe }],
      });
      cache.removeSource('gateway');
      const all = await cache.getAll();
      expect(all).toHaveLength(0);
      expect(probe).not.toHaveBeenCalled();
    });
  });
});

describe('a failed probe must not overwrite a good catalog (#5059)', () => {
  function sourceThatFailsAfterFirstCall(): {
    source: AvailableModelsSource;
    fail: () => void;
  } {
    let failing = false;
    return {
      source: {
        name: 'flaky',
        listModels: () =>
          failing
            ? Promise.reject(new Error('network down'))
            : Promise.resolve([{ id: 'model-a' }, { id: 'model-b' }]),
      },
      fail: () => {
        failing = true;
      },
    };
  }

  it('keeps the cached catalog when the next probe fails', async () => {
    // The cache already has the right handling — it just never ran, because
    // both real sources caught internally and returned `[]`, which takes the
    // SUCCESS path: the empty list is stored and stamped fresh, discarding a
    // good catalog for the whole TTL.
    let clock = 0;
    const { source, fail } = sourceThatFailsAfterFirstCall();
    const cache = new AvailableModelsCache({
      sources: [source],
      ttlMs: 100,
      now: () => clock,
    });

    expect(await cache.getAll()).toHaveLength(2);

    fail();
    clock = 1000; // past the TTL, so the next call re-probes

    expect(await cache.getAll()).toHaveLength(2);
  });

  it('does not mark a failed probe as freshly fetched', async () => {
    // Stamping `fetchedAt` on failure is what makes the damage last a full
    // TTL: the bad state looks current, so nothing retries.
    let clock = 0;
    const { source, fail } = sourceThatFailsAfterFirstCall();
    const cache = new AvailableModelsCache({
      sources: [source],
      ttlMs: 100,
      now: () => clock,
    });
    await cache.getAll();

    fail();
    clock = 1000;
    await cache.getAll();

    // Recovery on the very next probe, not after another full TTL.
    clock = 1001;
    expect(await cache.getAll()).toHaveLength(2);
  });
});
