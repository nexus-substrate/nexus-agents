/**
 * Tests for the distiller training-population filter (#6512, panel option B).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import {
  isDistillerEligible,
  countEligibleSince,
  countEligibleOutcomesInFile,
  countRoutedOutcomesInFile,
} from './distiller-eligibility.js';

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: `o-${Math.random().toString(36).slice(2)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-opus',
    success: true,
    durationMs: 100,
    timestamp: '2026-09-01T00:00:00.000Z',
    source: 'delegate',
    ...overrides,
  };
}

describe('isDistillerEligible (#6521)', () => {
  const routed = { routedBy: 'composite-router' as const };
  const table: ReadonlyArray<[string, Partial<TaskOutcome>, boolean]> = [
    ['routed delegate outcome', routed, true],
    ['each routable CLI: gemini', { ...routed, cli: 'gemini' }, true],
    ['each routable CLI: codex', { ...routed, cli: 'codex' }, true],
    ['each routable CLI: opencode', { ...routed, cli: 'opencode' }, true],
    ['routed outcome with a manual source', { ...routed, source: 'manual' }, true],
    // No routed marker: not eligible, whatever else the row claims.
    ['delegate with no marker', {}, false],
    // The #6512 inference is gone: orchestrate's executed rows ran the
    // server's configured adapter, not a CLI the router chose.
    ['executed orchestrate row without the marker', { cliSource: 'executed' }, false],
    [
      'legacy orchestrate row: model orchestrator, 0 ms, no cliSource',
      { id: 'orch-1', model: 'orchestrator', durationMs: 0, category: 'exploration' },
      false,
    ],
    ['routed but 0 ms', { ...routed, durationMs: 0 }, false],
    ['routed consensus voter seat', { ...routed, source: 'consensus' }, false],
    [
      'warm-up prior',
      { source: 'manual', durationMs: 0, qualitySignals: ['synthetic:warm-up'] },
      false,
    ],
    ['e2e-eval simulated run', { source: 'manual', qualitySignals: ['e2e-eval'] }, false],
    ['routed but unknown CLI', { ...routed, cli: 'unknown' }, false],
    ['routed api:* arm no rule can match', { ...routed, cli: 'api:anthropic' }, false],
  ];

  it.each(table)('%s → %s', (_label, overrides, expected) => {
    expect(isDistillerEligible(makeOutcome(overrides))).toBe(expected);
  });
});

describe('countEligibleSince (#6512)', () => {
  const routed = { routedBy: 'composite-router' as const };

  it('names the empty case: no outcomes is 0', () => {
    expect(countEligibleSince([], undefined)).toBe(0);
  });

  it('counts every eligible outcome when there is no snapshot', () => {
    const outcomes = [
      makeOutcome(routed),
      makeOutcome(routed),
      makeOutcome({ ...routed, source: 'consensus' }),
      makeOutcome({ cliSource: 'executed' }),
    ];
    expect(countEligibleSince(outcomes, undefined)).toBe(2);
  });

  it('counts only outcomes strictly newer than the snapshot', () => {
    const since = Date.parse('2026-09-10T00:00:00.000Z');
    const outcomes = [
      makeOutcome({ ...routed, timestamp: '2026-09-09T00:00:00.000Z' }),
      makeOutcome({ ...routed, timestamp: '2026-09-10T00:00:00.000Z' }),
      makeOutcome({ ...routed, timestamp: '2026-09-11T00:00:00.000Z' }),
    ];
    expect(countEligibleSince(outcomes, since)).toBe(1);
  });

  it('does not count an unparseable timestamp as newer than a snapshot', () => {
    const outcomes = [makeOutcome({ ...routed, timestamp: 'not-a-date' })];
    expect(countEligibleSince(outcomes, 0)).toBe(0);
  });
});

describe('countEligibleOutcomesInFile (#6512)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-eligibility-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is 0 for a missing file', () => {
    expect(countEligibleOutcomesInFile(join(dir, 'absent.jsonl'))).toBe(0);
  });

  it('counts eligible records and skips malformed and ineligible lines', () => {
    const path = join(dir, 'outcomes.jsonl');
    const routed = { routedBy: 'composite-router' as const };
    const lines = [
      JSON.stringify(makeOutcome(routed)),
      JSON.stringify(makeOutcome({ cliSource: 'executed' })),
      JSON.stringify(makeOutcome({ ...routed, source: 'consensus' })),
      JSON.stringify({ ...makeOutcome(routed), routedBy: 'some-other-router' }),
      JSON.stringify({ ...makeOutcome(routed), cli: 'cli-codex' }),
      '{not json',
      '',
      JSON.stringify(makeOutcome({ ...routed, cli: 'gemini' })),
    ];
    writeFileSync(path, lines.join('\n'));
    expect(countEligibleOutcomesInFile(path)).toBe(2);
  });
});

describe('countRoutedOutcomesInFile (#6521)', () => {
  const NOW = Date.parse('2026-09-23T12:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-routed-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function daysAgo(days: number): string {
    return new Date(NOW - days * DAY_MS).toISOString();
  }

  it('names the empty case: a missing file is zero routed, zero this week', () => {
    expect(countRoutedOutcomesInFile(join(dir, 'absent.jsonl'), NOW)).toEqual({
      total: 0,
      last7Days: 0,
    });
  });

  it('names the empty case: a store with no routed rows is zero, not the row count', () => {
    const path = join(dir, 'outcomes.jsonl');
    writeFileSync(
      path,
      [makeOutcome(), makeOutcome({ source: 'consensus' })].map((o) => JSON.stringify(o)).join('\n')
    );
    expect(countRoutedOutcomesInFile(path, NOW)).toEqual({ total: 0, last7Days: 0 });
  });

  it('counts routed rows in total and splits out the last 7 days', () => {
    const path = join(dir, 'outcomes.jsonl');
    const routed = { routedBy: 'composite-router' as const };
    const lines = [
      makeOutcome({ ...routed, timestamp: daysAgo(1) }),
      makeOutcome({ ...routed, timestamp: daysAgo(6.9) }),
      makeOutcome({ ...routed, timestamp: daysAgo(7.1) }),
      makeOutcome({ ...routed, timestamp: daysAgo(30), success: false }),
      makeOutcome({ ...routed, timestamp: 'not-a-date' }),
      makeOutcome({ timestamp: daysAgo(1) }),
    ].map((o) => JSON.stringify(o));
    writeFileSync(path, [...lines, '{not json', ''].join('\n'));
    // Routed is the marker alone, eligible or not: the failure and the
    // unparseable-timestamp row count in total; only parseable recent rows
    // count this week.
    expect(countRoutedOutcomesInFile(path, NOW)).toEqual({ total: 5, last7Days: 2 });
  });
});
