/**
 * Tests for the committed-ledger half of the ratification gate (#5130 step 2).
 *
 * The pure verdict is tested over real records from the real builder; the
 * end-to-end block at the bottom drives the REAL producer (`persistVoteRecord`)
 * through the REAL append script into a temp committed ledger and then the
 * REAL gate over it — neither side stubbed, which is the seam class #5120
 * names and the acceptance criterion #5130 states.
 *
 * @module scripts/governor-ledger-evidence.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConsensusResult, Vote } from '../packages/nexus-agents/src/consensus/types.js';
import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  computeVoteRecordHash,
  verifyVoteRecordSet,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  buildVoteRecord,
  persistVoteRecord,
  VOTE_RECORDS_REL_PATH,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';

import {
  BASE_LEDGER_PATH_ENV,
  acceptedHeadShas,
  evaluateLedgerEvidence,
  formatLedgerEvidence,
  isLedgerOnlyTip,
  ledgerEvidenceFromEnv,
  type HeadBinding,
  type LedgerEvidence,
} from './governor-ledger-evidence.js';
import { runRatificationGate } from './check-governor-ratification.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPEND_SCRIPT = join(REPO_ROOT, 'scripts', 'append-ratification-record.ts');
const HEAD = '0123456789abcdef0123456789abcdef01234567';
const PARENT = 'fedcba9876543210fedcba9876543210fedcba98';
const OTHER = '1111111111111111111111111111111111111111';
const PR = 6210;

// ---------------------------------------------------------------------------
// Fixtures: real records from the real builder.
// ---------------------------------------------------------------------------

function vote(decision: Vote['decision']): Vote {
  return { decision, confidence: 0.8, reasoning: 'because' };
}
function seat(role: VoterRole, decision: Vote['decision'], errored = false): AgentVoteResult {
  return { role, vote: vote(decision), processingTimeMs: 10, source: errored ? 'error' : 'llm' };
}
function consensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  const now = '2026-09-14T00:00:00.000Z';
  return {
    proposalId: 'p-1',
    proposal: { title: 'T', description: 'D', algorithm: 'supermajority' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 3, reject: 0, abstain: 0, total: 3 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 5,
    ...overrides,
  };
}
const WHOLE_PANEL: readonly AgentVoteResult[] = [
  seat('architect', 'approve'),
  seat('security', 'approve'),
  seat('scope_steward', 'approve'),
];
const DEGRADED_PANEL: readonly AgentVoteResult[] = [
  seat('architect', 'approve'),
  seat('security', 'approve'),
  seat('scope_steward', 'abstain', true),
];

interface RecordOpts {
  readonly sequence: number;
  readonly pr?: number;
  readonly headSha?: string;
  readonly bound?: boolean;
  readonly decision?: VoteRecord['decision'];
  readonly votes?: readonly AgentVoteResult[];
  /** #6211: absent ⇒ a pre-1.11 record that never recorded its policy. */
  readonly errorPolicy?: VoteRecord['errorPolicy'];
}

function record(id: string, opts: RecordOpts): VoteRecord {
  return buildVoteRecord({
    declaredOptions: undefined,
    resolvedDecision: opts.decision ?? 'approved',
    id,
    proposal: `Ratify PR #${String(opts.pr ?? PR)}`,
    strategy: 'supermajority',
    result: consensusResult(),
    votes: opts.votes ?? WHOLE_PANEL,
    sequence: opts.sequence,
    ...(opts.errorPolicy !== undefined ? { errorPolicy: opts.errorPolicy } : {}),
    ...(opts.bound === false
      ? {}
      : { ratifiesPr: { pr: opts.pr ?? PR, headSha: opts.headSha ?? HEAD } }),
  });
}

/**
 * The same record with `panelCoverage` removed and re-hashed: a bound record
 * that says nothing about whether its panel ran whole. The producer now always
 * writes coverage on a bound record, so this is the hand-typed shape #6213
 * names — it self-verifies, and only the gate can refuse it.
 */
