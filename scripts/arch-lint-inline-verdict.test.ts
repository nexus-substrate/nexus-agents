import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectSrcTargets } from './arch-lint.js';
import {
  INLINE_VERDICT_BASELINE,
  checkInlineVerdict,
  countInlineVerdictHits,
} from './arch-lint-inline-verdict.js';
import { ROOT, SRC_ROOT } from './script-paths.js';

const srcFile = (rel: string): string => join(SRC_ROOT, rel);

const ROGUE = [
  "import { resolveVoteDecision } from './decision/verdict.js';",
  'export function tally(t: { approvalPercentage: number }): boolean {',
  '  if (tally.approvalPercentage >= 0.667) {',
  '    return true;',
  '  }',
  '  return false;',
  '}',
].join('\n');

describe('checkInlineVerdict — a verdict is not re-implemented outside consensus/decision (#6000 step 2)', () => {
  it('names a literal supermajority comparison in a new consensus file, file:line', () => {
    const violations = checkInlineVerdict(srcFile('consensus/rogue-tally.ts'), ROGUE);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('inline-verdict');
    expect(violations[0]?.severity).toBe('error');
    expect(violations[0]?.file).toBe('consensus/rogue-tally.ts');
    expect(violations[0]?.line).toBe(3);
    expect(violations[0]?.message).toContain('consensus/decision');
  });

  it.each([
    ['majority `> 0.5`', 'const ok = ratio > 0.5;'],
    ['`>= 0.5`', 'const ok = ratio >= 0.5;'],
    ['literal on the left', 'const ok = 0.5 < ratio;'],
    ['fraction form `2 / 3`', 'const ok = ratio >= 2 / 3;'],
    ['four-decimal supermajority', 'const ok = ratio >= 0.6667;'],
    ['two-decimal supermajority (#5543 rounding)', 'const ok = ratio >= 0.67;'],
    ['unanimous `=== 1.0`', 'const ok = ratio === 1.0;'],
  ])('flags %s in cli/ and mcp/tools/ as well', (_label, line) => {
    expect(checkInlineVerdict(srcFile('cli/rogue.ts'), line)).toHaveLength(1);
    expect(checkInlineVerdict(srcFile('mcp/tools/rogue.ts'), line)).toHaveLength(1);
  });

  it.each([
    ['a non-threshold literal `>= 0.6`', 'const ok = ratio >= 0.6;'],
    ['an integer `>= 1` (too common to police; stated gap)', 'const ok = votes >= 1;'],
    ['a governed-constant comparison', 'const ok = ratio >= VOTING_THRESHOLDS.supermajority;'],
    ['a whole-line comment', '// the bar is >= 0.667 here'],
  ])('does not flag %s', (_label, line) => {
    expect(checkInlineVerdict(srcFile('consensus/fine.ts'), line)).toEqual([]);
  });

  it('exempts the governed decision directory, tests, and dirs outside the three named', () => {
    expect(checkInlineVerdict(srcFile('consensus/decision/verdict.ts'), ROGUE)).toEqual([]);
    expect(checkInlineVerdict(srcFile('consensus/rogue.test.ts'), ROGUE)).toEqual([]);
    expect(checkInlineVerdict(srcFile('pipeline/rogue.ts'), ROGUE)).toEqual([]);
  });

  it('errors when a baselined file grows past its baseline, naming every hit', () => {
    const [file, baseline] = Object.entries(INLINE_VERDICT_BASELINE)[0] ?? ['', 0];
    const lines = Array.from(
      { length: baseline + 1 },
      (_, i) => `const ok${String(i)} = r >= 0.5;`
    );

    const violations = checkInlineVerdict(srcFile(file), lines.join('\n'));

    expect(violations.filter((v) => v.severity === 'error')).toHaveLength(baseline + 1);
    expect(violations.map((v) => v.line)).toEqual(lines.map((_, i) => i + 1));
    expect(violations[0]?.message).toContain(`baseline ${String(baseline)}`);
  });

  it('warns, not errors, when a baselined file drops below its baseline (stale entry)', () => {
    const [file] = Object.entries(INLINE_VERDICT_BASELINE)[0] ?? [''];

    const violations = checkInlineVerdict(srcFile(file), 'export const nothing = 1;');

    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('warning');
    expect(violations[0]?.message).toContain('INLINE_VERDICT_BASELINE');
  });
});

describe('inline-verdict over the real package source', () => {
  const inScope = collectSrcTargets();

  it('finds zero new hits, and the baseline is exactly what the tree measures', () => {
    let measured = 0;
    const errors = [];
    for (const filePath of inScope) {
      const content = readFileSync(filePath, 'utf-8');
      measured += countInlineVerdictHits(filePath, content);
      errors.push(...checkInlineVerdict(filePath, content).filter((v) => v.severity === 'error'));
    }
    const expected = Object.values(INLINE_VERDICT_BASELINE).reduce((a, b) => a + b, 0);

    expect(inScope.length).toBeGreaterThan(0);
    expect(errors.map((v) => `${v.file}:${String(v.line)}`)).toEqual([]);
    // Not `>= 0`: a baseline that measures nothing would make the ratchet a
    // check that cannot fail. The count must be the real one.
    expect(measured).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('is wired into the src loop of arch-lint.ts', () => {
    const source = readFileSync(join(ROOT, 'scripts/arch-lint.ts'), 'utf-8');
    expect(source).toContain('violations.push(...checkInlineVerdict(filePath, content));');
  });
});
