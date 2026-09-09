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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeGovernorReview,
  parseGenesisExemptions,
  resolvePrContext,
  resolveChangedFiles,
  runGovernorReviewGate,
  type GovernorReviewInputs,
} from './check-governor-review.js';
import {
  governorPathsFromCodeowners,
  governorSectionLines,
  matchesCodeownersPattern,
  isGovernorPath,
  GOVERNOR_SECTION_MARKER,
  GOVERNOR_SECTION_END_LINE,
} from './governor-section.js';
import {
  isStampOnlyChange,
  stampOnlyExemptFiles,
  EXEMPT_SPAN_NAMES,
} from './governance-stamp-exemption.js';
import { GOVERNANCE_SPAN_NAMES } from './governance-markers.js';
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

/** Repo root, so the #5997 tests read the COMMITTED files rather than a fixture. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

describe('the gate says how much of the ledger it verified (#5818)', () => {
  it('says VERIFIED NOTHING when the ledger is empty', () => {
    // `governance/pr-review-records.jsonl` is 0 bytes with no CI producer, so
    // this is not a hypothetical — it is every governor PR today. The verdict
    // is unchanged (warn-first); what changes is that the WARN no longer stays
    // silent about the integrity check having had nothing to check.
    const outcome = analyzeGovernorReview(inputs({ records: [] }));

    expect(outcome.kind).toBe('warn');
    if (outcome.kind !== 'warn') throw new Error('unreachable');
    expect(outcome.message).toContain('VERIFIED NOTHING');
    expect(outcome.message).toContain('empty');
  });

  it('states the record count when the ledger is not empty', () => {
    // A record for a DIFFERENT PR: the ledger is non-empty, so the integrity
    // check covered something, but this PR still has no diff-bound record.
    const outcome = analyzeGovernorReview(
      inputs({ records: [record({ prNumber: 4999 })], prNumber: 5000 })
    );

    expect(outcome.kind).toBe('warn');
    if (outcome.kind !== 'warn') throw new Error('unreachable');
    expect(outcome.message).toContain('verified 1 record(s)');
    expect(outcome.message).not.toContain('VERIFIED NOTHING');
  });

  it('states the count on the PASS line too', () => {
    const outcome = analyzeGovernorReview(inputs({ records: [record()] }));

    expect(outcome.kind).toBe('pass');
    if (outcome.kind !== 'pass') throw new Error('unreachable');
    expect(outcome.reason).toContain('verified 1 record(s)');
  });
});

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

// ============================================================================
// Stamp-only exemption (#5944) — ratified 6-1, absolute_quorum
// ============================================================================

describe('stampOnlyExemptFiles (#5944)', () => {
  // The gate fired on every PR that touched any of the four
  // GOVERNANCE_STAMP_SOURCES, because regenerating the derived date stamp puts
  // CLAUDE.md and AGENTS.md in the diff. #5940 was a parameter rename. The
  // governed files changed; the governance did not.
  //
  // Deliberately NOT a diff parser: the panel's rejecting voter attacked that
  // surface (.gitattributes overrides, custom diff drivers, unified-diff edge
  // cases), and proving the ABSENCE of other changes through a parser is the
  // hard direction. This compares whole file texts with the stamp line
  // normalised, so "nothing else changed" is a byte equality, not an inference.

  // Digest-shaped since #5943 — the stamp is a content digest, not a date.
  const STAMPED = (digest: string): string =>
    ['# Title', '', 'Body line.', '', `_Governance Version: ${digest}_`, ''].join('\n');

  it('exempts a file whose only difference is the stamp digest', () => {
    expect(isStampOnlyChange(STAMPED('aaaaaaaaaaaa'), STAMPED('bbbbbbbbbbbb'))).toBe(true);
  });

  it('does NOT exempt the stamp line plus any other changed line', () => {
    // The case that matters. A bypass that cannot fail is worse than no bypass.
    const before = STAMPED('aaaaaaaaaaaa');
    const after = STAMPED('bbbbbbbbbbbb').replace('Body line.', 'Body line, quietly edited.');
    expect(isStampOnlyChange(before, after)).toBe(false);
  });

  it('does NOT exempt a hand-edited stamp that misses the generated shape', () => {
    const before = STAMPED('aaaaaaaaaaaa');
    const after = before.replace(
      '_Governance Version: aaaaaaaaaaaa_',
      '_Governance Version: soon_'
    );
    expect(isStampOnlyChange(before, after)).toBe(false);
  });

  it('does NOT exempt an added or removed stamp line', () => {
    const before = STAMPED('aaaaaaaaaaaa');
    expect(
      isStampOnlyChange(before, before.replace('_Governance Version: aaaaaaaaaaaa_\n', ''))
    ).toBe(false);
  });

  it('does NOT exempt identical files (nothing to exempt)', () => {
    // A file the changed-list named but whose content is identical means the
    // gate's two inputs disagree — a rename, a mode change, or a bad read.
    // Absence of a difference is not evidence of a stamp-only difference.
    expect(isStampOnlyChange(STAMPED('bbbbbbbbbbbb'), STAMPED('bbbbbbbbbbbb'))).toBe(false);
  });

  it('fails closed when either side is unreadable', () => {
    expect(isStampOnlyChange(undefined, STAMPED('bbbbbbbbbbbb'))).toBe(false);
    expect(isStampOnlyChange(STAMPED('aaaaaaaaaaaa'), undefined)).toBe(false);
    expect(isStampOnlyChange(undefined, undefined)).toBe(false);
  });

  it('only ever exempts the two generated files', () => {
    // Every file here has a difference that WOULD qualify on content alone —
    // a well-formed stamp date bump and nothing else. So the only thing that
    // can exclude `.rules/governance.md` is the allowlist, which is the point.
    // An earlier version of this fixture gave the non-generated file a
    // different change, so it passed even with the allowlist deleted.
    const exempt = stampOnlyExemptFiles(
      ['CLAUDE.md', 'AGENTS.md', '.rules/governance.md', 'src/audit/hash-chain.ts'],
      () => STAMPED('aaaaaaaaaaaa'),
      () => STAMPED('bbbbbbbbbbbb'),
      () => true
    );
    expect(exempt).toEqual(['CLAUDE.md', 'AGENTS.md']);
  });

  // ---- #6022: the widened, span-aware exemption -------------------------

  /** A generated file with real marker spans, the shape the injector emits. */
  const GENERATED = (opts: {
    digest: string;
    tools: string;
    count: number;
    rules?: string;
    prose?: string;
    models?: string;
  }): string =>
    [
      '# Title',
      '',
      opts.prose ?? 'Hand-written prose.',
      '',
      '<!-- GOVERNANCE:MODEL_LIST:START -->',
      `Supported models: ${opts.models ?? 'claude-opus, claude-sonnet'}.`,
      '<!-- GOVERNANCE:MODEL_LIST:END -->',
      '',
      '<!-- GOVERNANCE:TOOL_INDEX:START -->',
      `**${String(opts.count)} MCP tools registered.**`,
      opts.tools,
      '<!-- GOVERNANCE:TOOL_INDEX:END -->',
      '',
      '<!-- GOVERNANCE:RULES_INDEX:START -->',
      opts.rules ?? '| `.rules/git.md` | commits |',
      '<!-- GOVERNANCE:RULES_INDEX:END -->',
      '',
      '<!-- GOVERNANCE:VERSION:START -->',
      `_Governance Version: ${opts.digest}_`,
      '<!-- GOVERNANCE:VERSION:END -->',
      '',
    ].join('\n');

  it('exempts an MCP-tool registration — the case #6022 was filed for', () => {
    // Digest, tool list AND count all move. Before #6022 the normalizer blanked
    // only the stamp line, so two changed regions remained and registering a
    // tool demanded owner ratification.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`, `orchestrate`', count: 47 });
    const after = GENERATED({
      digest: 'bbbbbbbbbbbb',
      tools: '`run`, `orchestrate`, `new_tool`',
      count: 48,
    });
    expect(isStampOnlyChange(before, after)).toBe(true);
  });

  it('does NOT exempt a RULES_INDEX regeneration — it is outside the subset', () => {
    // RULES_INDEX is the cross-adapter bridge telling Codex/Gemini/OpenCode
    // which rules exist. The panel kept it OUT of the subset deliberately.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({
      digest: 'bbbbbbbbbbbb',
      tools: '`run`',
      count: 1,
      rules: '| `.rules/git.md` | commits | AND A SMUGGLED ROW |',
    });
    expect(isStampOnlyChange(before, after)).toBe(false);
  });

  it('does NOT exempt hand-written prose outside every span', () => {
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({
      digest: 'bbbbbbbbbbbb',
      tools: '`run`',
      count: 1,
      prose: 'Hand-written prose, quietly altered.',
    });
    expect(isStampOnlyChange(before, after)).toBe(false);
  });

  it('exempts a model-registry addition WITHOUT the stamp moving (#6024)', () => {
    // The distinguishing fact for MODEL_LIST: in-tree-data.ts is NOT one of the
    // four GOVERNANCE_STAMP_SOURCES, so adding a model moves the span and
    // leaves the digest alone. #5944's stamp-line exemption could never have
    // covered this shape -- same digest, one changed span -- which is why the
    // span exemption is the only mechanism that reaches it.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({
      digest: 'aaaaaaaaaaaa',
      tools: '`run`',
      count: 1,
      models: 'claude-opus, claude-sonnet, claude-fable-5',
    });
    expect(before).not.toEqual(after);
    expect(isStampOnlyChange(before, after)).toBe(true);
  });

  it('does NOT exempt a model-list change smuggled alongside altered prose', () => {
    // The span being exempt must not launder the rest of the file.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({
      digest: 'aaaaaaaaaaaa',
      tools: '`run`',
      count: 1,
      models: 'claude-opus, claude-sonnet, claude-fable-5',
      prose: 'Hand-written prose, quietly altered.',
    });
    expect(isStampOnlyChange(before, after)).toBe(false);
  });

  it('does NOT exempt a model-list change when the injector reports drift', () => {
    // MODEL_LIST is subject to the same precondition as every other exempt
    // span: without an injector-clean checkout the region is free-form text.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({
      digest: 'aaaaaaaaaaaa',
      tools: '`run`',
      count: 1,
      models: 'claude-opus, claude-sonnet, attacker-controlled-endpoint',
    });
    expect(
      stampOnlyExemptFiles(
        ['CLAUDE.md'],
        () => before,
        () => after,
        () => false
      )
    ).toEqual([]);
  });

  it('does NOT exempt a diff that removes a span marker', () => {
    // An unbalanced span simply fails to match, so the raw text survives into
    // the comparison — removing a span cannot be laundered as a regeneration.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = before.replace('<!-- GOVERNANCE:TOOL_INDEX:END -->', '');
    expect(isStampOnlyChange(before, after)).toBe(false);
  });

  it('exempts NOTHING when the injector reports drift at head', () => {
    // THE precondition. Without it, blanking span content would make everything
    // between the markers free-form text that skips ratification.
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({ digest: 'bbbbbbbbbbbb', tools: '`run`', count: 1 });
    expect(
      stampOnlyExemptFiles(
        ['CLAUDE.md'],
        () => before,
        () => after,
        () => false
      )
    ).toEqual([]);
    // Same inputs, clean injector -> exempt. Proves the guard is what differs.
    expect(
      stampOnlyExemptFiles(
        ['CLAUDE.md'],
        () => before,
        () => after,
        () => true
      )
    ).toEqual(['CLAUDE.md']);
  });

  it('names only spans that actually exist in the injector', () => {
    // The subset is policy; the marker set is fact. A hand-copied list is the
    // shape that drifts, and this one decides what skips ratification.
    for (const name of EXEMPT_SPAN_NAMES) {
      expect(GOVERNANCE_SPAN_NAMES).toContain(name);
    }
  });

  it('exempts nothing when the changed list has no generated file', () => {
    expect(
      stampOnlyExemptFiles(
        ['src/audit/logger.ts'],
        () => '',
        () => '',
        () => true
      )
    ).toEqual([]);
  });
});

