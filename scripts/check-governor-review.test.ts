/**
 * Tests for the warn-first governor-path pr_review audit gate (#3831, Epic B).
 *
 * Proves the binding-condition behaviors:
 *  (a) a valid diff-bound record for the PR → PASS;
 *  (b) NO record → WARN (not fail) — warn-first;
 *  (c) NEGATIVE: a record bound to a DIFFERENT reviewed diff → NOT accepted (still
 *      WARN), proving the gate is not theater (Option-C diff-binding, mandatory);
 *  (d) a tampered record set (bad self-hash / sequence gap) → FAIL CLOSED;
 *  (e) genesis-exempt PR → PASS;
 *  (f) non-governor-path PR → PASS without needing a record.
 * Plus the CODEOWNERS single-source path derivation and the genesis parser.
 *
 * @module scripts/check-governor-review.test
 * (Source: Issue #3831)
 */

import { describe, it, expect } from 'vitest';

import {
  analyzeGovernorReview,
  governorPathsFromCodeowners,
  matchesCodeownersPattern,
  isGovernorPath,
  parseGenesisExemptions,
  resolvePrContext,
  resolveChangedFiles,
  type GovernorReviewInputs,
} from './check-governor-review.js';
import type { PrReviewRecord } from '../packages/nexus-agents/src/audit/index.js';
import {
  buildPrReviewRecord,
  type BuildPrReviewRecordInput,
} from '../packages/nexus-agents/src/audit/index.js';

const SHA_HEAD = 'a'.repeat(40);
const SHA_STALE = 'b'.repeat(40);
const SHA_BASE = 'e'.repeat(40);
// reviewedDiffHash values (64-hex): DIFF_HASH is the gate-recomputed hash a record
// must match; DIFF_HASH_STALE is a record bound to a DIFFERENT (changed) diff.
const DIFF_HASH = 'c'.repeat(64);
const DIFF_HASH_STALE = 'd'.repeat(64);

/** Restore (or clear) an env var after a test override. `Reflect.deleteProperty`
 * avoids the `delete obj[key]` dynamic-delete lint rule. */
