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

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getNexusDataDir, nexusDataPath } from '../../config/nexus-data-dir.js';
import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import type { ConsensusResult, Vote } from '../../consensus/types.js';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import {
  getOutcomeStore,
  OutcomeStore,
  setOutcomeStore,
} from '../../orchestration/outcomes/index.js';

const memoryMocks = vi.hoisted(() => ({
  recordTask: vi.fn(),
  recordLearning: vi.fn(),
  runPromotionPipeline: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => memoryMocks,
}));

import {
  recordAuthenticVote,
  recordVoteOutcomes,
  recordVoteSuccess,
} from './consensus-vote-recording.js';

// #3991: the runtime ledger resolves via nexusDataPath (governance category)
// instead of findRepoRoot. Mock the resolver so each test pins the data root.
vi.mock('../../config/nexus-data-dir.js', () => ({
  getNexusDataDir: vi.fn(() => '/data-root/.nexus-agents'),
  nexusDataPath: vi.fn((...segments: string[]) =>
    ['/data-root/.nexus-agents', ...segments].join('/')
  ),
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

describe('recordVoteSuccess decision fidelity (#5544)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOutcomeStore(new OutcomeStore());
  });

  it('records the task but no learning or outcome sample for no_quorum', () => {
    const votes = [
      agentVote('architect', 'approve'),
      { ...agentVote('security', 'abstain', 'error'), error: 'timeout' },
    ];

    recordVoteSuccess({
      proposal: 'Require every voter',
      strategy: 'unanimous',
      decision: 'no_quorum',
      durationMs: 10,
      approvalPercentage: 50,
      votes,
    });

    expect(memoryMocks.recordTask).toHaveBeenCalledOnce();
    expect(memoryMocks.recordLearning).not.toHaveBeenCalled();
    expect(memoryMocks.runPromotionPipeline).not.toHaveBeenCalled();
    expect(getOutcomeStore().size).toBe(0);
  });

  it('continues recording learning and outcomes for an approved decision', () => {
    const votes = [agentVote('architect', 'approve')];

    recordVoteSuccess({
      proposal: 'Ship it',
      strategy: 'simple_majority',
      decision: 'approved',
      durationMs: 10,
      approvalPercentage: 90,
      votes,
    });

    expect(memoryMocks.recordTask).toHaveBeenCalledOnce();
    expect(memoryMocks.recordLearning).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: 'simple_majority vote → approved', confidence: 0.9 })
    );
    expect(memoryMocks.runPromotionPipeline).toHaveBeenCalledOnce();
    expect(getOutcomeStore().size).toBe(1);
  });
});

describe('recordVoteOutcomes CLI attribution (#5529)', () => {
  beforeEach(() => {
    setOutcomeStore(new OutcomeStore());
  });

  it('attributes a failed codex voter without changing a successful LLM voter', () => {
    recordVoteOutcomes([
      { ...agentVote('architect', 'approve'), cli: 'gemini' },
      {
        ...agentVote('security', 'abstain', 'error'),
        cli: 'codex',
        error: 'Codex failed',
      },
    ]);

    const outcomes = getOutcomeStore().query();
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ cli: 'gemini', success: true });
    expect(outcomes[1]).toMatchObject({ cli: 'codex', success: false });
  });

  it('attributes an error vote with no CLI to unknown, never claude', () => {
    recordVoteOutcomes([
      {
        ...agentVote('security', 'abstain', 'error'),
        error: 'Unattributed failure',
      },
    ]);

    const outcome = getOutcomeStore().query()[0];
    expect(outcome?.cli).toBe('unknown');
    expect(outcome?.cli).not.toBe('claude');
  });
});

describe('recordAuthenticVote persistence outcome (#3991)', () => {
  let dir: string;
  let dataRoot: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vote-outcome-'));
    dataRoot = join(dir, 'data-root', '.nexus-agents');
    // Default: nexusDataPath roots under a real temp data dir so persists write.
    vi.mocked(getNexusDataDir).mockReturnValue(dataRoot);
    vi.mocked(nexusDataPath).mockImplementation((...segments: string[]) =>
      join(dataRoot, ...segments)
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports all-simulated when every vote is simulated', () => {
    const outcome = recordAuthenticVote({
      resolvedDecision: undefined,
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

  it('reports write-failed with an actionable note when the data dir is unwritable', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined); // no override → nexusDataPath
    // Make the resolved path unwritable: put a regular FILE where a directory
    // component must be, so persistVoteRecord's mkdirSync throws ENOTDIR and the
    // outcome is classified write-failed. The path still passes the resolver's
    // defense-in-depth check because it sits under getNexusDataDir.
    const fileAsDir = join(dir, 'not-a-dir');
    writeFileSync(fileAsDir, 'x', 'utf-8');
    const unwritable = join(fileAsDir, 'governance', 'vote-records.jsonl');
    vi.mocked(getNexusDataDir).mockReturnValue(fileAsDir);
    vi.mocked(nexusDataPath).mockReturnValue(unwritable);

    const outcome = recordAuthenticVote({
      resolvedDecision: undefined,
      proposal: 'Promote loop X to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: realVotes,
    });
    expect(outcome.persisted).toBe(false);
    if (!outcome.persisted) {
      expect(outcome.reason).toBe('write-failed');
      expect(outcome.detail).toContain(VOTE_RECORDS_PATH_ENV);
    }
  });

  it('persists and returns the record when the env override path is set', () => {
    const filePath = join(dir, 'env', 'vote-records.jsonl');
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, filePath);

    const outcome = recordAuthenticVote({
      resolvedDecision: undefined,
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

  it('#4004: binds the ratifies subject into the persisted record', () => {
    const filePath = join(dir, 'ratify', 'vote-records.jsonl');
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, filePath);

    const outcome = recordAuthenticVote({
      resolvedDecision: undefined,
      proposal: 'Promote auto-remediation to enforce',
      strategy: 'higher_order',
      result: consensusResult(),
      votes: realVotes,
      correlationId: 'corr-ratify',
      ratifies: 'auto-remediation',
    });
    expect(outcome.persisted).toBe(true);
    if (outcome.persisted) {
      expect(outcome.record.ratifies).toBe('auto-remediation');
      // ratifies is covered by the self-hash, so the on-disk line carries it.
      const written = readFileSync(filePath, 'utf-8').trim();
      expect(JSON.parse(written).ratifies).toBe('auto-remediation');
    }
  });

  it('#3991: persists to the .nexus-agents/governance/ data-dir path when no override is set', () => {
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, undefined);

    const outcome = recordAuthenticVote({
      resolvedDecision: undefined,
      proposal: 'p',
      strategy: 'simple_majority',
      result: consensusResult(),
      votes: realVotes,
    });
    expect(outcome.persisted).toBe(true);
    // Landed under the canonical nexusDataPath governance location — the global-
    // install / sandbox-robust path, NOT a repo-root committed ledger.
    const written = readFileSync(
      join(dataRoot, 'governance', 'vote-records.jsonl'),
      'utf-8'
    ).trim();
    expect(written.length).toBeGreaterThan(0);
  });
});
