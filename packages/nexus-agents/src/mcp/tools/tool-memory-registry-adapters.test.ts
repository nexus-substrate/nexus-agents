/**
 * Tests for the Phase 5 thin adapters that surface tool-memory backends
 * as `IMemoryBackend` implementations on the unified registry.
 *
 * @module mcp/tools/tool-memory-registry-adapters.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeMemoryRegistry, createInMemoryMemoryRegistry, setMemoryRegistry } from 'nexus-memory';
import { StatsOnlyAdapter } from './tool-memory-registry-adapters.js';

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

  it('query returns empty array', async () => {
    const adapter = new StatsOnlyAdapter('test_query', { count: () => 0 });
    expect(await adapter.query()).toEqual([]);
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
