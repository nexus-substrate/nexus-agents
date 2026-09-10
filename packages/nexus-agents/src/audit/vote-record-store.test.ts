/**
 * Tests for the authentic vote-record store (#3897, model revised #3927): a
 * completed vote persists a self-hashed record carrying the proposal hash +
 * decision + per-voter summary + monotonic `sequence`. The record is append-only
 * and round-trips, persisted sequences increment, tampering is detected as a
 * `hash_mismatch`, and the ledger survives a simulated concurrent-branch merge
 * (duplicate sequence → benign fork, not a failure).
 *
 * @module audit/vote-record-store.test
 */

import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import type { ILogger } from '../core/index.js';
import { UNREADABLE_RECORD_PREFIX } from './ledger-append.js';
import { isAbsolute, join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getNexusDataDir, nexusDataPath } from '../config/nexus-data-dir.js';

import type { ConsensusResult, Vote } from '../consensus/types.js';
import type { AgentVoteResult, VoterRole } from '../cli/vote-types.js';

// #3991: the store now resolves the runtime ledger via nexusDataPath (governance
// category) instead of findRepoRoot. Mock the resolver so each test pins the
// data root without touching the real homedir/sandbox/repo layout.
vi.mock('../config/nexus-data-dir.js', () => ({
  getNexusDataDir: vi.fn(() => '/data-root/.nexus-agents'),
  nexusDataPath: vi.fn((...segments: string[]) =>
    ['/data-root/.nexus-agents', ...segments].join('/')
  ),
}));

import type { VoteRecord } from './vote-record.js';
import {
  MAX_VOTER_REASONING_CHARS,
  VoterSummarySchema,
  computeVoteRecordHash,
  verifyVoteRecordSet,
} from './vote-record.js';
import {
  VOTE_RECORDS_PATH_ENV,
  buildVoteRecord,
  persistVoteRecord,
  parseVoteRecordsText,
  readVoteRecords,
  resolveVoteRecordsPath,
} from './vote-record-store.js';

function vote(decision: Vote['decision'], confidence: number): Vote {
  return { decision, confidence, reasoning: 'because' };
}

function agentVote(
  role: VoterRole,
  decision: Vote['decision'],
  source: AgentVoteResult['source'] = 'llm'
): AgentVoteResult {
  return { role, vote: vote(decision, 0.8), processingTimeMs: 10, source };
}

function consensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  const now = '2026-06-15T00:00:00.000Z';
  return {
    proposalId: 'p-1',
    proposal: { title: 'T', description: 'D', algorithm: 'higher_order' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 2, reject: 1, abstain: 0, total: 3 },
    approvalPercentage: 66.7,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 5,
    ...overrides,
  };
}

const votes: readonly AgentVoteResult[] = [
  agentVote('architect', 'approve'),
  agentVote('security', 'approve'),
  agentVote('catfish', 'reject'),
];

