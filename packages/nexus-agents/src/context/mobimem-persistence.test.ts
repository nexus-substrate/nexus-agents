/**
 * Persistence-focused tests for MobiMem (#2719).
 *
 * These pin the fix for the triple-disconnect: a write through one
 * MobiMem instance must be visible to a freshly-opened MobiMem instance
 * pointing at the same `dbPath`. Pre-Phase 4 this assertion failed —
 * `dbPath` was a dead config field — and `KnnRoutingStage` had nothing
 * to retrieve. Post-Phase 4 the SQLite mirror in `mobimem-persistence.ts`
 * carries writes across instance boundaries.
 *
 * @module context/mobimem-persistence.test
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MobiMem,
  getSharedMobiMem,
  resetSharedMobiMem,
  setSharedMobiMemDbPathResolver,
} from './mobimem.js';

describe('MobiMem SQLite persistence (#2719)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mobimem-persist-'));
    dbPath = join(tmpDir, 'mobimem.db');
  });

  afterEach(() => {
    resetSharedMobiMem();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('profile.observe persists across MobiMem instances', () => {
    const a = new MobiMem({ dbPath });
    a.profile.observe('agent-1', 'agent', 'preferred_model', 'claude');
    a.close();

    const b = new MobiMem({ dbPath });
    const restored = b.profile.getPreference('agent-1', 'preferred_model');
    expect(restored?.preferenceValue).toBe('claude');
    b.close();
  });

  it('experience.recordExecution persists across MobiMem instances', () => {
    const actionSequence = [
      {
        index: 0,
        actionType: 'model_route',
        parameters: { model: 'claude' },
        durationMs: 100,
        success: true,
      },
    ];
    const outcome = { success: true, totalDurationMs: 100, tokensUsed: 500 };

    const a = new MobiMem({ dbPath });
    a.experience.recordExecution('arch-task', actionSequence, outcome, 'claude');
    a.close();

    const b = new MobiMem({ dbPath });
    const patterns = b.experience.findPatterns('arch-task');
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    expect(patterns[0]?.taskType).toBe('arch-task');
    b.close();
  });

  it('action.cache persists with Date types intact', () => {
    const a = new MobiMem({ dbPath, actionCacheTtlMs: 60_000 });
    a.action.cache({ op: 'list', target: 'files' }, ['a.ts'], 200);
    a.close();

    const b = new MobiMem({ dbPath, actionCacheTtlMs: 60_000 });
    const cached = b.action.get({ op: 'list', target: 'files' });
    expect(cached).not.toBeNull();
    // hydrateDates ensures Date fields aren't strings after JSON round-trip.
    expect(cached?.expiresAt).toBeInstanceOf(Date);
    expect(cached?.cachedAt).toBeInstanceOf(Date);
    b.close();
  });

  it('in-memory mode (:memory:) keeps test isolation', () => {
    const a = new MobiMem({ dbPath: ':memory:' });
    a.profile.observe('agent-1', 'agent', 'k', 'v');
    a.close();
    // Second instance with same `:memory:` literal gets its own fresh DB.
    const b = new MobiMem({ dbPath: ':memory:' });
    expect(b.profile.getEntryCount()).toBe(0);
    b.close();
  });
});

describe('getSharedMobiMem singleton', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mobimem-shared-'));
    dbPath = join(tmpDir, 'mobimem.db');
    resetSharedMobiMem();
    setSharedMobiMemDbPathResolver(() => dbPath);
  });

  afterEach(() => {
    resetSharedMobiMem();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the same instance on repeat calls', () => {
    const a = getSharedMobiMem();
    const b = getSharedMobiMem();
    expect(a).toBe(b);
  });

  it('shared instance persists writes to the resolver path', () => {
    const shared = getSharedMobiMem();
    shared.profile.observe('agent-x', 'agent', 'k', 'v');
    resetSharedMobiMem();
    // New singleton, same path → must see the write.
    const next = getSharedMobiMem();
    expect(next.profile.getPreference('agent-x', 'k')?.preferenceValue).toBe('v');
  });
});
