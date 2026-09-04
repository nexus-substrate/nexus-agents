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
import { DEFAULT_DISTILLER_CONFIG } from './strategy-distiller-types.js';
import { sigmoidConfidence, effectFor } from './strategy-distiller.js';
import type { ILogger } from '../core/index.js';

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
    support: 0.8,
    effect: 1,
    observationCount: 40,
    metric: 0.7,
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
    tainted: false,
    ...overrides,
  };
}

/**
 * A rule as persisted BEFORE #5004 finding 3: `confidence` was the sigmoid over
 * observations and `support`/`effect` did not exist. Typed loosely on purpose —
 * this is the on-disk shape, not the current interface.
 */
function makeLegacyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'failure-rate:claude:code_generation',
    patternType: 'failure-rate',
    cli: 'claude',
    category: 'code_generation',
    action: 'penalize',
    confidence: sigmoidConfidence(40),
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

    describe('legacy records without support/effect (#5004 finding 3)', () => {
      function makeLogger(): ILogger & { debugCalls: Array<[string, unknown]> } {
        const debugCalls: Array<[string, unknown]> = [];
        const logger: ILogger & { debugCalls: Array<[string, unknown]> } = {
          debugCalls,
          debug: (message, context) => {
            debugCalls.push([message, context]);
          },
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
          child: () => logger,
          setLevel: () => undefined,
        };
        return logger;
      }

      it('derives support from observations and effect from the persisted metric', () => {
        // The pre-#5004 on-disk shape: `confidence` = sigmoid(observations), no
        // `support`, no `effect`.
        const snapshot = { version: 1, savedAt: 'then', rules: [makeLegacyRecord()] };
        writeFileSync(filePath, JSON.stringify(snapshot));
        const logger = makeLogger();

        const distiller = new PersistentStrategyDistiller(
          new OutcomeStore(),
          { filePath, dataDir: tmpDir },
          logger
        );

        const rule = distiller.getRules()[0];
        expect(rule).toBeDefined();
        if (rule === undefined) return;
        const support = sigmoidConfidence(40);
        const effect = effectFor('failure-rate', 0.7, DEFAULT_DISTILLER_CONFIG); // 0.25
        expect(rule.support).toBeCloseTo(support, 10);
        expect(rule.effect).toBeCloseTo(effect, 10);
        expect(rule.effect).toBeCloseTo(0.25, 10);
        // The persisted sigmoid-only confidence is replaced by the product so
        // routing never multiplies by a sample-size-only value again.
        expect(rule.confidence).toBeCloseTo(support * effect, 10);
        expect(Number.isNaN(rule.confidence)).toBe(false);

        expect(
          logger.debugCalls.some(([message]) => /legacy/i.test(message) || /support/i.test(message))
        ).toBe(true);
      });

      it('recomputes effect with the CURRENT threshold, not the one the rule was distilled under', () => {
        writeFileSync(
          filePath,
          JSON.stringify({ version: 1, savedAt: 'then', rules: [makeLegacyRecord()] })
        );

        const distiller = new PersistentStrategyDistiller(
          new OutcomeStore(),
          { filePath, dataDir: tmpDir },
          undefined,
          { failureRateThreshold: 0.5 }
        );

        // (0.7 - 0.5) / (1 - 0.5)
        expect(distiller.getRules()[0]?.effect).toBeCloseTo(0.4, 10);
      });

      it('leaves a record that already carries support/effect untouched', () => {
        const rule = makeRule({ confidence: 0.3, support: 0.6, effect: 0.5 });
        writeFileSync(filePath, JSON.stringify(makeSnapshot([rule])));
        const logger = makeLogger();

        const distiller = new PersistentStrategyDistiller(
          new OutcomeStore(),
          { filePath, dataDir: tmpDir },
          logger
        );

        const loaded = distiller.getRules()[0];
        expect(loaded?.support).toBe(0.6);
        expect(loaded?.effect).toBe(0.5);
        expect(loaded?.confidence).toBe(0.3);
        expect(logger.debugCalls.some(([message]) => /legacy/i.test(message))).toBe(false);
      });

      it('loadPersistedRules hydrates legacy records the same way', () => {
        writeFileSync(
          filePath,
          JSON.stringify({ version: 1, savedAt: 'then', rules: [makeLegacyRecord()] })
        );

        const [rule] = loadPersistedRules(filePath);
        expect(rule).toBeDefined();
        expect(rule?.support).toBeCloseTo(sigmoidConfidence(40), 10);
        expect(rule?.effect).toBeCloseTo(0.25, 10);
        expect(rule?.confidence).toBeCloseTo(sigmoidConfidence(40) * 0.25, 10);
      });
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

    it('persists support and effect at distill time (#5004 finding 3)', () => {
      // Effect is a function of the threshold, which is config. Persisting it
      // pins the value the rule was distilled under; recomputing on load would
      // silently rescale every old rule when the threshold changes.
      const store = new OutcomeStore();
      populateFailures(store, 10);
      const distiller = new PersistentStrategyDistiller(
        store,
        { filePath, dataDir: tmpDir },
        undefined,
        { failureRateThreshold: 0.5, minObservationsForDraft: 3 }
      );
      distiller.distill();

      const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
      const persisted = (raw as { rules: Array<Record<string, unknown>> }).rules[0];
      expect(persisted?.['support']).toBeCloseTo(sigmoidConfidence(10), 10);
      expect(persisted?.['effect']).toBe(1); // 10/10 failed
      expect(persisted?.['confidence']).toBeCloseTo(sigmoidConfidence(10), 10);
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
