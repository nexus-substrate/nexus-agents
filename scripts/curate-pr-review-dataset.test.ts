/**
 * Tests for the pr_review eval-set curation pipeline (#3847) and its rubric
 * schema (#3846).
 *
 * Proves: (a) the committed dataset is rubric-valid and its rubricVersion
 * matches the rubric doc header; (b) the validator enforces the rubric rules
 * (severity floor, borderline exclusivity, location tolerance, version
 * lockstep) by rejecting deliberately-broken fixtures; (c) stats report the
 * documented class balance; (d) the `add` skeleton is itself rubric-valid.
 *
 * @module scripts/curate-pr-review-dataset.test
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

import { describe, it, expect } from 'vitest';
import { parseDataset } from './curate-pr-review-dataset-schema.js';
import {
  validateDataset,
  loadDataset,
  computeStats,
  rubricDocVersion,
  skeletonEntry,
} from './curate-pr-review-dataset.js';

/** Wrap a single case in a minimal valid dataset envelope and parse it. */
function parseSingle(c: Record<string, unknown>): boolean {
  return parseDataset({
    rubricVersion: '1.0.0',
    curatedAt: 'x',
    methodology: 'fixture dataset',
    prs: [c],
  }).success;
}

// A minimal valid buggy case used as the mutation base for negative tests.
function validBuggyCase(): Record<string, unknown> {
  return {
    number: 'synthetic-fixture',
    rubricVersion: '1.0.0',
    class: 'buggy',
    title: 'fixture',
    provenance: { source: 'synthetic', fixReference: 'synthetic', discoveredBy: null },
    knownBugs: [
      {
        summary: 'a statable bug summary',
        severity: 'medium',
        location: 'path/to/file.ts:10',
        locationTolerance: 'line',
        fixReference: 'synthetic',
      },
    ],
    borderlineConcerns: [],
    adjudication: {
      adjudicatedAt: '2026-06-16',
      adjudicatedUnder: '1.0.0',
      rationale: 'reachable failure statable as a failing test assertion',
    },
  };
}

describe('committed dataset', () => {
  it('is rubric-valid and version-locked to the rubric doc', () => {
    const { versionMatches, dataset, docVersion } = validateDataset();
    expect(versionMatches).toBe(true);
    expect(dataset.rubricVersion).toBe(docVersion);
  });

  it('reflects the post-#3847 class balance after the outcome-mined pilot promotion (10 buggy / 8 clean / 1 borderline, n=19)', () => {
    const stats = computeStats(loadDataset());
    expect(stats.n).toBe(19);
    expect(stats.byClass).toEqual({ buggy: 10, clean: 8, borderline: 1 });
  });

  it('keeps the rubric doc version at the major it was re-adjudicated under', () => {
    expect(rubricDocVersion().startsWith('1.')).toBe(true);
  });
});

describe('schema — rubric rule enforcement', () => {
  it('accepts a well-formed buggy case', () => {
    expect(parseSingle(validBuggyCase())).toBe(true);
  });

  it('Rule 1: rejects class "clean" carrying a medium+ bug', () => {
    expect(parseSingle({ ...validBuggyCase(), class: 'clean' })).toBe(false);
  });

  it('Rule 1: rejects class "buggy" with no medium+ bug', () => {
    expect(parseSingle({ ...validBuggyCase(), knownBugs: [] })).toBe(false);
  });

  it('Rule 4: rejects a borderline case carrying confirmed bugs', () => {
    expect(parseSingle({ ...validBuggyCase(), class: 'borderline' })).toBe(false);
  });

  it('Rule 4: rejects borderlineConcerns on a non-borderline case', () => {
    expect(
      parseSingle({
        ...validBuggyCase(),
        borderlineConcerns: [{ summary: 'a concern here', raisedBy: 'x' }],
      })
    ).toBe(false);
  });

  it('Rule 2: rejects a line-tolerance bug without a :line location', () => {
    const base = validBuggyCase();
    const bug = {
      ...(base.knownBugs as Array<Record<string, unknown>>)[0],
      location: 'path/to/file.ts',
    };
    expect(parseSingle({ ...base, knownBugs: [bug] })).toBe(false);
  });

  it('Rule 2: accepts a structural bug with a path-only location', () => {
    const base = validBuggyCase();
    const bug = {
      ...(base.knownBugs as Array<Record<string, unknown>>)[0],
      location: 'path/to/file.ts',
      locationTolerance: 'structural',
    };
    expect(parseSingle({ ...base, knownBugs: [bug] })).toBe(true);
  });

  it('rejects unknown keys (strict shape)', () => {
    expect(parseSingle({ ...validBuggyCase(), surprise: true })).toBe(false);
  });

  it('dataset: rejects an entry whose rubricVersion differs from the dataset version', () => {
    const result = parseDataset({
      rubricVersion: '1.0.0',
      curatedAt: 'x',
      methodology: 'fixture dataset',
      prs: [{ ...validBuggyCase(), rubricVersion: '2.0.0' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('add skeleton', () => {
  it.each(['buggy', 'clean', 'borderline', 'synthetic-buggy', 'synthetic-clean'] as const)(
    'emits a rubric-valid %s skeleton (modulo TODO placeholders)',
    (kind) => {
      const skel = skeletonEntry(kind, '1.0.0') as Record<string, unknown>;
      // The skeleton is structurally valid; only string CONTENT is TODO.
      expect(parseSingle(skel)).toBe(true);
    }
  );
});
