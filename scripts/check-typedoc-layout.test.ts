import { describe, expect, it } from 'vitest';

import { NESTED_MODULES, assessLayout, expectedPagePath } from './check-typedoc-layout.js';

const NESTED = ['pipeline', 'benchmarks', 'agents-ictm'];
const DECLARED = ['core', 'scm', ...NESTED];
const GENERATED = [
  'core.md',
  'scm.md',
  'exports/pipeline.md',
  'exports/benchmarks.md',
  'exports/agents-ictm.md',
];

describe('expectedPagePath', () => {
  it('pins a nested module under exports/', () => {
    expect(expectedPagePath('pipeline', NESTED)).toBe('exports/pipeline.md');
  });

  it('leaves every other module flat', () => {
    expect(expectedPagePath('core', NESTED)).toBe('core.md');
  });
});

describe('assessLayout', () => {
  it('passes on the layout the #4523 panel voted to preserve', () => {
    const v = assessLayout({ declared: DECLARED, generated: GENERATED, nested: NESTED });

    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.moved).toEqual([]);
    expect(v.unexpectedNested).toEqual([]);
  });

  it('fails when a pinned nested page is de-slashed into the flat root', () => {
    // The exact tidy-up the panel rejected: dropping `exports/` from the
    // `@module` tag breaks a published URL. Documentation cannot stop it.
    const v = assessLayout({
      declared: DECLARED,
      generated: [...GENERATED.filter((p) => p !== 'exports/pipeline.md'), 'pipeline.md'],
      nested: NESTED,
    });

    expect(v.ok).toBe(false);
    expect(v.moved).toEqual(['pipeline: pinned at exports/pipeline.md, found at pipeline.md']);
    expect(v.reason).toContain('exports/pipeline.md');
  });

  it('fails when a flat sibling acquires a slash-bearing @module tag', () => {
    // The inverse move — `scm.ts` is one repaired `@module` tag away from
    // this, which is why the tag was made deliberate rather than left inert.
    const v = assessLayout({
      declared: DECLARED,
      generated: [...GENERATED.filter((p) => p !== 'scm.md'), 'exports/scm.md'],
      nested: NESTED,
    });

    expect(v.ok).toBe(false);
    expect(v.moved).toEqual(['scm: pinned at scm.md, found at exports/scm.md']);
    expect(v.unexpectedNested).toEqual(['exports/scm.md']);
  });

  it('fails when a pinned page vanishes entirely', () => {
    const v = assessLayout({
      declared: DECLARED,
      generated: GENERATED.filter((p) => p !== 'exports/benchmarks.md'),
      nested: NESTED,
    });

    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['exports/benchmarks.md']);
    expect(v.moved).toEqual([]);
  });

  it('fails on a nested page nobody pinned, even when every declared page is in place', () => {
    // A new subdirectory is a new URL shape. It may well be right, but it is
    // a decision, and this gate is where the decision gets recorded.
    const v = assessLayout({
      declared: DECLARED,
      generated: [...GENERATED, 'internal/surprise.md'],
      nested: NESTED,
    });

    expect(v.ok).toBe(false);
    expect(v.unexpectedNested).toEqual(['internal/surprise.md']);
  });

  it('ignores index pages at any depth', () => {
    const v = assessLayout({
      declared: DECLARED,
      generated: [...GENERATED, 'index.md', 'exports/index.md'],
      nested: NESTED,
    });

    expect(v.ok).toBe(true);
    expect(v.unexpectedNested).toEqual([]);
  });

  it('fails closed when generation produced nothing', () => {
    // Running the gate before `docs:api:md` must not read as a pass — an
    // empty tree satisfying a layout assertion is the check-that-cannot-fail
    // shape this repo has been clearing out.
    const v = assessLayout({ declared: DECLARED, generated: [], nested: NESTED });

    expect(v.ok).toBe(false);
    expect(v.missing).toHaveLength(DECLARED.length);
  });

  it('says so plainly when the layout is intact', () => {
    const v = assessLayout({ declared: DECLARED, generated: GENERATED, nested: NESTED });

    expect(v.reason).toContain('3 nested');
    expect(v.reason).toContain('2 flat');
  });
});

describe('NESTED_MODULES', () => {
  it('pins exactly the three barrels the #4523 vote resolved to leave alone', () => {
    expect([...NESTED_MODULES].sort()).toEqual(['agents-ictm', 'benchmarks', 'pipeline']);
  });
});
