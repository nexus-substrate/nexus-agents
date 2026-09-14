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
  buildVoteRecord,
  persistVoteRecord,
  VOTE_RECORDS_REL_PATH,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';

import {
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
    ...(opts.bound === false
      ? {}
      : { ratifiesPr: { pr: opts.pr ?? PR, headSha: opts.headSha ?? HEAD } }),
  });
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
    const ok = formatLedgerEvidence({ kind: 'ratified', record: r, shaChecked: true });
    expect(ok.startsWith('::notice::')).toBe(true);
    expect(ok).toContain("'v0'");
    expect(ok).toContain(HEAD);

    const unchecked = formatLedgerEvidence({ kind: 'ratified', record: r, shaChecked: false });
    expect(unchecked).toContain('not checked');

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
    '#5131: a governor-path PR with no ratified ledger record FAILS the gate (warn→fail flip)'
  );
});
