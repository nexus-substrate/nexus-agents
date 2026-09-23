/**
 * `recordAuthenticVote` reads the record back before reporting it persisted
 * (#6531). The store's writer is replaced here so a write can "succeed"
 * without reaching disk — the only way to reach the read-back miss without
 * racing the filesystem.
 *
 * @module mcp/tools/consensus-vote-recording-readback.test
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsensusResult } from '../../consensus/types.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';

const storeMocks = vi.hoisted(() => ({ writesToDisk: true }));

vi.mock('../../audit/vote-record-store.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../audit/vote-record-store.js')>();
  return {
    ...real,
    // A store that reports success; `writesToDisk: false` models a write that
    // returned a record but left nothing on the ledger.
    persistVoteRecord: (
      opts: Parameters<typeof real.persistVoteRecord>[0]
    ): ReturnType<typeof real.persistVoteRecord> =>
      storeMocks.writesToDisk
        ? real.persistVoteRecord(opts)
        : real.buildVoteRecord({ ...opts, sequence: 0 }),
  };
});

import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import { recordAuthenticVote } from './consensus-vote-recording.js';

function consensusResult(): ConsensusResult {
  const now = '2026-09-23T00:00:00.000Z';
  return {
    proposalId: 'p-1',
    proposal: { title: 'T', description: 'D', algorithm: 'higher_order' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 1,
  };
}

const votes: readonly AgentVoteResult[] = [
  {
    role: 'architect',
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
    processingTimeMs: 1,
    source: 'llm',
  },
];

function record(): ReturnType<typeof recordAuthenticVote> {
  return recordAuthenticVote({
    declaredOptions: undefined,
    resolvedDecision: undefined,
    errorPolicy: undefined,
    proposal: 'p',
    strategy: 'simple_majority',
    result: consensusResult(),
    votes,
  });
}

describe('recordAuthenticVote read-back (#6531)', () => {
  let dir: string;
  let ledger: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vote-readback-'));
    ledger = join(dir, 'vote-records.jsonl');
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, ledger);
    storeMocks.writesToDisk = true;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports persisted, with the ledger path, when the record reads back', () => {
    const outcome = record();

    expect(outcome.persisted).toBe(true);
    expect(outcome.persisted && outcome.path).toBe(ledger);
  });

  it('reports read-back-missed when the store returned a record the ledger does not hold', () => {
    storeMocks.writesToDisk = false;

    const outcome = record();

    expect(outcome.persisted).toBe(false);
    expect(!outcome.persisted && outcome.reason).toBe('read-back-missed');
    expect(!outcome.persisted && outcome.detail).toContain(ledger);
  });
});
