/**
 * Integration tests for cross-session learning persistence (Issue #1009).
 *
 * End-to-end tests: append outcomes → distill → simulate restart → hydrate →
 * verify rules are preserved. Also tests feature flag off behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { PersistentOutcomeStore } from '../orchestration/outcomes/outcome-store-persistence.js';
import { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { PersistentStrategyDistiller } from './strategy-distiller-persistence.js';
import { StrategyDistiller } from './strategy-distiller.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `nexus-integ-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeOutcome(overrides?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: `out-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-5-20250929',
    success: false,
    durationMs: 1200,
    timestamp: '2026-02-07T10:00:00Z',
    source: 'delegate',
    ...overrides,
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Learning Persistence Integration', () => {
  let tmpDir: string;
  let outcomesFile: string;
  let rulesFile: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    outcomesFile = join(tmpDir, 'outcomes.jsonl');
    rulesFile = join(tmpDir, 'rules.json');
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('end-to-end: outcomes → distill → restart → rules preserved', () => {
    // Session 1: accumulate outcomes and distill rules
    const store1 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });

    for (let i = 0; i < 15; i++) {
      store1.append(
        makeOutcome({
          id: `s1-${String(i)}`,
          cli: 'claude',
          category: 'code_generation',
          success: false,
        })
      );
    }

    const distiller1 = new PersistentStrategyDistiller(
      store1,
      { filePath: rulesFile, dataDir: tmpDir },
      undefined,
      { failureRateThreshold: 0.5, minObservationsForDraft: 3 }
    );
    distiller1.distill();

    const session1Rules = distiller1.getRules();
    expect(session1Rules.length).toBeGreaterThan(0);
    expect(store1.size).toBe(15);

    // Session 2: simulate restart — new instances, same files
    const store2 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    expect(store2.size).toBe(15);

    const distiller2 = new PersistentStrategyDistiller(
      store2,
      { filePath: rulesFile, dataDir: tmpDir },
      undefined,
      { failureRateThreshold: 0.5, minObservationsForDraft: 3 }
    );

    const session2Rules = distiller2.getRules();
    expect(session2Rules).toHaveLength(session1Rules.length);

    for (const rule of session1Rules) {
      const loaded = session2Rules.find((r) => r.id === rule.id);
      expect(loaded).toBeDefined();
      expect(loaded?.confidence).toBe(rule.confidence);
    }
  });

  it('outcomes grow across sessions', () => {
    // Session 1
    const store1 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    store1.append(makeOutcome({ id: 'session1-1' }));
    store1.append(makeOutcome({ id: 'session1-2' }));
    expect(store1.size).toBe(2);

    // Session 2
    const store2 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    expect(store2.size).toBe(2);
    store2.append(makeOutcome({ id: 'session2-1' }));
    expect(store2.size).toBe(3);

    // Session 3
    const store3 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    expect(store3.size).toBe(3);
  });

  it('rules evolve across distill cycles', () => {
    const store = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });

    // Cycle 1: failures for claude
    for (let i = 0; i < 10; i++) {
      store.append(makeOutcome({ id: `c1-${String(i)}`, cli: 'claude', success: false }));
    }

    const d1 = new PersistentStrategyDistiller(
      store,
      { filePath: rulesFile, dataDir: tmpDir },
      undefined,
      { failureRateThreshold: 0.5, successRateThreshold: 0.7, minObservationsForDraft: 3 }
    );
    d1.distill();
    const count1 = d1.getRules().length;

    // Cycle 2: add successes for gemini (simulate restart with new store)
    const store2 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    for (let i = 0; i < 10; i++) {
      store2.append(
        makeOutcome({
          id: `c2-${String(i)}`,
          cli: 'gemini',
          category: 'research',
          success: true,
        })
      );
    }

    const d2 = new PersistentStrategyDistiller(
      store2,
      { filePath: rulesFile, dataDir: tmpDir },
      undefined,
      { failureRateThreshold: 0.5, successRateThreshold: 0.7, minObservationsForDraft: 3 }
    );
    d2.distill();
    // Should have rules from both cycles
    expect(d2.getRules().length).toBeGreaterThanOrEqual(count1);
  });

  it('feature flag off → no files created', () => {
    // When not using persistent stores, no files should be created
    const plainStore = new OutcomeStore();
    for (let i = 0; i < 10; i++) {
      plainStore.append(makeOutcome({ id: `plain-${String(i)}` }));
    }

    const plainDistiller = new StrategyDistiller(plainStore, undefined, {
      failureRateThreshold: 0.5,
    });
    plainDistiller.distill();

    // No persistence files should exist
    expect(existsSync(outcomesFile)).toBe(false);
    expect(existsSync(rulesFile)).toBe(false);

    // Rules exist in memory
    expect(plainDistiller.getRules().length).toBeGreaterThan(0);
  });

  it('distiller applies hydrated rules to routing stage', () => {
    // Save rules in session 1
    const store1 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    for (let i = 0; i < 10; i++) {
      store1.append(makeOutcome({ id: `r-${String(i)}`, success: false }));
    }

    const d1 = new PersistentStrategyDistiller(
      store1,
      { filePath: rulesFile, dataDir: tmpDir },
      undefined,
      { failureRateThreshold: 0.5, minObservationsForDraft: 3, minObservationsForActive: 5 }
    );
    d1.distill();
    const activeRules = d1.getRules('active');
    expect(activeRules.length).toBeGreaterThan(0);

    // Session 2: hydrate and verify active rules are accessible
    const store2 = new PersistentOutcomeStore({
      filePath: outcomesFile,
      dataDir: tmpDir,
    });
    const d2 = new PersistentStrategyDistiller(
      store2,
      { filePath: rulesFile, dataDir: tmpDir },
      undefined,
      { failureRateThreshold: 0.5, minObservationsForDraft: 3, minObservationsForActive: 5 }
    );

    // Active rules should be present from hydration
    const hydratedActive = d2.getRules('active');
    expect(hydratedActive.length).toBe(activeRules.length);
  });

  it('handles missing data directory gracefully', () => {
    const deepDir = join(tmpDir, 'a', 'b', 'c');
    const deepFile = join(deepDir, 'outcomes.jsonl');

    // Should create directory automatically
    const store = new PersistentOutcomeStore({
      filePath: deepFile,
      dataDir: deepDir,
    });
    store.append(makeOutcome({ id: 'deep-1' }));

    expect(existsSync(deepFile)).toBe(true);
    expect(store.size).toBe(1);
  });
});
