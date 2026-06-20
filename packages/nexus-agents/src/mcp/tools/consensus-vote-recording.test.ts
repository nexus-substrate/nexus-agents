/**
 * Tests for the authentic-vote-record persistence OUTCOME (#3991).
 *
 * `recordAuthenticVote` returns a structured {@link VoteRecordPersistOutcome} so
 * a skipped/failed persist is observable to the MCP caller instead of being a
 * server-only WARN. Covered: all-simulated skip, no-committable-root skip (with
 * an actionable `NEXUS_VOTE_RECORDS_PATH` detail), env-override write, and
 * repo-root write. The persistence/cwd-resolution logic itself is unchanged —
 * these assert only the classification of the outcome.
 *
 * @module mcp/tools/consensus-vote-recording.test
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findRepoRoot } from '../../config/repo-root-detection.js';
import { VOTE_RECORDS_PATH_ENV, VOTE_RECORDS_REL_PATH } from '../../audit/vote-record-store.js';
import type { ConsensusResult, Vote } from '../../consensus/types.js';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';

import { recordAuthenticVote } from './consensus-vote-recording.js';

vi.mock('../../config/repo-root-detection.js', () => ({
  findRepoRoot: vi.fn(() => null),
}));

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

const realVotes: readonly AgentVoteResult[] = [
  agentVote('architect', 'approve'),
  agentVote('security', 'approve'),
  agentVote('catfish', 'reject'),
];

describe('recordAuthenticVote persistence outcome (#3991)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vote-outcome-'));
    vi.mocked(findRepoRoot).mockReturnValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports all-simulated when every vote is simulated', () => {
    const outcome = recordAuthenticVote({
      proposal: 'p',
      strategy: 'simple_majority',
      result: consensusResult(),
      votes: [
        agentVote('architect', 'approve', 'simulation'),
        agentVote('security', 'reject', 'simulation'),
      ],
    });
    expect(outcome.persisted).toBe(false);
    if (!outcome.persisted) {
      expect(outcome.reason).toBe('all-simulated');
      expect(outcome.detail).toContain('simulated');
    }
  });

  it('reports no-repo-root with an actionable NEXUS_VOTE_RECORDS_PATH detail when no location resolves', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined); // no override
    // findRepoRoot mocked to null → no committable location.
    const outcome = recordAuthenticVote({
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: realVotes,
    });
    expect(outcome.persisted).toBe(false);
    if (!outcome.persisted) {
      expect(outcome.reason).toBe('no-repo-root');
      expect(outcome.detail).toContain(VOTE_RECORDS_PATH_ENV);
      expect(outcome.detail).toContain(VOTE_RECORDS_REL_PATH);
    }
  });

  it('persists and returns the record when the env override path is set', () => {
    const filePath = join(dir, 'env', 'vote-records.jsonl');
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, filePath);

    const outcome = recordAuthenticVote({
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: realVotes,
      correlationId: 'corr-1',
    });
    expect(outcome.persisted).toBe(true);
    if (outcome.persisted) {
      expect(outcome.record.decision).toBe('approved');
      expect(outcome.record.correlationId).toBe('corr-1');
    }
    // The record actually landed on disk at the override path.
    const written = readFileSync(filePath, 'utf-8').trim();
    expect(written.length).toBeGreaterThan(0);
  });

  it('persists to <repo-root>/governance/... when a repo root resolves (no override)', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined);
    vi.mocked(findRepoRoot).mockReturnValue(dir); // simulate a committable repo root

    const outcome = recordAuthenticVote({
      proposal: 'p',
      strategy: 'simple_majority',
      result: consensusResult(),
      votes: realVotes,
    });
    expect(outcome.persisted).toBe(true);
    const written = readFileSync(join(dir, VOTE_RECORDS_REL_PATH), 'utf-8').trim();
    expect(written.length).toBeGreaterThan(0);
  });
});
