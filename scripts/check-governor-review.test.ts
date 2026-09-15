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
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { GOVERNOR_TOUCHED_OUTPUT_KEY } from './governor-paths-touched.js';
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
  unresolvedGovernorPatterns,
  MUST_NOT_EXIST_GOVERNOR_PATHS,
  matchesCodeownersPattern,
  isGovernorPath,
  GovernorSectionError,
  GOVERNOR_SECTION_START_DIRECTIVE,
  GOVERNOR_SECTION_END_DIRECTIVE,
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
  type PrReviewSanitization,
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
  GOVERNOR_SECTION_START_DIRECTIVE,
  "# Governor's own core — the governance-of-the-governor paths.",
  '# Audit hash chain',
  '/packages/nexus-agents/src/audit/ @owner',
  '# Governance source',
  '/packages/nexus-agents/src/governance/ @owner',
  '/scripts/inject-governance.ts @owner',
  '/governance/ @owner',
  '/CLAUDE.md @owner',
  '/CODEOWNERS @owner',
  GOVERNOR_SECTION_END_DIRECTIVE,
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

describe('governor section start directive (#5576, #6048)', () => {
  const NO_START_DIRECTIVE = [
    '# Ownership',
    // The human heading is present and is NOT a boundary (#6048): only the
    // directive opens the section, so this fixture has no section at all.
    "# Governor's own core — the governance-of-the-governor paths.",
    '/packages/nexus-agents/src/audit/ @owner',
    '/CODEOWNERS @owner',
    GOVERNOR_SECTION_END_DIRECTIVE,
  ].join('\n');

  it('refuses to derive a set when the start directive is absent', () => {
    // #5576: only `terminated` was tracked, so a missing start returned
    // lines: [] with no signal and every gate downstream passed unmeasured.
    // #6048 replaces the `started` flag with a thrown, named error — a flag a
    // caller can forget to read is the #5576 shape one consumer over.
    expect(() => governorSectionLines(NO_START_DIRECTIVE)).toThrow(GovernorSectionError);
    expect(() => governorSectionLines(NO_START_DIRECTIVE)).toThrow(
      "CODEOWNERS: governor section start directive '# @governor-section-start' not found — " +
        'the governor path set cannot be derived'
    );
    expect(governorSectionLines(CODEOWNERS_SAMPLE)).toHaveLength(6);
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

  it('does NOT consult the injector when no generated file is in the change set (#6250)', () => {
    // `injectorIsClean` is a ~5 s spawn of the whole governance injector. It
    // was invoked BEFORE the filter to GENERATED_GOVERNANCE_FILES, so every
    // gate run paid for an answer it then never used — 16 ledger-evidence
    // tests spent ~90 s on it. The result is unchanged either way (nothing is
    // eligible), so the spawn count is the only observable.
    let calls = 0;
    const injector = (): boolean => {
      calls += 1;
      return true;
    };
    expect(
      stampOnlyExemptFiles(
        ['src/audit/logger.ts', '.rules/governance.md'],
        () => 'a',
        () => 'b',
        injector
      )
    ).toEqual([]);
    expect(calls).toBe(0);
    expect(
      stampOnlyExemptFiles(
        [],
        () => 'a',
        () => 'b',
        injector
      )
    ).toEqual([]);
    expect(calls).toBe(0);
  });

  it('STILL consults the injector when a generated file is in the change set (#6250)', () => {
    // The other half of the short-circuit: the precondition is skipped only
    // when nothing could be exempt. With a generated file present the injector
    // must be asked, and its verdict must still be what decides.
    let calls = 0;
    const before = GENERATED({ digest: 'aaaaaaaaaaaa', tools: '`run`', count: 1 });
    const after = GENERATED({ digest: 'bbbbbbbbbbbb', tools: '`run`', count: 1 });
    const drifted = (): boolean => {
      calls += 1;
      return false;
    };
    expect(
      stampOnlyExemptFiles(
        ['src/audit/logger.ts', 'AGENTS.md'],
        () => before,
        () => after,
        drifted
      )
    ).toEqual([]);
    expect(calls).toBe(1);
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

  it('includes the pure decision computation and the voter-role set (#6000 step 3)', () => {
    // The #5997 contrarian's gap: `.rules/` declares the bar, but the code that
    // turns a tally into approved/rejected was an ordinary review-request. The
    // #6000 panel (option D, refined) governs the NARROW extraction — not the
    // directory — so `engine.ts` stays routine while the verdict path does not.
    expect(REAL_PATTERNS).toContain('/packages/nexus-agents/src/consensus/decision/');
    expect(REAL_PATTERNS).toContain('/packages/nexus-agents/src/cli/voter-roles.ts');
  });

  it.each([
    ['packages/nexus-agents/src/consensus/decision/verdict.ts', true],
    ['packages/nexus-agents/src/consensus/decision/thresholds.ts', true],
    ['packages/nexus-agents/src/consensus/decision/strategy.ts', true],
    ['packages/nexus-agents/src/consensus/decision/quorum.ts', true], // #6180
    ['packages/nexus-agents/src/cli/voter-roles.ts', true],
    ['packages/nexus-agents/src/consensus/engine.ts', false],
    ['packages/nexus-agents/src/consensus/types-core.ts', false],
    ['packages/nexus-agents/src/cli/vote-types.ts', false],
    ['packages/nexus-agents/src/mcp/tools/consensus-vote.ts', false],
  ])('%s is a governor path: %s (#6000 step 3)', (file, expected) => {
    // Both gates route through this one matcher, so the boundary between the
    // governed modules and their re-export homes is decided here, once.
    expect(isGovernorPath(file, REAL_PATTERNS)).toBe(expected);
  });
});

describe('the ratification gate runs on EVERY pull request, so branch protection can require it (#4802 part 1)', () => {
  // Until #4802 the workflow carried a `paths:` filter — a hand-maintained
  // second copy of the governor set, kept in lockstep with CODEOWNERS by the
  // test this block replaces (#5997). A path-filtered job never reports on a
  // PR outside its paths, so as a required status context it would sit
  // `expected` forever on an ordinary PR. The set now has one copy (CODEOWNERS)
  // and one parser; the two jobs that should not run on an ordinary PR read a
  // detector output computed from that parse.
  const WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/governor-review.yml'), 'utf-8');
  interface Step {
    id?: string;
    name?: string;
    if?: string;
    uses?: string;
    run?: string;
    env?: Record<string, string>;
  }
  interface Job {
    name?: string;
    needs?: string | string[];
    if?: string;
    outputs?: Record<string, string>;
    steps?: Step[];
  }
  const parsed = parseYaml(WORKFLOW) as {
    on?: Record<string, Record<string, unknown>>;
    true?: Record<string, Record<string, unknown>>;
    jobs: Record<string, Job>;
  };
  // `on:` parses as the boolean `true` under YAML 1.1.
  const triggers = parsed.true ?? parsed.on ?? {};
  const jobs = parsed.jobs;

  it('neither trigger carries a paths filter', () => {
    expect(Object.keys(triggers)).toEqual(['pull_request', 'push']);
    for (const [event, config] of Object.entries(triggers)) {
      expect(config, event).not.toHaveProperty('paths');
      expect(config, event).not.toHaveProperty('paths-ignore');
    }
  });

  it('the ratification job keeps the context name branch protection requires, and nothing narrows it', () => {
    const job = jobs['governor-ratification'];
    expect(job).toBeDefined();
    // The exact string the required-context setting names. A rename does not
    // fail CI; it makes the required context never report, which blocks every
    // PR — or, if the setting is then removed, un-requires the gate.
    expect(job?.name).toBe('Governor-path ratification gate');
    expect(job?.if).toBe("github.event_name == 'pull_request'");
    expect(job?.needs).toBeUndefined();
  });

  it('the ratification jobs publish the detector output from the detector step', () => {
    for (const id of ['governor-ratification', 'governor-ratification-backstop']) {
      const job = jobs[id];
      expect(job?.outputs?.[GOVERNOR_TOUCHED_OUTPUT_KEY], id).toBe(
        `\${{ steps.touched.outputs.${GOVERNOR_TOUCHED_OUTPUT_KEY} }}`
      );
      const detector = (job?.steps ?? []).find((s) => s.id === 'touched');
      // The `run:` body — not the script — writes the `governor_touched=`
      // line, so the #4698 wiring test can resolve the producer (#6260). The
      // script prints only the value; `bash -e` turns its exit 1 into a
      // failed assignment, so an unmeasured detector writes no line at all.
      expect(detector?.run, id).toBe(
        [
          'TOUCHED=$(pnpm exec tsx scripts/governor-paths-touched.ts)',
          `echo "${GOVERNOR_TOUCHED_OUTPUT_KEY}=\${TOUCHED}" >> "\${GITHUB_OUTPUT}"`,
          '',
        ].join('\n')
      );
    }
  });

  describe('the detector runs BEFORE the GitHub API is touched, and gates it (#6260)', () => {
    // Scope steward, #6260 panel: with evidence collected first, a transient
    // `gh api` failure would block an ORDINARY PR once this context is
    // required. The order is checkout → setup → changed files → detector →
    // (evidence → gate, both gated on the detector) → the not-touched verdict.
    const job = jobs['governor-ratification'];
    const steps = job?.steps ?? [];
    const ids = steps.map((s) => s.id);
    const at = (id: string): number => ids.indexOf(id);
    const gatedOnDetector = `steps.touched.outputs.${GOVERNOR_TOUCHED_OUTPUT_KEY} == 'true'`;

    it('the detector consumes the changed-files step, which precedes it', () => {
      expect(at('changed')).toBeGreaterThanOrEqual(0);
      expect(at('touched')).toBeGreaterThan(at('changed'));
      const detector = steps[at('touched')];
      expect(detector?.env?.['CHANGED_FILES']).toBe('${{ steps.changed.outputs.files }}');
      // The detector itself makes no API call — its only input is the diff.
      expect(detector?.run ?? '').not.toContain('gh api');
      expect(detector?.if).toBeUndefined();
    });

    it('the evidence step runs AFTER the detector and only when a governor path is touched', () => {
      expect(at('evidence')).toBeGreaterThan(at('touched'));
      const evidence = steps[at('evidence')];
      expect(evidence?.if).toBe(gatedOnDetector);
      // This is the step that reaches the API; nothing before it does.
      expect(evidence?.run ?? '').toContain('gh api');
      for (const step of steps.slice(0, at('evidence'))) {
        expect(step.run ?? '', step.id ?? step.name ?? step.uses ?? '?').not.toContain('gh api');
      }
    });

    it('the gate step is gated the same way and reads the diff from the changed-files step', () => {
      const gate = steps.find((s) => s.run?.includes('check-governor-ratification.ts') === true);
      expect(gate).toBeDefined();
      expect(steps.indexOf(gate as Step)).toBeGreaterThan(at('evidence'));
      expect(gate?.if).toBe(gatedOnDetector);
      expect(gate?.env?.['CHANGED_FILES']).toBe('${{ steps.changed.outputs.files }}');
      expect(gate?.env?.['PR_BASE_SHA']).toBe('${{ steps.changed.outputs.base }}');
    });

    it('the final step names the not-touched verdict and is reached even when the detector failed', () => {
      const last = steps[steps.length - 1];
      expect(last?.if).toBe(
        `\${{ always() && steps.touched.outputs.${GOVERNOR_TOUCHED_OUTPUT_KEY} != 'true' }}`
      );
      expect(last?.run).toContain('not-applicable');
      // `false` exits 0; an empty (unmeasured) value exits 1 — the empty
      // case is named, not defaulted to a pass.
      expect(last?.run).toContain('exit 0');
      expect(last?.run).toContain('exit 1');
      expect(last?.run).toContain('unmeasured');
    });
  });

  it.each([
    ['governor-review', ['governor-ratification']],
    ['codeowners-errors', ['governor-ratification', 'governor-ratification-backstop']],
  ])('%s is gated on the detector output and still runs when the gate FAILS', (id, needs) => {
    const job = jobs[id];
    const declared = Array.isArray(job?.needs) ? job.needs : [job?.needs];
    expect(declared, id).toEqual(needs);
    const condition = job?.if ?? '';
    // Without `!cancelled()` the implicit `success()` skips this job whenever
    // the ratification gate fails — exactly the governor PRs it must report on.
    expect(condition, id).toContain('!cancelled()');
    for (const upstream of needs) {
      expect(condition, id).toContain(
        `needs.${upstream}.outputs.${GOVERNOR_TOUCHED_OUTPUT_KEY} == 'true'`
      );
    }
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

  it('an explanatory comment naming the end directive does NOT end the section', () => {
    // The measured trigger. Under `includes()` this took the real file from 13
    // patterns to 0 with started AND terminated both still reporting success,
    // so neither existing guard could fire. No adversary needed: this is the
    // comment a maintainer writes while documenting the section.
    const withComment = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_START_DIRECTIVE,
      `${GOVERNOR_SECTION_START_DIRECTIVE}\n# Everything below, up to ${GOVERNOR_SECTION_END_DIRECTIVE}, needs ratification.`
    );
    expect(withComment).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(withComment)).toHaveLength(REAL_COUNT);
  });

  it('the real end directive line still ends the section', () => {
    expect(governorSectionLines(REAL_CODEOWNERS)).toHaveLength(REAL_COUNT);
  });

  it('an end directive whose text drifted is reported as MISSING, not run to end-of-file', () => {
    // #4683 routed an unterminated section to end-of-file: more paths governed
    // and no ratifiers. #6048 makes it a named error instead, so both gates go
    // red on the same message rather than one silently widening its set while
    // the other reports `indeterminate`.
    const drifted = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_END_DIRECTIVE,
      `${GOVERNOR_SECTION_END_DIRECTIVE} (do not move)`
    );
    expect(drifted).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorSectionLines(drifted)).toThrow(
      "CODEOWNERS: governor section end directive '# @governor-section-end' not found — " +
        'the governor path set cannot be derived'
    );
  });
});

describe('a started governor section that yields nothing is a failure, not an empty set (#6030)', () => {
  it('throws when the directives are present but no pattern survives', () => {
    const collapsed = [
      '/some/other/path @someone',
      GOVERNOR_SECTION_START_DIRECTIVE,
      "# Governor's own core — the heading is prose (#6048)",
      '# only commentary in here',
      GOVERNOR_SECTION_END_DIRECTIVE,
    ].join('\n');
    expect(() => governorPathsFromCodeowners(collapsed)).toThrow(GovernorSectionError);
    expect(() => governorPathsFromCodeowners(collapsed)).toThrow(/ZERO path patterns/);
  });

  it('an absent section is the missing-start error, never an empty set (#5576 → #6048)', () => {
    // Before #6048 this returned [] with `started: false` and relied on every
    // consumer reading the flag. Now there is no flag to forget.
    const noSection = ['/some/other/path @someone', '# nothing governor-ish here'].join('\n');
    expect(() => governorPathsFromCodeowners(noSection)).toThrow(/start directive .* not found/);
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

describe('the LABELS evidence expression has no shell pipe to mask (#5731)', () => {
  // #5722 added `set -o pipefail` so a failed `gh api` fails the step instead
  // of yielding an empty LABELS the gate reads as "not ratified". This is the
  // structural half: with the join done inside `--jq` there is no pipe, so the
  // next pipeline someone adds to these blocks cannot reintroduce the class.
  // APPROVALS keeps its streaming filter + shell join deliberately: under
  // `--paginate` gh applies `--jq` per page, so an array-wrapping filter would
  // emit one joined string PER PAGE, and `--slurp` is unverified on the runner.
  const WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/governor-review.yml'), 'utf-8');
  const JQ = `--jq '[.labels[].name] | join(",")'`;

  it('both jobs build LABELS with the array-and-join filter', () => {
    expect(WORKFLOW.split(JQ).length - 1).toBe(2);
  });

  it('neither LABELS assignment pipes gh output through another process', () => {
    // The assignment closes `)` right after the jq string: `LABELS=$(gh api
    // "…" \\\n  --jq '…')`. A `| tr` (or any other stage) between the two
    // would break the match, and that is the shape this test exists to reject.
    const assignments = WORKFLOW.match(/LABELS=\$\(gh api "[^"]+" \\\n\s+--jq '[^']*'\)/g) ?? [];
    expect(assignments).toHaveLength(2);
    expect(WORKFLOW).not.toMatch(/--jq '\.labels\[\]\.name' \| tr/);
  });
});

describe('a governor pattern that matches nothing is not a governed path (#6034)', () => {
  // governorPathsFromCodeowners returns the first token of each governor-section
  // line. A pattern matching nothing on disk is indistinguishable from one
  // matching everything it should: the count is unchanged, `started` and
  // `terminated` stay healthy, #6030's non-empty guard is satisfied — and the
  // path is silently ungoverned. Fail-OPEN.
  const LINES = [
    GOVERNOR_SECTION_START_DIRECTIVE,
    "# Governor's own core",
    '/packages/nexus-agents/src/audit/ @owner',
    '/scripts/inject-governance.ts @owner',
    '/governance/claims-registry.* @owner',
    GOVERNOR_SECTION_END_DIRECTIVE,
  ];
  const TRACKED = [
    'packages/nexus-agents/src/audit/logger.ts',
    'scripts/inject-governance.ts',
    'governance/claims-registry.json',
    'README.md',
  ];

  it('reports nothing when every pattern matches a tracked file', () => {
    const patterns = [
      '/packages/nexus-agents/src/audit/',
      '/scripts/inject-governance.ts',
      '/governance/claims-registry.*',
    ];
    expect(unresolvedGovernorPatterns(patterns, TRACKED, LINES)).toEqual([]);
  });

  it('reports a typo, naming the pattern AND its line', () => {
    // "some pattern is stale" is not actionable on a 14-entry list.
    const result = unresolvedGovernorPatterns(['/pakages/nexus-agents/src/audit/'], TRACKED, [
      GOVERNOR_SECTION_START_DIRECTIVE,
      '/pakages/nexus-agents/src/audit/ @owner',
      GOVERNOR_SECTION_END_DIRECTIVE,
    ]);
    expect(result).toEqual(['CODEOWNERS:2  /pakages/nexus-agents/src/audit/']);
  });

  it('catches the RENAME case, which never touches CODEOWNERS', () => {
    // The likelier drift: a PR moves src/audit/ and leaves the entry alone.
    // This is why the check runs on every PR rather than on CODEOWNERS edits.
    const renamedTree = TRACKED.filter((f) => !f.startsWith('packages/nexus-agents/src/audit/'));
    const result = unresolvedGovernorPatterns(
      ['/packages/nexus-agents/src/audit/'],
      renamedTree,
      LINES
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('/packages/nexus-agents/src/audit/');
  });

  it('a glob matching at least one tracked file passes', () => {
    expect(unresolvedGovernorPatterns(['/governance/claims-registry.*'], TRACKED, LINES)).toEqual(
      []
    );
  });

  it('a glob matching nothing fails — the pair', () => {
    // Without this, treating every glob as resolved would pass the test above.
    const result = unresolvedGovernorPatterns(['/governance/no-such-thing.*'], TRACKED, LINES);
    expect(result).toHaveLength(1);
  });

  it('a must-not-exist entry matching nothing is NOT unresolved (#6174)', () => {
    // The shadow CODEOWNERS locations are governed so that creating one is a
    // governor change; for them, matching no tracked file is the healthy state.
    expect(MUST_NOT_EXIST_GOVERNOR_PATHS).toEqual(['/.github/CODEOWNERS', '/docs/CODEOWNERS']);
    expect(unresolvedGovernorPatterns(MUST_NOT_EXIST_GOVERNOR_PATHS, TRACKED, LINES)).toEqual([]);
    // The exemption is by exact pattern — a near miss is still reported.
    expect(unresolvedGovernorPatterns(['/.github/CODEOWNER'], TRACKED, LINES)).toHaveLength(1);
  });

  it('the REAL CODEOWNERS resolves against the REAL tracked tree', () => {
    // The regression that matters: this is the assertion that fires if someone
    // renames a governed directory without updating its entry.
    const real = readFileSync(join(REPO_ROOT, 'CODEOWNERS'), 'utf-8');
    const tracked = execFileSync('git', ['ls-files'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter((f) => f !== '');
    expect(tracked.length).toBeGreaterThan(100);
    expect(
      unresolvedGovernorPatterns(governorPathsFromCodeowners(real), tracked, real.split('\n'))
    ).toEqual([]);
  });
});

describe('the governor section is bounded by dedicated directives, not the human heading (#6048)', () => {
  // The fifth boundary change to this ~20-line parser (#5137, #5576, #6030,
  // #6032). Three of the four defects were boundary-matching, which indicts the
  // representation rather than any single matcher: the start boundary was a
  // human heading doing double duty, so its prefix and its prose had to be
  // separated by hand (#6032). The directives carry no prose and are matched
  // as exact trimmed lines. There is NO fallback to the heading prefix — a
  // silent fallback would recreate the #6032 class with one more spelling.
  const REAL_CODEOWNERS = readFileSync(join(REPO_ROOT, 'CODEOWNERS'), 'utf-8');

  /**
   * The governor set parsed from origin/main at 32c14595b6, BEFORE the
   * directives landed, plus the two #6000 step-3 entries (the pure decision
   * computation and the voter-role set), plus the #6174 CODEOWNERS-parses gate
   * script, plus the #5130 step-2 ledger-evidence module. The migration must not change what
   * is governed: this is the identical-set proof, pinned as data rather than
   * recomputed, so an addition to the section is a reviewed act here too.
   */
  const PINNED_SET = [
    '/packages/nexus-agents/src/audit/',
    '/packages/nexus-agents/src/governance/',
    '/scripts/inject-governance.ts',
    '/governance/',
    '/governance/claims-registry.*',
    '/.github/workflows/governor-review.yml',
    '/scripts/check-governor-review.ts',
    '/scripts/check-governor-ratification.ts',
    '/scripts/governor-ledger-evidence.ts',
    '/scripts/check-codeowners-errors.ts',
    '/scripts/governor-paths-touched.ts',
    '/.github/CODEOWNERS',
    '/docs/CODEOWNERS',
    '/scripts/governance-stamp-exemption.ts',
    '/scripts/governor-section.ts',
    '/.rules/',
    '/packages/nexus-agents/src/consensus/decision/',
    '/packages/nexus-agents/src/cli/voter-roles.ts',
    '/CLAUDE.md',
    '/AGENTS.md',
    '/CODEOWNERS',
  ];

  const CANNOT_DERIVE = 'the governor path set cannot be derived';
  const MISSING_START =
    "CODEOWNERS: governor section start directive '# @governor-section-start' not found — " +
    CANNOT_DERIVE;
  const MISSING_END =
    "CODEOWNERS: governor section end directive '# @governor-section-end' not found — " +
    CANNOT_DERIVE;

  it('the directives are the committed spelling', () => {
    // The error messages above quote them literally, so a renamed constant
    // must show up here and not only in a regex that happens to still match.
    expect(GOVERNOR_SECTION_START_DIRECTIVE).toBe('# @governor-section-start');
    expect(GOVERNOR_SECTION_END_DIRECTIVE).toBe('# @governor-section-end');
  });

  it('the real file parses to exactly the pre-migration set', () => {
    expect(governorPathsFromCodeowners(REAL_CODEOWNERS)).toEqual(PINNED_SET);
  });

  it('the #6174 CODEOWNERS-parses gate script and the two shadow locations are governor-owned (21 entries)', () => {
    const set = governorPathsFromCodeowners(REAL_CODEOWNERS);
    expect(set).toContain('/scripts/check-codeowners-errors.ts');
    // #4802 part 1: the detector that decides whether the audit gate and the
    // CODEOWNERS parse run at all — the `paths:` filter's replacement.
    expect(set).toContain('/scripts/governor-paths-touched.ts');
    // Entries for files that must NOT exist: creating one is a governor change.
    expect(set).toContain('/.github/CODEOWNERS');
    expect(set).toContain('/docs/CODEOWNERS');
    // #5130 step 2: the committed-ledger half of the ratification gate.
    expect(set).toContain('/scripts/governor-ledger-evidence.ts');
    expect(set).toHaveLength(21);
  });

  it('a stray copy of the old heading text elsewhere does NOT open a section (#6032)', () => {
    // #6032's defect, re-run against the new boundary. Under the prefix
    // matcher a full heading line above the security block opened the section
    // early and swept five non-governor entries in. Under the directives the
    // heading is prose wherever it appears.
    const withStrayHeading = REAL_CODEOWNERS.replace(
      '# Security modules',
      "# Governor's own core — see the directive-bounded section below.\n# Security modules"
    );
    expect(withStrayHeading).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(withStrayHeading)).toEqual(PINNED_SET);
  });

  it('a path listed above the start directive is NOT governor', () => {
    const above = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_START_DIRECTIVE,
      `/packages/nexus-agents/src/not-governed/ @owner\n${GOVERNOR_SECTION_START_DIRECTIVE}`
    );
    expect(above).not.toEqual(REAL_CODEOWNERS);
    const set = governorPathsFromCodeowners(above);
    expect(set).not.toContain('/packages/nexus-agents/src/not-governed/');
    expect(set).toEqual(PINNED_SET);
  });

  it('the human heading is free prose: rewording or deleting it changes nothing', () => {
    // The reason for the migration. Under #6032 the heading PREFIX was load-
    // bearing and a drifted prefix silently closed the section (started=false).
    const reworded = REAL_CODEOWNERS.replace(
      /^# Governor's own core.*$/m,
      '# Whatever the maintainers want to call this section (#9999)'
    );
    expect(reworded).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(reworded)).toEqual(PINNED_SET);

    const deleted = REAL_CODEOWNERS.replace(/^# Governor's own core.*\n/m, '');
    expect(deleted).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(deleted)).toEqual(PINNED_SET);
  });

  it('start directive missing → the named error', () => {
    const noStart = REAL_CODEOWNERS.replace(`${GOVERNOR_SECTION_START_DIRECTIVE}\n`, '');
    expect(noStart).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(noStart)).toThrow(GovernorSectionError);
    expect(() => governorPathsFromCodeowners(noStart)).toThrow(MISSING_START);
  });

  it('end directive missing → the named error', () => {
    const noEnd = REAL_CODEOWNERS.replace(`${GOVERNOR_SECTION_END_DIRECTIVE}\n`, '');
    expect(noEnd).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(noEnd)).toThrow(GovernorSectionError);
    expect(() => governorPathsFromCodeowners(noEnd)).toThrow(MISSING_END);
  });

  it('duplicate start directive → the named error, with the count', () => {
    // A second start ABOVE the real one would otherwise widen the set silently
    // (the #6032 shape); a second start INSIDE would be swallowed as a comment.
    // Neither is a section; both are refused.
    const dupAbove = REAL_CODEOWNERS.replace(
      '# Security modules',
      `${GOVERNOR_SECTION_START_DIRECTIVE}\n# Security modules`
    );
    expect(dupAbove).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(dupAbove)).toThrow(
      "CODEOWNERS: governor section start directive '# @governor-section-start' duplicated " +
        `(2 occurrences) — ${CANNOT_DERIVE}`
    );
    const dupInside = REAL_CODEOWNERS.replace(
      '# Audit hash chain',
      `${GOVERNOR_SECTION_START_DIRECTIVE}\n# Audit hash chain`
    );
    expect(dupInside).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(dupInside)).toThrow(/start directive .* duplicated/);
  });

  it('duplicate end directive → the named error, with the count', () => {
    const dup = REAL_CODEOWNERS.replace(
      '# Audit hash chain',
      `${GOVERNOR_SECTION_END_DIRECTIVE}\n# Audit hash chain`
    );
    expect(dup).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(dup)).toThrow(
      "CODEOWNERS: governor section end directive '# @governor-section-end' duplicated " +
        `(2 occurrences) — ${CANNOT_DERIVE}`
    );
  });

  it('an end directive ABOVE the start directive → the named error', () => {
    // Both present, once each, in the wrong order. Slicing start..end would
    // yield an empty range that the ZERO-patterns guard also catches, but the
    // message would blame a comment; name the actual cause.
    const swapped = REAL_CODEOWNERS.replace(`${GOVERNOR_SECTION_END_DIRECTIVE}\n`, '').replace(
      '# Security modules',
      `${GOVERNOR_SECTION_END_DIRECTIVE}\n# Security modules`
    );
    expect(swapped).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(swapped)).toThrow(
      "CODEOWNERS: governor section end directive '# @governor-section-end' precedes the " +
        `start directive — ${CANNOT_DERIVE}`
    );
  });

  it('a comment NAMING a directive is not a directive — whole-line match', () => {
    // #6030's defect (substring match on the sentinel) re-run against the new
    // boundary. This is the comment a maintainer writes while documenting it.
    const naming = REAL_CODEOWNERS.replace(
      '# Security modules',
      `# The governor section is bounded by ${GOVERNOR_SECTION_START_DIRECTIVE} and ` +
        `${GOVERNOR_SECTION_END_DIRECTIVE}; see below.\n# Security modules`
    );
    expect(naming).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(naming)).toEqual(PINNED_SET);
  });

  it('the directive line tolerates surrounding whitespace but not a suffix', () => {
    const indented = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_START_DIRECTIVE,
      `  ${GOVERNOR_SECTION_START_DIRECTIVE}  `
    );
    expect(indented).not.toEqual(REAL_CODEOWNERS);
    expect(governorPathsFromCodeowners(indented)).toEqual(PINNED_SET);

    const suffixed = REAL_CODEOWNERS.replace(
      GOVERNOR_SECTION_START_DIRECTIVE,
      `${GOVERNOR_SECTION_START_DIRECTIVE} (#3830)`
    );
    expect(suffixed).not.toEqual(REAL_CODEOWNERS);
    expect(() => governorPathsFromCodeowners(suffixed)).toThrow(MISSING_START);
  });
});

