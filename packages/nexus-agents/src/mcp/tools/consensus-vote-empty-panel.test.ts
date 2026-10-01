/** Real recorder/store seam for empty and errored panels (#5120). */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import type { ConsensusResult } from '../../consensus/types.js';
import { createLogger } from '../../core/index.js';
import { VOTE_RECORDS_PATH_ENV, readVoteRecords } from '../../audit/vote-record-store.js';
import { verifyVoteRecordSet } from '../../audit/vote-record.js';
import { getVoterRoles } from '../../cli/voter-roles.js';

// Only the network/process boundary is canned; voting, recording and parsing
// run for real, including the CLI producer's narrowing of the voting result.
vi.mock('../../cli/voter-agents.js', () => ({
  DEFAULT_VOTE_TIMEOUT_MS: 90_000,
  collectRealVotes: ({ roles }: { roles: readonly VoterRole[] }) =>
    Promise.resolve(erroredPanel(roles)),
}));

import { voteCommand } from '../../cli/vote-command.js';
import { executeVoting } from './consensus-vote.js';
import { recordAuthenticVote } from './consensus-vote-recording.js';
import { AllVotersFailedError, recordCompletedVote } from './consensus-vote-completed-recording.js';
import { toRecordDecision } from './consensus-vote-types.js';

function erroredPanel(roles: readonly VoterRole[]): AgentVoteResult[] {
  return roles.map((role) => ({
    role,
    source: 'error',
    error: 'TEST voter unavailable',
    vote: { decision: 'abstain', confidence: 0, reasoning: '' },
    processingTimeMs: 1,
  }));
}

function approvingResult(): ConsensusResult {
  const now = '2026-10-01T00:00:00.000Z';
  return {
    proposalId: 'test-empty-panel',
    proposal: { title: 'T', description: 'D', algorithm: 'supermajority' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve: 3, reject: 0, abstain: 0, total: 3 },
    approvalPercentage: 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 1,
  };
}

function record(votes: readonly AgentVoteResult[]): ReturnType<typeof recordAuthenticVote> {
  return recordAuthenticVote({
    proposal: 'Record only attributed panels',
    strategy: 'supermajority',
    result: approvingResult(),
    votes,
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    errorPolicy: 'absolute_quorum',
  });
}

describe('empty attribution is distinct from an all-errored panel (#5120)', () => {
  let dir: string;
  let ledger: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-empty-panel-'));
    ledger = join(dir, 'vote-records.jsonl');
    writeFileSync(ledger, '');
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, ledger);
    vi.stubEnv('NEXUS_DATA_DIR', dir);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses zero seat attribution, returns its reason and leaves the real ledger empty', async () => {
    const outcome = await record([]);
    expect(readFileSync(ledger, 'utf8')).toBe('');
    expect(outcome).toMatchObject({ persisted: false, reason: 'empty-panel' });
    expect(!outcome.persisted && outcome.detail).toMatch(/no voter attribution/i);
  });

  it('retains errored seats in votes and persists their real no-quorum record', async () => {
    const result = await executeVoting(
      { proposal: 'All seats fail', quickMode: true, simulateVotes: false },
      createLogger({ test: 'empty-panel' })
    );
    const roles = getVoterRoles(true);
    expect(result.votes.map(({ role, source }) => ({ role, source }))).toEqual(
      roles.map((role) => ({ role, source: 'error' }))
    );
    expect(result.decision).toBe('no_quorum');
    const outcome = await recordAuthenticVote({
      proposal: result.proposal,
      strategy: result.strategy,
      result: result.result,
      votes: result.votes,
      declaredOptions: undefined,
      resolvedDecision: toRecordDecision(result.decision),
      errorPolicy: result.errorPolicy,
      errorVoided: result.policyReason !== undefined,
    });
    expect(outcome.persisted).toBe(true);
    const { records, invalidLines } = readVoteRecords(ledger);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(verifyVoteRecordSet(records).ok).toBe(true);
    expect(records[0]).toMatchObject({
      decision: 'no_quorum',
      voters: [],
      panelCoverage: {
        requested: roles.length,
        responded: 0,
        errored: roles.length,
        erroredRoles: roles,
      },
    });
  });

  it.each([true, false])(
    'CLI preserves all-errored no-quorum persistence (quick=%s)',
    async (quick) => {
      expect(await voteCommand({ proposal: 'All seats fail', quick, onNoQuorum: 'exit2' })).toBe(2);
      const { records, invalidLines } = readVoteRecords(ledger);
      expect(invalidLines).toEqual([]);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        decision: 'no_quorum',
        voters: [],
        panelCoverage: {
          requested: getVoterRoles(quick).length,
          responded: 0,
          erroredRoles: getVoterRoles(quick),
        },
      });
    }
  );

  it('preserves MCP rejection of all-errored panels before recording', async () => {
    const logger = createLogger({ test: 'empty-panel' });
    const result = await executeVoting(
      { proposal: 'All seats fail', quickMode: true, simulateVotes: false },
      logger
    );
    await expect(recordCompletedVote(result.proposal, result, logger)).rejects.toBeInstanceOf(
      AllVotersFailedError
    );
    expect(readFileSync(ledger, 'utf8')).toBe('');
  });

  it('continues to persist a real attributed vote', async () => {
    expect(
      (
        await record([
          {
            role: 'architect',
            source: 'llm',
            processingTimeMs: 1,
            vote: { decision: 'approve', confidence: 0.9, reasoning: 'Reviewed' },
          },
        ])
      ).persisted
    ).toBe(true);
    expect(readVoteRecords(ledger).records).toHaveLength(1);
  });
});
