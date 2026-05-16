/**
 * Tests for the Phase 6 OutcomeStore IMemoryBackend adapter.
 *
 * @module orchestration/outcomes/outcome-store-adapter.test
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OutcomeStore } from './outcome-store.js';
import { OutcomeStoreAdapter } from './outcome-store-adapter.js';
import type { TaskOutcome } from './outcome-types.js';

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: `o-${Math.random().toString(36).slice(2)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet',
    success: true,
    durationMs: 100,
    timestamp: new Date('2026-01-01T00:00:00Z').toISOString(),
    source: 'delegate',
    ...overrides,
  };
}

describe('OutcomeStoreAdapter', () => {
  let store: OutcomeStore;
  let adapter: OutcomeStoreAdapter;

  beforeEach(() => {
    store = new OutcomeStore();
    adapter = new OutcomeStoreAdapter(store);
  });

  it('exposes the domain as "outcomes"', () => {
    expect(adapter.domain).toBe('outcomes');
  });

  it('stats reports the store count + timestamp bounds', async () => {
    store.append(makeOutcome({ timestamp: '2026-01-01T00:00:00Z' }));
    store.append(makeOutcome({ timestamp: '2026-03-15T00:00:00Z' }));
    const stats = await adapter.stats();
    expect(stats.count).toBe(2);
    expect(stats.oldestTimestamp).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    expect(stats.newestTimestamp).toBe(new Date('2026-03-15T00:00:00Z').getTime());
  });

  it('stats returns null bounds when empty', async () => {
    const stats = await adapter.stats();
    expect(stats.count).toBe(0);
    expect(stats.oldestTimestamp).toBeNull();
    expect(stats.newestTimestamp).toBeNull();
  });

  it('query filters by cli', async () => {
    store.append(makeOutcome({ cli: 'claude' }));
    store.append(makeOutcome({ cli: 'gemini' }));
    const claudes = await adapter.query({ where: { cli: 'claude' } });
    expect(claudes).toHaveLength(1);
    expect(claudes[0]?.cli).toBe('claude');
  });

  it('query honors limit', async () => {
    for (let i = 0; i < 5; i++) store.append(makeOutcome());
    const limited = await adapter.query({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it('read returns undefined (OutcomeStore is query-only)', async () => {
    expect(await adapter.read('any-key')).toBeUndefined();
  });

  it('write rejects with explanatory error', async () => {
    await expect(adapter.write('k', makeOutcome())).rejects.toThrow(/append.*directly/);
  });

  it('delete returns false (bulk-only)', async () => {
    expect(await adapter.delete('k')).toBe(false);
  });

  it('close is a no-op', async () => {
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});
