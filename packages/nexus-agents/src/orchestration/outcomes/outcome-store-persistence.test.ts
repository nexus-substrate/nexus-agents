/**
 * Tests for PersistentOutcomeStore (Issue #1009).
 *
 * Covers: hydration from JSONL, persistence on append, corruption handling,
 * FIFO eviction on hydrate, graceful degradation on disk errors,
 * and feature flag behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskOutcome } from './outcome-types.js';
import { PersistentOutcomeStore } from './outcome-store-persistence.js';
import {
  resetOutcomeStore,
  getOutcomeStore,
  registerPersistentOutcomeStoreFactory,
} from './outcome-store.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `nexus-persist-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeOutcome(overrides?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: `out-${String(Date.now())}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-6',
    success: true,
    durationMs: 1200,
    timestamp: '2026-02-07T10:00:00Z',
    source: 'delegate',
    ...overrides,
  };
}

function makeOutcomeLine(overrides?: Partial<TaskOutcome>): string {
  return JSON.stringify(makeOutcome(overrides));
}

// ============================================================================
// Tests
// ============================================================================

describe('PersistentOutcomeStore', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    filePath = join(tmpDir, 'outcomes.jsonl');
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------------------------------
  // Hydration
  // --------------------------------------------------------------------------

  describe('hydration', () => {
    it('starts empty when no file exists', () => {
      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store.size).toBe(0);
    });

    it('hydrates valid JSONL on construction', () => {
      const lines =
        [
          makeOutcomeLine({ id: 'out-1' }),
          makeOutcomeLine({ id: 'out-2' }),
          makeOutcomeLine({ id: 'out-3' }),
        ].join('\n') + '\n';
      writeFileSync(filePath, lines);

      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store.size).toBe(3);
    });

    it('skips malformed lines gracefully', () => {
      const lines =
        [
          makeOutcomeLine({ id: 'out-1' }),
          'not-json-at-all',
          '{"partial": true}',
          makeOutcomeLine({ id: 'out-4' }),
        ].join('\n') + '\n';
      writeFileSync(filePath, lines);

      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store.size).toBe(2);
    });

    it('handles empty file', () => {
      writeFileSync(filePath, '');
      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store.size).toBe(0);
    });

    it('handles file with only blank lines', () => {
      writeFileSync(filePath, '\n\n\n');
      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store.size).toBe(0);
    });

    it('reclassifies unclassified failed outcomes during hydration', () => {
      // Write failed outcomes without failureCategory to simulate pre-#1441 data
      const lines =
        [
          makeOutcomeLine({
            id: 'fail-1',
            success: false,
            errorMessage: 'Connection timeout after 30s',
          }),
          makeOutcomeLine({
            id: 'fail-2',
            success: false,
            errorMessage: 'ENOENT: no such file or directory',
          }),
          makeOutcomeLine({ id: 'ok-1', success: true }),
        ].join('\n') + '\n';
      writeFileSync(filePath, lines);

      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });

      const entries = store.query();
      expect(entries).toHaveLength(3);

      // Failed outcomes should have failureCategory set after hydration + reclassify
      const fail1 = entries.find((e) => e.id === 'fail-1');
      const fail2 = entries.find((e) => e.id === 'fail-2');
      const ok1 = entries.find((e) => e.id === 'ok-1');

      expect(fail1?.failureCategory).toBeDefined();
      expect(fail2?.failureCategory).toBeDefined();
      // Success outcomes should not have failureCategory
      expect(ok1?.failureCategory).toBeUndefined();
    });

    it('enforces FIFO eviction when hydrated count exceeds maxEntries', () => {
      const lines =
        Array.from({ length: 10 }, (_, i) => makeOutcomeLine({ id: `out-${String(i)}` })).join(
          '\n'
        ) + '\n';
      writeFileSync(filePath, lines);

      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
        maxEntries: 5,
      });
      expect(store.size).toBe(5);
      // Should retain the last 5 (FIFO eviction)
      const entries = store.query();
      expect(entries[0]?.id).toBe('out-5');
      expect(entries[4]?.id).toBe('out-9');
    });

    it('skips partially corrupt files (some valid, some invalid)', () => {
      const lines =
        [
          makeOutcomeLine({ id: 'valid-1' }),
          '{"id":"x","cli":"claude"}', // missing required fields
          '{invalid json',
          makeOutcomeLine({ id: 'valid-2' }),
        ].join('\n') + '\n';
      writeFileSync(filePath, lines);

      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store.size).toBe(2);
      const entries = store.query();
      expect(entries[0]?.id).toBe('valid-1');
      expect(entries[1]?.id).toBe('valid-2');
    });
  });

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  describe('persistence', () => {
    it('writes each append to disk', () => {
      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });

      store.append(makeOutcome({ id: 'new-1' }));
      store.append(makeOutcome({ id: 'new-2' }));

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0] ?? '') as TaskOutcome;
      const parsed2 = JSON.parse(lines[1] ?? '') as TaskOutcome;
      expect(parsed1.id).toBe('new-1');
      expect(parsed2.id).toBe('new-2');
    });

    it('appends to existing file content', () => {
      writeFileSync(filePath, makeOutcomeLine({ id: 'existing' }) + '\n');

      const store = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      store.append(makeOutcome({ id: 'appended' }));

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });

    it('creates the data directory if it does not exist', () => {
      const nestedDir = join(tmpDir, 'nested', 'deep');
      const nestedFile = join(nestedDir, 'outcomes.jsonl');

      const store = new PersistentOutcomeStore({
        filePath: nestedFile,
        dataDir: nestedDir,
      });
      store.append(makeOutcome({ id: 'nested-1' }));

      expect(existsSync(nestedFile)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Graceful degradation
  // --------------------------------------------------------------------------

  describe('graceful degradation', () => {
    it('logs warning on hydration read error (non-file path)', () => {
      // Point to a directory instead of a file — readFileSync will throw
      const store = new PersistentOutcomeStore({
        filePath: tmpDir, // a directory, not a file
        dataDir: tmpDir,
      });
      // Should not throw, just log warning and start empty
      expect(store.size).toBe(0);
    });

    it('logs warning on persist write error', () => {
      const readonlyDir = join(tmpDir, 'readonly');
      mkdirSync(readonlyDir, { recursive: true });
      // Point to a path inside a non-existent dir to cause write failure
      const badPath = join(tmpDir, 'no-such-dir', 'outcomes.jsonl');

      const store = new PersistentOutcomeStore({
        filePath: badPath,
        dataDir: tmpDir,
      });
      // Should not throw on append even if write fails
      expect(() => {
        store.append(makeOutcome());
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Round-trip
  // --------------------------------------------------------------------------

  describe('round-trip', () => {
    it('survives save → load cycle', () => {
      const store1 = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      store1.append(makeOutcome({ id: 'rt-1', cli: 'claude', success: true }));
      store1.append(makeOutcome({ id: 'rt-2', cli: 'gemini', success: false }));
      store1.append(makeOutcome({ id: 'rt-3', cli: 'codex', durationMs: 5000 }));

      // Create a new store from the same file (simulates restart)
      const store2 = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(store2.size).toBe(3);

      const entries = store2.query();
      expect(entries[0]?.id).toBe('rt-1');
      expect(entries[1]?.cli).toBe('gemini');
      expect(entries[2]?.durationMs).toBe(5000);
    });

    it('preserves data through multiple restart cycles', () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        const store = new PersistentOutcomeStore({
          filePath,
          dataDir: tmpDir,
        });
        store.append(makeOutcome({ id: `cycle-${String(cycle)}` }));
      }

      const finalStore = new PersistentOutcomeStore({
        filePath,
        dataDir: tmpDir,
      });
      expect(finalStore.size).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Feature flag integration
  // --------------------------------------------------------------------------

  describe('feature flag integration', () => {
    beforeEach(() => {
      resetOutcomeStore();
    });

    afterEach(() => {
      resetOutcomeStore();
      delete process.env['NEXUS_PERSIST_LEARNING'];
    });

    it('getOutcomeStore returns plain store when flag is explicitly false', () => {
      process.env['NEXUS_PERSIST_LEARNING'] = 'false';
      resetOutcomeStore();
      const store = getOutcomeStore();
      expect(store).not.toBeInstanceOf(PersistentOutcomeStore);
    });

    it('getOutcomeStore returns persistent store when flag is on and factory registered', () => {
      process.env['NEXUS_PERSIST_LEARNING'] = 'true';
      resetOutcomeStore();
      // Factory was registered at import time by outcome-store-persistence.ts
      // Re-register pointing to our tmp dir for test isolation
      registerPersistentOutcomeStoreFactory(
        () => new PersistentOutcomeStore({ filePath, dataDir: tmpDir })
      );
      const store = getOutcomeStore();
      expect(store).toBeInstanceOf(PersistentOutcomeStore);
    });

    it('factory is auto-registered by side-effect import from barrel', async () => {
      // Import the barrel — the side-effect import in outcomes/index.ts
      // should trigger outcome-store-persistence.ts module load,
      // which calls registerPersistentOutcomeStoreFactory() at module scope.
      await import('./index.js');

      process.env['NEXUS_PERSIST_LEARNING'] = 'true';
      resetOutcomeStore();
      // Factory should already be registered from the barrel import
      const store = getOutcomeStore();
      expect(store).toBeInstanceOf(PersistentOutcomeStore);
    });
  });
});
