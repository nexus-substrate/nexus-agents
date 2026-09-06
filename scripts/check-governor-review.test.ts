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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  analyzeGovernorReview,
  governorPathsFromCodeowners,
  governorSectionLines,
  matchesCodeownersPattern,
  isGovernorPath,
  parseGenesisExemptions,
  resolvePrContext,
  resolveChangedFiles,
  runGovernorReviewGate,
  type GovernorReviewInputs,
} from './check-governor-review.js';
import type { PrReviewRecord } from '../packages/nexus-agents/src/audit/index.js';
import {
  ledgerIntegrityFailure,
  readPrReviewRecords,
} from '../packages/nexus-agents/src/audit/index.js';
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
    reviewedDiffTruncated: false,
    baseSha: SHA_BASE,
    changedFiles: ['packages/nexus-agents/src/audit/audit-logger.ts'],
    governorPatterns: GOVERNOR_PATTERNS,
    records: [],
    genesisExemptPrs: new Set<number>(),
    ...overrides,
  };
}

describe('governor section start marker (#5576)', () => {
  const NO_START_MARKER = [
    // Deliberately does NOT contain the section marker text — a fixture that
    // quotes the marker it claims is missing would start the section anyway.
    '# Ownership',
    '/packages/nexus-agents/src/audit/ @owner',
    '/CODEOWNERS @owner',
    '# END governor-owned paths',
  ].join('\n');

  it('reports that the section never started', () => {
    // Only `terminated` was tracked. With the start marker absent the parser
    // returned lines: [] and no signal, so the caller derived zero governor
    // patterns and every gate downstream reported a pass it never measured.
    expect(governorSectionLines(NO_START_MARKER).started).toBe(false);
    expect(governorSectionLines(CODEOWNERS_SAMPLE).started).toBe(true);
  });

  it('fails the review gate when no governor pattern could be parsed', () => {
    // Deleting or renaming one line in CODEOWNERS — a file the governor owns —
    // used to turn this gate green for every PR after it.
    const outcome = analyzeGovernorReview(
      inputs({ records: [record()], changedFiles: ['CODEOWNERS'], governorPatterns: [] })
    );
    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') expect(outcome.message).toContain('CODEOWNERS');
  });

  it('still passes when patterns parsed and none was touched', () => {
    const outcome = analyzeGovernorReview(
      inputs({ records: [record()], changedFiles: ['README.md'] })
    );
    expect(outcome.kind).toBe('pass');
  });
});

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

// ============================================================================
// A ledger line the reader cannot validate must fail the gate, not vanish
// ============================================================================

describe('ledgerIntegrityFailure', () => {
  // `readPrReviewRecords` drops a line it cannot parse or validate. The gate
  // destructured `{ records }` and discarded `invalidLines`, so tampering that
  // takes a record OUT OF SCHEMA — an unknown key against the `.strict()`
  // shape, a broken brace — removed the evidence instead of failing the check.
  // Editing a covered field is caught by the record's hash; this was not caught
  // at all, and removing the highest `sequence` left no gap for the sequence
  // check either.
  const LEDGER = 'governance/pr-review-records.jsonl';

  it('reports the lines that could not be read', () => {
    const failure = ledgerIntegrityFailure([3, 7], LEDGER);

    expect(failure).not.toBeNull();
    expect(failure).toContain('3, 7');
    expect(failure).toContain(LEDGER);
  });

  it('returns null for a ledger that parsed completely', () => {
    // The pair. Without it the predicate could return a failure for everything
    // and the assertions above would still pass.
    expect(ledgerIntegrityFailure([], LEDGER)).toBeNull();
  });

  it('does not treat an empty ledger as an integrity failure', () => {
    // The empty case, named: today's committed ledger is 0 bytes, so
    // `invalidLines` is empty and `records` is empty. That is "nothing to
    // verify", which the warn branch already reports — not "the ledger is
    // corrupt". Conflating them would redden every governor PR.
    const { records, invalidLines } = readPrReviewRecords('/nonexistent/ledger.jsonl');

    expect(records).toEqual([]);
    expect(ledgerIntegrityFailure(invalidLines, LEDGER)).toBeNull();
  });

  it('flags a record made unreadable by an out-of-schema edit', () => {
    // Drives the real reader over a real tampered line, so the test fails if
    // the schema stops being strict — the property the fix depends on.
    const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
    const file = join(dir, 'pr-review-records.jsonl');
    writeFileSync(file, `${JSON.stringify({ sequence: 0, tampered: 'yes' })}\n`, 'utf8');

    const { records, invalidLines } = readPrReviewRecords(file);

    expect(records).toEqual([]);
    expect(invalidLines).toEqual([1]);
    expect(ledgerIntegrityFailure(invalidLines, file)).not.toBeNull();
  });
});

