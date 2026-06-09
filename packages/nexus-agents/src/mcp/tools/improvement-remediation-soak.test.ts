/**
 * Tests for the durable audit-mode soak sink + summarize surface (#3762).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createRemediationSoakSink,
  scrubSoakRecord,
  summarizeRemediationSoak,
  readRemediationSoakSummary,
  SOAK_MAX_RECORDS,
  type RemediationSoakRecord,
} from './improvement-remediation-shadow.js';

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'soak-sink-'));
  filePath = join(dir, 'learning', 'remediation-soak.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rec(over: Partial<RemediationSoakRecord> = {}): RemediationSoakRecord {
  return {
    timestamp: '2026-06-08T00:00:00.000Z',
    signalKey: 'routing:cli-floor:codex:docs',
    category: 'routing',
    priority: 'p2',
    severity: 'warning',
    voteOutcome: { approved: true, approvalPercentage: 100 },
    planStepCount: 3,
    reason: 'approved in shadow',
    ...over,
  };
}

describe('durable soak sink', () => {
  it('round-trips records: write N, reconstruct from disk preserving order', () => {
    const sink = createRemediationSoakSink(filePath);
    for (let i = 0; i < 4; i++) {
      sink.record(
        rec({ signalKey: `s${String(i)}`, timestamp: `2026-06-08T00:0${String(i)}:00.000Z` })
      );
    }
    expect(sink.getRecords()).toHaveLength(4);

    const reopened = createRemediationSoakSink(filePath);
    expect(reopened.getRecords().map((r) => r.signalKey)).toEqual(['s0', 's1', 's2', 's3']);
    expect(reopened.getRecords()[1]?.voteOutcome).toEqual({
      approved: true,
      approvalPercentage: 100,
    });
  });

  it('bounds retention to the last N records', () => {
    const sink = createRemediationSoakSink(filePath, 5);
    for (let i = 0; i < 5 + 3; i++) sink.record(rec({ signalKey: `s${String(i)}` }));
    expect(sink.getRecords()).toHaveLength(5);
    expect(sink.getRecords().map((r) => r.signalKey)).toEqual(['s3', 's4', 's5', 's6', 's7']);

    const reopened = createRemediationSoakSink(filePath, 5);
    expect(reopened.getRecords()).toHaveLength(5);
    expect(reopened.getRecords()[0]?.signalKey).toBe('s3');
  });

  it('SOAK_MAX_RECORDS is a generous, finite bound', () => {
    expect(SOAK_MAX_RECORDS).toBeGreaterThanOrEqual(1000);
    expect(Number.isFinite(SOAK_MAX_RECORDS)).toBe(true);
  });
});

describe('secret-scrub before persistence', () => {
  it('redacts a secret in the reason field before write', () => {
    const leaky = rec({
      reason: 'token=ghp_0123456789012345678901234567890123456789 leaked',
    });
    const scrubbed = scrubSoakRecord(leaky);
    expect(scrubbed.reason).not.toContain('ghp_');
    expect(scrubbed.reason).toContain('[redacted:');
  });

  it('redacts a secret in dryRunResult before write', () => {
    const leaky = rec({
      dryRunResult: 'AKIAIOSFODNN7EXAMPLE found in fixture',
    });
    const scrubbed = scrubSoakRecord(leaky);
    expect(scrubbed.dryRunResult).not.toContain('AKIA');
    expect(scrubbed.dryRunResult).toContain('[redacted:');
  });

  it('a record with a secret never reaches disk un-redacted', () => {
    const sink = createRemediationSoakSink(filePath);
    sink.record(rec({ reason: 'leak AKIAIOSFODNN7EXAMPLE here' }));
    const reopened = createRemediationSoakSink(filePath);
    const persisted = reopened.getRecords()[0];
    expect(persisted?.reason).not.toContain('AKIA');
    expect(persisted?.reason).toContain('[redacted:');
  });

  it('leaves clean fields untouched', () => {
    const clean = rec({ reason: 'approved supermajority (86%)' });
    expect(scrubSoakRecord(clean).reason).toBe('approved supermajority (86%)');
  });
});

describe('summarizeRemediationSoak', () => {
  it('computes counts, approval rate, and breakdowns over fixtures', () => {
    const records: RemediationSoakRecord[] = [
      rec({
        category: 'routing',
        priority: 'p2',
        voteOutcome: { approved: true, approvalPercentage: 100 },
      }),
      rec({
        category: 'bug',
        priority: 'p1',
        voteOutcome: { approved: false, approvalPercentage: 40 },
      }),
      rec({
        category: 'bug',
        priority: 'p0',
        voteOutcome: { approved: true, approvalPercentage: 100 },
        dryRunResult: 'ok',
      }),
      rec({
        category: 'tech-debt',
        priority: 'p3',
        voteOutcome: undefined,
        planStepCount: 0,
        reason: 'research failed',
      }),
    ];
    const s = summarizeRemediationSoak(records);
    expect(s.total).toBe(4);
    expect(s.voted).toBe(3);
    expect(s.approved).toBe(2);
    expect(s.rejected).toBe(1);
    expect(s.approvalRate).toBeCloseTo(2 / 3, 5);
    expect(s.dryRunsCaptured).toBe(1);
    expect(s.byCategory).toEqual({ routing: 1, bug: 2, 'tech-debt': 1 });
    expect(s.byPriority).toEqual({ p2: 1, p1: 1, p0: 1, p3: 1 });
  });

  it('handles the empty case without NaN', () => {
    const s = summarizeRemediationSoak([]);
    expect(s.total).toBe(0);
    expect(s.approvalRate).toBe(0);
    expect(s.firstTimestamp).toBeUndefined();
  });

  it('readRemediationSoakSummary reads from the sink', () => {
    const sink = createRemediationSoakSink(filePath);
    sink.record(rec({ voteOutcome: { approved: true, approvalPercentage: 90 } }));
    sink.record(rec({ voteOutcome: { approved: false, approvalPercentage: 20 } }));
    const s = readRemediationSoakSummary(sink);
    expect(s.total).toBe(2);
    expect(s.approvalRate).toBeCloseTo(0.5, 5);
  });
});
