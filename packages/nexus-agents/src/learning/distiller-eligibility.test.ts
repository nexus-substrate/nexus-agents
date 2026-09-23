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

describe('isDistillerEligible (#6512)', () => {
  const executed = { cliSource: 'executed' as const };
  const table: ReadonlyArray<[string, Partial<TaskOutcome>, boolean]> = [
    ['delegate with an executed CLI attribution', executed, true],
    ['each routable CLI: gemini', { ...executed, cli: 'gemini' }, true],
    ['each routable CLI: codex', { ...executed, cli: 'codex' }, true],
    ['each routable CLI: opencode', { ...executed, cli: 'opencode' }, true],
    // No positive marker that a CLI ran: not eligible (#6512 review C1).
    ['delegate with no cliSource marker', {}, false],
    [
      'legacy orchestrate row: model orchestrator, 0 ms, no cliSource',
      { id: 'orch-1', model: 'orchestrator', durationMs: 0, category: 'exploration' },
      false,
    ],
    ['legacy orchestrate row with a duration', { model: 'orchestrator', durationMs: 900 }, false],
    ['executed marker but 0 ms', { ...executed, durationMs: 0 }, false],
    ['CLI attributed by category default', { cliSource: 'category-default' }, false],
    ['consensus voter seat', { ...executed, source: 'consensus' }, false],
    ['manual (warm-up / e2e-eval)', { ...executed, source: 'manual' }, false],
    ['unknown CLI', { ...executed, cli: 'unknown' }, false],
    ['api:* arm no rule can match', { ...executed, cli: 'api:anthropic' }, false],
  ];

  it.each(table)('%s → %s', (_label, overrides, expected) => {
    expect(isDistillerEligible(makeOutcome(overrides))).toBe(expected);
  });
});

describe('countEligibleSince (#6512)', () => {
  it('names the empty case: no outcomes is 0', () => {
    expect(countEligibleSince([], undefined)).toBe(0);
  });

  it('counts every eligible outcome when there is no snapshot', () => {
    const outcomes = [
      makeOutcome({ cliSource: 'executed' }),
      makeOutcome({ cliSource: 'executed' }),
      makeOutcome({ cliSource: 'executed', source: 'consensus' }),
      makeOutcome(),
    ];
    expect(countEligibleSince(outcomes, undefined)).toBe(2);
  });

  it('counts only outcomes strictly newer than the snapshot', () => {
    const since = Date.parse('2026-09-10T00:00:00.000Z');
    const outcomes = [
      makeOutcome({ cliSource: 'executed', timestamp: '2026-09-09T00:00:00.000Z' }),
      makeOutcome({ cliSource: 'executed', timestamp: '2026-09-10T00:00:00.000Z' }),
      makeOutcome({ cliSource: 'executed', timestamp: '2026-09-11T00:00:00.000Z' }),
    ];
    expect(countEligibleSince(outcomes, since)).toBe(1);
  });

  it('does not count an unparseable timestamp as newer than a snapshot', () => {
    const outcomes = [makeOutcome({ cliSource: 'executed', timestamp: 'not-a-date' })];
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
    const lines = [
      JSON.stringify(makeOutcome({ cliSource: 'executed' })),
      JSON.stringify(makeOutcome()),
      JSON.stringify(makeOutcome({ cliSource: 'executed', source: 'consensus' })),
      JSON.stringify(makeOutcome({ cliSource: 'executed', source: 'manual' })),
      JSON.stringify({ ...makeOutcome({ cliSource: 'executed' }), cli: 'cli-codex' }),
      '{not json',
      '',
      JSON.stringify(makeOutcome({ cliSource: 'executed', cli: 'gemini' })),
    ];
    writeFileSync(path, lines.join('\n'));
    expect(countEligibleOutcomesInFile(path)).toBe(2);
  });
});
