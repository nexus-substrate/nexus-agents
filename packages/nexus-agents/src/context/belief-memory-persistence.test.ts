/**
 * Tests for belief-memory-persistence module.
 * Covers snapshot creation, hydration, save/load, and FIFO retention.
 *
 * @module context/belief-memory-persistence.test
 * (Source: Issue #714 Phase 3 - Unified memory persistence)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import type { ILogger } from '../core/logger.js';
import type { Belief } from './belief-core-types.js';
import type { BeliefUpdate } from './belief-update-types.js';
import type { Counterfactual, HindsightRecord } from './belief-hindsight-types.js';
import {
  createSnapshot,
  hydrateSnapshot,
  saveBeliefSnapshot,
  loadBeliefSnapshot,
  type BeliefMemoryData,
  type BeliefSnapshot,
} from './belief-memory-persistence.js';

// ============================================================================
// Mock File System (ESM-compatible)
// ============================================================================

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn().mockReturnValue(''),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ILogger;
}

function createTestBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    beliefId: 'belief-001',
    subject: 'nexus-agents',
    predicate: 'supports',
    object: 'multi-agent orchestration',
    confidence: 'high',
    sourceType: 'observation',
    sourceRef: 'test-source',
    version: 1,
    createdAt: new Date('2026-01-15T12:00:00Z'),
    updatedAt: new Date('2026-01-15T12:00:00Z'),
    superseded: false,
    domain: 'architecture',
    ...overrides,
  };
}

function createTestUpdate(): BeliefUpdate {
  return {
    updateId: 'update-001',
    beliefId: 'belief-001',
    updateType: 'retain',
    newState: { subject: 'nexus-agents' },
    reason: 'Initial creation',
    timestamp: new Date('2026-01-15T12:00:00Z'),
  };
}

function createTestCounterfactual(): Counterfactual {
  return {
    counterfactualId: 'cf-001',
    hypothesis: 'What if we used a different consensus algorithm?',
    affectedBeliefs: ['belief-001'],
    predictedOutcomes: ['Better agreement'],
    validated: false,
    createdAt: new Date('2026-01-15T12:00:00Z'),
  };
}

function createTestHindsightRecord(): HindsightRecord {
  return {
    hindsightId: 'hs-001',
    taskId: 'task-001',
    priorBeliefs: ['belief-001'],
    expectedOutcome: 'Success',
    actualOutcome: 'Success',
    outcomeMatched: true,
    correctedBeliefs: [],
    newBeliefs: [],
    lessons: ['System works as expected'],
    createdAt: new Date('2026-01-15T12:00:00Z'),
  };
}

function createTestData(): BeliefMemoryData {
  const beliefs = new Map<string, Belief>();
  beliefs.set('belief-001', createTestBelief());
  beliefs.set(
    'belief-002',
    createTestBelief({
      beliefId: 'belief-002',
      subject: 'memory',
      predicate: 'persists-to',
      object: 'disk',
      confidence: 'medium',
      superseded: true,
      supersededBy: 'belief-003',
    })
  );

  const updates = new Map<string, BeliefUpdate[]>();
  updates.set('belief-001', [createTestUpdate()]);

  const counterfactuals = new Map<string, Counterfactual>();
  counterfactuals.set('cf-001', createTestCounterfactual());

  const hindsightRecords = new Map<string, HindsightRecord[]>();
  hindsightRecords.set('task-001', [createTestHindsightRecord()]);

  return { beliefs, updates, counterfactuals, hindsightRecords };
}

// ============================================================================
// Tests
// ============================================================================

describe('belief-memory-persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Restore default mock implementations after each test
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue('');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      /* no-op */
    });
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      /* no-op */
    });
  });

  describe('createSnapshot', () => {
    it('serializes beliefs with Date fields as ISO strings', () => {
      const data = createTestData();
      const snapshot = createSnapshot(data);

      expect(snapshot.version).toBe(1);
      expect(snapshot.beliefs).toHaveLength(2);
      expect(snapshot.beliefs[0]?.createdAt).toBe('2026-01-15T12:00:00.000Z');
      expect(snapshot.beliefs[0]?.updatedAt).toBe('2026-01-15T12:00:00.000Z');
    });

    it('serializes update records', () => {
      const data = createTestData();
      const snapshot = createSnapshot(data);

      expect(snapshot.updates).toHaveLength(1);
      expect(snapshot.updates[0]?.beliefId).toBe('belief-001');
      expect(snapshot.updates[0]?.records).toHaveLength(1);
      expect(snapshot.updates[0]?.records[0]?.timestamp).toBe('2026-01-15T12:00:00.000Z');
    });

    it('serializes counterfactuals', () => {
      const data = createTestData();
      const snapshot = createSnapshot(data);

      expect(snapshot.counterfactuals).toHaveLength(1);
      expect(snapshot.counterfactuals[0]?.createdAt).toBe('2026-01-15T12:00:00.000Z');
    });

    it('serializes hindsight records', () => {
      const data = createTestData();
      const snapshot = createSnapshot(data);

      expect(snapshot.hindsightRecords).toHaveLength(1);
      expect(snapshot.hindsightRecords[0]?.records).toHaveLength(1);
    });

    it('handles empty data', () => {
      const emptyData: BeliefMemoryData = {
        beliefs: new Map(),
        updates: new Map(),
        counterfactuals: new Map(),
        hindsightRecords: new Map(),
      };
      const snapshot = createSnapshot(emptyData);

      expect(snapshot.beliefs).toHaveLength(0);
      expect(snapshot.updates).toHaveLength(0);
      expect(snapshot.counterfactuals).toHaveLength(0);
      expect(snapshot.hindsightRecords).toHaveLength(0);
    });

    it('handles beliefs without optional fields', () => {
      const belief: Belief = {
        beliefId: 'belief-bare',
        subject: 'test',
        predicate: 'has',
        object: 'no-optionals',
        confidence: 'high',
        sourceType: 'observation',
        version: 1,
        createdAt: new Date('2026-01-15T12:00:00Z'),
        updatedAt: new Date('2026-01-15T12:00:00Z'),
        superseded: false,
      };
      const data: BeliefMemoryData = {
        beliefs: new Map([['belief-001', belief]]),
        updates: new Map(),
        counterfactuals: new Map(),
        hindsightRecords: new Map(),
      };
      const snapshot = createSnapshot(data);

      expect(snapshot.beliefs).toHaveLength(1);
      expect(snapshot.beliefs[0]?.sourceRef).toBeUndefined();
      expect(snapshot.beliefs[0]?.domain).toBeUndefined();
    });

    it('produces valid JSON-serializable output', () => {
      const data = createTestData();
      const snapshot = createSnapshot(data);
      const json = JSON.stringify(snapshot);
      const parsed = JSON.parse(json) as unknown;

      expect(parsed).toBeDefined();
      expect(typeof json).toBe('string');
    });
  });

  describe('hydrateSnapshot', () => {
    it('round-trips through createSnapshot + hydrateSnapshot', () => {
      const original = createTestData();
      const snapshot = createSnapshot(original);
      const hydrated = hydrateSnapshot(snapshot);

      expect(hydrated.beliefs.size).toBe(2);
      expect(hydrated.updates.size).toBe(1);
      expect(hydrated.counterfactuals.size).toBe(1);
      expect(hydrated.hindsightRecords.size).toBe(1);
    });

    it('restores Date fields from ISO strings', () => {
      const original = createTestData();
      const snapshot = createSnapshot(original);
      const hydrated = hydrateSnapshot(snapshot);

      const belief = hydrated.beliefs.get('belief-001');
      expect(belief?.createdAt).toBeInstanceOf(Date);
      expect(belief?.createdAt.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    });

    it('preserves belief content through round-trip', () => {
      const original = createTestData();
      const snapshot = createSnapshot(original);
      const hydrated = hydrateSnapshot(snapshot);

      const belief = hydrated.beliefs.get('belief-001');
      expect(belief?.subject).toBe('nexus-agents');
      expect(belief?.predicate).toBe('supports');
      expect(belief?.object).toBe('multi-agent orchestration');
      expect(belief?.confidence).toBe('high');
      expect(belief?.sourceType).toBe('observation');
    });

    it('preserves superseded metadata through round-trip', () => {
      const original = createTestData();
      const snapshot = createSnapshot(original);
      const hydrated = hydrateSnapshot(snapshot);

      const superseded = hydrated.beliefs.get('belief-002');
      expect(superseded?.superseded).toBe(true);
      expect(superseded?.supersededBy).toBe('belief-003');
    });

    it('handles empty snapshot', () => {
      const emptySnapshot: BeliefSnapshot = {
        version: 1,
        exportedAt: new Date().toISOString(),
        beliefs: [],
        updates: [],
        counterfactuals: [],
        hindsightRecords: [],
      };
      const hydrated = hydrateSnapshot(emptySnapshot);

      expect(hydrated.beliefs.size).toBe(0);
      expect(hydrated.updates.size).toBe(0);
    });

    it('round-trips through JSON serialization', () => {
      const original = createTestData();
      const snapshot = createSnapshot(original);
      const json = JSON.stringify(snapshot);
      const reparsed = JSON.parse(json) as BeliefSnapshot;
      const hydrated = hydrateSnapshot(reparsed);

      expect(hydrated.beliefs.size).toBe(2);
      const belief = hydrated.beliefs.get('belief-001');
      expect(belief?.createdAt).toBeInstanceOf(Date);
      expect(belief?.subject).toBe('nexus-agents');
    });
  });

  describe('saveBeliefSnapshot', () => {
    it('saves snapshot to disk and returns filepath', () => {
      const logger = createMockLogger();
      const data = createTestData();

      const result = saveBeliefSnapshot(data, logger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('beliefs-');
        expect(result.value).toContain('.json');
      }
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('handles write errors gracefully', () => {
      const logger = createMockLogger();
      const data = createTestData();

      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const result = saveBeliefSnapshot(data, logger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Disk full');
      }
    });

    it('calls enforceRetention after save', () => {
      const logger = createMockLogger();
      const data = createTestData();

      // Return many files to trigger retention
      vi.mocked(fs.readdirSync).mockReturnValue(
        Array.from(
          { length: 15 },
          (_, i) => `beliefs-2026-01-${String(i + 1).padStart(2, '0')}.json`
        ) as unknown as ReturnType<typeof fs.readdirSync>
      );

      saveBeliefSnapshot(data, logger);

      // Should have called unlinkSync for files beyond retention
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('loadBeliefSnapshot', () => {
    it('returns null when no snapshot files exist', () => {
      const logger = createMockLogger();

      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = loadBeliefSnapshot(logger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('loads and hydrates a valid snapshot file', () => {
      const logger = createMockLogger();
      const data = createTestData();
      const snapshot = createSnapshot(data);
      const content = JSON.stringify(snapshot);

      vi.mocked(fs.readdirSync).mockReturnValue([
        'beliefs-2026-01-15.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const result = loadBeliefSnapshot(logger);

      expect(result.ok).toBe(true);
      if (result.ok && result.value !== null) {
        expect(result.value.beliefs.size).toBe(2);
        expect(result.value.updates.size).toBe(1);
      }
    });

    it('skips invalid snapshot files and tries next', () => {
      const logger = createMockLogger();

      vi.mocked(fs.readdirSync).mockReturnValue([
        'beliefs-2026-01-16.json',
        'beliefs-2026-01-15.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const data = createTestData();
      const validSnapshot = JSON.stringify(createSnapshot(data));
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('invalid json{{{')
        .mockReturnValueOnce(validSnapshot);

      const result = loadBeliefSnapshot(logger);

      expect(result.ok).toBe(true);
      if (result.ok && result.value !== null) {
        expect(result.value.beliefs.size).toBe(2);
      }
    });

    it('returns null when all snapshots are invalid', () => {
      const logger = createMockLogger();

      vi.mocked(fs.readdirSync).mockReturnValue([
        'beliefs-2026-01-15.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');

      const result = loadBeliefSnapshot(logger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });
});