describe('buildVoteRecord', () => {
  it('carries the proposal hash, decision, counts, per-voter summary, and a sequence', () => {
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-1',
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    // 1.6 since #5373: every live voter's reasoning is stored, which is the
    // latest optional field. The optionTally/optionCoverage assertions below
    // are what test those fields' presence.
    expect(record.version).toBe('1.6');
    expect(record.sequence).toBe(0); // default first sequence
    expect(record.decision).toBe('approved');
    expect(record.proposalHash).toHaveLength(64);
    expect(record.approvalPercentage).toBeCloseTo(66.7);
    expect(record.voteCounts).toEqual({ approve: 2, reject: 1, abstain: 0, total: 3 });
    // #5373: the stored grounds travel with each entry.
    expect(record.voters).toEqual([
      { role: 'architect', decision: 'approve', confidence: 0.8, reasoning: 'because' },
      { role: 'security', decision: 'approve', confidence: 0.8, reasoning: 'because' },
      { role: 'catfish', decision: 'reject', confidence: 0.8, reasoning: 'because' },
    ]);
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('records a resolved no_quorum even when the engine outcome was approved (#4986)', () => {
    // The absolute_quorum void: `resolveVoteDecision` returns no_quorum while
    // `result.outcome` stays 'approved' and `result.policyReason` is never set,
    // so `errorVoided` is false. Deriving from the outcome recorded a genuine
    // approval for a vote the tool reported as no_quorum.
    const record = buildVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: 'no_quorum',
      id: 'vote-void',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult({ outcome: 'approved' }),
      votes,
    });

    expect(record.decision).toBe('no_quorum');
  });

  it('does not call an approved-but-voided vote approved (#4986)', () => {
    // The fallback's own asymmetry: the `errorVoided` check used to sit BELOW
    // the approved short-circuit, so it could only ever rescue a `rejected`.
    const record = buildVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-voided-approved',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult({ outcome: 'approved' }),
      votes,
      errorVoided: true,
    });

    expect(record.decision).toBe('no_quorum');
  });

  it('does not record a timed-out panel as a rejection (#4986)', () => {
    // `ProposalStatus` carries `timeout`/`pending`/`voting`/`closed`. The old
    // everything-else-is-rejected default attributed a verdict to voters who
    // never gave one.
    const record = buildVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-timeout',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult({ outcome: 'timeout', quorumReached: false }),
      votes,
    });

    expect(record.decision).toBe('no_quorum');
  });

  it('still records a genuine rejection as rejected', () => {
    // The pair that keeps the change above from swallowing real rejections.
    const record = buildVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-rejected',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult({ outcome: 'rejected' }),
      votes,
    });

    expect(record.decision).toBe('rejected');
  });

  it('omits optionTally and stays on 1.2 when no voter declared an option (#4452)', () => {
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-noopt',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    expect(record.optionTally).toBeUndefined();
    expect(record.version).toBe('1.6'); // #5373: stored reasoning
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('derives optionTally from selectedOption and bumps the schema (#4452, #4472)', () => {
    // The defect this fixes: voteCounts says approve:2 for BOTH a genuine
    // agreement and a split across options. The tally distinguishes them.
    const withOptions = votes.map((v, i) => ({
      ...v,
      selectedOption: i === 0 ? 'A' : i === 1 ? 'A' : 'C',
    }));
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-opt',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: withOptions,
    });
    // #4472: a tally now always travels with its coverage, so a record
    // carrying one is 1.4. Historical 1.3 records still verify.
    expect(record.version).toBe('1.6'); // #5373: stored reasoning outranks 1.4
    // The fixture's third voter is catfish(reject) and was assigned 'C'. Only
    // approvers count — this expectation previously asserted `C: 1`, encoding
    // the very defect e2e validation later surfaced in a live record.
    expect(record.optionTally).toEqual([{ option: 'A', count: 2 }]);
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('tallies only approvers, matching the population the verdict was computed over', () => {
    // Found by e2e validation: a REJECTING voter named an option, and the
    // record counted it. The threshold is evaluated over approvers only, so a
    // record whose tally includes rejecters describes a different population
    // than the verdict it accompanies — and disagrees with its own
    // optionCoverage, which was already approvers-only.
    const mixed: readonly AgentVoteResult[] = [
      { ...agentVote('architect', 'approve'), selectedOption: 'A' },
      { ...agentVote('catfish', 'reject'), selectedOption: 'B' },
    ];
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-mixed',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: mixed,
    });

    // 'B' came from a rejecter and must not appear.
    expect(record.optionTally).toEqual([{ option: 'A', count: 1 }]);

    // The tally and the coverage must describe the same population.
    const tallied = (record.optionTally ?? []).reduce((n, t) => n + t.count, 0);
    expect(tallied).toBe(record.optionCoverage?.selectedCount);
  });

  it('records selection coverage so a diluted share reads as partial (#4472)', () => {
    // Two approvers select, one approves without a usable selection. The
    // tally alone would show A:2 with no hint that a third approver's choice
    // was never measured.
    const partial = votes.map((v, i) => ({
      ...v,
      ...(i < 2 ? { selectedOption: 'A' } : {}),
    }));
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-coverage',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: partial,
    });

    const approvers = partial.filter((v) => v.vote.decision === 'approve').length;
    expect(record.optionCoverage).toEqual({
      approverCount: approvers,
      selectedCount: 2,
      unattributedApprovals: approvers - 2,
    });
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('orders the tally deterministically regardless of voter arrival order (#4452)', () => {
    // The array is hash-covered, so two vote sets differing only in order must
    // not produce different hashes.
    const mk = (opts: readonly string[]): VoteRecord =>
      buildVoteRecord({
        // #4986: these fixtures exercise the fallback derivation.
        declaredOptions: undefined,
        resolvedDecision: undefined,
        id: 'vote-ord',
        recordedAt: '2026-06-15T00:00:00.000Z',
        proposal: 'p',
        strategy: 'higher_order',
        result: consensusResult(),
        votes: votes.map((v, i) => ({ ...v, selectedOption: opts[i] as string })),
      });
    expect(mk(['A', 'C', 'A']).hash).toBe(mk(['C', 'A', 'A']).hash);
  });

  it('excludes error-source voters from the per-voter summary', () => {
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-1',
      proposal: 'p',
      strategy: 'simple_majority',
      result: consensusResult(),
      votes: [...votes, agentVote('pm', 'abstain', 'error')],
    });
    expect(record.voters.map((v) => v.role)).not.toContain('pm');
  });

  it('persists no_quorum (not rejected) for an error-policy short-circuit, matching the response (#4053)', () => {
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-sc',
      proposal: 'p',
      strategy: 'simple_majority',
      // short-circuit shape: 1 approver surfaced, no quorum, error-voided.
      result: consensusResult({
        outcome: 'rejected',
        quorumReached: false,
        approvalPercentage: 100,
      }),
      votes: [
        agentVote('scope_steward', 'approve'),
        agentVote('architect', 'abstain', 'error'),
        agentVote('security', 'abstain', 'error'),
      ],
      errorVoided: true,
    });
    expect(record.decision).toBe('no_quorum');
  });

  it('keeps rejected for a genuine quorum-reached rejection (#4053)', () => {
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-rej',
      proposal: 'p',
      strategy: 'simple_majority',
      result: consensusResult({ outcome: 'rejected', quorumReached: true, approvalPercentage: 20 }),
      votes: [agentVote('architect', 'reject'), agentVote('security', 'reject')],
      errorVoided: false,
    });
    expect(record.decision).toBe('rejected');
  });
});

