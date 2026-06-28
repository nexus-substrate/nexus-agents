/**
 * Tests for the `remediation-review` CLI handler (#3765) — the human
 * soundness-review surface: list pending soak selections, mark one
 * reviewed+sound|unsound by a named evaluator, and record an owner sign-off.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

import { handleRemediationReviewCommand, harmfulRate } from './remediation-review-command.js';
import type { ParsedCliArgs } from '../cli-types.js';
import {
  createRemediationSoakSink,
  getRemediationSoakFile,
  _resetRemediationSoakSinkForTests,
  type RemediationSoakRecord,
} from '../mcp/tools/improvement-remediation-shadow.js';
import {
  createRemediationReviewStore,
  getRemediationReviewFile,
  _resetRemediationReviewStoreForTests,
  soakRefOf,
  type ReviewRecord,
} from '../mcp/tools/remediation-review.js';

function args(
  subcommand: string | undefined,
  over: Partial<ParsedCliArgs['options']> = {},
  positionals: string[] = []
): ParsedCliArgs {
  return {
    command: 'remediation-review',
    ...(subcommand !== undefined ? { subcommand } : {}),
    options: { format: 'text', ...over },
    positionals: [
      'remediation-review',
      ...(subcommand !== undefined ? [subcommand] : []),
      ...positionals,
    ],
  } as unknown as ParsedCliArgs;
}

function seedSoak(): RemediationSoakRecord {
  const rec: RemediationSoakRecord = {
    timestamp: '2026-06-08T00:00:00.000Z',
    signalKey: 'routing:floor:codex',
    category: 'routing',
    priority: 'p2',
    severity: 'warning',
    planStepCount: 3,
    reason: 'plan produced',
  };
  createRemediationSoakSink(getRemediationSoakFile()).record(rec);
  return rec;
}

let dir: string;
let prevDataDir: string | undefined;
let out: MockInstance<(buffer: Uint8Array | string) => boolean>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-cli-'));
  prevDataDir = process.env['NEXUS_DATA_DIR'];
  process.env['NEXUS_DATA_DIR'] = dir;
  _resetRemediationSoakSinkForTests();
  _resetRemediationReviewStoreForTests();
  out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = prevDataDir;
  _resetRemediationSoakSinkForTests();
  _resetRemediationReviewStoreForTests();
  rmSync(dir, { recursive: true, force: true });
});

function output(): string {
  return out.mock.calls.map((c) => String(c[0])).join('');
}

describe('handleRemediationReviewCommand', () => {
  it('list: shows pending (un-reviewed) soak selections', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(args('list'));
    expect(output()).toContain(soakRefOf(rec));
    expect(output()).toContain('1 pending');
  });

  it('mark: records a reviewed+sound verdict by a named evaluator', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(
      args('mark', { evaluator: 'alice', sound: true }, [soakRefOf(rec)])
    );
    const reviews = createRemediationReviewStore(getRemediationReviewFile()).getRecords();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.sound).toBe(true);
    expect(reviews[0]?.evaluator).toBe('alice');
  });

  it('mark --unsound: records sound=false', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(
      args('mark', { evaluator: 'alice', unsound: true }, [soakRefOf(rec)])
    );
    const reviews = createRemediationReviewStore(getRemediationReviewFile()).getRecords();
    expect(reviews[0]?.sound).toBe(false);
  });

  it('mark: requires a named --evaluator (fail-closed)', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await expect(
      handleRemediationReviewCommand(args('mark', { sound: true }, [soakRefOf(rec)]))
    ).rejects.toThrow(/evaluator/i);
  });

  it('mark: rejects when both --sound and --unsound are given', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await expect(
      handleRemediationReviewCommand(
        args('mark', { evaluator: 'alice', sound: true, unsound: true }, [soakRefOf(rec)])
      )
    ).rejects.toThrow(/sound|unsound/i);
  });

  it('sign-off: records an owner sign-off carried into the review summary', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(
      args('mark', { evaluator: 'alice', sound: true }, [soakRefOf(rec)])
    );
    _resetRemediationReviewStoreForTests();
    await handleRemediationReviewCommand(args('sign-off', { owner: 'carol' }));
    const reviews = createRemediationReviewStore(getRemediationReviewFile()).getRecords();
    expect(reviews.some((r) => r.owner === 'carol')).toBe(true);
  });

  it('list reflects that a marked selection is no longer pending', async () => {
    const rec = seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(
      args('mark', { evaluator: 'alice', sound: true }, [soakRefOf(rec)])
    );
    _resetRemediationReviewStoreForTests();
    out.mockClear();
    await handleRemediationReviewCommand(args('list'));
    expect(output()).toContain('0 pending');
  });

  it('readiness: NOT READY (text) with no review data — fail-closed, harmful-rate line present', async () => {
    seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(args('readiness'));
    const text = output();
    expect(text).toContain('Enforcement readiness: NOT READY');
    expect(text).toContain('harmful-rate');
    expect(text).toMatch(/Blockers:/);
  });

  it('readiness --format json: ready=false + numeric harmfulRate with no review data', async () => {
    seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(args('readiness', { format: 'json' }));
    const parsed = JSON.parse(output()) as {
      ready: boolean;
      harmfulRate: number;
      evidence: { judgedSelections: number; judgedSound: number };
      blockers: string[];
    };
    expect(parsed.ready).toBe(false);
    expect(typeof parsed.harmfulRate).toBe('number');
    expect(parsed.harmfulRate).toBe(0); // judgedSelections=0 → 0
    expect(parsed.blockers.length).toBeGreaterThan(0);
  });

  it('readiness: READY when volume + judged + sound + evaluator + owner all met', async () => {
    const sink = createRemediationSoakSink(getRemediationSoakFile());
    const reviewStore = createRemediationReviewStore(getRemediationReviewFile());
    const refs: string[] = [];
    for (let i = 0; i < 20; i++) {
      const rec: RemediationSoakRecord = {
        timestamp: `2026-06-08T00:00:${String(i).padStart(2, '0')}.000Z`,
        signalKey: 'routing:floor:codex',
        category: 'routing',
        priority: 'p2',
        severity: 'warning',
        planStepCount: 3,
        reason: 'plan produced',
      };
      sink.record(rec);
      refs.push(soakRefOf(rec));
    }
    // Review 18/20 (≥80% judged), all sound (100% ≥ 90%), named evaluator + owner.
    for (const ref of refs.slice(0, 18)) {
      const review: ReviewRecord = {
        soakRef: ref,
        reviewedAt: '2026-06-09T00:00:00.000Z',
        reviewed: true,
        sound: true,
        evaluator: 'alice',
        owner: 'carol',
      };
      reviewStore.record(review);
    }
    _resetRemediationSoakSinkForTests();
    _resetRemediationReviewStoreForTests();
    await handleRemediationReviewCommand(args('readiness', { format: 'json' }));
    const parsed = JSON.parse(output()) as { ready: boolean; harmfulRate: number };
    expect(parsed.ready).toBe(true);
    expect(parsed.harmfulRate).toBeLessThanOrEqual(0.1);
    expect(parsed.harmfulRate).toBe(0);
  });
});

describe('harmfulRate', () => {
  it('returns 0 when nothing judged', () => {
    expect(harmfulRate({ shadowSelections: 5, judgedSelections: 0, judgedSound: 0 })).toBe(0);
  });

  it('is 1 − soundnessRate over judged selections (10 judged, 8 sound → 0.2)', () => {
    expect(harmfulRate({ shadowSelections: 10, judgedSelections: 10, judgedSound: 8 })).toBeCloseTo(
      0.2
    );
  });
});