/**
 * #5997. These read the REAL CODEOWNERS and the REAL workflow, not a fixture.
 * The defect they exist to catch was a reorder of the committed file: `/.rules/`
 * sat above the section marker, so the parser classified the file that defines
 * the voting thresholds as an ordinary review-request while CLAUDE.md claimed it
 * required ratification. A fixture-based test cannot see that.
 */
describe('the governor path set matches what the docs claim (#5997)', () => {
  const REAL_CODEOWNERS = readFileSync(join(REPO_ROOT, 'CODEOWNERS'), 'utf-8');
  const REAL_PATTERNS = governorPathsFromCodeowners(REAL_CODEOWNERS);

  it('parses a non-empty set (a zero-length parse fails closed elsewhere)', () => {
    expect(REAL_PATTERNS.length).toBeGreaterThan(0);
  });

  it('includes /.rules/ — it holds the voting thresholds', () => {
    expect(REAL_PATTERNS).toContain('/.rules/');
  });

  it('excludes /packages/nexus-agents/src/consensus/ — deliberately, per the #5997 panel', () => {
    // Not an oversight: routing an actively developed module through a human
    // gate is how gates come to be bypassed. If this is ever reversed, it must
    // be a ratified decision, so pin it rather than leave it implicit.
    expect(REAL_PATTERNS).not.toContain('/packages/nexus-agents/src/consensus/');
  });
});