function restoreEnv(key: string, prev: string | undefined): void {
  if (prev === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = prev;
}

/** A small CODEOWNERS sample carrying both pre-section and governor entries. */
const CODEOWNERS_SAMPLE = [
  '# Security modules',
  '/packages/nexus-agents/src/security/ @owner',
  '/packages/nexus-agents/src/mcp/ @owner',
  '',
  "# Governor's own core — the governance-of-the-governor paths.",
  '# Audit hash chain',
  '/packages/nexus-agents/src/audit/ @owner',
  '# Governance source',
  '/packages/nexus-agents/src/governance/ @owner',
  '/scripts/inject-governance.ts @owner',
  '/governance/ @owner',
  '/CLAUDE.md @owner',
  '/CODEOWNERS @owner',
  '# END governor-owned paths',
].join('\n');

const GOVERNOR_PATTERNS = governorPathsFromCodeowners(CODEOWNERS_SAMPLE);

function record(overrides: Partial<BuildPrReviewRecordInput> = {}): PrReviewRecord {
  return buildPrReviewRecord({
    prNumber: 5000,
    baseSha: SHA_BASE,
    reviewedDiffHash: DIFF_HASH,
    verdict: 'approve',
    verified: false,
    voteCounts: { approve: 3, request_changes: 0, abstain: 0, error: 0, total: 3 },
    summary: 'ok',
    sequence: 0,
    recordedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  });
}

function inputs(overrides: Partial<GovernorReviewInputs> = {}): GovernorReviewInputs {
  return {
    prNumber: 5000,
    reviewedDiffHash: DIFF_HASH,
    baseSha: SHA_BASE,
    changedFiles: ['packages/nexus-agents/src/audit/audit-logger.ts'],
    governorPatterns: GOVERNOR_PATTERNS,
    records: [],
    genesisExemptPrs: new Set<number>(),
    ...overrides,
  };
}

describe('governorPathsFromCodeowners — single-source path derivation', () => {
  it('extracts ONLY the governance-of-the-governor section patterns', () => {
    expect(GOVERNOR_PATTERNS).toEqual([
      '/packages/nexus-agents/src/audit/',
      '/packages/nexus-agents/src/governance/',
      '/scripts/inject-governance.ts',
      '/governance/',
      '/CLAUDE.md',
      '/CODEOWNERS',
    ]);
    // Pre-section entries are NOT governor paths.
    expect(GOVERNOR_PATTERNS).not.toContain('/packages/nexus-agents/src/security/');
    expect(GOVERNOR_PATTERNS).not.toContain('/packages/nexus-agents/src/mcp/');
  });
});

describe('matchesCodeownersPattern', () => {
  it('matches a directory pattern recursively', () => {
    expect(
      matchesCodeownersPattern(
        'packages/nexus-agents/src/audit/pr-review-record.ts',
        '/packages/nexus-agents/src/audit/'
      )
    ).toBe(true);
  });
  it('does not match a sibling directory', () => {
    expect(
      matchesCodeownersPattern(
        'packages/nexus-agents/src/security/sanitizer.ts',
        '/packages/nexus-agents/src/audit/'
      )
    ).toBe(false);
  });
  it('matches an exact file pattern', () => {
    expect(
      matchesCodeownersPattern('scripts/inject-governance.ts', '/scripts/inject-governance.ts')
    ).toBe(true);
    expect(
      matchesCodeownersPattern('scripts/inject-other.ts', '/scripts/inject-governance.ts')
    ).toBe(false);
  });
  it('matches a glob pattern within a segment', () => {
    expect(
      matchesCodeownersPattern('governance/claims-registry.yaml', '/governance/claims-registry.*')
    ).toBe(true);
  });
  it('isGovernorPath aggregates the pattern set', () => {
    expect(isGovernorPath('CLAUDE.md', GOVERNOR_PATTERNS)).toBe(true);
    expect(isGovernorPath('README.md', GOVERNOR_PATTERNS)).toBe(false);
  });
});

describe('analyzeGovernorReview — binding conditions', () => {
  it('(a) PASSES with a valid diff-bound record for the PR (baseSha consistent)', () => {
    const outcome = analyzeGovernorReview(inputs({ records: [record()] }));
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') expect(outcome.reason).toContain('baseSha consistent');
  });

  it("(a2) WARNS when the record's baseSha does NOT match the PR's actual base (#4058)", () => {
    // Same diff CONTENT (reviewedDiffHash matches) but the record records a base that
    // is not the PR's real base → provenance inconsistent → warn-first (enforce: fail).
    const outcome = analyzeGovernorReview(inputs({ records: [record()], baseSha: SHA_STALE }));
    expect(outcome.kind).toBe('warn');
    if (outcome.kind === 'warn') {
      expect(outcome.message).toContain('does NOT match');
      expect(outcome.message).toContain('#4058');
    }
  });

  it('(a3) is case-insensitive on baseSha — no spurious warn for an upper-cased CI base', () => {
    const outcome = analyzeGovernorReview(
      inputs({ records: [record()], baseSha: SHA_BASE.toUpperCase() })
    );
    expect(outcome.kind).toBe('pass');
  });

  it('(a4) FAILS OPEN (passes) on a non-40-hex CI base — no spurious provenance warn', () => {
    // An abbreviated/odd base is not comparable to the record's pinned 40-hex format;
    // we PASS on the hash match rather than risk a false warn.
    const outcome = analyzeGovernorReview(inputs({ records: [record()], baseSha: 'abc1234' }));
    expect(outcome.kind).toBe('pass');
  });

  it('(b) WARNS (not fails) when NO record exists — warn-first', () => {
    const outcome = analyzeGovernorReview(inputs({ records: [] }));
    expect(outcome.kind).toBe('warn');
    if (outcome.kind === 'warn') {
      expect(outcome.message).toContain('NO diff-bound pr_review record');
      expect(outcome.message).toContain('Warn-first');
    }
  });

  it('(c) NEGATIVE: a record bound to a DIFFERENT reviewed diff is NOT accepted (still warns)', () => {
    // Record exists for THIS PR but against a different (changed) diff → must NOT satisfy.
    const stale = record({ reviewedDiffHash: DIFF_HASH_STALE });
    const outcome = analyzeGovernorReview(inputs({ records: [stale] }));
    expect(outcome.kind).toBe('warn');
    if (outcome.kind === 'warn') {
      // The warn should call out the different-diff record explicitly.
      expect(outcome.message).toContain('DIFFERENT reviewed diff');
      expect(outcome.message).toContain(DIFF_HASH_STALE.slice(0, 12));
    }
  });

  it('(d) FAILS CLOSED on a tampered record (bad self-hash)', () => {
    const good = record();
    const tampered: PrReviewRecord = { ...good, verdict: 'request_changes' }; // hash no longer matches
    const outcome = analyzeGovernorReview(inputs({ records: [tampered] }));
    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') {
      expect(outcome.message).toContain('TAMPER EVIDENCE');
      expect(outcome.message).toContain('hash_mismatch');
    }
  });

  it('(d2) FAILS CLOSED on a sequence gap — even on a non-governor PR (integrity first)', () => {
    const a = record({ prNumber: 1, sequence: 0 });
    const c = record({ prNumber: 2, sequence: 2 }); // gap at 1
    const outcome = analyzeGovernorReview(
      inputs({
        changedFiles: ['README.md'], // non-governor
        records: [a, c],
      })
    );
    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') expect(outcome.message).toContain('sequence_gap');
  });

  it('(v1) FAILS when the diff-bound record REQUESTED CHANGES', () => {
    // The gate returned pass on record EXISTENCE and never read the verdict —
    // it even interpolated `verdict=request_changes` into the pass reason. A
    // reviewer who explicitly refused a governor-path change satisfied the
    // gate that exists to require review.
    const outcome = analyzeGovernorReview(
      inputs({ records: [record({ verdict: 'request_changes' })] })
    );

    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') expect(outcome.message).toContain('request_changes');
  });

  it('(v2) WARNS on an abstain record — nothing affirmed, nothing refused', () => {
    // Abstain carries no signal either way, so it sits with absence under the
    // warn-first posture rather than blocking ahead of the #4058 flip.
    const outcome = analyzeGovernorReview(inputs({ records: [record({ verdict: 'abstain' })] }));

    expect(outcome.kind).toBe('warn');
  });

  it('(v3) still PASSES an approve record', () => {
    // The pair. Failing every verdict would satisfy v1 and v2 and block all
    // governor-path work.
    expect(analyzeGovernorReview(inputs({ records: [record()] })).kind).toBe('pass');
  });

  it('(v4) a request_changes is not shadowed by an earlier approve on the same diff', () => {
    // `records.find(...)` returned the FIRST match in an append-only ledger,
    // so the EARLIEST review for a diff won and every later one was ignored.
    // Two reviewers on the identical diff — one approves, one then refuses —
    // and the gate reported pass. Verdicts are now aggregated, refusal wins.
    const approved = record({ sequence: 0 });
    const refused = record({ sequence: 1, verdict: 'request_changes' });

    const outcome = analyzeGovernorReview(inputs({ records: [approved, refused] }));

    expect(outcome.kind).toBe('fail');
  });

  it('(v5) order does not decide the outcome', () => {
    // The same two records the other way round must give the same verdict, or
    // the gate is deciding on ledger position rather than on review content.
    const refused = record({ sequence: 0, verdict: 'request_changes' });
    const approved = record({ sequence: 1 });

    expect(analyzeGovernorReview(inputs({ records: [refused, approved] })).kind).toBe('fail');
  });

  it('(v6) an abstain alongside an approve still passes', () => {
    // Aggregation must not turn a non-signal into a blocker.
    const approved = record({ sequence: 0 });
    const abstained = record({ sequence: 1, verdict: 'abstain' });

    expect(analyzeGovernorReview(inputs({ records: [approved, abstained] })).kind).toBe('pass');
  });

  it('(e) PASSES a genesis-exempt PR even with no record', () => {
    const outcome = analyzeGovernorReview(
      inputs({ records: [], genesisExemptPrs: new Set([5000]) })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') expect(outcome.reason).toContain('genesis-exempt');
  });

  it('(f) PASSES a non-governor-path PR with no record', () => {
    const outcome = analyzeGovernorReview(
      inputs({ changedFiles: ['README.md', 'docs/guide.md'], records: [] })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') expect(outcome.reason).toContain('no governor paths');
  });
});

describe('genesis parser', () => {
  it('parses PR numbers, ignoring comments and blanks', () => {
    const set = parseGenesisExemptions('# header\n3831\n\n  4242  # inline\nnotanumber\n');
    expect(set.has(3831)).toBe(true);
    expect(set.has(4242)).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe('PR context + changed-files resolution', () => {
  it('reads --pr, --base, and --sha from argv', () => {
    const ctx = resolvePrContext(['--pr', '777', '--base', SHA_BASE, '--sha', SHA_HEAD]);
    expect(ctx.prNumber).toBe(777);
    expect(ctx.baseSha).toBe(SHA_BASE);
    expect(ctx.headSha).toBe(SHA_HEAD);
  });
  it('falls back to env vars', () => {
    const prev = {
      PR_NUMBER: process.env['PR_NUMBER'],
      PR_BASE_SHA: process.env['PR_BASE_SHA'],
      PR_HEAD_SHA: process.env['PR_HEAD_SHA'],
    };
    process.env['PR_NUMBER'] = '888';
    process.env['PR_BASE_SHA'] = SHA_BASE;
    process.env['PR_HEAD_SHA'] = SHA_STALE;
    try {
      const ctx = resolvePrContext([]);
      expect(ctx.prNumber).toBe(888);
      expect(ctx.baseSha).toBe(SHA_BASE);
      expect(ctx.headSha).toBe(SHA_STALE);
    } finally {
      restoreEnv('PR_NUMBER', prev.PR_NUMBER);
      restoreEnv('PR_BASE_SHA', prev.PR_BASE_SHA);
      restoreEnv('PR_HEAD_SHA', prev.PR_HEAD_SHA);
    }
  });
  it('parses changed files from a newline/comma list', () => {
    expect(resolveChangedFiles(['--changed-files', 'a.ts\nb.ts, c.ts'])).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
    ]);
  });
});
