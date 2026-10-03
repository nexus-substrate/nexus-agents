/** Regression coverage for bounded decision-cost labels (#7017). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecisionCostStore } from './decision-cost-store.js';
import { rollupDecisionCost, UNKNOWN_MODEL, type VoterCostInput } from './decision-cost.js';

const VOTER: VoterCostInput = {
  role: 'architect',
  model: 'claude-sonnet',
  inputTokens: 1000,
  outputTokens: 200,
  cachedInputTokens: 300,
  cacheCreationInputTokens: 50,
  costUsd: 0.006,
};

describe('decision-cost label bounds (#7017)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'decision-cost-labels-'));
    file = join(dir, 'decision-costs.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function record(voter: VoterCostInput): ReturnType<DecisionCostStore['record']> {
    return new DecisionCostStore({ filePath: file, dataDir: dir }).record({
      decisionId: 'bounded-labels',
      gate: 'consensus_vote',
      voters: [voter],
      billingMode: 'api',
      timestamp: '2026-10-03T00:00:00.000Z',
    });
  }

  it.each(['openrouter/' + 'm'.repeat(120), '😀'.repeat(66)])(
    'persists an overlong model with a visible marker and intact usage: %s',
    (model) => {
      const { record: written, persisted } = record({ ...VOTER, model });
      expect(persisted).toBe(true);
      const expectedModel = model.slice(0, 119) + '…';
      const reader = new DecisionCostStore({ filePath: file, dataDir: dir });
      expect(reader.all()).toHaveLength(1);
      const summary = reader.all()[0]?.summary;
      expect(summary).toEqual(written.summary);
      expect(summary).toMatchObject({
        totalInputTokens: 1000,
        totalOutputTokens: 200,
        totalTokens: 1200,
        totalCostUsd: 0.006,
        measuredVoters: 1,
        tokenMeasuredVoters: 1,
        perVoter: [{ ...VOTER, model: expectedModel, totalTokens: 1200, unmeasured: false }],
        perModel: [{ model: expectedModel, voterCount: 1, totalTokens: 1200, costUsd: 0.006 }],
      });
      expect(summary?.perVoter[0]?.model.length).toBeLessThanOrEqual(120);
      expect(summary?.perModel[0]?.model.length).toBeLessThanOrEqual(120);
    }
  );

  it.each(['m'.repeat(120), '😀'.repeat(60)])('keeps a 120-unit model unchanged: %s', (model) => {
    const { record: written, persisted } = record({ ...VOTER, model });
    expect(persisted).toBe(true);
    expect(written.summary.perVoter[0]?.model).toBe(model);
    expect(written.summary.perModel[0]?.model).toBe(model);
    expect(new DecisionCostStore({ filePath: file, dataDir: dir }).all()[0]).toEqual(written);
  });

  it.each([
    ['r'.repeat(65), 'r'.repeat(63) + '…'],
    ['😀'.repeat(33), '😀'.repeat(33).slice(0, 63) + '…'],
    ['r'.repeat(64), 'r'.repeat(64)],
  ])('persists a bounded role: %s', (role, expectedRole) => {
    const { persisted } = record({ ...VOTER, role });
    expect(persisted).toBe(true);
    const summary = new DecisionCostStore({ filePath: file, dataDir: dir }).all()[0]?.summary;
    expect(summary?.perVoter[0]?.role).toBe(expectedRole);
    expect(summary?.perVoter[0]?.role.length).toBeLessThanOrEqual(64);
    expect(summary?.totalTokens).toBe(1200);
    expect(summary?.totalCostUsd).toBe(0.006);
  });

  it('leaves an explicitly empty model empty and rejected', () => {
    const { record: written, persisted } = record({ ...VOTER, model: '' });
    expect(written.summary.perVoter[0]?.model).toBe('');
    expect(written.summary.perModel[0]?.model).toBe('');
    expect(persisted).toBe(false);
    expect(new DecisionCostStore({ filePath: file, dataDir: dir }).all()).toEqual([]);
  });

  it('keeps an absent model labelled unknown and persists it', () => {
    const { record: written, persisted } = record({ ...VOTER, model: undefined });
    expect(persisted).toBe(true);
    expect(written.summary.perVoter[0]?.model).toBe(UNKNOWN_MODEL);
    expect(written.summary.perModel[0]?.model).toBe(UNKNOWN_MODEL);
  });

  it('leaves an explicitly empty role empty and rejected', () => {
    const { record: written, persisted } = record({ ...VOTER, role: '' });
    expect(written.summary.perVoter[0]?.role).toBe('');
    expect(persisted).toBe(false);
  });

  it('keeps distinct models separate when their truncated labels coincide', () => {
    const prefix = 'm'.repeat(119);
    const summary = rollupDecisionCost(
      [
        { ...VOTER, model: prefix + '-first-model' },
        { ...VOTER, model: prefix + '-second-model' },
      ],
      'api'
    );
    expect(summary.perModel).toHaveLength(2);
    expect(summary.perModel.map((line) => line.model)).toEqual([prefix + '…', prefix + '…']);
    expect(summary.perModel.map((line) => line.voterCount)).toEqual([1, 1]);
    expect(summary.totalTokens).toBe(2400);
    expect(summary.totalCostUsd).toBe(0.012);
  });
});
