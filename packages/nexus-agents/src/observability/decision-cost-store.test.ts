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

import { PriceBasisSchema } from '../core/price-basis.js';
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

describe('DecisionCostStore price-basis persistence (#4406)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'decision-cost-basis-'));
    file = join(dir, 'decision-costs.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the per-voter and decision-level basis through the JSONL schema', () => {
    const store = new DecisionCostStore({ filePath: file, dataDir: dir });
    store.record({
      decisionId: 'd-basis',
      gate: 'consensus_vote',
      voters: [
        {
          role: 'architect',
          model: 'claude-sonnet',
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.006,
          priceBasis: 'list',
        },
      ],
      billingMode: 'api',
      timestamp: TS,
    });

    const rehydrated = new DecisionCostStore({ filePath: file, dataDir: dir });
    const record = rehydrated.all()[0];
    expect(record?.summary.priceBasis).toBe('list');
    expect(record?.summary.perVoter[0]?.priceBasis).toBe('list');
  });

  it.each(PriceBasisSchema.options)(
    'persists a %s basis without the store rejecting the whole record (#4406 review)',
    (basis) => {
      // Driven off the union's OWN member list, so a member added later is
      // exercised here automatically. That is the point: the store schema used
      // to hand-mirror the union, and a mirror that fell behind would make
      // `JsonlStore.safeParse` reject the ENTIRE decision record — `append`
      // returning persisted:false and the line skipped on read with only an
      // aggregate debug count. Whole-record governance/billing data loss from
      // one unrecognised field value.
      const store = new DecisionCostStore({ filePath: file, dataDir: dir });
      const { persisted } = store.record({
        decisionId: `d-${basis}`,
        gate: 'consensus_vote',
        voters: [
          {
            role: 'architect',
            model: 'claude-sonnet',
            inputTokens: 10,
            costUsd: 0.001,
            priceBasis: basis,
          },
        ],
        billingMode: 'api',
        timestamp: TS,
      });
      expect(persisted).toBe(true);

      const rehydrated = new DecisionCostStore({ filePath: file, dataDir: dir });
      expect(rehydrated.all()).toHaveLength(1);
      expect(rehydrated.all()[0]?.summary.perVoter[0]?.priceBasis).toBe(basis);
    }
  );

  it('still parses records written BEFORE the basis existed (additive + optional)', () => {
    // A pre-#4406 line carries no priceBasis at any level. The schema change
    // must not orphan the existing history, so it stays optional.
    const legacy = {
      decisionId: 'd-legacy',
      gate: 'consensus_vote',
      timestamp: TS,
      summary: {
        billingMode: 'api',
        voterCount: 1,
        measuredVoters: 1,
        unmeasuredVoters: 0,
        totalInputTokens: 1000,
        totalOutputTokens: 200,
        totalTokens: 1200,
        totalCostUsd: 0.006,
        perVoter: [
          {
            role: 'architect',
            model: 'claude-sonnet',
            inputTokens: 1000,
            outputTokens: 200,
            totalTokens: 1200,
            costUsd: 0.006,
            unmeasured: false,
          },
        ],
        perModel: [
          {
            model: 'claude-sonnet',
            voterCount: 1,
            inputTokens: 1000,
            outputTokens: 200,
            totalTokens: 1200,
            costUsd: 0.006,
          },
        ],
      },
    };
    writeFileSync(file, `${JSON.stringify(legacy)}\n`, 'utf-8');

    const store = new DecisionCostStore({ filePath: file, dataDir: dir });
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]?.decisionId).toBe('d-legacy');
    expect(store.all()[0]?.summary.priceBasis).toBeUndefined();
  });
});