describe('persistVoteRecord', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vote-records-'));
    filePath = join(dir, 'governance', 'vote-records.jsonl');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a maximal built voter entry carries EVERY schema field — the builder is not a fourth source (#6057)', () => {
    // The schema-only failure mode is a compile error now; this pins the
    // builder side: a vote that is retried AND clipped produces an entry whose
    // key set equals the schema's. Adding a field to the schema without teaching
    // the builder to emit it fails here.
    // One past the cap, derived from the constant: a literal that happened to
    // sit under it produced a fixture that was not clipped at all.
    const clipped = 'x'.repeat(MAX_VOTER_REASONING_CHARS + 1);
    const written = persistVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-maximal',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: [{ ...votes[0]!, retried: true, vote: { ...votes[0]!.vote, reasoning: clipped } }],
      filePath,
    });
    expect(written).toBeDefined();
    const entry = written!.voters[0]!;
    // Pin the two optional flags individually so a fixture that stops
    // exercising one is named, not just "key sets differ".
    expect(entry.retried).toBe(true);
    expect(entry.reasoningTruncated).toBe(true);
    expect(Object.keys(entry).sort()).toEqual(Object.keys(VoterSummarySchema.shape).sort());
  });

  it('the returned record and the line on disk serialize IDENTICALLY (#6054)', () => {
    // The guard's first version re-emitted Zod's rebuilt object, which reorders
    // keys to schema order; the builder emits `ratifies` BEFORE the option
    // fields while the schema declares it after `panelCoverage`, so a record
    // carrying both diverged on disk while the hash (a projection) stayed green.
    // Assert the bytes, not the hash — and with a fixture Zod would really
    // reorder: a minimal one matched schema order by accident and let the
    // mutation survive.
    const written = persistVoteRecord({
      declaredOptions: ['A', 'B'],
      resolvedDecision: 'approved',
      ratifies: 'loop-x',
      id: 'vote-bytes',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
      filePath,
    });
    expect(written).toBeDefined();
    expect(readFileSync(filePath, 'utf-8')).toBe(JSON.stringify(written) + '\n');
  });

  it('REFUSES to append a record the read schema would reject (#6054)', () => {
    // `id: ''` violates `VoteRecordSchema`'s `id: z.string().min(1)`. Before the
    // guard this was APPENDED, reported as written, and then invisible on read —
    // a line in `invalidLines` that no non-test consumer reads. The chain moved
    // past it, so it could never be repaired. The #6049 shape, structurally.
    const warn = vi.fn();
    const logger = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as ILogger;
    const written = persistVoteRecord({
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: '',
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
      filePath,
      logger,
    });

    expect(written).toBeUndefined();
    // Nothing durable: not even an unreadable line.
    expect(existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '').toBe('');
    // The caller's log names the field, not merely "write failed".
    const messages = warn.mock.calls.map((c) => JSON.stringify(c));
    expect(messages.some((m) => m.includes(UNREADABLE_RECORD_PREFIX) && m.includes('id'))).toBe(
      true
    );
  });

  it('persists a self-hashed record that round-trips through read', () => {
    const written = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-1',
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
      filePath,
    });
    expect(written).toBeDefined();

    const { records, invalidLines } = readVoteRecords(filePath);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(written);
  });

  it('assigns an incrementing sequence and an advisory previousHash on append', () => {
    const first = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-1',
      proposal: 'first',
      strategy: 'higher_order',
      result: consensusResult({ outcome: 'rejected', approvalPercentage: 20 }),
      votes,
      filePath,
    });
    const second = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-2',
      proposal: 'second',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
      filePath,
    });

    const { records } = readVoteRecords(filePath);
    expect(records).toHaveLength(2);
    expect(records[0]!.sequence).toBe(0);
    expect(records[1]!.sequence).toBe(1);
    expect(records[0]!.previousHash).toBeUndefined();
    // previousHash is advisory (set to the prior tip) but NOT verified.
    expect(records[1]!.previousHash).toBe(first!.hash);
    expect(second!.sequence).toBe(1);
    expect(verifyVoteRecordSet(records)).toEqual({ ok: true, recordCount: 2 });
  });

  it('detects tampering with a persisted line (decision flip) via set verification', () => {
    persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-1',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult({ outcome: 'rejected', approvalPercentage: 20 }),
      votes,
      filePath,
    });

    // Forge the committed artifact: flip rejected → approved on the raw line.
    const raw = readFileSync(filePath, 'utf-8');
    writeFileSync(filePath, raw.replace('"decision":"rejected"', '"decision":"approved"'), 'utf-8');

    const { records } = readVoteRecords(filePath);
    expect(records).toHaveLength(1);
    expect(records[0]!.decision).toBe('approved'); // the forged value is present...
    const result = verifyVoteRecordSet(records);
    expect(result.ok).toBe(false); // ...but verification rejects it
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('survives a simulated two-branch concurrent merge (merge=union) as a benign fork', () => {
    // Branch base: one record at sequence 0.
    persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-base',
      proposal: 'base proposal',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
      filePath,
    });
    const baseRaw = readFileSync(filePath, 'utf-8');

    // Two branches each fork from the same tip and append THEIR OWN sequence-1
    // record (each computed the same max sequence = 0 → next = 1).
    const branchA = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-A',
      proposal: 'branch A proposal',
      strategy: 'higher_order',
      result: consensusResult({ approvalPercentage: 71 }),
      votes,
      sequence: 1,
    });
    const branchB = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-B',
      proposal: 'branch B proposal',
      strategy: 'higher_order',
      result: consensusResult({ outcome: 'rejected', approvalPercentage: 33 }),
      votes,
      sequence: 1,
    });

    // Simulate what `merge=union` produces: base line + both branch lines.
    writeFileSync(filePath, baseRaw, 'utf-8');
    appendFileSync(filePath, JSON.stringify(branchA) + '\n', 'utf-8');
    appendFileSync(filePath, JSON.stringify(branchB) + '\n', 'utf-8');

    const { records, invalidLines } = readVoteRecords(filePath);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(3);

    const result = verifyVoteRecordSet(records);
    expect(result.ok).toBe(true); // a concurrent fork is NOT a failure
    if (result.ok) {
      expect(result.recordCount).toBe(3);
      expect(result.forks).toEqual([1]); // the duplicated sequence is surfaced
    }
  });

  it("skips persistence when every vote is simulated is the caller's job; store itself writes given real votes", () => {
    const written = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-1',
      proposal: 'p',
      strategy: 'simple_majority',
      result: consensusResult(),
      votes,
      filePath,
    });
    expect(written).toBeDefined();
  });
});

