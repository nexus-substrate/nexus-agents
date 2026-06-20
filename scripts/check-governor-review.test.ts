/**
 * Tests for the warn-first governor-path pr_review audit gate (#3831, Epic B).
 *
 * Proves the binding-condition behaviors:
 *  (a) a valid sha-bound record for the PR → PASS;
 *  (b) NO record → WARN (not fail) — warn-first;
 *  (c) NEGATIVE: a record with the WRONG/stale headSha → NOT accepted (still
 *      WARN), proving the gate is not theater (condition 1, mandatory);
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
].join('\n');

const GOVERNOR_PATTERNS = governorPathsFromCodeowners(CODEOWNERS_SAMPLE);

function record(overrides: Partial<BuildPrReviewRecordInput> = {}): PrReviewRecord {
  return buildPrReviewRecord({
    prNumber: 5000,
    headSha: SHA_HEAD,
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
    headSha: SHA_HEAD,
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
    expect(matchesCodeownersPattern('scripts/inject-governance.ts', '/scripts/inject-governance.ts')).toBe(
      true
    );
    expect(matchesCodeownersPattern('scripts/inject-other.ts', '/scripts/inject-governance.ts')).toBe(
      false
    );
  });
  it('matches a glob pattern within a segment', () => {
    expect(matchesCodeownersPattern('governance/claims-registry.yaml', '/governance/claims-registry.*')).toBe(
      true
    );
  });
  it('isGovernorPath aggregates the pattern set', () => {
    expect(isGovernorPath('CLAUDE.md', GOVERNOR_PATTERNS)).toBe(true);
    expect(isGovernorPath('README.md', GOVERNOR_PATTERNS)).toBe(false);
  });
});

describe('analyzeGovernorReview — binding conditions', () => {
  it('(a) PASSES with a valid sha-bound record for the PR', () => {
    const outcome = analyzeGovernorReview(inputs({ records: [record()] }));
    expect(outcome.kind).toBe('pass');
  });

  it('(b) WARNS (not fails) when NO record exists — warn-first', () => {
    const outcome = analyzeGovernorReview(inputs({ records: [] }));
    expect(outcome.kind).toBe('warn');
    if (outcome.kind === 'warn') {
      expect(outcome.message).toContain('NO sha-bound pr_review record');
      expect(outcome.message).toContain('Warn-first');
    }
  });

  it('(c) NEGATIVE: a record with the WRONG/stale headSha is NOT accepted (still warns)', () => {
    // Record exists for THIS PR but against a stale head sha → must NOT satisfy.
    const stale = record({ headSha: SHA_STALE });
    const outcome = analyzeGovernorReview(inputs({ records: [stale] }));
    expect(outcome.kind).toBe('warn');
    if (outcome.kind === 'warn') {
      // The warn should call out the stale-sha record explicitly.
      expect(outcome.message).toContain('STALE head sha');
      expect(outcome.message).toContain(SHA_STALE);
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
  it('reads --pr and --sha from argv', () => {
    const ctx = resolvePrContext(['--pr', '777', '--sha', SHA_HEAD]);
    expect(ctx.prNumber).toBe(777);
    expect(ctx.headSha).toBe(SHA_HEAD);
  });
  it('falls back to env vars', () => {
    const prev = { PR_NUMBER: process.env['PR_NUMBER'], PR_HEAD_SHA: process.env['PR_HEAD_SHA'] };
    process.env['PR_NUMBER'] = '888';
    process.env['PR_HEAD_SHA'] = SHA_STALE;
    try {
      const ctx = resolvePrContext([]);
      expect(ctx.prNumber).toBe(888);
      expect(ctx.headSha).toBe(SHA_STALE);
    } finally {
      if (prev.PR_NUMBER === undefined) delete process.env['PR_NUMBER'];
      else process.env['PR_NUMBER'] = prev.PR_NUMBER;
      if (prev.PR_HEAD_SHA === undefined) delete process.env['PR_HEAD_SHA'];
      else process.env['PR_HEAD_SHA'] = prev.PR_HEAD_SHA;
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