function withoutCoverage(r: VoteRecord): VoteRecord {
  const { hash: _hash, panelCoverage: _coverage, ...payload } = r;
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

function ledgerText(records: readonly VoteRecord[]): string {
  return records.map((r) => JSON.stringify(r) + '\n').join('');
}

const AT_HEAD = { sha: HEAD, parentSha: PARENT, commitFiles: ['scripts/x.ts'] } as const;

function kindOf(e: LedgerEvidence): LedgerEvidence['kind'] {
  return e.kind;
}

// ---------------------------------------------------------------------------
// The pure verdict.
// ---------------------------------------------------------------------------

describe('evaluateLedgerEvidence', () => {
  it('an EMPTY ledger is no-record, never ratified (the empty case is named)', () => {
    const e = evaluateLedgerEvidence({ ledgerText: '', pr: PR, head: AT_HEAD });
    expect(e).toEqual({ kind: 'no-record', recordCount: 0 });
  });

  it('a ledger with records for OTHER PRs only is no-record, and counts them', () => {
    const text = ledgerText([
      record('v0', { sequence: 0, pr: 1 }),
      record('v1', { sequence: 1, pr: 2 }),
    ]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e).toEqual({ kind: 'no-record', recordCount: 2 });
  });

  it('ratified when a record binds this PR at the head, is approved and the panel is whole', () => {
    const r = record('v0', { sequence: 0 });
    const e = evaluateLedgerEvidence({ ledgerText: ledgerText([r]), pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.record.id).toBe('v0');
    expect(e.record.hash).toBe(r.hash);
    expect(e.shaChecked).toBe(true);
  });

  it('sha-mismatch when the bound head is not the PR head, listing the shas found', () => {
    const text = ledgerText([record('v0', { sequence: 0, headSha: OTHER })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e).toEqual({ kind: 'sha-mismatch', accepted: [HEAD], found: [OTHER] });
  });

  it('accepts head^ when the head commit touches ONLY the ledger (the caller-commits tip)', () => {
    const text = ledgerText([record('v0', { sequence: 0, headSha: PARENT })]);
    const tip = { sha: HEAD, parentSha: PARENT, commitFiles: [VOTE_RECORDS_REL_PATH] };
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: tip });
    expect(e.kind).toBe('ratified');
  });

  it('does NOT accept head^ when the head commit touches anything besides the ledger', () => {
    const text = ledgerText([record('v0', { sequence: 0, headSha: PARENT })]);
    const tip = { sha: HEAD, parentSha: PARENT, commitFiles: [VOTE_RECORDS_REL_PATH, 'src/a.ts'] };
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: tip });
    expect(e).toEqual({ kind: 'sha-mismatch', accepted: [HEAD], found: [PARENT] });
  });

  it('does NOT accept head^ when the parent is unknown, even for a ledger-only tip', () => {
    const text = ledgerText([record('v0', { sequence: 0, headSha: PARENT })]);
    const tip = { sha: HEAD, commitFiles: [VOTE_RECORDS_REL_PATH] };
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: tip }))).toBe(
      'sha-mismatch'
    );
  });

  it('compares shas case-insensitively (GitHub emits lowercase; a local run may not)', () => {
    const text = ledgerText([record('v0', { sequence: 0 })]);
    const head = { sha: HEAD.toUpperCase(), commitFiles: ['x'] };
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head }))).toBe('ratified');
  });

  it('not-approved when the bound record is not an approval', () => {
    const text = ledgerText([record('v0', { sequence: 0, decision: 'rejected' })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('not-approved');
    if (e.kind !== 'not-approved') throw new Error('unreachable');
    expect(e.record.decision).toBe('rejected');
  });

  it('degraded-panel when panelCoverage reports an errored seat, naming the roles', () => {
    const text = ledgerText([record('v0', { sequence: 0, votes: DEGRADED_PANEL })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('degraded-panel');
    if (e.kind !== 'degraded-panel') throw new Error('unreachable');
    expect(e.coverage).toEqual({
      requested: 3,
      responded: 2,
      errored: 1,
      erroredRoles: ['scope_steward'],
    });
  });

  it('a dissenting bound record is not cherry-picked past by an approving one', () => {
    // Two records bound to the same head, one rejected and one approved. The
    // tier resolver's contrarian condition: a promoter must not select the
    // approving fork by ref. Every bound record must ratify.
    const text = ledgerText([
      record('v0', { sequence: 0, decision: 'rejected' }),
      record('v1', { sequence: 1 }),
    ]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD }))).toBe(
      'not-approved'
    );
  });

  it('ledger-invalid when a record fails its self-hash (a tampered byte)', () => {
    const r = record('v0', { sequence: 0 });
    const text = ledgerText([{ ...r, proposal: r.proposal + '!' }]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ledger-invalid');
    if (e.kind !== 'ledger-invalid') throw new Error('unreachable');
    expect(e.detail).toContain('hash_mismatch');
  });

  it('ledger-invalid when a line does not parse — a valid record elsewhere does not rescue it', () => {
    const text = ledgerText([record('v0', { sequence: 0 })]) + '{not json\n';
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ledger-invalid');
    if (e.kind !== 'ledger-invalid') throw new Error('unreachable');
    expect(e.detail).toContain('line(s) 2');
  });

  it('ledger-invalid on a sequence gap (an omitted record)', () => {
    const text = ledgerText([record('v0', { sequence: 0 }), record('v2', { sequence: 2 })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ledger-invalid');
    if (e.kind !== 'ledger-invalid') throw new Error('unreachable');
    expect(e.detail).toContain('sequence_gap');
  });

  it('duplicate-id when two records share an id with DIFFERENT content — REFUSED', () => {
    // The step-1 fork case: two branches appended the same id, the union merge
    // kept both lines, each self-hashes, the set verifies (a benign fork at
    // sequence 0). But one id names two contents, so a resolver cannot say
    // which one the panel produced.
    const a = record('v0', { sequence: 0 });
    const b = record('v0', { sequence: 0, headSha: OTHER });
    expect(a.hash).not.toBe(b.hash);
    const e = evaluateLedgerEvidence({ ledgerText: ledgerText([a, b]), pr: PR, head: AT_HEAD });
    expect(e).toEqual({ kind: 'duplicate-id', ids: ['v0'] });
  });

  it('duplicate-id is scoped to the whole ledger, not just this PR’s records', () => {
    const a = record('v9', { sequence: 0, pr: 1 });
    const b = record('v9', { sequence: 0, pr: 2 });
    const mine = record('v0', { sequence: 1 });
    const e = evaluateLedgerEvidence({
      ledgerText: ledgerText([a, b, mine]),
      pr: PR,
      head: AT_HEAD,
    });
    expect(e).toEqual({ kind: 'duplicate-id', ids: ['v9'] });
  });

  it('two byte-identical copies of one record collapse to that record (not duplicate-id)', () => {
    const r = record('v0', { sequence: 0 });
    const e = evaluateLedgerEvidence({ ledgerText: ledgerText([r, r]), pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ratified');
  });

  it('a record without ratifiesPr is an ordinary vote and never binds a PR', () => {
    const text = ledgerText([record('v0', { sequence: 0, bound: false })]);
    expect(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD })).toEqual({
      kind: 'no-record',
      recordCount: 1,
    });
  });

  it('post-merge (no head): keys on the PR number only and says the sha was not checked', () => {
    const text = ledgerText([record('v0', { sequence: 0, headSha: OTHER })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR });
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.shaChecked).toBe(false);
  });

  it('post-merge still refuses a degraded or unapproved record', () => {
    const text = ledgerText([record('v0', { sequence: 0, votes: DEGRADED_PANEL })]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR }))).toBe('degraded-panel');
  });
});