describe('vote-record path resolution via nexusDataPath (#3991, design vote 7-0)', () => {
  let dir: string;
  let dataRoot: string;
  let envFilePath: string;
  let optsFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vote-records-env-'));
    dataRoot = join(dir, 'data-root', '.nexus-agents');
    envFilePath = join(dir, 'env', 'vote-records.jsonl');
    optsFilePath = join(dir, 'opts', 'vote-records.jsonl');
    // Default mock: nexusDataPath roots under a real temp data dir so persists
    // actually write. getNexusDataDir returns the same root for the in-data-dir
    // traversal validation in resolveVoteRecordsPath().
    vi.mocked(getNexusDataDir).mockReturnValue(dataRoot);
    vi.mocked(nexusDataPath).mockImplementation((...segments: string[]) =>
      join(dataRoot, ...segments)
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs(); // restore any process.env mutations made via vi.stubEnv
    rmSync(dir, { recursive: true, force: true });
  });

  it('honors the env-var override path when no opts.filePath is given', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, envFilePath);
    expect(resolveVoteRecordsPath()).toBe(envFilePath);

    const written = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-env',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    expect(written).toBeDefined();

    const { records, invalidLines } = readVoteRecords(envFilePath);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(written);
    // The default nexusDataPath location was NOT used.
    expect(
      readVoteRecords(join(dataRoot, 'governance', 'vote-records.jsonl')).records
    ).toHaveLength(0);
  });

  it('returns an absolute override unchanged (#3963)', () => {
    // envFilePath is already absolute → returned verbatim (resolve is a no-op).
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, envFilePath);
    const resolved = resolveVoteRecordsPath();
    expect(resolved).toBe(envFilePath);
    expect(isAbsolute(resolved as string)).toBe(true);
  });

  it('resolves a RELATIVE override to an absolute path against cwd (#3963)', () => {
    // A relative override is resolved against cwd to an absolute path rather than
    // written verbatim. Use a value that stays under cwd so it is NOT rejected by
    // the path-traversal guard.
    const rel = 'governance/custom-vote-records.jsonl';
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, rel);
    const resolved = resolveVoteRecordsPath();
    expect(resolved).toBe(resolve(rel));
    expect(isAbsolute(resolved as string)).toBe(true);
    expect(resolved).not.toBe(rel);
  });

  it('rejects (fail-closed) a relative override that escapes cwd via `..` (security #3991)', () => {
    // A relative override resolving outside cwd is a path-traversal attempt → the
    // resolver returns undefined rather than writing astray.
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, '../../../../../../tmp/evil-vote-records.jsonl');
    expect(resolveVoteRecordsPath()).toBeUndefined();
  });

  it('treats an empty/whitespace env var as unset (falls through to nexusDataPath)', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, '   ');
    // Post-#3991 the fall-through is the canonical data-dir path, NOT undefined.
    expect(resolveVoteRecordsPath()).toBe(join(dataRoot, 'governance', 'vote-records.jsonl'));
  });

  it('falls through to nexusDataPath(governance, ...) when no override is set', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined);
    const resolved = resolveVoteRecordsPath();
    expect(resolved).toBe(join(dataRoot, 'governance', 'vote-records.jsonl'));
    expect(vi.mocked(nexusDataPath)).toHaveBeenCalledWith('governance', 'vote-records.jsonl');
  });

  it('lets opts.filePath take precedence over the env var', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, envFilePath);

    const written = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-opts',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
      filePath: optsFilePath,
    });
    expect(written).toBeDefined();

    // Written to opts path, not the env path.
    expect(readVoteRecords(optsFilePath).records).toHaveLength(1);
    expect(readVoteRecords(envFilePath).records).toHaveLength(0);
  });

  it('#3991 regression: global install (no override, cwd not a repo) resolves a valid .nexus-agents path and persists there', () => {
    // The pre-#3991 bug: resolveVoteRecordsPath() returned undefined when cwd was
    // not a repo and no override was set → the producer silently skipped. Now the
    // canonical resolver always yields a writable data-dir path, so a persist
    // writes a record there.
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined);
    const resolved = resolveVoteRecordsPath();
    expect(resolved).toBeDefined();
    expect(resolved).toBe(join(dataRoot, 'governance', 'vote-records.jsonl'));

    const written = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-global',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    expect(written).toBeDefined();
    const { records } = readVoteRecords(resolved as string);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(written);
  });

  it('routes under a per-repo .nexus-agents/governance/ location when nexusDataPath does (NEXUS_REPO_PREFERRED)', () => {
    // Simulate nexusDataPath choosing the per-repo tier: the resolved path sits
    // under <repo>/.nexus-agents/governance/, which differs from getNexusDataDir
    // (the homedir root). The store's defense-in-depth validation must still
    // accept it via the `.nexus-agents/governance/` segment check.
    const repoGovDir = join(dir, 'repo', '.nexus-agents', 'governance');
    vi.mocked(nexusDataPath).mockImplementation((...segments: string[]) =>
      join(dir, 'repo', '.nexus-agents', ...segments)
    );
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined);
    const resolved = resolveVoteRecordsPath();
    expect(resolved).toBe(join(repoGovDir, 'vote-records.jsonl'));

    const written = persistVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      declaredOptions: undefined,
      resolvedDecision: undefined,
      id: 'vote-repo',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    expect(written).toBeDefined();
    expect(readVoteRecords(resolved as string).records).toHaveLength(1);
  });

  it('does not throw on a fail-closed resolution; persist returns undefined', () => {
    // Force resolveVoteRecordsPath() to fail closed: nexusDataPath returns a path
    // that neither sits under getNexusDataDir nor contains the canonical
    // .nexus-agents/governance/ segment → defense-in-depth rejects it.
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined);
    vi.mocked(nexusDataPath).mockReturnValue('/somewhere/else/governance/vote-records.jsonl');
    vi.mocked(getNexusDataDir).mockReturnValue('/data-root/.nexus-agents');
    expect(resolveVoteRecordsPath()).toBeUndefined();

    let written: ReturnType<typeof persistVoteRecord>;
    expect(() => {
      written = persistVoteRecord({
        declaredOptions: undefined,
        resolvedDecision: undefined,
        id: 'vote-none',
        proposal: 'p',
        strategy: 'higher_order',
        result: consensusResult(),
        votes,
      });
    }).not.toThrow();
    expect(written!).toBeUndefined();
  });
});

