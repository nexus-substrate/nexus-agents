/**
 * Tests for the pr_review candidate-MINING pipeline's PURE logic (#3847).
 *
 * Proves, against fixtures (NO live gh, NO network): bot-PR exclusion; the
 * conservative weak-label heuristic (confirmed defect-fix → likely-buggy;
 * refinement / long-tenure-no-fix → likely-clean; ambiguous fix or too-young
 * no-fix → unknown); diff bounding never invents content; dedup against both the
 * dataset and prior candidates; and that re-running never overwrites an
 * owner-adjudicated candidate. Every emitted case is adjudicated:false with a
 * neutral placeholder class — the miner asserts no verdict.
 *
 * @module scripts/mine-pr-review-candidates.test
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

import { describe, it, expect } from 'vitest';
import {
  boundDiff,
  daysSinceMerge,
  deriveWeakLabel,
  isBotAuthored,
  filterByMinAge,
  buildPrListArgs,
  growFetchLimit,
  assembleDiffFromFiles,
  CLEAN_TENURE_DAYS,
  DEFAULT_DIFF_CHAR_CAP,
  MAX_FETCH_LIMIT,
  type MergedPrWithDiff,
} from './mine-pr-review-candidates-core.js';
import {
  assembleCandidate,
  mineCandidates,
  mergeCandidates,
  buildCandidatesFile,
  type CandidateCase,
} from './mine-pr-review-candidates-assemble.js';
import { parseArgs, summarize } from './mine-pr-review-candidates.js';
import type { PrSignals, FollowUpFix } from './curate-pr-review-labeling.js';

const NOW = new Date('2026-06-20T00:00:00Z');

function signals(over: Partial<PrSignals> = {}): PrSignals {
  return {
    number: 100,
    title: 'feat(x): a feature',
    url: 'https://github.com/nexus-substrate/nexus-agents/pull/100',
    changedSourceFiles: ['packages/nexus-agents/src/x/a.ts'],
    followUpFixes: [],
    reviewDecision: null,
    ...over,
  };
}

function fix(over: Partial<FollowUpFix> = {}): FollowUpFix {
  return {
    fixPrNumber: 200,
    fixType: 'fix',
    overlappingSourceFiles: ['packages/nexus-agents/src/x/a.ts'],
    ...over,
  };
}

function mergedPr(over: Partial<MergedPrWithDiff> = {}): MergedPrWithDiff {
  return {
    number: 100,
    title: 'feat(x): a feature',
    body: 'does a thing',
    url: 'https://github.com/nexus-substrate/nexus-agents/pull/100',
    author: 'williamzujkowski',
    mergedAt: '2026-01-01T00:00:00Z',
    files: ['packages/nexus-agents/src/x/a.ts'],
    reviewDecision: null,
    diff: 'diff --git a/x b/x\n+const x = 1;\n',
    ...over,
  };
}

// ============================================================================
// Bot-PR exclusion
// ============================================================================

describe('isBotAuthored', () => {
  it('flags changeset-release, dependabot, github-actions, and [bot]', () => {
    expect(isBotAuthored('changeset-release[bot]')).toBe(true);
    expect(isBotAuthored('dependabot[bot]')).toBe(true);
    expect(isBotAuthored('github-actions[bot]')).toBe(true);
    expect(isBotAuthored('renovate[bot]')).toBe(true);
  });
  it('does not flag human logins', () => {
    expect(isBotAuthored('williamzujkowski')).toBe(false);
    expect(isBotAuthored('grenlan')).toBe(false);
  });
});

// ============================================================================
// daysSinceMerge
// ============================================================================

describe('daysSinceMerge', () => {
  it('computes whole days, floors negatives/unparseable to 0', () => {
    expect(daysSinceMerge('2026-06-10T00:00:00Z', NOW)).toBe(10);
    expect(daysSinceMerge('2026-06-25T00:00:00Z', NOW)).toBe(0); // future → 0
    expect(daysSinceMerge('not-a-date', NOW)).toBe(0);
  });
});

// ============================================================================
// filterByMinAge — --min-age-days targeting (#4316)
// ============================================================================

describe('filterByMinAge', () => {
  const prs = [
    { number: 1, mergedAt: '2026-06-19T00:00:00Z' }, // 1 day old
    { number: 2, mergedAt: '2026-06-10T00:00:00Z' }, // 10 days old
    { number: 3, mergedAt: '2026-05-01T00:00:00Z' }, // 50 days old
    { number: 4, mergedAt: '2026-04-01T00:00:00Z' }, // 80 days old
  ];

  it('keeps only PRs merged at least N days ago', () => {
    const kept = filterByMinAge(prs, 42, NOW);
    expect(kept.map((p) => p.number)).toEqual([3, 4]);
  });

  it('is a no-op (returns everything) when minAgeDays is 0 (the default)', () => {
    expect(filterByMinAge(prs, 0, NOW)).toEqual(prs);
  });

  it('keeps nothing when every PR is younger than the threshold', () => {
    expect(filterByMinAge(prs, 1000, NOW)).toEqual([]);
  });
});

// ============================================================================
// growFetchLimit — page enlargement when --min-age-days filters out most of a page
// ============================================================================

describe('growFetchLimit', () => {
  it('doubles the raw fetch limit toward the target, never below the target', () => {
    expect(growFetchLimit(50, 50)).toBe(100);
    expect(growFetchLimit(20, 50)).toBe(50);
  });

  it('caps growth at MAX_FETCH_LIMIT', () => {
    expect(growFetchLimit(400, 50)).toBe(MAX_FETCH_LIMIT);
    expect(growFetchLimit(MAX_FETCH_LIMIT, 50)).toBe(MAX_FETCH_LIMIT);
  });
});

// ============================================================================
// buildPrListArgs — query assembly for `gh pr list` (--search passthrough, #4316)
// ============================================================================

describe('buildPrListArgs', () => {
  const JSON_FIELDS = 'number,title,body,url,mergedAt,author,files,reviewDecision';

  it('defaults to --state merged when no --search is given', () => {
    const args = buildPrListArgs({ repo: 'nexus-substrate/nexus-agents', limit: 50 });
    expect(args).toEqual([
      'pr',
      'list',
      '--repo',
      'nexus-substrate/nexus-agents',
      '--state',
      'merged',
      '--limit',
      '50',
      '--json',
      JSON_FIELDS,
    ]);
  });

  it('uses --search instead of --state when a search query is given (no conflicting flags)', () => {
    const args = buildPrListArgs({
      repo: 'nexus-substrate/nexus-agents',
      limit: 80,
      search: 'merged:<2026-06-06 is:merged',
    });
    expect(args).toEqual([
      'pr',
      'list',
      '--repo',
      'nexus-substrate/nexus-agents',
      '--search',
      'merged:<2026-06-06 is:merged',
      '--limit',
      '80',
      '--json',
      JSON_FIELDS,
    ]);
    expect(args).not.toContain('--state');
  });

  it('ignores an empty/null search string and falls back to --state merged', () => {
    const args = buildPrListArgs({ repo: 'r/r', limit: 10, search: null });
    expect(args).toContain('--state');
    expect(args).not.toContain('--search');
  });
});

// ============================================================================
// assembleDiffFromFiles — 406-fallback assembly from the files API (#4316)
// ============================================================================

describe('assembleDiffFromFiles', () => {
  it('assembles a unified-diff-ish excerpt from real patch fields only', () => {
    const files = [
      { filename: 'a.ts', patch: '@@ -1 +1 @@\n-old\n+new' },
      { filename: 'b.ts', patch: '@@ -1 +1 @@\n-x\n+y' },
    ];
    const out = assembleDiffFromFiles(files, 10000);
    expect(out).toContain('diff --git a/a.ts b/a.ts');
    expect(out).toContain('-old\n+new');
    expect(out).toContain('diff --git a/b.ts b/b.ts');
    expect(out).toContain('-x\n+y');
  });

  it('skips patch-less entries (binary/oversized-per-file) rather than fabricating content', () => {
    const files = [
      { filename: 'a.ts', patch: '@@ -1 +1 @@\n-old\n+new' },
      { filename: 'big.bin' }, // no patch field (binary or too large per-file)
      { filename: 'c.ts', patch: '' },
    ];
    const out = assembleDiffFromFiles(files, 10000);
    expect(out).toContain('a.ts');
    expect(out).not.toContain('big.bin');
    expect(out).not.toContain('c.ts');
  });

  it('returns empty string (never invents) when no file has usable patch content', () => {
    expect(assembleDiffFromFiles([{ filename: 'big.bin' }], 10000)).toBe('');
    expect(assembleDiffFromFiles([], 10000)).toBe('');
  });

  it('respects the cap, truncating with an explicit marker rather than overflowing', () => {
    const files = [{ filename: 'a.ts', patch: 'x'.repeat(500) }];
    const out = assembleDiffFromFiles(files, 100);
    expect(out.length).toBeLessThan(600);
    expect(out).toContain('diff truncated');
  });

  it('stops adding further files once the cap is reached, without truncating mid-earlier-file needlessly', () => {
    const files = [
      { filename: 'a.ts', patch: 'a'.repeat(50) },
      { filename: 'b.ts', patch: 'b'.repeat(500) },
    ];
    const out = assembleDiffFromFiles(files, 80);
    expect(out).toContain('a.ts');
    expect(out).toContain('diff truncated');
  });
});

// ============================================================================
// Weak-label heuristic (TRIAGE HINT — never a verdict)
// ============================================================================

describe('deriveWeakLabel — conservative triage heuristic', () => {
  it('likely-buggy on a confirmed defect-fix follow-up', () => {
    const r = deriveWeakLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(x): guard against a silently dropped result']]),
      100
    );
    expect(r.weakLabel).toBe('likely-buggy');
    expect(r.weakLabelEvidence).toContain('#200');
  });

  it('likely-clean on a refinement-only follow-up', () => {
    const r = deriveWeakLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(x): refine heuristics, no behavior change']]),
      100
    );
    expect(r.weakLabel).toBe('likely-clean');
  });

  it('likely-clean on NO follow-up once the long-tenure window clears', () => {
    const r = deriveWeakLabel(signals(), new Map(), CLEAN_TENURE_DAYS + 1);
    expect(r.weakLabel).toBe('likely-clean');
    expect(r.weakLabelEvidence).toContain('long-tenure');
  });

  it('unknown on NO follow-up when the PR is too young (conservative)', () => {
    const r = deriveWeakLabel(signals(), new Map(), CLEAN_TENURE_DAYS - 1);
    expect(r.weakLabel).toBe('unknown');
    expect(r.weakLabelEvidence).toContain('too young');
  });

  it('unknown on an ambiguous bare fix (never guessed)', () => {
    const r = deriveWeakLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(x): tweak']]),
      100
    );
    expect(r.weakLabel).toBe('unknown');
  });
});

// ============================================================================
// Diff bounding (never invent)
// ============================================================================

describe('boundDiff', () => {
  it('returns the diff verbatim when within the cap', () => {
    expect(boundDiff('short diff', 100)).toBe('short diff');
  });
  it('truncates with an explicit marker, never synthesizes', () => {
    const big = 'x'.repeat(DEFAULT_DIFF_CHAR_CAP + 100);
    const bounded = boundDiff(big);
    expect(bounded.length).toBeLessThan(big.length + 100);
    expect(bounded).toContain('diff truncated');
    expect(bounded.startsWith('x'.repeat(DEFAULT_DIFF_CHAR_CAP))).toBe(true);
  });
});

// ============================================================================
// assembleCandidate — schema mirrors pr-review-sample + candidate fields
// ============================================================================

describe('assembleCandidate', () => {
  const page = [
    mergedPr({ number: 100, mergedAt: '2026-01-01T00:00:00Z' }),
    mergedPr({
      number: 200,
      title: 'fix(x): guard against a silently dropped result',
      body: 'follow-up to #100',
      files: ['packages/nexus-agents/src/x/a.ts'],
    }),
  ];
  const titles = new Map(page.map((p) => [p.number, p.title]));

  it('emits a neutral, adjudicated:false candidate carrying only a weakLabel', () => {
    const c = assembleCandidate(page[0]!, page, titles, {
      rubricVersion: '1.0.0',
      now: NOW,
      diffCharCap: DEFAULT_DIFF_CHAR_CAP,
    });
    expect(c.class).toBe('borderline'); // neutral placeholder, NOT a verdict
    expect(c.adjudicated).toBe(false);
    expect(c.knownBugs).toEqual([]);
    expect(c.adjudication.adjudicatedAt).toBeNull();
    expect(c.adjudication.rationale).toContain('UNADJUDICATED');
    expect(c.provenance.source).toBe('outcome-mined');
    // #100 has a defect-fix follow-up (#200) → likely-buggy + fixReference set.
    expect(c.weakLabel).toBe('likely-buggy');
    expect(c.provenance.fixReference).toBe('#200');
  });

  it('uses the REAL diff (bounded), never invents one', () => {
    const c = assembleCandidate(page[0]!, page, titles, {
      rubricVersion: '1.0.0',
      now: NOW,
      diffCharCap: DEFAULT_DIFF_CHAR_CAP,
    });
    expect(c.customDiff).toBe(page[0]!.diff);
  });
});

// ============================================================================
// mineCandidates — bot/dedup filtering
// ============================================================================

describe('mineCandidates — eligibility + dedup', () => {
  const opts = { rubricVersion: '1.0.0', now: NOW, diffCharCap: DEFAULT_DIFF_CHAR_CAP };

  it('excludes bot PRs, dataset PRs, prior candidates, and non-source PRs', () => {
    const page: MergedPrWithDiff[] = [
      mergedPr({ number: 1, author: 'williamzujkowski', mergedAt: '2026-01-01T00:00:00Z' }),
      mergedPr({ number: 2, author: 'changeset-release[bot]' }), // bot
      mergedPr({ number: 3 }), // dataset dup
      mergedPr({ number: 4 }), // prior-candidate dup
      mergedPr({ number: 5, files: ['docs/x.md'] }), // no source
    ];
    const dedup = {
      datasetNumbers: new Set([3]),
      existingCandidateNumbers: new Set([4]),
    };
    const mined = mineCandidates(page, dedup, opts);
    expect(mined.map((c) => c.number)).toEqual([1]);
  });

  it('is idempotent: re-mining the same page against its own output adds nothing', () => {
    const page = [
      mergedPr({ number: 1, mergedAt: '2026-01-01T00:00:00Z' }),
      mergedPr({ number: 2, mergedAt: '2026-01-01T00:00:00Z' }),
    ];
    const dedup = {
      datasetNumbers: new Set<number>(),
      existingCandidateNumbers: new Set<number>(),
    };
    const first = mineCandidates(page, dedup, opts);
    const second = mineCandidates(
      page,
      {
        datasetNumbers: new Set<number>(),
        existingCandidateNumbers: new Set(first.map((c) => c.number)),
      },
      opts
    );
    expect(second).toHaveLength(0);
  });
});

// ============================================================================
// mergeCandidates — never overwrite an adjudicated candidate
// ============================================================================

describe('mergeCandidates', () => {
  function candidate(over: Partial<CandidateCase>): CandidateCase {
    return {
      number: 1,
      rubricVersion: '1.0.0',
      class: 'borderline',
      title: 't',
      customDescription: '',
      customDiff: '',
      provenance: {
        source: 'outcome-mined',
        sourcePrUrl: '',
        mergedAt: '',
        fixReference: null,
        discoveredBy: null,
      },
      knownBugs: [],
      borderlineConcerns: [],
      weakLabel: 'unknown',
      weakLabelEvidence: '',
      adjudicated: false,
      adjudication: { adjudicatedAt: null, adjudicatedUnder: null, rationale: '' },
      ...over,
    };
  }

  it('preserves a prior adjudicated candidate verbatim and drops a colliding new one', () => {
    const prior = [
      {
        ...candidate({ number: 7 }),
        adjudicated: true as unknown as false,
        weakLabel: 'likely-buggy' as const,
      },
    ];
    const mined = [candidate({ number: 7, weakLabel: 'unknown' }), candidate({ number: 8 })];
    const merged = mergeCandidates(prior, mined);
    const seven = merged.find((c) => c.number === 7);
    expect(seven?.adjudicated).toBe(true); // not clobbered
    expect(seven?.weakLabel).toBe('likely-buggy');
    expect(merged.map((c) => c.number).sort((a, b) => a - b)).toEqual([7, 8]);
  });
});

// ============================================================================
// buildCandidatesFile + CLI helpers
// ============================================================================

describe('buildCandidatesFile', () => {
  it('wraps candidates with the no-fabrication note and generator stamp', () => {
    const file = buildCandidatesFile([], '1.0.0', NOW);
    expect(file.generatedBy).toBe('scripts/mine-pr-review-candidates.ts');
    expect(file.note).toContain('not dataset entries');
    expect(file.note).toContain('triage hint');
    expect(file.generatedAt).toBe('2026-06-20');
  });
});

describe('parseArgs / summarize', () => {
  it('parses limit/diff-cap/out with sane defaults, search/min-age-days off by default', () => {
    expect(parseArgs([])).toEqual({
      limit: 50,
      diffCap: DEFAULT_DIFF_CHAR_CAP,
      out: expect.any(String),
      search: null,
      minAgeDays: 0,
    });
    const a = parseArgs(['--limit', '10', '--diff-cap', '500', '--out', '/tmp/x.json']);
    expect(a).toEqual({
      limit: 10,
      diffCap: 500,
      out: '/tmp/x.json',
      search: null,
      minAgeDays: 0,
    });
  });

  it('parses --search and --min-age-days', () => {
    const a = parseArgs(['--search', 'merged:<2026-06-06 is:merged', '--min-age-days', '42']);
    expect(a.search).toBe('merged:<2026-06-06 is:merged');
    expect(a.minAgeDays).toBe(42);
  });

  it('tallies weak labels for the run summary', () => {
    const cs = [
      { weakLabel: 'likely-buggy' },
      { weakLabel: 'likely-clean' },
      { weakLabel: 'likely-clean' },
      { weakLabel: 'unknown' },
    ] as CandidateCase[];
    expect(summarize(cs)).toBe('likely-buggy=1 likely-clean=2 unknown=1');
  });
});
