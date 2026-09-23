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
  const table: ReadonlyArray<[string, Partial<TaskOutcome>, boolean]> = [
    ['delegate on a routable CLI', {}, true],
    ['delegate with an executed CLI attribution', { cliSource: 'executed' }, true],
    ['each routable CLI: gemini', { cli: 'gemini' }, true],
    ['each routable CLI: codex', { cli: 'codex' }, true],
    ['each routable CLI: opencode', { cli: 'opencode' }, true],
    ['consensus voter seat', { source: 'consensus' }, false],
    ['manual (warm-up / e2e-eval)', { source: 'manual' }, false],
    ['unknown CLI', { cli: 'unknown' }, false],
    ['api:* arm no rule can match', { cli: 'api:anthropic' }, false],
    ['CLI attributed by category default', { cliSource: 'category-default' }, false],
    ['consensus on a routable CLI', { source: 'consensus', cli: 'claude' }, false],
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
    const outcomes = [makeOutcome(), makeOutcome(), makeOutcome({ source: 'consensus' })];
    expect(countEligibleSince(outcomes, undefined)).toBe(2);
  });

  it('counts only outcomes strictly newer than the snapshot', () => {
    const since = Date.parse('2026-09-10T00:00:00.000Z');
    const outcomes = [
      makeOutcome({ timestamp: '2026-09-09T00:00:00.000Z' }),
      makeOutcome({ timestamp: '2026-09-10T00:00:00.000Z' }),
      makeOutcome({ timestamp: '2026-09-11T00:00:00.000Z' }),
    ];
    expect(countEligibleSince(outcomes, since)).toBe(1);
  });

  it('does not count an unparseable timestamp as newer than a snapshot', () => {
    const outcomes = [makeOutcome({ timestamp: 'not-a-date' })];
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
      JSON.stringify(makeOutcome()),
      JSON.stringify(makeOutcome({ source: 'consensus' })),
      JSON.stringify(makeOutcome({ source: 'manual' })),
      JSON.stringify({ ...makeOutcome(), cli: 'cli-codex' }),
      '{not json',
      '',
      JSON.stringify(makeOutcome({ cli: 'gemini' })),
    ];
    writeFileSync(path, lines.join('\n'));
    expect(countEligibleOutcomesInFile(path)).toBe(2);
  });
});