describe('declared options survive into the record even when nothing was selected (#6049)', () => {
  // The record used to infer "were there options?" from "did anyone pick one?".
  // So a panel that unanimously APPROVED while every selection failed
  // matchDeclaredOption persisted as `decision: rejected, approvalPercentage:
  // 100` with NO option fields at all -- and an auditor filtering
  // `optionTally !== undefined` to find multi-option votes skipped the very case
  // most worth reviewing.
  const OPTIONS = ['A - do it', 'B - do not'];

  function approversWithNoSelection(): readonly AgentVoteResult[] {
    return [agentVote('architect', 'approve'), agentVote('security', 'approve')];
  }

  function withSelection(role: VoterRole, option: string): AgentVoteResult {
    return { ...agentVote(role, 'approve'), selectedOption: option };
  }

  it('records coverage when options were declared and NOTHING was selected', () => {
    const record = buildVoteRecord({
      id: 'v-1',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: approversWithNoSelection(),
      declaredOptions: OPTIONS,
      resolvedDecision: 'rejected',
      sequence: 1,
      previousHash: undefined,
    });

    expect(record.optionCoverage).toEqual({
      approverCount: 2,
      selectedCount: 0,
      unattributedApprovals: 2,
    });
    // An EMPTY tally, not an absent one: "declared, nothing attributable" is a
    // measurement. An absent field is what made the case invisible.
    expect(record.optionTally).toEqual([]);
  });

  it('an auditor filtering for multi-option votes now finds that case', () => {
    // The consequence that made this worth fixing, asserted directly.
    const record = buildVoteRecord({
      id: 'v-2',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: approversWithNoSelection(),
      declaredOptions: OPTIONS,
      resolvedDecision: 'rejected',
      sequence: 1,
      previousHash: undefined,
    });
    expect(record.optionTally).toBeDefined();
  });

  it('an ordinary yes/no vote still carries NEITHER field — the pair', () => {
    // Without this, emitting coverage unconditionally would pass the tests above
    // while pushing every plain vote off the pre-1.3 hash projection.
    const record = buildVoteRecord({
      id: 'v-3',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes,
      declaredOptions: undefined,
      resolvedDecision: 'approved',
      sequence: 1,
      previousHash: undefined,
    });
    expect(record.optionTally).toBeUndefined();
    expect(record.optionCoverage).toBeUndefined();
    // Not asserting version '1.2' here: this fixture's voters carry reasoning,
    // which is 1.6 by the ladder in `recordVersion` and has nothing to do with
    // options. The claim under test is that NEITHER option field appears.
  });

  it('a normal multi-option vote is unchanged', () => {
    const record = buildVoteRecord({
      id: 'v-4',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: [withSelection('architect', 'A - do it'), withSelection('security', 'A - do it')],
      declaredOptions: OPTIONS,
      resolvedDecision: 'approved',
      sequence: 1,
      previousHash: undefined,
    });
    expect(record.optionTally).toEqual([{ option: 'A - do it', count: 2 }]);
    expect(record.optionCoverage?.selectedCount).toBe(2);
    expect(record.optionCoverage?.unattributedApprovals).toBe(0);
  });

  it('an empty declared-options array is treated as no options', () => {
    // `options: []` cannot produce a selection, so it is not a multi-option vote.
    const record = buildVoteRecord({
      id: 'v-5',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes,
      declaredOptions: [],
      resolvedDecision: 'approved',
      sequence: 1,
      previousHash: undefined,
    });
    expect(record.optionCoverage).toBeUndefined();
  });
});

