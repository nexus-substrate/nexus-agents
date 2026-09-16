/**
 * Tests for the undeclared-options precision reader (#5422).
 *
 * The reader turns the detector verdicts `consensus_vote` records on the
 * decision-cost store into the number the promotion decision needs. The two
 * properties that matter: the empty case reads `unmeasured`, never a precision
 * of 1, and the arithmetic is over hand-labelled fired rows only.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computePrecision,
  parseLabels,
  parseStoreText,
  renderReport,
  run,
  PROMOTION_MIN_FIRED,
  PROMOTION_MIN_PRECISION,
} from './undeclared-options-precision.js';

function row(
  decisionId: string,
  verdict: Record<string, unknown> | undefined,
  gate = 'consensus_vote'
): string {
  return JSON.stringify({
    decisionId,
    gate,
    timestamp: '2026-09-16T00:00:00.000Z',
    summary: {},
    ...(verdict !== undefined ? { undeclaredOptionsDetector: verdict } : {}),
  });
}

const OPTION_PATTERN = String(/\b(?:Option|OPTION) [A-Z0-9]\b/);

const FIRED_A = row('a', {
  fired: true,
  pattern: OPTION_PATTERN,
  excerpt: 'Option A — keep it.',
  declaredOptionCount: 0,
});
const FIRED_B = row('b', {
  fired: true,
  pattern: String(/\bchoose between\b/i),
  excerpt: 'choose between them',
  declaredOptionCount: 0,
});
const QUIET_C = row('c', { fired: false, declaredOptionCount: 0 });
const QUIET_D = row('d', { fired: false, declaredOptionCount: 2 });
const OLD_E = row('e', undefined);
const PR_REVIEW_F = row('f', undefined, 'pr_review');

describe('parseStoreText', () => {
  it('separates fired rows, not-fired rows, rows with no verdict, and unparseable lines', () => {
    const census = parseStoreText(
      [FIRED_A, QUIET_C, OLD_E, PR_REVIEW_F, 'not json', FIRED_B, QUIET_D, ''].join('\n')
    );
    expect(census.total).toBe(4);
    expect(census.fired.map((r) => r.decisionId)).toEqual(['a', 'b']);
    expect(census.withoutVerdict).toBe(2);
    expect(census.unparseable).toBe(1);
  });

  it('counts a row whose verdict fails the schema as unparseable, not as not-fired', () => {
    const bad = row('z', { fired: 'yes', declaredOptionCount: 0 });
    const census = parseStoreText(bad);
    expect(census.total).toBe(0);
    expect(census.unparseable).toBe(1);
  });

  it('names the empty store: zero rows of every kind', () => {
    const census = parseStoreText('');
    expect(census).toMatchObject({ total: 0, fired: [], withoutVerdict: 0, unparseable: 0 });
  });
});

describe('parseLabels', () => {
  it('reads `<id>,<tp|fp>` lines, ignoring blanks and # comments, and reports malformed lines', () => {
    const { labels, malformed } = parseLabels(
      ['# labelled 2026-09-16', 'a,tp', '', 'b, fp', 'c,maybe', 'nocomma'].join('\n')
    );
    expect([...labels.entries()]).toEqual([
      ['a', 'tp'],
      ['b', 'fp'],
    ]);
    expect(malformed).toEqual(['c,maybe', 'nocomma']);
  });
});

describe('computePrecision', () => {
  const fired = parseStoreText([FIRED_A, FIRED_B].join('\n')).fired;

  it('is tp / (tp + fp) over labelled fired rows, with n', () => {
    const verdict = computePrecision(
      fired,
      new Map([
        ['a', 'tp'],
        ['b', 'fp'],
      ])
    );
    expect(verdict).toEqual({
      kind: 'measured',
      tp: 1,
      fp: 1,
      n: 2,
      precision: 0.5,
      unlabelled: 0,
      unknownIds: [],
    });
  });

  it('reads unmeasured, never 1, when there are no fired rows', () => {
    expect(computePrecision([], new Map([['a', 'tp']]))).toEqual({
      kind: 'unmeasured',
      reason: '0 fired rows',
    });
  });

  it('reads unmeasured when fired rows exist but none is labelled', () => {
    expect(computePrecision(fired, new Map())).toEqual({
      kind: 'unmeasured',
      reason: '0 labelled fired rows (2 fired, 0 labelled)',
    });
  });

  it('counts unlabelled fired rows and labels that name no fired row, without folding them in', () => {
    const verdict = computePrecision(
      fired,
      new Map([
        ['a', 'fp'],
        ['ghost', 'tp'],
      ])
    );
    expect(verdict).toEqual({
      kind: 'measured',
      tp: 0,
      fp: 1,
      n: 1,
      precision: 0,
      unlabelled: 1,
      unknownIds: ['ghost'],
    });
  });
});

describe('renderReport', () => {
  it('lists every fired row with id, pattern, declared count and excerpt, and the fired / total ratio', () => {
    const census = parseStoreText([FIRED_A, QUIET_C, QUIET_D, OLD_E].join('\n'));
    const text = renderReport('/x/decision-costs.jsonl', census, undefined);
    expect(text).toContain('fired / total: 1 / 3');
    expect(text).toContain('a\t');
    expect(text).toContain(OPTION_PATTERN);
    expect(text).toContain('Option A — keep it.');
    expect(text).toContain('rows without a verdict (written before #5422, or pr_review): 1');
    expect(text).toContain('precision: unmeasured (no labels file)');
  });

  it('prints a zero-hit pattern as 0, so a pattern that never fires is visible', () => {
    const census = parseStoreText(FIRED_A);
    const text = renderReport('/x', census, undefined);
    expect(text).toContain(`${String(/\bpick exactly one\b/i)}: 0`);
    expect(text).toContain(`${OPTION_PATTERN}: 1`);
  });

  it('renders a newline inside an excerpt on one line', () => {
    const census = parseStoreText(
      row('nl', {
        fired: true,
        pattern: OPTION_PATTERN,
        excerpt: 'x\nOption A',
        declaredOptionCount: 0,
      })
    );
    const text = renderReport('/x', census, undefined);
    expect(text).not.toContain('x\nOption A');
    expect(text).toContain('x⏎Option A');
  });

  it('states the promotion bar and whether the measured precision meets it, with n', () => {
    const census = parseStoreText([FIRED_A, FIRED_B].join('\n'));
    const measured = computePrecision(
      census.fired,
      new Map([
        ['a', 'tp'],
        ['b', 'tp'],
      ])
    );
    const text = renderReport('/x', census, measured);
    expect(text).toContain('precision: 1.000 (tp=2, fp=0, n=2)');
    expect(text).toContain(
      `bar (#5422): precision >= ${String(PROMOTION_MIN_PRECISION)} over n >= ${String(PROMOTION_MIN_FIRED)} labelled fired rows — NOT MET (n=2 < ${String(PROMOTION_MIN_FIRED)})`
    );
  });
});

describe('run', () => {
  let dir: string;
  const setup = (): void => {
    dir = mkdtempSync(join(tmpdir(), 'undeclared-options-precision-'));
  };
  const teardown = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };

  it('exits 2 with `unmeasured (0 fired rows)` on a store with no fired rows', () => {
    setup();
    try {
      const store = join(dir, 'dc.jsonl');
      writeFileSync(store, `${QUIET_C}\n`);
      const result = run(['--file', store]);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('unmeasured (0 fired rows)');
      expect(result.output).not.toMatch(/precision: 1/);
    } finally {
      teardown();
    }
  });

  it('exits 2 on a missing store file rather than reading it as empty-and-clean', () => {
    setup();
    try {
      const result = run(['--file', join(dir, 'absent.jsonl')]);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('no store file');
    } finally {
      teardown();
    }
  });

  it('exits 2 when fired rows exist but no labels file was given — listing them to label', () => {
    setup();
    try {
      const store = join(dir, 'dc.jsonl');
      writeFileSync(store, `${FIRED_A}\n${QUIET_C}\n`);
      const result = run(['--file', store]);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('fired / total: 1 / 2');
      expect(result.output).toContain('unmeasured (no labels file)');
    } finally {
      teardown();
    }
  });

  it('exits 0 with the precision when labels cover fired rows', () => {
    setup();
    try {
      const store = join(dir, 'dc.jsonl');
      const labels = join(dir, 'labels.csv');
      writeFileSync(store, `${FIRED_A}\n${FIRED_B}\n${QUIET_C}\n`);
      writeFileSync(labels, 'a,tp\nb,fp\n');
      const result = run(['--file', store, '--labels', labels]);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('precision: 0.500 (tp=1, fp=1, n=2)');
    } finally {
      teardown();
    }
  });

  it('exits 1 on an unknown flag', () => {
    const result = run(['--bogus']);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('usage');
  });
});