describe('the gate itself fails closed on an unreadable ledger', () => {
  // The seam, not the parts. The predicate above is pure and its tests pass
  // whether or not the GATE consults it — which is exactly the shape that let
  // `invalidLines` sit destructured-away in the first place. This drives the
  // real entry point.
  function withLedger(contents: string): number {
    const dir = mkdtempSync(join(tmpdir(), 'gov-ledger-'));
    const file = join(dir, 'pr-review-records.jsonl');
    writeFileSync(file, contents, 'utf8');
    return runGovernorReviewGate([], file);
  }

  it('exits 1 when a ledger line cannot be validated', () => {
    expect(withLedger(`${JSON.stringify({ sequence: 0, tampered: 'yes' })}\n`)).toBe(1);
  });

  it('does not exit 1 for an empty ledger', () => {
    // Today's committed ledger is 0 bytes. If this returned 1 the gate would
    // redden every governor PR — the benign population it exists to let
    // through — so the two cases must stay distinguishable.
    expect(withLedger('')).not.toBe(1);
  });
});

// ============================================================================
// A pass over a truncated diff must say which portion it verified
// ============================================================================

describe('reviewed-diff truncation is stated in the verdict', () => {
  // `computeReviewedDiffHash` truncates to MAX_REVIEWED_DIFF_BYTES as part of
  // the canonical form, so content past the cap is UNBOUND on both the producer
  // and the gate side: two diffs identical in their first 50 KB hash the same
  // however they differ after it. `git diff` orders by path, so a new file
  // sorting last lands entirely past the cap.
  //
  // The gate had the diff string in hand, computed the hash and dropped it.
  // `reviewedDiffWasTruncated` lives in the same module and had exactly one
  // caller, which logs at review time where no consumer of the ledger can read
  // it. A partial verification labelled as complete is the failure CLAUDE.md
  // names on the governor path (#5818).
  function passingInputs(truncated: boolean): GovernorReviewInputs {
    return inputs({
      reviewedDiffTruncated: truncated,
      records: [record({ prNumber: 5000, reviewedDiffHash: DIFF_HASH, verdict: 'approve' })],
    });
  }

  it('labels a pass over a truncated diff as partial', () => {
    const outcome = analyzeGovernorReview(passingInputs(true));

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('PARTIAL');
      expect(outcome.reason).toContain('unattested');
    }
  });

  it('leaves a pass over a whole diff unqualified', () => {
    // The pair. Without it, always appending the caveat would pass — and every
    // complete verification would read as partial, which is the same defect
    // mirrored.
    const outcome = analyzeGovernorReview(passingInputs(false));

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('PARTIAL');
    }
  });

  it('still passes — the caveat qualifies the verdict, it does not change it', () => {
    // Deliberate: the gate is warn-first and this is a disclosure fix. Turning
    // a truncated diff into a failure is a separate, behavioural decision.
    expect(analyzeGovernorReview(passingInputs(true)).kind).toBe('pass');
  });
});