describe('every record the builder writes must read back and verify (#6049, the seam)', () => {
  // The seam that let #6049's first attempt ship a regression: the new tests
  // asserted on the IN-MEMORY return of buildVoteRecord, and none round-tripped
  // through the schema. `optionTally: []` appended to the ledger fine and then
  // failed `parseVoteRecordsText` with `too_small, minimum 1` -- so the case the
  // fix exists to preserve became the one no reader could see. Parsing alone is
  // not enough either: optionTally is appended to the CANONICAL HASH payload
  // when defined, so the hash path needs exercising too.
  function roundTrip(record: VoteRecord): {
    parsed: number;
    invalid: number;
    verified: boolean;
  } {
    const line = JSON.stringify(record);
    const { records, invalidLines } = parseVoteRecordsText(line + '\n');
    return {
      parsed: records.length,
      invalid: invalidLines.length,
      verified: verifyVoteRecordSet(records).ok,
    };
  }

  function build(
    declaredOptions: readonly string[] | undefined,
    v: readonly AgentVoteResult[]
  ): VoteRecord {
    return buildVoteRecord({
      id: 'rt-1',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: v,
      declaredOptions,
      resolvedDecision: 'rejected',
      // Sequence 0: verifyVoteRecordSet requires 0..maxSeq with no gap, so a
      // lone record at sequence 1 fails as a `sequence_gap` -- an omission
      // signal, not a hash one. The fixture must model a real ledger tip.
      sequence: 0,
      previousHash: undefined,
    });
  }

  it('declared options with NO parseable selection round-trips and verifies', () => {
    // The exact record the first attempt made unreadable.
    const record = build(
      ['A - do it', 'B - do not'],
      [agentVote('architect', 'approve'), agentVote('security', 'approve')]
    );
    expect(record.optionTally).toEqual([]);
    expect(roundTrip(record)).toEqual({ parsed: 1, invalid: 0, verified: true });
  });

  it('a normal multi-option vote round-trips and verifies', () => {
    const record = build(
      ['A', 'B'],
      [
        { ...agentVote('architect', 'approve'), selectedOption: 'A' },
        { ...agentVote('security', 'approve'), selectedOption: 'A' },
      ]
    );
    expect(roundTrip(record)).toEqual({ parsed: 1, invalid: 0, verified: true });
  });

  it('an ordinary yes/no vote round-trips and verifies', () => {
    const record = build(undefined, votes);
    expect(record.optionTally).toBeUndefined();
    expect(roundTrip(record)).toEqual({ parsed: 1, invalid: 0, verified: true });
  });
});