describe('append-only against the base (#6213, ledger-rewritten)', () => {
  // The verifier already refuses a ledger with a HOLE in `0..max` as
  // `ledger-invalid` (sequence_gap), so deleting a line from the middle is
  // caught before this check runs. What the set verifier cannot see, and this
  // check exists for: dropping the TAIL and re-sequencing the new record
  // into the freed slot, editing a line and re-hashing it, and reordering.
  const L0 = record('v0', { sequence: 0, pr: 1 });
  const L1 = record('v1', { sequence: 1, pr: 2 });
  const A1 = record('vA', { sequence: 2, pr: 3 });
  const B1 = record('vB', { sequence: 2 });
  /** The ratifying record re-sequenced into a slot a deleted base line freed. */
  const B_AT_1 = record('vB', { sequence: 1 });
  const B_AT_0 = record('vB', { sequence: 0 });
  const base = ledgerText([L0, L1]);

  function ev(headText: string, baseText: string | undefined): LedgerEvidence {
    return evaluateLedgerEvidence({
      ledgerText: headText,
      pr: PR,
      head: AT_HEAD,
      ...(baseText !== undefined ? { baseLedgerText: baseText } : {}),
    });
  }

  it('head = base + appended line is NOT rewritten, and the verdict says append-only was checked', () => {
    const e = ev(ledgerText([L0, L1, B1]), base);
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.appendOnlyChecked).toBe(true);
  });

  it('head identical to base is not rewritten (nothing appended; the verdict is about the PR, not the diff)', () => {
    expect(ev(base, base)).toEqual({ kind: 'no-record', recordCount: 2 });
  });

  it('deleting a base line from the MIDDLE leaves a sequence hole: ledger-invalid, which outranks the rewrite', () => {
    const e = ev(ledgerText([L1, B1]), base);
    expect(e.kind).toBe('ledger-invalid');
    if (e.kind !== 'ledger-invalid') throw new Error('unreachable');
    expect(e.detail).toContain('sequence_gap');
  });

  it('deleting the LAST base line (a recorded dissent, say) and re-sequencing the new record into its slot → ledger-rewritten', () => {
    // The set verifies (0..1, both hashes good); only the base comparison sees it.
    const head = ledgerText([L0, B_AT_1]);
    expect(evaluateLedgerEvidence({ ledgerText: head, pr: PR, head: AT_HEAD }).kind).toBe(
      'ratified'
    );
    expect(ev(head, base)).toEqual({
      kind: 'ledger-rewritten',
      baseLineCount: 2,
      headLineCount: 2,
      divergesAt: 2,
    });
  });

  it('truncating the ledger to a prefix of the base (nothing appended) → ledger-rewritten', () => {
    expect(ev(ledgerText([L0]), base)).toEqual({
      kind: 'ledger-rewritten',
      baseLineCount: 2,
      headLineCount: 1,
      divergesAt: 2,
    });
  });

  it('editing a base line and RE-HASHING it (the self-hash cannot see this) → ledger-rewritten', () => {
    const { hash: _h, ...payload } = L1;
    const edited: VoteRecord = {
      ...payload,
      approvalPercentage: 99,
      hash: computeVoteRecordHash({ ...payload, approvalPercentage: 99 }),
    };
    const head = ledgerText([L0, edited, B1]);
    // The rewritten ledger verifies as a set — that is why the base comparison exists.
    expect(evaluateLedgerEvidence({ ledgerText: head, pr: PR, head: AT_HEAD }).kind).toBe(
      'ratified'
    );
    expect(ev(head, base)).toEqual({
      kind: 'ledger-rewritten',
      baseLineCount: 2,
      headLineCount: 3,
      divergesAt: 2,
    });
  });

  it('reordering the base lines → ledger-rewritten (same set, not the same ledger)', () => {
    expect(kindOf(ev(ledgerText([L1, L0, B1]), base))).toBe('ledger-rewritten');
  });

  it('an emptied or missing head ledger over a non-empty base → ledger-rewritten with headLineCount 0', () => {
    expect(ev('', base)).toEqual({
      kind: 'ledger-rewritten',
      baseLineCount: 2,
      headLineCount: 0,
      divergesAt: 1,
    });
  });

  it('an EMPTY base (the PR adds the file) constrains nothing: every head is append-only over it', () => {
    const e = ev(ledgerText([B_AT_0]), '');
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.appendOnlyChecked).toBe(true);
  });

  it('blank lines between records are not a rewrite: the comparison is over record lines', () => {
    const head = `${JSON.stringify(L0)}\n\n${JSON.stringify(L1)}\n${JSON.stringify(B1)}\n`;
    expect(kindOf(ev(head, base))).toBe('ratified');
  });

  it('no base supplied → append-only is NOT checked, and the ratified verdict says so', () => {
    const e = ev(ledgerText([L0, L1, B1]), undefined);
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.appendOnlyChecked).toBe(false);
  });

  describe('the #6194 fork: two branches each append one line (measured against git merge=union)', () => {
    // Measured in a scratch repo (see PR #6218): the union driver writes
    // OURS first, so the order of the two appended lines depends on which
    // side did the merging. Every git-produced shape keeps the base as an
    // ordered SUBSEQUENCE; a prefix rule refused the "Update branch" shape.
    const L = [L0, L1];
    const B2 = record('vB2', { sequence: 3 });

    it('branch A merged first: A head = base + A1 over merge-base = base → append-only', () => {
      expect(kindOf(ev(ledgerText([...L, A1]), ledgerText(L)))).toBe('no-record');
    });

    it('branch B un-rebased: its merge-base is still the old base, so base + B1 is append-only', () => {
      expect(kindOf(ev(ledgerText([...L, B1]), ledgerText(L)))).toBe('ratified');
    });

    it('branch B rebased onto main (base + A1): union puts A1 first → base + A1 + B1 is append-only', () => {
      expect(kindOf(ev(ledgerText([...L, A1, B1]), ledgerText([...L, A1])))).toBe('ratified');
    });

    it('main merged INTO branch B ("Update branch"): union puts OURS first → base + B1 + A1 is append-only over base + A1', () => {
      // The merge-base after the refresh is main's tip (base + A1); B1 now
      // sits BEFORE A1. Not a rewrite: every base line is present, in order.
      const e = ev(ledgerText([...L, B1, A1]), ledgerText([...L, A1]));
      expect(e.kind).toBe('ratified');
      if (e.kind !== 'ratified') throw new Error('unreachable');
      expect(e.appendOnlyChecked).toBe(true);
    });

    it('...and the next append on the refreshed branch (base + B1 + A1 + B2) still lands as append-only', () => {
      expect(kindOf(ev(ledgerText([...L, B1, A1, B2]), ledgerText([...L, A1])))).toBe('ratified');
    });

    it('the refreshed branch with A1 DROPPED (base + B1) over base + A1 → ledger-rewritten at base line 3', () => {
      expect(ev(ledgerText([...L, B1]), ledgerText([...L, A1]))).toEqual({
        kind: 'ledger-rewritten',
        baseLineCount: 3,
        headLineCount: 3,
        divergesAt: 3,
      });
    });
  });

  it('precedence: ledger-invalid beats ledger-rewritten; ledger-rewritten beats duplicate-id and no-record', () => {
    // Unparseable head line AND a dropped base line → the parse failure is reported.
    expect(kindOf(ev(`${JSON.stringify(L0)}\nnot json\n`, base))).toBe('ledger-invalid');
    // Dropped tail line AND a duplicate id (two contents under 'vB') → the rewrite is reported.
    const { hash: _h, ...dupePayload } = B_AT_1;
    const dupe = { ...dupePayload, approvalPercentage: 50 };
    const dupeHead = ledgerText([L0, B_AT_1, { ...dupe, hash: computeVoteRecordHash(dupe) }]);
    expect(evaluateLedgerEvidence({ ledgerText: dupeHead, pr: PR, head: AT_HEAD }).kind).toBe(
      'duplicate-id'
    );
    expect(kindOf(ev(dupeHead, base))).toBe('ledger-rewritten');
    // Dropped tail line AND no record for this PR → the rewrite is reported.
    expect(kindOf(ev(ledgerText([L0]), base))).toBe('ledger-rewritten');
  });

  it('the deadlock claim is false: a dissent bound at sha A does not touch a record bound at sha B', () => {
    // Binding is PR + sha. The contrarian seat on #6210 argued a recorded
    // dissent would block every later approval of the same PR, so append-only
    // would deadlock the PR. It does not: the dissent stays in the ledger
    // (deleting it IS the rewrite refused above) and binds only the head it
    // names.
    const dissentAtA = record('v-dissent', { sequence: 0, headSha: OTHER, decision: 'rejected' });
    const approvalAtB = record('v-approve', { sequence: 1, headSha: HEAD });
    const baseWithDissent = ledgerText([dissentAtA]);
    const head = ledgerText([dissentAtA, approvalAtB]);
    const atB = evaluateLedgerEvidence({
      ledgerText: head,
      pr: PR,
      head: AT_HEAD,
      baseLedgerText: baseWithDissent,
    });
    expect(atB.kind).toBe('ratified');
    if (atB.kind !== 'ratified') throw new Error('unreachable');
    expect(atB.record.id).toBe('v-approve');
    // At head A the dissent DOES bind — the same ledger, the other head.
    const atA = evaluateLedgerEvidence({
      ledgerText: head,
      pr: PR,
      head: { ...AT_HEAD, sha: OTHER },
      baseLedgerText: baseWithDissent,
    });
    expect(atA.kind).toBe('not-approved');
    // And removing the dissent to "unblock" (re-sequencing the approval into
    // its slot so the set still verifies) is the rewrite.
    expect(
      kindOf(
        evaluateLedgerEvidence({
          ledgerText: ledgerText([record('v-approve', { sequence: 0, headSha: HEAD })]),
          pr: PR,
          head: AT_HEAD,
          baseLedgerText: baseWithDissent,
        })
      )
    ).toBe('ledger-rewritten');
  });
});

