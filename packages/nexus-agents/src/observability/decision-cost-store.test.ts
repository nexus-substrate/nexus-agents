/**
 * Tests for the JSONL-backed per-decision cost store (#3855).
 *
 * Round-trip persistence (write → hydrate from disk → query), corruption
 * tolerance (inherited from the shared JsonlStore primitive), and the
 * record-via-rollup path.
 *
 * @module observability/decision-cost-store.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DecisionCostStore } from './decision-cost-store.js';
import type { VoterCostInput } from './decision-cost.js';

const TS = '2026-06-17T00:00:00.000Z';

const VOTERS: VoterCostInput[] = [
  {
    role: 'architect',
    model: 'claude-sonnet',
    inputTokens: 1000,
    outputTokens: 200,
    costUsd: 0.006,
  },
  { role: 'security', model: 'claude-sonnet' }, // unmeasured
];

describe('DecisionCostStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'decision-cost-store-'));
    file = join(dir, 'decision-costs.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records a rollup and returns the persisted summary', () => {
    const store = new DecisionCostStore({ filePath: file, dataDir: dir });
    const { record, persisted } = store.record({
      decisionId: 'd1',
      gate: 'consensus_vote',
      voters: VOTERS,
      billingMode: 'api',
      timestamp: TS,
    });

    expect(persisted).toBe(true);
    expect(record.decisionId).toBe('d1');
    expect(record.gate).toBe('consensus_vote');
    expect(record.summary.voterCount).toBe(2);
    expect(record.summary.measuredVoters).toBe(1);
    expect(record.summary.unmeasuredVoters).toBe(1);
    expect(record.summary.totalCostUsd).toBeCloseTo(0.006, 9);
    expect(store.size).toBe(1);
  });

  it('round-trips through disk: a fresh store hydrates the same records', () => {
    const writer = new DecisionCostStore({ filePath: file, dataDir: dir });
    writer.record({
      decisionId: 'd1',
      gate: 'consensus_vote',
      voters: VOTERS,
      billingMode: 'api',
      timestamp: TS,
    });
    writer.record({
      decisionId: 'd2',
      gate: 'pr_review',
      voters: VOTERS,
      billingMode: 'plan',
      timestamp: TS,
    });

    const reader = new DecisionCostStore({ filePath: file, dataDir: dir });
    expect(reader.size).toBe(2);
    expect(reader.all().map((r) => r.decisionId)).toEqual(['d1', 'd2']);
    // Plan-mode record persisted 0 cost but kept tokens.
    const planRec = reader.all().find((r) => r.decisionId === 'd2');
    expect(planRec?.summary.totalCostUsd).toBe(0);
    expect(planRec?.summary.totalTokens).toBe(1200);
  });

  it('skips corrupt lines on hydrate (graceful degradation)', () => {
    const writer = new DecisionCostStore({ filePath: file, dataDir: dir });
    writer.record({
      decisionId: 'd1',
      gate: 'consensus_vote',
      voters: VOTERS,
      billingMode: 'api',
      timestamp: TS,
    });

    // Inject a malformed line + a schema-invalid line.
    const good = readFileSync(file, 'utf-8').trim();
    writeFileSync(file, `${good}\nnot-json{{\n${JSON.stringify({ decisionId: 'd2' })}\n`, 'utf-8');

    const reader = new DecisionCostStore({ filePath: file, dataDir: dir });
    expect(reader.size).toBe(1);
    expect(reader.all()[0]?.decisionId).toBe('d1');
  });

  it('filters by gate and since-timestamp', () => {
    const store = new DecisionCostStore({ filePath: file, dataDir: dir });
    store.record({
      decisionId: 'a',
      gate: 'consensus_vote',
      voters: VOTERS,
      billingMode: 'api',
      timestamp: '2026-06-15T00:00:00.000Z',
    });
    store.record({
      decisionId: 'b',
      gate: 'pr_review',
      voters: VOTERS,
      billingMode: 'api',
      timestamp: '2026-06-17T00:00:00.000Z',
    });

    expect(store.query({ gate: 'pr_review' }).map((r) => r.decisionId)).toEqual(['b']);
    expect(store.query({ since: '2026-06-16T00:00:00.000Z' }).map((r) => r.decisionId)).toEqual([
      'b',
    ]);
    expect(store.query()).toHaveLength(2);
  });
});