describe('a retried voter seat is visible in the record (#6050)', () => {
  // `voter-retry.ts:58` has set `retried: true` on every recovered seat since it
  // was written, and `vote-types.ts:126` states why: the flag is "what makes the
  // recovery visible instead of indistinguishable from a clean first attempt".
  // It had ONE producer and ZERO consumers -- both summarizers and the record
  // dropped it -- so the record said "answered cleanly" for a panel that needed
  // a retry to reach quorum.
  function retriedVote(role: VoterRole): AgentVoteResult {
    return { ...agentVote(role, 'approve'), retried: true };
  }

  function build(v: readonly AgentVoteResult[]): VoteRecord {
    return buildVoteRecord({
      id: 'rt-1',
      proposal: 'p',
      strategy: 'supermajority',
      result: consensusResult(),
      votes: v,
      declaredOptions: undefined,
      resolvedDecision: 'approved',
      sequence: 0,
      previousHash: undefined,
    });
  }

  it('carries retried on the recovered seat and NOT on the others', () => {
    const record = build([retriedVote('security'), agentVote('architect', 'approve')]);
    const security = record.voters.find((v) => v.role === 'security');
    const architect = record.voters.find((v) => v.role === 'architect');
    expect(security?.retried).toBe(true);
    expect(architect?.retried).toBeUndefined();
  });

  it('a clean panel carries no retried key anywhere — the pair', () => {
    // Without this, setting it unconditionally would pass the test above while
    // making every clean record claim a retry that never happened.
    const record = build([agentVote('architect', 'approve'), agentVote('security', 'approve')]);
    expect(record.voters.every((v) => v.retried === undefined)).toBe(true);
  });

  it('the record round-trips and VERIFIES with a retried seat', () => {
    // #6049's lesson: parsing is not enough. VoterSummarySchema is .strict(),
    // so an unknown key makes the line unreadable; and the voter entries are
    // rebuilt field-by-field for the canonical hash, so a field the hash does
    // not carry is attested-but-unstored.
    const record = build([retriedVote('security'), agentVote('architect', 'approve')]);
    const { records, invalidLines } = parseVoteRecordsText(JSON.stringify(record) + '\n');
    expect(invalidLines).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(verifyVoteRecordSet(records).ok).toBe(true);
    expect(records[0]?.voters.find((v) => v.role === 'security')?.retried).toBe(true);
  });

  it('editing a retried seat to a clean one MOVES the hash', () => {
    // The property that makes the flag evidence rather than decoration: without
    // it, a retried seat could be edited to a clean one and the chain would
    // still verify.
    //
    // Hashed DIRECTLY, holding everything else constant. Comparing two records
    // built by `build()` passed even with the hash coverage removed, because
    // those records also differ in `version` (1.7 vs 1.2) and version is itself
    // hashed -- the assertion was satisfied by the wrong field.
    const withRetry = build([retriedVote('security')]);
    const { hash: _ignored, ...payload } = withRetry;
    const cleaned = {
      ...payload,
      voters: payload.voters.map(({ retried: _dropped, ...rest }) => rest),
    };
    expect(computeVoteRecordHash(payload)).not.toBe(computeVoteRecordHash(cleaned));
  });

  it('reports schema 1.7 when a seat was retried', () => {
    expect(build([retriedVote('security')]).version).toBe('1.7');
  });
});