describe('panel coverage is REQUIRED on a bound record (#6213, unmeasured-panel)', () => {
  it('a bound record without panelCoverage → unmeasured-panel, never ratified', () => {
    const r = withoutCoverage(record('v0', { sequence: 0 }));
    expect(r.panelCoverage).toBeUndefined();
    expect(verifyVoteRecordSet([r]).ok).toBe(true);
    const e = evaluateLedgerEvidence({ ledgerText: ledgerText([r]), pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('unmeasured-panel');
    if (e.kind !== 'unmeasured-panel') throw new Error('unreachable');
    expect(e.record.id).toBe('v0');
  });

  it('a bound record whose coverage names an errored seat → degraded-panel (unchanged)', () => {
    const r = record('v0', { sequence: 0, votes: DEGRADED_PANEL });
    expect(
      kindOf(evaluateLedgerEvidence({ ledgerText: ledgerText([r]), pr: PR, head: AT_HEAD }))
    ).toBe('degraded-panel');
  });

  it('a bound record whose coverage says 0 of 0 seats → unmeasured-panel (the empty panel is named)', () => {
    const r = record('v0', { sequence: 0, votes: [] });
    expect(r.panelCoverage?.requested).toBe(0);
    expect(
      kindOf(evaluateLedgerEvidence({ ledgerText: ledgerText([r]), pr: PR, head: AT_HEAD }))
    ).toBe('unmeasured-panel');
  });

  it('an UNBOUND record without coverage is irrelevant: the bound whole record still ratifies', () => {
    const unbound = withoutCoverage(record('v-old', { sequence: 0, bound: false }));
    const other = withoutCoverage(record('v-other', { sequence: 1, pr: 1 }));
    const bound = record('v0', { sequence: 2 });
    const e = evaluateLedgerEvidence({
      ledgerText: ledgerText([unbound, other, bound]),
      pr: PR,
      head: AT_HEAD,
    });
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.record.id).toBe('v0');
  });

  it('precedence: not-approved beats unmeasured-panel; unmeasured-panel beats ratified', () => {
    const dissent = record('v-no', { sequence: 0, decision: 'rejected' });
    const blind = withoutCoverage(record('v-blind', { sequence: 1 }));
    const whole = record('v-ok', { sequence: 2 });
    const text = ledgerText([dissent, blind, whole]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD }))).toBe(
      'not-approved'
    );
    const blindFirst = ledgerText([
      withoutCoverage(record('v-blind', { sequence: 0 })),
      record('v-ok', { sequence: 1 }),
    ]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: blindFirst, pr: PR, head: AT_HEAD }))).toBe(
      'unmeasured-panel'
    );
  });

  it('post-merge (no head) requires coverage too', () => {
    const r = withoutCoverage(record('v0', { sequence: 0 }));
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: ledgerText([r]), pr: PR }))).toBe(
      'unmeasured-panel'
    );
  });
});