describe('CODEOWNERS governor section and the workflow paths filters stay in lockstep (#5997)', () => {
  const REAL_CODEOWNERS = readFileSync(join(REPO_ROOT, 'CODEOWNERS'), 'utf-8');
  const REAL_PATTERNS = governorPathsFromCodeowners(REAL_CODEOWNERS);
  const WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/governor-review.yml'), 'utf-8');

  /** Every `- 'x'` entry inside a `paths:` block, one array per block. */
  function pathsFilters(yaml: string): string[][] {
    const blocks: string[][] = [];
    let current: string[] | undefined;
    for (const raw of yaml.split('\n')) {
      if (/^\s*paths:\s*$/.test(raw)) {
        current = [];
        blocks.push(current);
        continue;
      }
      if (current === undefined) continue;
      const entry = /^\s*-\s*'([^']+)'\s*$/.exec(raw);
      if (entry?.[1] !== undefined) current.push(entry[1]);
      else if (raw.trim() !== '') current = undefined; // block ended
    }
    return blocks;
  }

  /** Does some workflow glob cause the gate to run for this governor pattern? */
  function isCovered(pattern: string, globs: string[]): boolean {
    const normalized = pattern.replace(/^\//, '');
    return globs.some((glob) => {
      if (glob === normalized) return true;
      if (glob.endsWith('/**')) return normalized.startsWith(glob.slice(0, -2));
      return false;
    });
  }

  const filters = pathsFilters(WORKFLOW);

  it('finds both trigger blocks (pull_request and push)', () => {
    // If this drops to one, the loop below would silently stop checking a filter.
    expect(filters).toHaveLength(2);
  });

  it.each([0, 1])('covers every governor path in paths filter #%i', (index) => {
    const globs = filters[index] as string[];
    const uncovered = REAL_PATTERNS.filter((p) => !isCovered(p, globs));
    // A governor path the workflow does not list is a path whose gate never
    // runs — the second half of the #5997 defect, independent of the parser.
    expect(uncovered).toEqual([]);
  });
});