describe('the gate says what the panel READ, from the structured field first (#6190)', () => {
  // A hash match proves the record is bound to this PR's diff; the C1 gate
  // proves a partial panel read cannot verified-approve. Neither says, in the
  // gate's own pass line, that the panel read 2 of 42 files. Since #6190 the
  // record carries that as a hash-covered `coverage` field; before it, only the
  // 500-char summary stamp did (and it could cut the list).
  const DROPPED_40 = Array.from({ length: 40 }, (_, i) => `src/dropped/file-${String(i)}.ts`);

  function passingRecord(overrides: Partial<BuildPrReviewRecordInput>): GovernorReviewInputs {
    return inputs({
      records: [
        record({ prNumber: 5000, reviewedDiffHash: DIFF_HASH, verdict: 'approve', ...overrides }),
      ],
    });
  }

  it('reads the structured coverage field and lists EVERY dropped path, naming the source', () => {
    // The summary here carries a legacy-format stamp that DISAGREES with the
    // field (three paths, 2/5) so the precedence is actually exercised: a
    // reader that consulted the stamp first would report 2 of 5 and three
    // paths. No producer writes this shape; the conflict is the test's.
    const outcome = analyzeGovernorReview(
      passingRecord({
        summary:
          'approve [partial coverage: 2/5 files reviewed, dropped: src/dropped/file-0.ts, src/dropped/file-1.ts, src/dropped/file-2.ts] — t',
        coverage: {
          panelRead: 'partial',
          reviewedFiles: 2,
          totalFiles: 42,
          droppedFiles: DROPPED_40,
          reviewedBytes: 40_000,
          totalBytes: 161_204,
          budgetSource: 'registry',
          budgetDetail:
            'min window 1,000,000 tok (claude-fable-5) − 16,000 × 3.5 B/tok = 3,444,000 B',
        },
        bindingBounds: { kind: 'prefix', boundBytes: 50_000 },
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('PARTIAL: the panel read 2 of 42 files');
      expect(outcome.reason).toContain('40 dropped');
      for (const path of DROPPED_40) expect(outcome.reason).toContain(path);
      expect(outcome.reason).toContain('from the record’s coverage field');
      expect(outcome.reason).not.toContain('summary stamp');
    }
  });

  it('falls back to the summary stamp for a pre-#6190 record, and says so', () => {
    // A 1.3 record: no `coverage` field; the stamp is the only disclosure and
    // its list may have been cut by the summary cap. The caveat must name the
    // weaker source rather than present a parsed stamp as the field.
    const outcome = analyzeGovernorReview(
      passingRecord({
        summary:
          'approve (3 approve / 0 request_changes / 0 abstain) [partial coverage: 2/5 files reviewed, dropped: src/a.ts, src/b.ts, src/c.ts] [panel read 40,000/61,204 bytes; binding covers first 50,000 bytes; budget: registry (x)] — t',
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('PARTIAL: the panel read 2 of 5 files');
      expect(outcome.reason).toContain('src/a.ts, src/b.ts, src/c.ts');
      expect(outcome.reason).toContain('parsed from the summary stamp');
      expect(outcome.reason).toContain('may be incomplete');
    }
  });

  it('a summary stamp cut mid-list by the store cap drops the cut fragment, never a fabricated path', () => {
    const outcome = analyzeGovernorReview(
      passingRecord({
        summary:
          'approve [partial coverage: 3/9 files reviewed, dropped: src/whole.ts, src/also-whole.ts, src/cut-in-ha...',
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('PARTIAL: the panel read 3 of 9 files');
      expect(outcome.reason).toContain('src/whole.ts, src/also-whole.ts');
      expect(outcome.reason).not.toContain('src/cut-in-ha');
      expect(outcome.reason).toContain('parsed from the summary stamp');
    }
  });

  it('a full panel read over a prefix binding adds NO panel caveat', () => {
    const outcome = analyzeGovernorReview(
      passingRecord({
        coverage: {
          panelRead: 'full',
          reviewedFiles: 3,
          totalFiles: 3,
          droppedFiles: [],
          reviewedBytes: 61_204,
          totalBytes: 61_204,
          budgetSource: 'registry',
          budgetDetail: 'x',
        },
        bindingBounds: { kind: 'prefix', boundBytes: 50_000 },
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('the panel read');
      expect(outcome.reason).not.toContain('PARTIAL');
    }
  });

  it('a record with neither field nor stamp adds no panel caveat (absence is not a claim)', () => {
    const outcome = analyzeGovernorReview(passingRecord({ summary: 'ok' }));
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') expect(outcome.reason).not.toContain('the panel read');
  });
});

describe('the gate says whether the voters read the bytes it bound (#5385)', () => {
  // A hash match proves the record is bound to THIS PR's canonical diff. It does
  // NOT prove the panel read that diff: the MCP middleware strips HTML comments
  // and XML-like tags before the handler sees them, and this repo's own
  // governance PRs carry `<!-- GENERATED:… -->` markers. A pass that omits the
  // gap is a partial verification recorded as complete.
  function passingInputs(sanitization: PrReviewSanitization | undefined): GovernorReviewInputs {
    return inputs({
      records: [
        record({
          prNumber: 5000,
          reviewedDiffHash: DIFF_HASH,
          verdict: 'approve',
          ...(sanitization !== undefined ? { sanitization } : {}),
        }),
      ],
    });
  }

  it('labels a pass whose reviewed TEXT differs from the bound bytes as partial', () => {
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: 'd'.repeat(64),
        commentsRemoved: 2,
        fieldsModified: 2,
        tagsRemoved: 0,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('PARTIAL');
      expect(outcome.reason).toContain('SANITIZED');
      expect(outcome.reason).toContain('2 HTML comment(s)');
    }
  });

  it('says so when a sanitizer ran and removed nothing at all', () => {
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 0,
        fieldsModified: 0,
        tagsRemoved: 0,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('PARTIAL');
      expect(outcome.reason).toContain('removed nothing');
    }
  });

  it('does NOT claim "removed nothing" when it removed something outside the bound bytes', () => {
    // Reachable two ways, and both are equal hashes with a NON-ZERO counter:
    //  - the stripped span starts past MAX_REVIEWED_DIFF_BYTES, so it falls
    //    outside the truncated bytes the hash covers;
    //  - the sanitizer stripped a SIBLING field (prTitle, prDescription,
    //    repoContext) — the counter is over the whole args object, the hash only
    //    over prDiff.
    // Saying "removed nothing" here would be a default reported as a
    // measurement: the record's own counter says otherwise.
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 3,
        fieldsModified: 3,
        tagsRemoved: 0,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('removed nothing');
      expect(outcome.reason).toContain('3');
      expect(outcome.reason).toContain('none inside the bytes this hash binds');
    }
  });

  it('stays silent when the record discloses nothing — the pair', () => {
    // Without this, always appending a caveat would pass both tests above while
    // asserting a sanitizer ran on records that never met one.
    const outcome = analyzeGovernorReview(passingInputs(undefined));

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('PARTIAL');
      expect(outcome.reason).not.toContain('removed nothing');
      expect(outcome.reason).not.toContain('sanitiz');
    }
  });

  it('still passes — the caveat qualifies the verdict, it does not change it', () => {
    // Warn-first, and this is a disclosure fix. Turning a sanitized review into
    // a failure is a separate, behavioural decision (#3831 enforce flip).
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: 'd'.repeat(64),
        commentsRemoved: 9,
        fieldsModified: 9,
        tagsRemoved: 0,
      })
    );
    expect(outcome.kind).toBe('pass');
  });
});

describe('the gate cannot call a TAG strip "removed nothing" (#5385, adversarial review)', () => {
  // The sanitizer removes TWO things and the record originally counted one.
  // `commentsRemoved` is HTML comments only (#5258); XML-like injection tags
  // (`<system>`, `<context>`, …) are stripped through a SEPARATE counter. A tag
  // stripped from a sibling field (prTitle) leaves prDiff untouched — hashes
  // equal, commentsRemoved 0 — so the gate reported a no-op while a
  // prompt-injection tag had been taken out of what the panel read. That is a
  // default rendered as a measurement, on the governor path.
  function passingInputs(sanitization: PrReviewSanitization): GovernorReviewInputs {
    return inputs({
      records: [
        record({ prNumber: 5000, reviewedDiffHash: DIFF_HASH, verdict: 'approve', sanitization }),
      ],
    });
  }

  it('names a TAG strip as possible prompt injection, not a routine removal', () => {
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 0,
        fieldsModified: 1,
        tagsRemoved: 1,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('removed nothing');
      expect(outcome.reason).toContain('POSSIBLE PROMPT INJECTION');
    }
  });

  it('reports a tag EVEN WHEN a comment was also removed (#5385, six seats)', () => {
    // The masking defect. The caveat rendered one string that reported comments
    // whenever commentsRemoved > 0, so a record carrying BOTH said only
    // "removed 1 comment(s)". An attacker masks a stripped injection tag behind
    // any HTML comment, and GitHub's default PR template supplies one.
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 1,
        fieldsModified: 1,
        tagsRemoved: 1,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('POSSIBLE PROMPT INJECTION');
      expect(outcome.reason).toContain('1 HTML comment(s)');
    }
  });

  it('a field changed with NEITHER counter set is reported as unattributed', () => {
    // Neither a comment nor a tag, yet a field changed — the honest report is
    // that something was removed and the cause is unknown, not silence.
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 0,
        fieldsModified: 1,
        tagsRemoved: 0,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).not.toContain('removed nothing');
      expect(outcome.reason).toContain('unattributed');
    }
  });

  it('still says "removed nothing" for a genuine no-op — the pair', () => {
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 0,
        fieldsModified: 0,
        tagsRemoved: 0,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') expect(outcome.reason).toContain('removed nothing');
  });

  it('never reports "0 stripped" on a PARTIAL whose hashes differ', () => {
    // The self-contradicting message: hashes differ, so SOMETHING was removed
    // from prDiff, while the same sentence said "0 comment(s) stripped".
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: 'e'.repeat(64),
        commentsRemoved: 0,
        fieldsModified: 1,
        tagsRemoved: 0,
      })
    );

    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('PARTIAL');
      expect(outcome.reason).not.toContain('0 comment(s)');
    }
  });
});

