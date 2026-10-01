/** Real plan-vote recording seam, with only voters and experts mocked (#6872). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../cli/vote-types.js';

const voters = vi.hoisted<{
  decision: 'approve' | 'reject';
  failed: boolean;
  allFailed: boolean;
  empty: boolean;
}>(() => ({
  decision: 'approve',
  failed: false,
  allFailed: false,
  empty: false,
}));
vi.mock('../cli/voter-agents.js', () => ({
  collectRealVotes: ({ roles, simulate }: { roles: VoterRole[]; simulate: boolean }) =>
    Promise.resolve(
      (voters.empty ? [] : roles).map((role, index): AgentVoteResult => ({
        role,
        vote: { decision: voters.decision, confidence: 0.9, reasoning: 'Measured plan' },
        source: simulate
          ? 'simulation'
          : voters.allFailed || (voters.failed && index === 0)
            ? 'error'
            : 'llm',
        cli: 'codex',
        model: 'requested-alias',
        servedModel: 'claude-sonnet',
        processingTimeMs: 17,
        inputTokens: 100,
        outputTokens: 20,
        attemptUsage: {
          completions: 2,
          reportedCompletions: 2,
          inputTokens: 300,
          outputTokens: 60,
        },
      }))
    ),
}));
vi.mock('./expert-bridge.js', () => ({
  executeExpert: () =>
    Promise.resolve({
      success: true,
      text: 'Measured plan',
      expertType: 'architecture',
      cli: 'codex',
      durationMs: 17,
    }),
}));
vi.mock('./agent-executor-context.js', () => ({
  getOutcomeContext: () => '',
  getTrendContext: () => '',
  getWeatherContext: () => Promise.resolve(''),
  getMemoryContext: () => Promise.resolve(''),
}));
vi.mock('./agent-executor-memory.js', () => ({
  recordLearning: vi.fn(),
  recordMemoryError: vi.fn(),
  recordRoutingExperience: vi.fn(),
  flushPipelineMemory: vi.fn(),
}));
vi.mock('../mcp/tools/tool-memory.js', () => ({
  getToolMemory: () => ({
    recordTask: vi.fn(),
    recordLearning: vi.fn(),
    runPromotionPipeline: () => Promise.resolve(),
  }),
}));

import { createAgentStages } from './agent-executor.js';
import { runDevPipeline } from './dev-pipeline.js';
import { resetCorrelationTracker } from '../mcp/tools/consensus-vote.js';
import {
  getOutcomeStore,
  resetOutcomeStore,
  setOutcomeStore,
} from '../orchestration/outcomes/outcome-store.js';
import { PersistentOutcomeStore } from '../orchestration/outcomes/outcome-store-persistence.js';
import { DecisionCostStore } from '../observability/decision-cost-store.js';
import { readVoteRecords, VOTE_RECORDS_PATH_ENV } from '../audit/vote-record-store.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';

describe('pipeline plan votes share durable consensus records (#6872)', () => {
  let directory: string;
  let ledger: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'pipeline-vote-recording-'));
    ledger = join(directory, 'vote-records.jsonl');
    vi.stubEnv('NEXUS_DATA_DIR', directory);
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, ledger);
    resetNexusDataDirCache();
    resetOutcomeStore();
    setOutcomeStore(new PersistentOutcomeStore());
    resetCorrelationTracker();
    voters.decision = 'approve';
    voters.failed = false;
    voters.allFailed = false;
    voters.empty = false;
  });

  afterEach(() => {
    resetOutcomeStore();
    resetCorrelationTracker();
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    rmSync(directory, { recursive: true, force: true });
  });

  it('records a live vote in a dryRun, joining seats, attempt cost and ledger by one decision ID', async () => {
    const sessionId = '6872-live-dry-run';
    const stages = createAgentStages({
      sessionId,
      votingStrategy: 'simple_majority',
      quickMode: true,
    });
    const result = await runDevPipeline('Exercise live plan vote recording', stages, {
      sessionId,
      dryRun: true,
      researchOverride: 'Research',
    });
    expect(result.dryRun).toBe(true);

    const costs = new DecisionCostStore().all();
    expect(costs).toHaveLength(1);
    const decisionId = costs[0]?.decisionId;
    expect(decisionId).toMatch(/^consensus-/);
    // Kept apart from MCP consensus_vote calls in every cost report (#6872).
    expect(costs[0]?.gate).toBe('dev_pipeline_vote');
    const records = readVoteRecords(ledger).records;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ correlationId: decisionId, decision: 'approved' });
    const rows = new PersistentOutcomeStore().query({ source: 'consensus' });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.traceId)).toEqual([decisionId, decisionId, decisionId]);
    expect(costs[0]?.summary.observedAttemptUsage).toMatchObject({
      seats: 3,
      completions: 6,
      reportedCompletions: 6,
      inputTokens: 900,
      outputTokens: 180,
      totalTokens: 1080,
    });
    expect(costs[0]?.summary.perVoter[0]?.attemptUsage?.completions).toBe(2);
    // #6858: stage rows still join the pipeline session, not the vote decision.
    const stageRows = getOutcomeStore().query({ source: 'delegate' });
    expect(stageRows).toHaveLength(1);
    expect(stageRows[0]).toMatchObject({ traceId: `pipeline-${sessionId}` });
    expect(stageRows[0]?.id).toMatch(/^pipeline-plan-/);
  });

  it('records a rejected panel as a rejection while seats still count as answered', async () => {
    voters.decision = 'reject';
    const vote = await createAgentStages({
      votingStrategy: 'simple_majority',
      quickMode: true,
    }).vote('Measured plan', '');
    expect(vote.kind).toBe('rejected');
    const costs = new DecisionCostStore().all();
    expect(costs).toHaveLength(1);
    expect(readVoteRecords(ledger).records[0]).toMatchObject({
      correlationId: costs[0]?.decisionId,
      decision: 'rejected',
    });
    const rows = getOutcomeStore().query({ source: 'consensus' });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.success)).toEqual([true, true, true]);
  });

  it('records a no-quorum decision and its cost without measured consensus outcomes', async () => {
    voters.failed = true;
    const vote = await createAgentStages({
      votingStrategy: 'simple_majority',
      quickMode: true,
    }).vote('Measured plan', '');
    expect(vote.kind).toBe('no_quorum');
    const costs = new DecisionCostStore().all();
    expect(costs).toHaveLength(1);
    expect(readVoteRecords(ledger).records[0]).toMatchObject({
      correlationId: costs[0]?.decisionId,
      decision: 'no_quorum',
      errorPolicy: 'absolute_quorum',
    });
    expect(getOutcomeStore().query({ source: 'consensus' })).toHaveLength(0);
  });

  it('writes no real records for an all-simulated panel', async () => {
    await createAgentStages({
      votingStrategy: 'simple_majority',
      quickMode: true,
      simulateVotes: true,
    }).vote('Measured plan', '');
    expect(getOutcomeStore().query({ source: 'consensus' })).toHaveLength(0);
    expect(new DecisionCostStore().all()).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it('matches MCP by writing no decision records when every voter failed', async () => {
    voters.allFailed = true;
    const vote = await createAgentStages({
      votingStrategy: 'simple_majority',
      quickMode: true,
    }).vote('Measured plan', '');
    expect(vote.kind).toBe('no_quorum');
    expect(getOutcomeStore().query({ source: 'consensus' })).toHaveLength(0);
    expect(new DecisionCostStore().all()).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it('fails closed for an empty panel with a stage outcome and no decision records (#6885)', async () => {
    voters.empty = true;
    const sessionId = '6885-empty-panel';
    const vote = await createAgentStages({
      sessionId,
      votingStrategy: 'simple_majority',
      quickMode: true,
    }).vote('Measured plan', '');
    // Previously this pinned the engine's default rejection and a zero-seat
    // cost row. No votes means no measured decision, regardless of that default.
    expect(vote).toMatchObject({ kind: 'no_quorum', approvalPercentage: 0 });
    expect(vote.kind === 'no_quorum' && vote.reason).toMatch(/empty panel/i);
    expect(new DecisionCostStore().all()).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
    expect(getOutcomeStore().query({ source: 'consensus' })).toHaveLength(0);
    const stageRows = getOutcomeStore().query({ source: 'delegate' });
    expect(stageRows).toHaveLength(1);
    expect(stageRows[0]).toMatchObject({
      traceId: `pipeline-${sessionId}`,
      cli: 'unknown',
      category: 'planning',
      model: 'pipeline',
      success: false,
    });
    expect(stageRows[0]?.id).toMatch(/^pipeline-vote-/);
  });
});