describe('the governor section terminates on the sentinel LINE, not a mention (#6030)', () => {
  const REAL_CODEOWNERS = readFileSync(join(REPO_ROOT, 'CODEOWNERS'), 'utf-8');
  const REAL_COUNT = governorPathsFromCodeowners(REAL_CODEOWNERS).length;

  it('the real file still parses to a non-trivial set', () => {
    // Anchors every assertion below. If this drifts to 0 the other tests would
    // pass vacuously, which is the failure this whole issue is about.
    expect(REAL_COUNT).toBeGreaterThan(5);
  });

  it('an explanatory comment naming the sentinel does NOT end the section', () => {
    // The measured trigger. Under `includes()` this took the real file from 13
    // patterns to 0 with started AND terminated both still reporting success,
    // so neither existing guard could fire. No adversary needed: this is the
    // comment a maintainer writes while documenting the section.
    const withComment = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_MARKER,
      `${GOVERNOR_SECTION_MARKER}\n# Everything below, up to END governor-owned paths, needs ratification.`
    );
    expect(withComment).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(withComment)).toHaveLength(REAL_COUNT);
  });

  it('the real sentinel line still ends the section', () => {
    const section = governorSectionLines(REAL_CODEOWNERS);
    expect(section.terminated).toBe(true);
    expect(section.lines).toHaveLength(REAL_COUNT);
  });

  it('a sentinel whose text drifted leaves the section unterminated, not collapsed', () => {
    // #4683's fallback: unterminated runs to end-of-file, governing MORE paths
    // rather than fewer. Exact matching routes a drifted sentinel there.
    const drifted = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_END_LINE,
      `${GOVERNOR_SECTION_END_LINE} (do not move)`
    );
    const section = governorSectionLines(drifted);
    expect(section.terminated).toBe(false);
    expect(section.lines.length).toBeGreaterThanOrEqual(REAL_COUNT);
  });
});