describe('wrong-error-policy: the recorded policy is legible on a whole-panel record (#6211)', () => {
  it('wrong-error-policy when a bound, approved, WHOLE panel recorded a policy other than absolute_quorum', () => {
    // The case #6211 names: before the record carried the policy, a whole
    // panel ratified under `reduce_denominator` was indistinguishable from an
    // `absolute_quorum` one — `degraded-panel` needs an errored seat to fire.
    const text = ledgerText([record('v0', { sequence: 0, errorPolicy: 'reduce_denominator' })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('wrong-error-policy');
    if (e.kind !== 'wrong-error-policy') throw new Error('unreachable');
    expect(e.errorPolicy).toBe('reduce_denominator');
    expect(e.record.id).toBe('v0');
  });

  it('every non-absolute_quorum policy is wrong, not only the default', () => {
    for (const errorPolicy of ['count_as_abstain', 'fail_closed'] as const) {
      const text = ledgerText([record('v0', { sequence: 0, errorPolicy })]);
      expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD }))).toBe(
        'wrong-error-policy'
      );
    }
  });

  it('ratified when the recorded policy IS absolute_quorum, and the notice names it', () => {
    const text = ledgerText([record('v0', { sequence: 0, errorPolicy: 'absolute_quorum' })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ratified');
    expect(formatLedgerEvidence(e)).toContain('errorPolicy: absolute_quorum');
  });

  it('a record WITHOUT the field keeps the panel-coverage inference and says the policy is unrecorded', () => {
    // A pre-1.11 record cannot answer the policy question; the gate must not
    // print "absolute_quorum" for a record that never said so.
    const text = ledgerText([record('v0', { sequence: 0 })]);
    const e = evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD });
    expect(e.kind).toBe('ratified');
    expect(formatLedgerEvidence(e)).toContain('errorPolicy: unrecorded');
  });

  it('precedes degraded-panel: a degraded record with a wrong policy reports the policy', () => {
    // The policy is the CAUSE and the errored seat is the symptom the old
    // inference read; when the record can name the cause, it does.
    const text = ledgerText([
      record('v0', { sequence: 0, votes: DEGRADED_PANEL, errorPolicy: 'reduce_denominator' }),
    ]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD }))).toBe(
      'wrong-error-policy'
    );
  });

  it('does not precede not-approved: a rejected record is not-approved whatever its policy', () => {
    const text = ledgerText([
      record('v0', { sequence: 0, decision: 'rejected', errorPolicy: 'reduce_denominator' }),
    ]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR, head: AT_HEAD }))).toBe(
      'not-approved'
    );
  });

  it('post-merge (no head) still refuses a wrong policy', () => {
    const text = ledgerText([record('v0', { sequence: 0, errorPolicy: 'count_as_abstain' })]);
    expect(kindOf(evaluateLedgerEvidence({ ledgerText: text, pr: PR }))).toBe('wrong-error-policy');
  });

  it('renders as a ::warning:: naming the record, the recorded policy and the required one', () => {
    const r = record('v0', { sequence: 0, errorPolicy: 'reduce_denominator' });
    const line = formatLedgerEvidence({
      kind: 'wrong-error-policy',
      record: r,
      errorPolicy: 'reduce_denominator',
    });
    expect(line.startsWith('::warning::')).toBe(true);
    expect(line).toContain('wrong-error-policy');
    expect(line).toContain("'v0'");
    expect(line).toContain('reduce_denominator');
    expect(line).toContain('absolute_quorum');
    expect(line).toContain('#5131');
  });
});

describe('isLedgerOnlyTip / acceptedHeadShas', () => {
  it('is true only for exactly the ledger file', () => {
    expect(isLedgerOnlyTip([VOTE_RECORDS_REL_PATH])).toBe(true);
    expect(isLedgerOnlyTip([VOTE_RECORDS_REL_PATH, 'governance/README.md'])).toBe(false);
    expect(isLedgerOnlyTip(['governance/README.md'])).toBe(false);
  });

  it('an EMPTY file list is not a ledger-only tip (an empty commit adds no ledger line)', () => {
    expect(isLedgerOnlyTip([])).toBe(false);
  });

  it('accepts head, plus head^ only for a ledger-only tip with a known parent', () => {
    expect(acceptedHeadShas({ sha: HEAD, parentSha: PARENT, commitFiles: ['a'] })).toEqual([HEAD]);
    expect(
      acceptedHeadShas({ sha: HEAD, parentSha: PARENT, commitFiles: [VOTE_RECORDS_REL_PATH] })
    ).toEqual([HEAD, PARENT]);
    expect(acceptedHeadShas({ sha: HEAD, commitFiles: [VOTE_RECORDS_REL_PATH] })).toEqual([HEAD]);
  });
});

describe('formatLedgerEvidence', () => {
  it('renders ratified as a notice naming the record id, and every other kind as a ::warning::', () => {
    const r = record('v0', { sequence: 0 });
    const ok = formatLedgerEvidence({
      kind: 'ratified',
      record: r,
      shaChecked: true,
      appendOnlyChecked: true,
    });
    expect(ok.startsWith('::notice::')).toBe(true);
    expect(ok).toContain("'v0'");
    expect(ok).toContain(HEAD);
    expect(ok).toContain('append-only');
    expect(ok).not.toContain('not checked');

    const unchecked = formatLedgerEvidence({
      kind: 'ratified',
      record: r,
      shaChecked: false,
      appendOnlyChecked: false,
    });
    expect(unchecked).toContain('sha not checked');
    expect(unchecked).toContain('append-only not checked');

    const kinds: LedgerEvidence[] = [
      { kind: 'no-record', recordCount: 0 },
      { kind: 'sha-mismatch', accepted: [HEAD], found: [OTHER] },
      { kind: 'not-approved', record: { ...r, decision: 'rejected' } },
      {
        kind: 'degraded-panel',
        record: r,
        coverage: { requested: 7, responded: 6, errored: 1, erroredRoles: ['catfish'] },
      },
      { kind: 'ledger-invalid', detail: 'hash_mismatch at v0' },
      { kind: 'duplicate-id', ids: ['v0'] },
      { kind: 'ledger-rewritten', baseLineCount: 3, headLineCount: 3, divergesAt: 2 },
      { kind: 'unmeasured-panel', record: r, reason: 'no panelCoverage on the record' },
    ];
    for (const e of kinds) {
      const line = formatLedgerEvidence(e);
      expect(line.startsWith('::warning::')).toBe(true);
      expect(line).toContain(e.kind);
      expect(line).toContain('#5131');
    }
    expect(formatLedgerEvidence(kinds[1] as LedgerEvidence)).toContain(OTHER);
    expect(formatLedgerEvidence(kinds[3] as LedgerEvidence)).toContain('catfish');
    expect(formatLedgerEvidence(kinds[5] as LedgerEvidence)).toContain("'v0'");
    expect(formatLedgerEvidence(kinds[6] as LedgerEvidence)).toContain('base line 2');
    expect(formatLedgerEvidence(kinds[7] as LedgerEvidence)).toContain("'v0'");
  });

  it('an empty ledger says so explicitly, distinct from "no record for this PR"', () => {
    expect(formatLedgerEvidence({ kind: 'no-record', recordCount: 0 })).toContain('empty');
    expect(formatLedgerEvidence({ kind: 'no-record', recordCount: 3 })).toContain('3 record');
  });
});

