/**
 * Tests for the Phase 5 thin adapters that surface tool-memory backends
 * as `IMemoryBackend` implementations on the unified registry.
 *
 * @module mcp/tools/tool-memory-registry-adapters.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeMemoryRegistry,
  createInMemoryMemoryRegistry,
  getMemoryRegistry,
  hasMemoryRegistry,
  setMemoryRegistry,
} from 'nexus-memory';
import { StatsOnlyAdapter, ensureSharedMemoryRegistry } from './tool-memory-registry-adapters.js';

describe('StatsOnlyAdapter', () => {
  beforeEach(() => {
    setMemoryRegistry(createInMemoryMemoryRegistry());
  });

  afterEach(async () => {
    await closeMemoryRegistry();
  });

  it('reports the underlying backend count via stats()', async () => {
    const adapter = new StatsOnlyAdapter('test_count', { count: () => 42 });
    const stats = await adapter.stats();
    expect(stats.count).toBe(42);
    expect(stats.domain).toBe('test_count');
  });

  it('handles async count() returning a number', async () => {
    const adapter = new StatsOnlyAdapter('test_async', {
      count: () => Promise.resolve(7),
    });
    const stats = await adapter.stats();
    expect(stats.count).toBe(7);
  });

  it('handles Result<number, _>-shaped count() returns', async () => {
    const adapter = new StatsOnlyAdapter('test_result', {
      count: () => Promise.resolve({ ok: true, value: 13 }),
    });
    const stats = await adapter.stats();
    expect(stats.count).toBe(13);
  });

  // #4827: a FAILED Result was collapsed to 0, so `memory_stats` reported
  // {count: 0, error: null} for a corrupt or locked backend — byte-identical
  // to a healthy empty store. The catch that populates `error`
  // (memory-stats.ts:213) was therefore unreachable, and
  // `RegistryDomainStats.error` documented a state nothing could produce.
  it('rejects rather than reporting 0 when count() returns a FAILED Result', async () => {
    const adapter = new StatsOnlyAdapter('belief', {
      count: () => ({ ok: false, error: new Error('database is locked') }),
    });

    await expect(adapter.stats()).rejects.toThrow(/locked|count/i);
  });

  it('still reports 0 for a genuinely empty backend', async () => {
    // The pair that matters: empty must stay distinguishable from broken.
    const adapter = new StatsOnlyAdapter('belief', { count: () => ({ ok: true, value: 0 }) });

    await expect(adapter.stats()).resolves.toMatchObject({ count: 0 });
  });

  it('returns 0 when count() shape is unrecognized', async () => {
    const adapter = new StatsOnlyAdapter('test_unknown', {
      count: (): unknown => 'invalid',
    });
    const stats = await adapter.stats();
    expect(stats.count).toBe(0);
  });

  it('read returns undefined (stats-only adapter)', async () => {
    const adapter = new StatsOnlyAdapter('test_read', { count: () => 0 });
    expect(await adapter.read('any-key')).toBeUndefined();
  });

  it('write rejects with explanatory error', async () => {
    const adapter = new StatsOnlyAdapter('test_write', { count: () => 0 });
    await expect(adapter.write('k', 'v')).rejects.toThrow(/stats-only/);
  });

  it('query returns empty array when no search callback is provided', async () => {
    const adapter = new StatsOnlyAdapter('test_query', { count: () => 0 });
    expect(await adapter.query()).toEqual([]);
  });

  it('query returns empty array when no search text is provided', async () => {
    const adapter = new StatsOnlyAdapter('test_query_no_text', {
      count: () => 0,
      search: () => Promise.resolve(['should not see me']),
    });
    expect(await adapter.query()).toEqual([]);
    expect(await adapter.query({ where: {} })).toEqual([]);
  });

  it('query delegates to backend.search when where.text is a string', async () => {
    const seen: Array<{ query: string; limit: number }> = [];
    const adapter = new StatsOnlyAdapter('test_query_delegate', {
      count: () => 0,
      search: (query, limit) => {
        seen.push({ query, limit });
        return Promise.resolve([{ id: 1, content: `match for ${query}` }]);
      },
    });
    const result = await adapter.query({
      where: { text: 'find this' },
      limit: 7,
    });
    expect(seen).toEqual([{ query: 'find this', limit: 7 }]);
    expect(result).toEqual([{ id: 1, content: 'match for find this' }]);
  });

  it('projects native dates and omits unset object fields for the JSON registry contract', async () => {
    const native = {
      createdAt: new Date('2026-01-01T00:00:00Z'),
      metadata: { unset: undefined, tags: ['memory'] },
    };
    const adapter = new StatsOnlyAdapter('native', {
      count: () => 1,
      search: () => Promise.resolve([native]),
    });
    const rows = await adapter.query({ where: { text: 'memory' } });
    expect(rows).toEqual([
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        metadata: { tags: ['memory'] },
      },
    ]);
    expect(rows[0]).not.toBe(native);
    expect(native.createdAt).toBeInstanceOf(Date);
    expect(native.metadata).toHaveProperty('unset');
  });

  it.each([new Map([['key', 'value']]), Number.NaN, { nested: [undefined] }])(
    'rejects native values without a JSON representation: %j',
    async (value) => {
      const adapter = new StatsOnlyAdapter('invalid', {
        count: () => 1,
        search: () => Promise.resolve([value]),
      });
      await expect(adapter.query({ where: { text: 'memory' } })).rejects.toThrow(/JSON|json/);
    }
  );

  it('rejects hidden fields and accessors without invoking getters', async () => {
    let calls = 0;
    const accessor = Object.defineProperty({}, 'content', {
      enumerable: true,
      get: () => {
        calls++;
        return 'secret';
      },
    });
    const hidden = Object.defineProperty({}, 'secret', { value: 'hidden' });
    const extra = Object.assign(['memory'], { label: 'extra' });
    const sparse = new Array<unknown>(1);
    for (const row of [accessor, hidden, extra, sparse]) {
      const adapter = new StatsOnlyAdapter('invalid', {
        count: () => 1,
        search: () => Promise.resolve([row]),
      });
      await expect(adapter.query({ where: { text: 'memory' } })).rejects.toThrow(/JSON|json/);
    }
    expect(calls).toBe(0);
  });

  it.each(['read', 'write', 'delete'] as const)(
    'rejects runtime non-string keys in %s',
    async (op) => {
      const adapter = new StatsOnlyAdapter('test_keys', { count: () => 0 });
      const key = 42 as unknown as string;
      const action = op === 'write' ? adapter.write(key, 'value') : adapter[op](key);
      await expect(action).rejects.toThrow(/key must be a string/);
    }
  );

  it('query honors default limit when filter.limit is absent', async () => {
    let seenLimit = -1;
    const adapter = new StatsOnlyAdapter('test_query_default_limit', {
      count: () => 0,
      search: (_q, limit) => {
        seenLimit = limit;
        return Promise.resolve([]);
      },
    });
    await adapter.query({ where: { text: 'q' } });
    expect(seenLimit).toBe(10);
  });

  it('query returns empty array when backend.search throws', async () => {
    const adapter = new StatsOnlyAdapter('test_query_throws', {
      count: () => 0,
      search: () => Promise.reject(new Error('backend exploded')),
    });
    const result = await adapter.query({
      where: { text: 'anything' },
    });
    expect(result).toEqual([]);
  });

  it('delete returns false', async () => {
    const adapter = new StatsOnlyAdapter('test_delete', { count: () => 0 });
    expect(await adapter.delete('k')).toBe(false);
  });

  it('close delegates when the underlying backend has close()', async () => {
    let closed = false;
    const adapter = new StatsOnlyAdapter('test_close', {
      count: () => 0,
      close: () => {
        closed = true;
      },
    });
    await adapter.close();
    expect(closed).toBe(true);
  });

  it('close is a no-op when the underlying backend lacks close()', async () => {
    const adapter = new StatsOnlyAdapter('test_no_close', { count: () => 0 });
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});

describe('registry-level fan-out (#2792 Phase 1)', () => {
  beforeEach(() => {
    setMemoryRegistry(createInMemoryMemoryRegistry());
  });

  afterEach(async () => {
    await closeMemoryRegistry();
  });

  it('a consumer can fan out over registry.domains() and get real results per domain', async () => {
    const { getMemoryRegistry } = await import('nexus-memory');
    const registry = getMemoryRegistry();

    registry.attach(
      'domain-a',
      new StatsOnlyAdapter('domain-a', {
        count: () => 2,
        search: (q) => Promise.resolve([`a:${q}:1`, `a:${q}:2`]),
      })
    );
    registry.attach(
      'domain-b',
      new StatsOnlyAdapter('domain-b', {
        count: () => 0,
        search: (q, limit) => Promise.resolve([{ from: 'b', q, limit }] as readonly unknown[]),
      })
    );

    interface DomainRows {
      domain: string;
      rows: readonly unknown[];
    }
    const fanOut: Array<Promise<DomainRows>> = [];
    for (const domain of registry.domains()) {
      const backend = registry.get(domain);
      if (backend === undefined) continue;
      fanOut.push(
        backend
          .query({
            where: { text: 'task' },
            limit: 3,
          })
          .then((rows) => ({ domain, rows }))
      );
    }
    const results = await Promise.all(fanOut);

    const byDomain = new Map(results.map((r) => [r.domain, r.rows]));
    expect(byDomain.get('domain-a')).toEqual(['a:task:1', 'a:task:2']);
    expect(byDomain.get('domain-b')).toEqual([{ from: 'b', q: 'task', limit: 3 }]);
  });
});

describe('ensureSharedMemoryRegistry (#3995)', () => {
  let root: string;
  let savedDataDir: string | undefined;
  let savedRepoPreferred: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nexus-reg-inject-'));
    savedDataDir = process.env['NEXUS_DATA_DIR'];
    savedRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    // Pin resolution to the temp dir so the injected path is deterministic.
    process.env['NEXUS_DATA_DIR'] = root;
    // Start with no registry so the injection path runs.
    setMemoryRegistry(null);
  });

  afterEach(async () => {
    await closeMemoryRegistry();
    if (savedDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = savedDataDir;
    if (savedRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = savedRepoPreferred;
    rmSync(root, { recursive: true, force: true });
  });

  it('injects a registry resolved via nexusDataPath when none exists', async () => {
    expect(hasMemoryRegistry()).toBe(false);
    ensureSharedMemoryRegistry();
    expect(hasMemoryRegistry()).toBe(true);

    // Writing through the registry persists under <NEXUS_DATA_DIR>/memory/memory.db,
    // proving the canonical resolver supplied the path (and the parent dir was
    // auto-created on open — fresh-install case).
    const registry = getMemoryRegistry();
    const backend = registry.register<string, { v: number }>({ domain: 'inject_check' });
    await backend.write('k', { v: 5 });
    expect(await backend.read('k')).toEqual({ v: 5 });
    expect(existsSync(join(root, 'memory', 'memory.db'))).toBe(true);
  });

  it('is a no-op when a registry is already set (respects test injection)', () => {
    const injected = createInMemoryMemoryRegistry();
    setMemoryRegistry(injected);
    ensureSharedMemoryRegistry();
    // The in-memory test registry must NOT have been clobbered.
    expect(getMemoryRegistry()).toBe(injected);
  });
});
