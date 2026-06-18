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
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConsensusResult, Vote } from '../consensus/types.js';
import type { AgentVoteResult, VoterRole } from '../cli/vote-types.js';

import { verifyVoteRecordSet } from './vote-record.js';
import { buildVoteRecord, persistVoteRecord, readVoteRecords } from './vote-record-store.js';

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
    expect(record.version).toBe('1.1');
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
