/**
 * Tests for the stratified outcome report (#2662).
 *
 * @module scripts/stratify-outcomes.test
 */

import { describe, it, expect } from 'vitest';
import { loadOutcomes, stratify, renderReport, type OutcomeRecord } from './stratify-outcomes.js';

describe('loadOutcomes', () => {
  it('parses one JSON object per line, skipping blanks and malformed lines', () => {
    const jsonl = ['{"cli":"claude","success":true}', '', '{ not json', '{"cli":"codex"}'].join(
      '\n'
    );
    const records = loadOutcomes(jsonl);
    expect(records).toHaveLength(2);
    expect(records[0]?.cli).toBe('claude');
  });
});

describe('stratify', () => {
  const outcomes: OutcomeRecord[] = [
    { cli: 'claude', category: 'architecture', success: false, failureCategory: 'execution' },
    { cli: 'claude', category: 'architecture', success: true },
    { cli: 'gemini', category: 'testing', success: true },
    { cli: 'codex', category: 'planning', success: false, failureCategory: 'unknown' },
    { source: 'consensus', voterRole: 'architect', success: true },
    { source: 'consensus', voterRole: 'architect', success: false },
  ];

  it('groups by adapter with correct success rates', () => {
    const report = stratify(outcomes);
    const claude = report.byAdapter.find((s) => s.key === 'claude');
    expect(claude).toMatchObject({ total: 2, successes: 1, successRate: 0.5 });
  });

  it('groups by task-type and voter-role', () => {
    const report = stratify(outcomes);
    expect(report.byTaskType.find((s) => s.key === 'architecture')?.total).toBe(2);
    expect(report.byVoterRole.find((s) => s.key === 'architect')).toMatchObject({
      total: 2,
      successRate: 0.5,
    });
  });

  it('sorts strata worst-success-rate first', () => {
    const report = stratify(outcomes);
    for (let i = 1; i < report.byAdapter.length; i++) {
      expect(report.byAdapter[i - 1]!.successRate).toBeLessThanOrEqual(
        report.byAdapter[i]!.successRate
      );
    }
  });

  it('counts novel/uncategorized failures separately', () => {
    // Novel: the `unknown`-category failure AND the consensus failure with
    // no failureCategory. Not novel: the `execution`-category failure.
    expect(stratify(outcomes).novelErrorCount).toBe(2);
  });

  it('counts a failure with no failureCategory as novel', () => {
    expect(stratify([{ success: false }]).novelErrorCount).toBe(1);
    expect(stratify([{ success: true }]).novelErrorCount).toBe(0);
  });

  it('byVoterRole is empty when no consensus outcomes carry a voterRole', () => {
    const report = stratify([{ cli: 'claude', success: true }]);
    expect(report.byVoterRole).toEqual([]);
  });
});

describe('renderReport', () => {
  it('renders tables and notes empty strata explicitly', () => {
    const md = renderReport(stratify([{ cli: 'claude', success: true }]));
    expect(md).toContain('# Fitness — Stratified Outcome Report (v1)');
    expect(md).toContain('Total outcomes: **1**');
    expect(md).toContain('### By voter-role');
    expect(md).toContain('_No data yet._'); // voter-role table
  });
});