describe('the gate caveat clauses are independent (#5385, 5th panel)', () => {
  function passingInputs(sanitization: PrReviewSanitization): GovernorReviewInputs {
    return inputs({
      records: [
        record({ prNumber: 5000, reviewedDiffHash: DIFF_HASH, verdict: 'approve', sanitization }),
      ],
    });
  }

  it('an unattributed strip is reported ALONGSIDE a comment, not suppressed by it', () => {
    // `clauses.length === 0` was an `else if` in disguise: one routine comment
    // filled the list and suppressed the unattributed clause, reproducing the
    // masking pattern this function exists to fix.
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 1,
        fieldsModified: 4,
        tagsRemoved: 0,
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('HTML comment(s)');
      expect(outcome.reason).toContain('cause unattributed');
    }
  });

  it('a fully attributed removal reports NO unattributed clause — the pair', () => {
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: DIFF_HASH,
        commentsRemoved: 1,
        fieldsModified: 1,
        tagsRemoved: 0,
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') expect(outcome.reason).not.toContain('cause unattributed');
  });

  it('a differing hash with no attributed cause names the state, not an empty fragment', () => {
    const outcome = analyzeGovernorReview(
      passingInputs({
        sanitizedDiffHash: 'f'.repeat(64),
        commentsRemoved: 0,
        fieldsModified: 0,
        tagsRemoved: 0,
      })
    );
    expect(outcome.kind).toBe('pass');
    if (outcome.kind === 'pass') {
      expect(outcome.reason).toContain('cause unreported');
      expect(outcome.reason).not.toContain(', stripped before dispatch');
    }
  });
});
