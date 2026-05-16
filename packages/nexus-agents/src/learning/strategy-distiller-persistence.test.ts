/**
 * Tests for PersistentStrategyDistiller (Issue #1009).
 *
 * Covers: hydration from JSON, atomic persistence, corruption handling,
 * schema validation, version check, and round-trip save→load.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import {
  PersistentStrategyDistiller,
  RulesSnapshotSchema,
  loadPersistedRules,
} from './strategy-distiller-persistence.js';
import type { RulesSnapshot } from './strategy-distiller-persistence.js';
import type { DistilledRule } from './strategy-distiller-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `nexus-rules-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeRule(overrides?: Partial<DistilledRule>): DistilledRule {
  return {
    id: 'failure-rate:claude:code_generation',
    patternType: 'failure-rate',
    cli: 'claude',
    category: 'code_generation',
    action: 'penalize',
    confidence: 0.8,
    observationCount: 40,
    metric: 0.7,
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
    tainted: false,
    ...overrides,
  };
}

function makeSnapshot(rules: DistilledRule[]): RulesSnapshot {
  return {
    version: 1,
    savedAt: '2026-02-13T10:00:00Z',
    rules,
  };
}

function makeOutcome(overrides?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: `out-${String(Date.now())}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-6',
    success: false,
    durationMs: 1200,
    timestamp: '2026-02-07T10:00:00Z',
    source: 'delegate',
    ...overrides,
  };
}

// Populate an OutcomeStore with enough failure outcomes to trigger pattern detection
function populateFailures(store: OutcomeStore, count: number): void {
  for (let i = 0; i < count; i++) {
    store.append(makeOutcome({ id: `fail-${String(i)}`, success: false }));
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('PersistentStrategyDistiller', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    filePath = join(tmpDir, 'rules.json');
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
    it('starts with no rules when no file exists', () => {
      const store = new OutcomeStore();
      const distiller = new PersistentStrategyDistiller(store, {
        filePath,
        dataDir: tmpDir,
      });
      expect(distiller.getRules()).toHaveLength(0);
    });

    it('hydrates valid rules from snapshot file', () => {
      const rules = [
        makeRule({ id: 'failure-rate:claude:code_generation' }),
        makeRule({
          id: 'success-rate:gemini:research',
          cli: 'gemini',
          patternType: 'success-rate',
          action: 'boost',
        }),
      ];
      writeFileSync(filePath, JSON.stringify(makeSnapshot(rules)));

      const store = new OutcomeStore();
      const distiller = new PersistentStrategyDistiller(store, {
        filePath,
        dataDir: tmpDir,
      });
      expect(distiller.getRules()).toHaveLength(2);
    });

    it('starts fresh on corrupt JSON', () => {
      writeFileSync(filePath, '{not valid json');

      const store = new OutcomeStore();
      const distiller = new PersistentStrategyDistiller(store, {
        filePath,
        dataDir: tmpDir,
      });
      expect(distiller.getRules()).toHaveLength(0);
    });

    it('starts fresh on schema mismatch', () => {
      writeFileSync(filePath, JSON.stringify({ version: 99, rules: [] }));

      const store = new OutcomeStore();
      const distiller = new PersistentStrategyDistiller(store, {
        filePath,
        dataDir: tmpDir,
      });
      expect(distiller.getRules()).toHaveLength(0);
    });

    it('validates version number strictly', () => {
      // version: 2 should fail
      writeFileSync(filePath, JSON.stringify({ version: 2, savedAt: 'now', rules: [] }));

      const store = new OutcomeStore();
      const distiller = new PersistentStrategyDistiller(store, {
        filePath,
        dataDir: tmpDir,
      });
      expect(distiller.getRules()).toHaveLength(0);
    });

    it('rejects rules with invalid fields', () => {
      const badSnapshot = {
        version: 1,
        savedAt: 'now',
        rules: [{ id: 'x', patternType: 'unknown-type' }],
      };
      writeFileSync(filePath, JSON.stringify(badSnapshot));

      const store = new OutcomeStore();
      const distiller = new PersistentStrategyDistiller(store, {
        filePath,
        dataDir: tmpDir,
      });
      expect(distiller.getRules()).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  describe('persistence', () => {
    it('saves rules atomically on distill()', () => {
      const store = new OutcomeStore();
      populateFailures(store, 10);

      const distiller = new PersistentStrategyDistiller(
        store,
        { filePath, dataDir: tmpDir },
        undefined,
        { failureRateThreshold: 0.5, minObservationsForDraft: 3 }
      );
      distiller.distill();

      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = RulesSnapshotSchema.parse(JSON.parse(content));
      expect(parsed.version).toBe(1);
      expect(parsed.rules.length).toBeGreaterThan(0);
    });

    it('does not leave temp files on successful write', () => {
      const store = new OutcomeStore();
      populateFailures(store, 10);

      const distiller = new PersistentStrategyDistiller(
        store,
        { filePath, dataDir: tmpDir },
        undefined,
        { failureRateThreshold: 0.5 }
      );
      distiller.distill();

      expect(existsSync(filePath + '.tmp')).toBe(false);
    });

    it('handles write error gracefully', () => {
      const store = new OutcomeStore();
      populateFailures(store, 10);

      // Constructor can create the dir, but let's point to an impossible path
      const distiller = new PersistentStrategyDistiller(
        store,
        { filePath: join('/dev/null/impossible', 'rules.json'), dataDir: tmpDir },
        undefined,
        { failureRateThreshold: 0.5 }
      );
      // Should not throw
      expect(() => {
        distiller.distill();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Round-trip
  // --------------------------------------------------------------------------

  describe('round-trip', () => {
    it('save → load → verify rules match', () => {
      const store = new OutcomeStore();
      populateFailures(store, 10);

      // First distiller: distill + save
      const distiller1 = new PersistentStrategyDistiller(
        store,
        { filePath, dataDir: tmpDir },
        undefined,
        { failureRateThreshold: 0.5, minObservationsForDraft: 3 }
      );
      distiller1.distill();
      const savedRules = distiller1.getRules();
      expect(savedRules.length).toBeGreaterThan(0);

      // Second distiller: hydrate from file
      const store2 = new OutcomeStore();
      const distiller2 = new PersistentStrategyDistiller(
        store2,
        { filePath, dataDir: tmpDir },
        undefined,
        { failureRateThreshold: 0.5, minObservationsForDraft: 3 }
      );
      const loadedRules = distiller2.getRules();

      expect(loadedRules).toHaveLength(savedRules.length);
      for (const saved of savedRules) {
        const loaded = loadedRules.find((r) => r.id === saved.id);
        expect(loaded).toBeDefined();
        expect(loaded?.confidence).toBe(saved.confidence);
        expect(loaded?.action).toBe(saved.action);
        expect(loaded?.status).toBe(saved.status);
      }
    });

    it('accumulates rules across multiple distill+restart cycles', () => {
      // Cycle 1: failure pattern for claude
      const store1 = new OutcomeStore();
      populateFailures(store1, 10);
      const d1 = new PersistentStrategyDistiller(store1, { filePath, dataDir: tmpDir }, undefined, {
        failureRateThreshold: 0.5,
        minObservationsForDraft: 3,
      });
      d1.distill();
      const count1 = d1.getRules().length;
      expect(count1).toBeGreaterThan(0);

      // Cycle 2: add success pattern for gemini
      const store2 = new OutcomeStore();
      for (let i = 0; i < 10; i++) {
        store2.append(
          makeOutcome({
            id: `gem-${String(i)}`,
            cli: 'gemini',
            category: 'research',
            success: true,
          })
        );
      }
      const d2 = new PersistentStrategyDistiller(store2, { filePath, dataDir: tmpDir }, undefined, {
        successRateThreshold: 0.7,
        minObservationsForDraft: 3,
      });
      d2.distill();
      // Should have rules from both cycles
      expect(d2.getRules().length).toBeGreaterThanOrEqual(count1);
    });
  });

  // --------------------------------------------------------------------------
  // RulesSnapshotSchema validation
  // --------------------------------------------------------------------------

  describe('RulesSnapshotSchema', () => {
    it('accepts valid snapshot', () => {
      const result = RulesSnapshotSchema.safeParse(makeSnapshot([makeRule()]));
      expect(result.success).toBe(true);
    });

    it('rejects missing version', () => {
      const result = RulesSnapshotSchema.safeParse({ savedAt: 'now', rules: [] });
      expect(result.success).toBe(false);
    });

    it('rejects wrong version number', () => {
      const result = RulesSnapshotSchema.safeParse({ version: 2, savedAt: 'now', rules: [] });
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // loadPersistedRules — Phase 5 of #2792
  // --------------------------------------------------------------------------

  describe('loadPersistedRules', () => {
    it('returns empty when the file does not exist', () => {
      const missing = join(tmpDir, 'never-written.json');
      expect(loadPersistedRules(missing)).toEqual([]);
    });

    it('returns rules from a valid snapshot file', () => {
      const rules = [makeRule({ id: 'r1' }), makeRule({ id: 'r2', cli: 'gemini' })];
      writeFileSync(filePath, JSON.stringify(makeSnapshot(rules)));
      const loaded = loadPersistedRules(filePath);
      expect(loaded).toHaveLength(2);
      expect(loaded[0]?.id).toBe('r1');
      expect(loaded[1]?.cli).toBe('gemini');
    });

    it('returns empty on corrupt JSON', () => {
      writeFileSync(filePath, '{not valid');
      expect(loadPersistedRules(filePath)).toEqual([]);
    });

    it('returns empty on schema mismatch', () => {
      writeFileSync(filePath, JSON.stringify({ version: 99, rules: [] }));
      expect(loadPersistedRules(filePath)).toEqual([]);
    });

    it('never throws (consumer contract)', () => {
      // Pass an invalid path that resolves through unwritable directories.
      expect(() => loadPersistedRules('/proc/self/nope/rules.json')).not.toThrow();
      expect(loadPersistedRules('/proc/self/nope/rules.json')).toEqual([]);
    });
  });
});