describe('ledgerEvidenceFromEnv', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-evidence-env-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is unmeasured — not no-record — when PR_NUMBER is absent or not a positive integer', () => {
    const path = join(dir, 'vote-records.jsonl');
    writeFileSync(path, ledgerText([record('v0', { sequence: 0 })]), 'utf-8');
    for (const pr of [undefined, '', 'abc', '0', '-1', '1.5']) {
      const e = ledgerEvidenceFromEnv(
        { ...(pr !== undefined ? { PR_NUMBER: pr } : {}), RATIFICATION_LEDGER_PATH: path },
        path
      );
      expect(e.kind).toBe('unmeasured');
    }
  });

  it('a MISSING ledger file is the empty case (no-record with 0 records), not unmeasured', () => {
    const e = ledgerEvidenceFromEnv({ PR_NUMBER: String(PR) }, join(dir, 'absent.jsonl'));
    expect(e).toEqual({ kind: 'no-record', recordCount: 0 });
  });

  it('reads the head binding from PR_HEAD_SHA / PR_HEAD_PARENT_SHA / HEAD_COMMIT_FILES', () => {
    const path = join(dir, 'vote-records.jsonl');
    writeFileSync(path, ledgerText([record('v0', { sequence: 0, headSha: PARENT })]), 'utf-8');
    const base = { PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD, PR_HEAD_PARENT_SHA: PARENT };
    expect(
      ledgerEvidenceFromEnv({ ...base, HEAD_COMMIT_FILES: `${VOTE_RECORDS_REL_PATH}\n` }, path).kind
    ).toBe('ratified');
    expect(ledgerEvidenceFromEnv({ ...base, HEAD_COMMIT_FILES: 'src/a.ts' }, path).kind).toBe(
      'sha-mismatch'
    );
    // No head sha at all: the post-merge shape.
    const post = ledgerEvidenceFromEnv({ PR_NUMBER: String(PR) }, path);
    expect(post.kind).toBe('ratified');
    if (post.kind !== 'ratified') throw new Error('unreachable');
    expect(post.shaChecked).toBe(false);
  });

  it('an UNREADABLE ledger (a directory at the path) is unmeasured naming the error, not a crash (#6213)', () => {
    const path = join(dir, 'vote-records.jsonl');
    mkdirSync(path);
    const e = ledgerEvidenceFromEnv({ PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD }, path);
    expect(e.kind).toBe('unmeasured');
    if (e.kind !== 'unmeasured') throw new Error('unreachable');
    expect(e.reason).toContain('EISDIR');
    expect(e.reason).toContain(path);
  });

  it(`reads the base ledger from ${BASE_LEDGER_PATH_ENV} and checks append-only against it`, () => {
    const headPath = join(dir, 'head.jsonl');
    const basePath = join(dir, 'base.jsonl');
    const older = record('v-old', { sequence: 0, pr: 1 });
    writeFileSync(basePath, ledgerText([older]), 'utf-8');
    const env = { PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD, [BASE_LEDGER_PATH_ENV]: basePath };

    writeFileSync(headPath, ledgerText([older, record('v0', { sequence: 1 })]), 'utf-8');
    const ok = ledgerEvidenceFromEnv(env, headPath);
    expect(ok.kind).toBe('ratified');
    if (ok.kind !== 'ratified') throw new Error('unreachable');
    expect(ok.appendOnlyChecked).toBe(true);

    // The base line dropped and the new record re-sequenced into its slot.
    writeFileSync(headPath, ledgerText([record('v0', { sequence: 0 })]), 'utf-8');
    expect(ledgerEvidenceFromEnv(env, headPath).kind).toBe('ledger-rewritten');

    // The variable absent: append-only is not checked and the verdict says so.
    const unchecked = ledgerEvidenceFromEnv({ PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD }, headPath);
    expect(unchecked.kind).toBe('ratified');
    if (unchecked.kind !== 'ratified') throw new Error('unreachable');
    expect(unchecked.appendOnlyChecked).toBe(false);
  });

  it('an EMPTY base ledger file (the file did not exist at base) is a measured, empty base', () => {
    const headPath = join(dir, 'head.jsonl');
    const basePath = join(dir, 'base.jsonl');
    writeFileSync(basePath, '', 'utf-8');
    writeFileSync(headPath, ledgerText([record('v0', { sequence: 0 })]), 'utf-8');
    const e = ledgerEvidenceFromEnv(
      { PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD, [BASE_LEDGER_PATH_ENV]: basePath },
      headPath
    );
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.appendOnlyChecked).toBe(true);
  });

  it('an unreadable or missing BASE ledger file is unmeasured naming the error (the workflow promised a file)', () => {
    const headPath = join(dir, 'head.jsonl');
    writeFileSync(headPath, ledgerText([record('v0', { sequence: 0 })]), 'utf-8');
    const asDir = join(dir, 'base-dir');
    mkdirSync(asDir);
    const dirCase = ledgerEvidenceFromEnv(
      { PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD, [BASE_LEDGER_PATH_ENV]: asDir },
      headPath
    );
    expect(dirCase.kind).toBe('unmeasured');
    if (dirCase.kind !== 'unmeasured') throw new Error('unreachable');
    expect(dirCase.reason).toContain('EISDIR');
    const missing = ledgerEvidenceFromEnv(
      { PR_NUMBER: String(PR), PR_HEAD_SHA: HEAD, [BASE_LEDGER_PATH_ENV]: join(dir, 'nope') },
      headPath
    );
    expect(missing.kind).toBe('unmeasured');
    if (missing.kind !== 'unmeasured') throw new Error('unreachable');
    expect(missing.reason).toContain('ENOENT');
  });
});