describe('a started governor section that yields nothing is a failure, not an empty set (#6030)', () => {
  it('throws when the markers are present but no pattern survives', () => {
    const collapsed = [
      '/some/other/path @someone',
      GOVERNOR_SECTION_MARKER,
      '# only commentary in here',
      GOVERNOR_SECTION_END_LINE,
    ].join('\n');
    expect(() => governorPathsFromCodeowners(collapsed)).toThrow(/ZERO path patterns/);
  });

  it('does NOT throw when the section is simply absent — that is #5576, reported there', () => {
    const noSection = ['/some/other/path @someone', '# nothing governor-ish here'].join('\n');
    expect(governorPathsFromCodeowners(noSection)).toEqual([]);
    expect(governorSectionLines(noSection).started).toBe(false);
  });
});

describe('both ratification jobs are handed a base sha (#6029)', () => {
  // The generic wiring gate cannot see this half: the backstop referenced NO
  // step output at all, so there was nothing for it to resolve. An absent env
  // var is invisible to a check that validates references it can find.
  const WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/governor-review.yml'), 'utf-8');

  /**
   * The body of one top-level job, up to the next job key, with `#` comments
   * removed.
   *
   * The comment strip is not incidental. Writing these assertions, the
   * "derives it from a merge-base, not the base-branch tip" check failed on the
   * workflow COMMENT that explains exactly that — prose naming the thing it
   * forbids. That is the third time in this one change (the others: the
   * step-scope scanner, and #6029's own wiring comment tripping the #4698
   * gate), and the same class as #6030 and #6026. A detector must decide what
   * counts as a real occurrence before it counts.
   */
  function jobBody(name: string): string {
    const after = WORKFLOW.split(`\n  ${name}:\n`)[1] ?? '';
    const body = after.split(/\n {2}[A-Za-z0-9_-]+:\n/)[0] ?? '';
    return body
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
  }

  it.each(['governor-ratification', 'governor-ratification-backstop'])(
    '%s supplies PR_BASE_SHA to the gate',
    (name) => {
      const body = jobBody(name);
      expect(body).not.toEqual('');
      expect(body).toContain('PR_BASE_SHA:');
    }
  );

  it('the pre-merge job derives it from a MERGE-BASE, not the base-branch tip', () => {
    // pull_request.base.sha would fold in whatever landed on main since the
    // branch diverged, so an unrelated PR touching a governed file could revoke
    // this PR's exemption. The merge-base makes the diff the PR's own changes.
    const body = jobBody('governor-ratification');
    expect(body).toContain('git merge-base');
    expect(body).not.toContain('pull_request.base.sha');
  });

  it('the backstop derives it from the same commit pair as its file list', () => {
    const body = jobBody('governor-ratification-backstop');
    expect(body).toContain('git diff --name-only "${SHA}~1" "${SHA}"');
    expect(body).toContain('git rev-parse "${SHA}~1"');
  });
});
