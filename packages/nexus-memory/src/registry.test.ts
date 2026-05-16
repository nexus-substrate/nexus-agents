/**
 * MemoryRegistry tests — registration, lookup, isolation.
 *
 * @module nexus-memory/registry.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MemoryRegistry,
  closeMemoryRegistry,
  getMemoryRegistry,
  setMemoryRegistry,
} from './registry.js';
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