describe('the workflow wires the base ledger (#6213)', () => {
  // The shell hardcodes the ledger path and the env var name; if either
  // drifts from the module's constants the base reads as absent and
  // append-only passes over an empty base. Pinned here, in both jobs.
  const workflow = readFileSync(
    join(REPO_ROOT, '.github', 'workflows', 'governor-review.yml'),
    'utf-8'
  );

  it('both jobs read the ledger at the base by the module path constant, guarded by a commit-exists check', () => {
    const show = `git show "\${LEDGER_BASE_SHA}:${VOTE_RECORDS_REL_PATH}" > "\${BASE_LEDGER_PATH}"`;
    expect(workflow.split(show).length - 1).toBe(2);
    expect(workflow.split('git cat-file -e "${LEDGER_BASE_SHA}^{commit}"').length - 1).toBe(2);
  });

  it('the push job bases append-only on github.event.before, falling back to SHA~1 only for the null sha', () => {
    // `SHA~1` compares only the last hop; a multi-commit push could rewrite
    // the ledger in one commit and append in the next.
    expect(workflow).toContain('BEFORE: ${{ github.event.before }}');
    expect(workflow).toContain(
      'if [ -n "${BEFORE}" ] && [ "${BEFORE}" != "0000000000000000000000000000000000000000" ]; then'
    );
    expect(workflow).toContain('LEDGER_BASE_SHA="${BEFORE}"');
    // The fallback names itself in an annotation.
    expect(workflow).toContain(
      '::notice::[governor-ledger] github.event.before is the null sha (first push of this ref)'
    );
    // The merge-base/parent form appears twice: the pre-merge job, and the push job fallback.
    expect(workflow.split('LEDGER_BASE_SHA="${BASE_SHA}"').length - 1).toBe(2);
  });

  it(`both gate steps receive ${BASE_LEDGER_PATH_ENV} from the evidence step`, () => {
    const wired = `${BASE_LEDGER_PATH_ENV}: \${{ steps.evidence.outputs.base_ledger_path }}`;
    expect(workflow.split(wired).length - 1).toBe(2);
    expect(workflow.split('echo "base_ledger_path=${BASE_LEDGER_PATH}"').length - 1).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// End to end: real producer → real append script → real gate. Nothing stubbed.
// ---------------------------------------------------------------------------

describe('end to end: persistVoteRecord → append-ratification-record.ts → the gate', () => {
  let dir: string;
  let sourcePath: string;
  let ledgerPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-evidence-e2e-'));
    sourcePath = join(dir, '.nexus-agents', 'governance', 'vote-records.jsonl');
    ledgerPath = join(dir, 'governance', 'vote-records.jsonl');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** The real producer: the store's own write path, into a temp runtime store. */
  function produce(id: string, opts: RecordOpts = { sequence: 0 }): VoteRecord {
    const written = persistVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: opts.decision ?? 'approved',
      id,
      proposal: `Ratify PR #${String(PR)}`,
      strategy: 'supermajority',
      result: consensusResult(),
      votes: opts.votes ?? WHOLE_PANEL,
      ratifiesPr: { pr: opts.pr ?? PR, headSha: opts.headSha ?? HEAD },
      filePath: sourcePath,
    });
    if (written === undefined) throw new Error('persistVoteRecord returned undefined');
    return written;
  }

  /** The real append script, as a subprocess, exactly as the operator runs it. */
  function append(id: string): { status: number; out: string } {
    try {
      const out = execFileSync(
        'pnpm',
        [
          'exec',
          'tsx',
          APPEND_SCRIPT,
          '--record-id',
          id,
          '--source',
          sourcePath,
          '--ledger',
          ledgerPath,
        ],
        { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return { status: 0, out };
    } catch (error: unknown) {
      const e = error as { status: number | null; stdout: string; stderr: string };
      return { status: e.status ?? -1, out: `${e.stdout}${e.stderr}` };
    }
  }

  function gate(head: HeadBinding | undefined): LedgerEvidence {
    return evaluateLedgerEvidence({
      ledgerText: readFileSync(ledgerPath, 'utf-8'),
      pr: PR,
      ...(head !== undefined ? { head } : {}),
    });
  }

  it('matching PR and sha → ratified, and the gate names the record the producer wrote', () => {
    const produced = produce('vote-e2e');
    const appended = append('vote-e2e');
    expect(appended.status, appended.out).toBe(0);

    const e = gate(AT_HEAD);
    expect(e.kind).toBe('ratified');
    if (e.kind !== 'ratified') throw new Error('unreachable');
    expect(e.record.id).toBe(produced.id);
    // #6213: the real producer writes coverage on a bound whole panel, so the
    // gate's coverage requirement is satisfiable by the real path, not only by
    // fixtures.
    expect(e.record.panelCoverage).toEqual({
      requested: 3,
      responded: 3,
      errored: 0,
      erroredRoles: [],
    });
    expect(e.record.ratifiesPr).toEqual(produced.ratifiesPr);
    // Re-sequenced by the append (0 in the fresh committed ledger), so the hash
    // legitimately differs from the runtime copy; the content is what carries.
    expect(e.record.sequence).toBe(0);
    expect(e.record.voters).toEqual(produced.voters);
  }, 60_000);

  it('mismatched sha → sha-mismatch listing the sha the panel actually saw', () => {
    produce('vote-e2e');
    expect(append('vote-e2e').status).toBe(0);
    const e = gate({ sha: OTHER, parentSha: PARENT, commitFiles: ['src/a.ts'] });
    expect(e).toEqual({ kind: 'sha-mismatch', accepted: [OTHER], found: [HEAD] });
  }, 60_000);

  it('a tampered byte in the committed ledger → ledger-invalid', () => {
    produce('vote-e2e');
    expect(append('vote-e2e').status).toBe(0);
    const text = readFileSync(ledgerPath, 'utf-8');
    // Flip one byte of the approval percentage: still valid JSON, still schema-valid.
    const tampered = text.replace('"approvalPercentage":100', '"approvalPercentage":99');
    expect(tampered).not.toBe(text);
    writeFileSync(ledgerPath, tampered, 'utf-8');
    const e = gate(AT_HEAD);
    expect(e.kind).toBe('ledger-invalid');
    if (e.kind !== 'ledger-invalid') throw new Error('unreachable');
    expect(e.detail).toContain('hash_mismatch');
  }, 60_000);

  it('two records under one id with different content (the union-merge fork) → duplicate-id', () => {
    // Branch A appended the record for HEAD; branch B appended a record with the
    // same id for OTHER. Simulated by appending twice from two runtime copies:
    // the second append is refused as already-present, so the fork is produced
    // the way merge=union produces it — by concatenating the two lines.
    produce('vote-e2e');
    expect(append('vote-e2e').status).toBe(0);
    const lineA = readFileSync(ledgerPath, 'utf-8');

    rmSync(ledgerPath);
    rmSync(sourcePath);
    produce('vote-e2e', { sequence: 0, headSha: OTHER });
    expect(append('vote-e2e').status).toBe(0);
    const lineB = readFileSync(ledgerPath, 'utf-8');
    expect(lineB).not.toBe(lineA);

    writeFileSync(ledgerPath, lineA + lineB, 'utf-8');
    expect(gate(AT_HEAD)).toEqual({ kind: 'duplicate-id', ids: ['vote-e2e'] });
  }, 90_000);

  it('a degraded panel produced by the real store → degraded-panel', () => {
    // The append script refuses `decision !== approved` but not a degraded
    // approval — under reduce_denominator a 2-of-3 responded panel records as
    // approved. This is the row the gate exists to catch (#5779).
    produce('vote-e2e', { sequence: 0, votes: DEGRADED_PANEL });
    expect(append('vote-e2e').status).toBe(0);
    const e = gate(AT_HEAD);
    expect(e.kind).toBe('degraded-panel');
    if (e.kind !== 'degraded-panel') throw new Error('unreachable');
    expect(e.coverage.erroredRoles).toEqual(['scope_steward']);
  }, 60_000);

  it('empty committed ledger → no-record (the producer wrote, the caller never appended)', () => {
    produce('vote-e2e');
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, '', 'utf-8');
    expect(gate(AT_HEAD)).toEqual({ kind: 'no-record', recordCount: 0 });
  });

  it('the REAL gate entry point prints the ledger verdict as an annotation, exit code unchanged', () => {
    // Wiring: runRatificationGate must reach the ledger evidence for a
    // governor-path diff and print it, while the label/approval verdict alone
    // still sets the exit code (warn-first; #5131 flips it).
    produce('vote-e2e');
    expect(append('vote-e2e').status).toBe(0);
    const lines: string[] = [];
    const push = (...a: unknown[]): void => void lines.push(a.map(String).join(' '));
    const log = vi.spyOn(console, 'log').mockImplementation(push);
    const err = vi.spyOn(console, 'error').mockImplementation(push);
    try {
      const env = {
        CHANGED_FILES: 'packages/nexus-agents/src/audit/vote-record.ts',
        APPROVALS: '',
        PR_LABELS: '',
        PR_NUMBER: String(PR),
        PR_HEAD_SHA: HEAD,
        PR_HEAD_PARENT_SHA: PARENT,
        HEAD_COMMIT_FILES: 'packages/nexus-agents/src/audit/vote-record.ts',
        RATIFICATION_LEDGER_PATH: ledgerPath,
      };
      const code = runRatificationGate(env);
      const out = lines.join('\n');
      // Unratified by label/approval → exit 1, as before this change.
      expect(code).toBe(1);
      expect(out).toContain("::notice::[governor-ledger] ratified: record 'vote-e2e'");

      lines.length = 0;
      const mismatch = runRatificationGate({ ...env, PR_HEAD_SHA: OTHER });
      expect(mismatch).toBe(1);
      expect(lines.join('\n')).toContain('::warning::[governor-ledger] sha-mismatch');

      lines.length = 0;
      writeFileSync(ledgerPath, '', 'utf-8');
      expect(runRatificationGate(env)).toBe(1);
      expect(lines.join('\n')).toContain('::warning::[governor-ledger] no-record');

      // #6213: the base ledger had a record this head no longer carries.
      lines.length = 0;
      const basePath = join(dir, 'base.jsonl');
      writeFileSync(basePath, ledgerText([record('v-base', { sequence: 0, pr: 1 })]), 'utf-8');
      expect(append('vote-e2e').status).toBe(0);
      expect(runRatificationGate({ ...env, [BASE_LEDGER_PATH_ENV]: basePath })).toBe(1);
      expect(lines.join('\n')).toContain('::warning::[governor-ledger] ledger-rewritten');

      // #6213: a directory at the ledger path — unmeasured, named, exit code untouched.
      lines.length = 0;
      rmSync(ledgerPath);
      mkdirSync(ledgerPath);
      expect(runRatificationGate(env)).toBe(1);
      expect(lines.join('\n')).toContain('[governor-ledger] unmeasured:');
      expect(lines.join('\n')).toContain('EISDIR');
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  }, 60_000);

  // #5131 flips warn to fail. When it lands, this test turns RED-ready: a
  // governor-path PR whose ledger verdict is not `ratified` must exit 1 even
  // when an owner approval or label is present, and an empty ledger must fail
  // rather than pass. Left as `todo` so the flip has a named test to make green.
  it.todo(
    '#5131: a governor-path PR whose ledger verdict is not ratified — no-record, sha-mismatch, ' +
      'not-approved, degraded-panel, unmeasured-panel, ledger-invalid, duplicate-id or ' +
      'ledger-rewritten — FAILS the gate, and an unreadable ledger (unmeasured) fails too (warn→fail flip)'
  );
});
