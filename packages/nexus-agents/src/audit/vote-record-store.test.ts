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

import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { verifyVoteRecordSet } from './vote-record.js';
import {
  VOTE_RECORDS_PATH_ENV,
  buildVoteRecord,
  persistVoteRecord,
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
      id: 'vote-1',
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    expect(record.version).toBe('1.2');
    expect(record.sequence).toBe(0); // default first sequence
    expect(record.decision).toBe('approved');
    expect(record.proposalHash).toHaveLength(64);
    expect(record.approvalPercentage).toBeCloseTo(66.7);
    expect(record.voteCounts).toEqual({ approve: 2, reject: 1, abstain: 0, total: 3 });
    expect(record.voters).toEqual([
      { role: 'architect', decision: 'approve', confidence: 0.8 },
      { role: 'security', decision: 'approve', confidence: 0.8 },
      { role: 'catfish', decision: 'reject', confidence: 0.8 },
    ]);
    expect(verifyVoteRecordSet([record])).toEqual({ ok: true, recordCount: 1 });
  });

  it('omits optionTally and stays on 1.2 when no voter declared an option (#4452)', () => {
    const record = buildVoteRecord({
      id: 'vote-noopt',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes,
    });
    expect(record.optionTally).toBeUndefined();
    expect(record.version).toBe('1.2');
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
      id: 'vote-opt',
      proposal: 'p',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: withOptions,
    });
    // #4472: a tally now always travels with its coverage, so a record
    // carrying one is 1.4. Historical 1.3 records still verify.
    expect(record.version).toBe('1.4');
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

  it('persists a self-hashed record that round-trips through read', () => {
    const written = persistVoteRecord({
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
      id: 'vote-1',
      proposal: 'first',
      strategy: 'higher_order',
      result: consensusResult({ outcome: 'rejected', approvalPercentage: 20 }),
      votes,
      filePath,
    });
    const second = persistVoteRecord({
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
      id: 'vote-A',
      proposal: 'branch A proposal',
      strategy: 'higher_order',
      result: consensusResult({ approvalPercentage: 71 }),
      votes,
      sequence: 1,
    });
    const branchB = buildVoteRecord({
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
