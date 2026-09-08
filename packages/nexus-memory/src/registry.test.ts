/**
 * MemoryRegistry tests — registration, lookup, isolation.
 *
 * @module nexus-memory/registry.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryRegistry,
  closeMemoryRegistry,
  getMemoryRegistry,
  setMemoryRegistry,
} from './registry.js';
import type { IMemoryBackend } from './types.js';
import { createInMemoryMemoryRegistry, createSqliteMemoryRegistry } from './factory.js';

describe('MemoryRegistry', () => {
  let registry: MemoryRegistry;

  beforeEach(() => {
    registry = createInMemoryMemoryRegistry();
  });

  afterEach(async () => {
    await registry.close();
  });

  it('register returns a working backend', async () => {
    const backend = registry.register<string, { v: number }>({ domain: 'test_register' });
    await backend.write('k', { v: 1 });
    expect(await backend.read('k')).toEqual({ v: 1 });
  });

  it('get returns the registered backend', () => {
    const a = registry.register<string, { v: number }>({ domain: 'test_get' });
    const b = registry.get<string, { v: number }>('test_get');
    expect(b).toBe(a);
  });

  it('get returns undefined for unknown domain', () => {
    expect(registry.get('not_registered')).toBeUndefined();
  });

  it('register rejects duplicate domains', () => {
    registry.register({ domain: 'dup' });
    expect(() => registry.register({ domain: 'dup' })).toThrow(/already registered/);
  });

  it('domains() lists registered keys', () => {
    registry.register({ domain: 'a' });
    registry.register({ domain: 'b' });
    expect([...registry.domains()].sort()).toEqual(['a', 'b']);
  });

  it('close disposes all backends and rejects further ops', async () => {
    registry.register({ domain: 'x' });
    await registry.close();
    expect(() => registry.register({ domain: 'y' })).toThrow(/is closed/);
  });

  it('close is idempotent', async () => {
    await registry.close();
    await expect(registry.close()).resolves.toBeUndefined();
  });
});

describe('SqliteMemoryRegistry shares one connection', () => {
  it('two domains in the same registry share a DB file', async () => {
    const reg = createSqliteMemoryRegistry(':memory:');
    const a = reg.register<string, { kind: 'a' }>({ domain: 'shared_a' });
    const b = reg.register<string, { kind: 'b' }>({ domain: 'shared_b' });
    await a.write('k', { kind: 'a' });
    await b.write('k', { kind: 'b' });
    expect((await a.read('k'))?.kind).toBe('a');
    expect((await b.read('k'))?.kind).toBe('b');
    await reg.close();
  });
});

describe('shared singleton (getMemoryRegistry / setMemoryRegistry)', () => {
  afterEach(async () => {
    await closeMemoryRegistry();
  });

  it('setMemoryRegistry replaces the shared instance', () => {
    const injected = createInMemoryMemoryRegistry();
    setMemoryRegistry(injected);
    expect(getMemoryRegistry()).toBe(injected);
  });

  it('test-injected registry stays isolated from disk', async () => {
    const injected = createInMemoryMemoryRegistry();
    setMemoryRegistry(injected);
    const backend = getMemoryRegistry().register<string, { v: number }>({
      domain: 'iso_test',
    });
    await backend.write('k', { v: 1 });
    expect(await backend.read('k')).toEqual({ v: 1 });
  });
});

// ============================================================================
// close() must not report success for backends it never closed (#5776 item 2)
// ============================================================================

describe('MemoryRegistry.close() failure handling (#5776)', () => {
  function stubBackend(
    overrides: Partial<IMemoryBackend<string, unknown>> = {}
  ): IMemoryBackend<string, unknown> {
    return {
      domain: 'stub',
      read: () => Promise.resolve(undefined),
      write: () => Promise.resolve(),
      query: () => Promise.resolve([]),
      delete: () => Promise.resolve(false),
      stats: () =>
        Promise.resolve({ domain: 'stub', count: 0, oldestTimestamp: null, newestTimestamp: null }),
      close: () => Promise.resolve(),
      ...overrides,
    };
  }

  it('closes every backend even when one rejects', async () => {
    const registry = new MemoryRegistry();
    const later = vi.fn(() => Promise.resolve());
    registry.attach('a', stubBackend({ close: () => Promise.reject(new Error('boom')) }));
    registry.attach('b', stubBackend({ close: later }));

    await expect(registry.close()).rejects.toThrow('boom');
    // Before #5776 the loop aborted on the first rejection, so `b` stayed open
    // while the registry had already marked itself closed.
    expect(later).toHaveBeenCalled();
  });

  it('really is closed after a backend fails, rather than merely claiming to be', async () => {
    const registry = new MemoryRegistry();
    registry.attach('a', stubBackend({ close: () => Promise.reject(new Error('boom')) }));

    await expect(registry.close()).rejects.toThrow('boom');

    // The retry resolving is correct once everything the registry OWNS is shut
    // — there is genuinely nothing left to do. What must not happen is the
    // registry staying open: before #5776 the shared SQLite handle leaked, and
    // an early draft of the fix left `closed` false, which would have let the
    // next operation run against a closed handle. This is the assertion that
    // separates "reported closed" from "is closed".
    await expect(registry.close()).resolves.toBeUndefined();
    expect(() => registry.get('a')).toThrow(/closed/);
  });

  it('is still idempotent when every backend closes cleanly', async () => {
    const registry = new MemoryRegistry();
    const ok = vi.fn(() => Promise.resolve());
    registry.attach('a', stubBackend({ close: ok }));

    await expect(registry.close()).resolves.toBeUndefined();
    await expect(registry.close()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
