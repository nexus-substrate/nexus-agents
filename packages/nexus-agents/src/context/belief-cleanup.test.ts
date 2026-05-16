/**
 * Tests for the Phase 9 belief-pollution cleanup script.
 *
 * Covers (1) the classifier's positive + negative cases, (2) the
 * idempotency marker, and (3) the storage-aware driver's removal +
 * marker-write flow.
 *
 * @module context/belief-cleanup.test
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  classifyBelief,
  classifyBeliefs,
  readBeliefCleanupMarker,
  runBeliefCleanup,
} from './belief-cleanup.js';
import { BeliefConfidence, BeliefSourceType, type Belief } from './belief-core-types.js';
import { HindsightBeliefMemory } from './belief-memory.js';

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    beliefId: `b-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'A real paper',
    predicate: 'has_topic',
    object: 'agents',
    confidence: BeliefConfidence.MEDIUM,
    sourceType: BeliefSourceType.OBSERVATION,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    superseded: false,
    ...overrides,
  };
}

describe('classifyBelief', () => {
  it('flags rows where subject matches "arXiv Query: search_query="', () => {
    const b = makeBelief({
      subject: 'arXiv Query: search_query=quantum&id_list=&start=0&max_results=10',
    });
    const decision = classifyBelief(b);
    expect(decision.polluted).toBe(true);
    expect(decision.matchedPattern).toBeDefined();
  });

  it('flags rows where object carries the id_list=...max_results= pattern', () => {
    const b = makeBelief({ object: 'id_list=2401.1234&start=0&max_results=10' });
    const decision = classifyBelief(b);
    expect(decision.polluted).toBe(true);
  });

  it('keeps real beliefs intact', () => {
    const b = makeBelief();
    expect(classifyBelief(b).polluted).toBe(false);
  });

  it("keeps beliefs whose text *mentions* arxiv but isn't a query-string", () => {
    const b = makeBelief({
      subject: 'arXiv:2401.12345',
      object: 'Memory-augmented agents paper',
    });
    expect(classifyBelief(b).polluted).toBe(false);
  });

  it('classifyBeliefs returns one decision per input', () => {
    const ds = classifyBeliefs([
      makeBelief(),
      makeBelief({ subject: 'arXiv Query: search_query=&id_list=' }),
    ]);
    expect(ds).toHaveLength(2);
    expect(ds[0]?.polluted).toBe(false);
    expect(ds[1]?.polluted).toBe(true);
  });
});

describe('runBeliefCleanup', () => {
  let markerDir: string;

  beforeEach(() => {
    markerDir = mkdtempSync(join(tmpdir(), 'belief-cleanup-'));
  });

  afterEach(() => {
    rmSync(markerDir, { recursive: true, force: true });
  });

  it('removes polluted rows and keeps clean ones', async () => {
    const beliefs = [
      makeBelief({ beliefId: 'keep-1' }),
      makeBelief({
        beliefId: 'drop-1',
        subject: 'arXiv Query: search_query=&id_list=&max_results=10',
      }),
      makeBelief({ beliefId: 'keep-2' }),
    ];
    const deleted: string[] = [];
    const result = await runBeliefCleanup({
      loadBeliefs: () => Promise.resolve(beliefs),
      deleteBelief: (id) => {
        deleted.push(id);
        return Promise.resolve();
      },
      markerDir,
    });
    expect(result.scanned).toBe(3);
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(2);
    expect(deleted).toEqual(['drop-1']);
  });

  it('writes a marker file after first run', async () => {
    await runBeliefCleanup({
      loadBeliefs: () => Promise.resolve([]),
      deleteBelief: () => Promise.resolve(),
      markerDir,
    });
    const marker = readBeliefCleanupMarker(markerDir);
    expect(marker).not.toBeNull();
    expect((marker as { scanned: number }).scanned).toBe(0);
  });

  it('skips subsequent runs once the marker exists', async () => {
    let calls = 0;
    const load = (): Promise<readonly Belief[]> => {
      calls++;
      return Promise.resolve([]);
    };
    await runBeliefCleanup({
      loadBeliefs: load,
      deleteBelief: () => Promise.resolve(),
      markerDir,
    });
    const second = await runBeliefCleanup({
      loadBeliefs: load,
      deleteBelief: () => Promise.resolve(),
      markerDir,
    });
    expect(calls).toBe(1);
    expect(second.skipped).toBe(true);
  });

  it('force option overrides the marker', async () => {
    await runBeliefCleanup({
      loadBeliefs: () => Promise.resolve([]),
      deleteBelief: () => Promise.resolve(),
      markerDir,
    });
    let calls = 0;
    const result = await runBeliefCleanup({
      loadBeliefs: () => {
        calls++;
        return Promise.resolve([]);
      },
      deleteBelief: () => Promise.resolve(),
      markerDir,
      force: true,
    });
    expect(calls).toBe(1);
    expect(result.skipped).toBe(false);
  });

  it('marker captures samples of the first 3 polluted subjects', async () => {
    const polluted = Array.from({ length: 5 }, (_, i) =>
      makeBelief({
        beliefId: `drop-${String(i)}`,
        subject: `arXiv Query: search_query=topic${String(i)}&id_list=&max_results=10`,
      })
    );
    const result = await runBeliefCleanup({
      loadBeliefs: () => Promise.resolve(polluted),
      deleteBelief: () => Promise.resolve(),
      markerDir,
    });
    expect(result.samples).toHaveLength(3);
    expect(result.samples[0]).toContain('arXiv Query:');
  });

  it('async load + deleteBelief callbacks work', async () => {
    const beliefs = [
      makeBelief({
        beliefId: 'drop',
        subject: 'arXiv Query: search_query=x&id_list=&max_results=10',
      }),
    ];
    const deleted: string[] = [];
    const result = await runBeliefCleanup({
      loadBeliefs: () => Promise.resolve(beliefs),
      deleteBelief: (id) => Promise.resolve().then(() => void deleted.push(id)),
      markerDir,
    });
    expect(result.removed).toBe(1);
    expect(deleted).toEqual(['drop']);
  });
});

describe('runBeliefCleanup against a real HindsightBeliefMemory', () => {
  let markerDir: string;

  beforeEach(() => {
    markerDir = mkdtempSync(join(tmpdir(), 'belief-cleanup-integration-'));
  });

  afterEach(() => {
    rmSync(markerDir, { recursive: true, force: true });
  });

  it('removes polluted rows from HindsightBeliefMemory via forget()', async () => {
    const beliefs = new HindsightBeliefMemory();
    // Two clean retains + one polluted (the bug shape).
    await beliefs.retain({
      subject: 'Real paper title',
      predicate: 'has_topic',
      object: 'agents',
      confidence: BeliefConfidence.MEDIUM,
      sourceType: BeliefSourceType.OBSERVATION,
    });
    await beliefs.retain({
      subject: 'arXiv Query: search_query=quantum&id_list=&max_results=10',
      predicate: 'pollution',
      object: 'feed-fallback bug pre-#2755',
      confidence: BeliefConfidence.LOW,
      sourceType: BeliefSourceType.OBSERVATION,
    });
    await beliefs.retain({
      subject: 'Another real one',
      predicate: 'has_topic',
      object: 'memory',
      confidence: BeliefConfidence.HIGH,
      sourceType: BeliefSourceType.OBSERVATION,
    });

    const result = await runBeliefCleanup({
      loadBeliefs: async () => {
        const q = await beliefs.query({ includeSuperseded: true });
        return q.ok ? q.value : [];
      },
      deleteBelief: async (id) => {
        await beliefs.forget(id);
      },
      markerDir,
    });

    expect(result.scanned).toBe(3);
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(2);

    const remaining = await beliefs.query({ includeSuperseded: true });
    expect(remaining.ok).toBe(true);
    if (remaining.ok) {
      expect(remaining.value).toHaveLength(2);
      for (const b of remaining.value) {
        expect(b.subject).not.toMatch(/arXiv Query/i);
      }
    }
  });
});

describe('readBeliefCleanupMarker', () => {
  it('returns null when marker is absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'belief-marker-'));
    expect(readBeliefCleanupMarker(tmp)).toBeNull();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns parsed JSON when marker is present', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'belief-marker-'));
    await runBeliefCleanup({
      loadBeliefs: () => Promise.resolve([]),
      deleteBelief: () => Promise.resolve(),
      markerDir: tmp,
    });
    const m = readBeliefCleanupMarker(tmp) as Record<string, unknown>;
    expect(typeof m.completedAt).toBe('string');
    rmSync(tmp, { recursive: true, force: true });
    expect(existsSync(join(tmp, '.belief-cleanup-done'))).toBe(false);
  });
});
