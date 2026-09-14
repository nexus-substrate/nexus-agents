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
import { runAutoRemediationCycle } from '../mcp/tools/auto-remediation-cycle.js';
import { buildAutoRemediationDeps } from '../mcp/tools/auto-remediation-deps.js';
import type { ImprovementSignal } from '../mcp/tools/improvement-review.js';
import { FixedTimeProvider, resetTimeProvider, setTimeProvider } from '../core/time-provider.js';

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
    // #4158: volume bar is now ≥100 shadow selections.
    for (let i = 0; i < 120; i++) {
      const rec: RemediationSoakRecord = {
        timestamp: `2026-06-08T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
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
    // Review 110/120 (≥80% judged), all sound (100% ≥ 90%), named evaluator + owner.
    for (const ref of refs.slice(0, 110)) {
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

/**
 * #4279 item 3 — the readiness verdict carries a legible staleness/flatline
 * signal for the operator soak store. An empty store says UNMEASURED; a store
 * with ≤1 record, or none newer than the alarm window, says ALARM; and the
 * JSON shape carries the same signal for machine consumers.
 */
describe('readiness renders the soak-store staleness signal (#4279)', () => {
  const NOW = Date.parse('2026-09-14T12:00:00.000Z');

  beforeEach(() => {
    setTimeProvider(new FixedTimeProvider(NOW));
  });
  afterEach(() => {
    resetTimeProvider();
  });

  it('EMPTY store: text says UNMEASURED with 0 records — never a silent NOT READY', async () => {
    await handleRemediationReviewCommand(args('readiness'));
    const text = output();
    expect(text).toContain('Enforcement readiness: NOT READY');
    expect(text).toMatch(/Soak store: UNMEASURED — 0 records/);
  });

  it('EMPTY store: json carries soakStore.status = unmeasured', async () => {
    await handleRemediationReviewCommand(args('readiness', { format: 'json' }));
    const parsed = JSON.parse(output()) as {
      soakStore: { status: string; recordCount: number; reasons: string[] };
    };
    expect(parsed.soakStore.status).toBe('unmeasured');
    expect(parsed.soakStore.recordCount).toBe(0);
  });

  it('FLATLINED store (1 record, 97 days old): text prints ALARM with both causes', async () => {
    seedSoak(); // one p2 record dated 2026-06-08 → 98 days before NOW
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(args('readiness'));
    const text = output();
    expect(text).toMatch(/Soak store: ALARM — 1 record/);
    expect(text).toMatch(/flatlined/i);
    expect(text).toMatch(/no new record for 98 days \(alarm at ≥ 14 days\)/);
  });

  it('FLATLINED store: json carries status = alarm, idleDays and the reasons', async () => {
    seedSoak();
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(args('readiness', { format: 'json' }));
    const parsed = JSON.parse(output()) as {
      ready: boolean;
      soakStore: { status: string; recordCount: number; idleDays?: number; reasons: string[] };
    };
    expect(parsed.ready).toBe(false);
    expect(parsed.soakStore.status).toBe('alarm');
    expect(parsed.soakStore.recordCount).toBe(1);
    expect(parsed.soakStore.idleDays).toBe(98);
    expect(parsed.soakStore.reasons.length).toBe(2);
  });

  it('a live store (2 records, newest 1 day old) prints fresh with the last timestamp', async () => {
    const sink = createRemediationSoakSink(getRemediationSoakFile());
    for (const ts of ['2026-09-01T00:00:00.000Z', '2026-09-13T12:00:00.000Z']) {
      sink.record({
        timestamp: ts,
        signalKey: 'routing:floor:codex',
        category: 'routing',
        priority: 'p2',
        severity: 'warning',
        planStepCount: 3,
        reason: 'plan produced',
      });
    }
    _resetRemediationSoakSinkForTests();
    await handleRemediationReviewCommand(args('readiness'));
    expect(output()).toMatch(
      /Soak store: fresh — 2 records, last 2026-09-13T12:00:00\.000Z \(1 day ago\)/
    );
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

/**
 * #4279 Gap 2 — judgeability of a NON-p0 record. The panel's premise was that
 * p1–p4 records carry no `dryRunResult` (`requiresDryRun` is p0-only) and so can
 * never be judged, failing `minJudgedRate`. This pins the end-to-end path the
 * operator actually uses: the tool produces a p2 record in audit mode → `list`
 * shows it → `mark` accepts it → `readiness` counts it as judged. Judgeability
 * is a named-evaluator act over the soak ref and must never depend on a dry-run
 * having been captured.
 */
describe('a p2 record produced by the tool is judgeable (#4279 Gap 2)', () => {
  it('audit cycle → list → mark → readiness counts the p2 selection as judged', async () => {
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const p2Signal: ImprovementSignal = {
      category: 'routing',
      signalKey: 'routing:cli-floor:codex:docs',
      severity: 'warning', // warning → p2 (classifySignalPriority)
      title: 'routing: codex 30% on docs',
      body: 'floor breach',
      evidence: {},
    };
    await runAutoRemediationCycle(
      { mode: 'audit' },
      { collectSignals: async () => Promise.resolve([p2Signal]), deps }
    );
    _resetRemediationSoakSinkForTests();

    // The tool wrote a p2 record with NO dryRunResult — the exact shape at issue.
    const soak = createRemediationSoakSink(getRemediationSoakFile()).getRecords();
    expect(soak).toHaveLength(1);
    const rec = soak[0] as RemediationSoakRecord;
    expect(rec.priority).toBe('p2');
    expect(rec.dryRunResult).toBeUndefined();
    const ref = soakRefOf(rec);

    await handleRemediationReviewCommand(args('list'));
    expect(output()).toContain(ref);
    expect(output()).toContain('1 pending');

    out.mockClear();
    await handleRemediationReviewCommand(args('mark', { evaluator: 'alice', sound: true }, [ref]));
    expect(output()).toContain(`marked ${ref} as SOUND by alice`);

    _resetRemediationReviewStoreForTests();
    out.mockClear();
    await handleRemediationReviewCommand(args('readiness', { format: 'json' }));
    const parsed = JSON.parse(output()) as {
      evidence: { shadowSelections: number; judgedSelections: number; judgedSound: number };
      criteria: { name: string; met: boolean }[];
    };
    expect(parsed.evidence).toMatchObject({
      shadowSelections: 1,
      judgedSelections: 1,
      judgedSound: 1,
    });
    // judged-coverage is 100% ≥ 80% on the strength of the p2 record alone.
    expect(parsed.criteria.find((c) => c.name === 'judged-coverage')?.met).toBe(true);
  });
});
