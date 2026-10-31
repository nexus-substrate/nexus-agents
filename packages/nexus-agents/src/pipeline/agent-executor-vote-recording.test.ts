import * as workspace from './dev-pipeline-workspace.js';
import * as securityGate from './security-gate.js';
import { DevPipelineCheckpoint, CheckpointStopError } from './dev-pipeline-checkpoint.js';
import { readFileSync, writeFileSync } from 'node:fs';
import * as checkpointStore from './pipeline-checkpoint.js';
import * as expertBridge from './expert-bridge.js';
import { buildStructuredOutput } from '../mcp/tools/dev-pipeline-output.js';
import { captureAcceptanceContext } from './acceptance-context.js';
import { getBuiltinVoteEvidence, getAcceptanceSummary } from './acceptance-binding.js';
import { reconstructPlanVoteProposal } from './plan-vote-proposal.js';
import { hashProposal } from '../audit/vote-record.js';
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
  decisions: AgentVoteResult['vote']['decision'][] | undefined;
  respondents: number | undefined;
  unverifiable: boolean;
}>(() => ({
  decision: 'approve',
  failed: false,
  allFailed: false,
  empty: false,
  decisions: undefined,
  respondents: undefined,
  unverifiable: false,
}));
// These tests mock voters; supply explicit known seat metadata for bound preflight.
// Real adapter dispatch and missing-capacity refusal are tested in complete-plan.test.ts.
vi.mock('../mcp/tools/pr-review-panel-budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcp/tools/pr-review-panel-budget.js')>();
  return {
    ...actual,
    resolvePanelSeats: (roles: readonly VoterRole[]) =>
      Promise.resolve({
        ok: true,
        seats: new Map(
          roles.map((role) => [
            role,
            { modelId: 'claude-sonnet' } as unknown as import('../core/index.js').IModelAdapter,
          ])
        ),
      }),
  };
});
vi.mock('../cli/voter-agents.js', async () => {
  const { extractBoundArtifact } = await import('../cli/vote-artifact.js');
  return {
    collectRealVotes: ({
      roles,
      simulate,
      proposal,
    }: {
      roles: VoterRole[];
      simulate: boolean;
      proposal?: string;
    }) => {
      const bound = proposal !== undefined ? extractBoundArtifact(proposal) : undefined;
      return Promise.resolve(
        (voters.empty ? [] : roles.slice(0, voters.respondents)).map(
          (role, index): AgentVoteResult => ({
            role,
            vote: {
              decision: voters.decisions?.[index] ?? voters.decision,
              confidence: 0.9,
              reasoning: 'Measured plan',
              ...(bound !== undefined
                ? { artifactReadiness: 'ready', boundArtifactDigest: bound.digest }
                : {}),
            },
            source: simulate
              ? 'simulation'
              : voters.allFailed || (voters.failed && index === 0)
                ? 'error'
                : voters.unverifiable && index === 0
                  ? 'unverifiable'
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
          })
        )
      );
    },
  };
});
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

import { getVoterRoles } from '../cli/voter-roles.js';
import { createAgentStages } from './agent-executor.js';
import { buildVoteProposal } from './agent-executor-vote.js';
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
import * as voteRecording from '../mcp/tools/consensus-vote-recording.js';

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
    voters.decisions = undefined;
    voters.respondents = undefined;
    voters.unverifiable = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetOutcomeStore();
    resetCorrelationTracker();
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    rmSync(directory, { recursive: true, force: true });
  });

  it('privately captures the exact final suffix only for the actual bound approved vote', async () => {
    const snapshot = captureAcceptanceContext({ kind: 'goal', source: 'ACCEPTANCE_SENTINEL' });
    if (!snapshot.ok) throw snapshot.error;
    const stages = createAgentStages({ acceptance: snapshot.value });
    const vote = await stages.vote('Measured plan', 'x'.repeat(999) + ' private tail');
    const evidence = getBuiltinVoteEvidence(stages, vote);
    expect(evidence).toBeDefined();
    if (evidence === undefined) return;
    const restored = reconstructPlanVoteProposal('Measured plan', snapshot.value, evidence.suffix);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.endsWith(' ')).toBe(true);
    expect(hashProposal(restored.value)).toBe(evidence.proposalHash);
    expect(evidence.voteRecordId).toBe(vote.voteRecordId);
    expect(evidence.recordHash).toBe(readVoteRecords(ledger).records[0]?.hash);
    expect(getBuiltinVoteEvidence(stages, { ...vote })).toBeUndefined();
    expect(JSON.stringify(vote)).not.toContain('suffix');
    expect(JSON.stringify(getAcceptanceSummary(stages))).not.toContain('ACCEPTANCE_SENTINEL');
  });

  it('keeps even the shortest bound baseline outside the canonical ledger summary', async () => {
    const snapshot = captureAcceptanceContext({
      kind: 'task',
      source: 'Z',
      callerTrustTier: '1',
      sourceTrustTier: '1',
      argumentSanitization: { status: 'unmodified' },
      projectionSanitization: { status: 'unmodified' },
    });
    if (!snapshot.ok) throw snapshot.error;
    const stages = createAgentStages({ acceptance: snapshot.value });
    const vote = await stages.vote('P', '');
    expect(vote.kind).toBe('approved');
    const evidence = getBuiltinVoteEvidence(stages, vote);
    if (evidence === undefined) throw new Error('Expected persisted bound approval');
    const proposal = reconstructPlanVoteProposal('P', snapshot.value, evidence.suffix);
    if (!proposal.ok) throw proposal.error;
    expect(proposal.value).toContain('\nZ\n');
    const records = readVoteRecords(ledger).records;
    expect(records).toHaveLength(1);
    expect(records[0]?.proposal).toBe(proposal.value.slice(0, 500) + '...');
    expect(records[0]?.proposal).not.toContain('Z');
    expect(records[0]?.proposalHash).toBe(hashProposal(proposal.value));
  });

  it('resumes an actual bound approval without another vote or duplicate checkpoint append', async () => {
    const options = {
      sessionId: 'strict-resume',
      dryRun: true,
      researchOverride: 'x'.repeat(999) + ' private tail',
    };
    const first = await runDevPipeline('Bound task', createAgentStages(), options);
    expect(first.checkpoint?.status).toBe('fresh');
    const file = join(directory, 'checkpoints', 'pipeline-strict-resume.jsonl');
    const before = readFileSync(file, 'utf8');
    const calls = vi.spyOn(expertBridge, 'executeExpert');
    const second = await runDevPipeline('Bound task', createAgentStages(), options);
    expect(second.checkpoint).toMatchObject({
      status: 'verified',
      voteRecordId: first.planVoteRecordId,
    });
    expect(second.planVoteDecision).toBeUndefined();
    expect(calls).not.toHaveBeenCalled();
    expect(readVoteRecords(ledger).records).toHaveLength(1);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(JSON.stringify(buildStructuredOutput(second, false))).not.toContain('private tail');
  });

  it('blocks a different current baseline and missing ledger before any stage or append', async () => {
    const options = { sessionId: 'strict-changed', dryRun: true, researchOverride: 'Research' };
    await runDevPipeline('Bound task', createAgentStages(), options);
    const file = join(directory, 'checkpoints', 'pipeline-strict-changed.jsonl');
    const before = readFileSync(file, 'utf8');
    const calls = vi.spyOn(expertBridge, 'executeExpert');
    const changed = await runDevPipeline('Different task', createAgentStages(), options);
    expect(changed.checkpoint).toMatchObject({ status: 'blocked', reason: 'binding-mismatch' });
    writeFileSync(ledger, '');
    const missing = await runDevPipeline('Bound task', createAgentStages(), options);
    expect(missing.checkpoint).toMatchObject({
      status: 'unavailable',
      reason: 'approval-unavailable',
    });
    expect(calls).not.toHaveBeenCalled();
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('does not turn a bound approved vote without persisted proof into a successful dry run', async () => {
    vi.spyOn(voteRecording, 'recordAuthenticVote').mockResolvedValueOnce({
      persisted: false,
      reason: 'write-failed',
      detail: 'TEST failure',
    });
    const result = await runDevPipeline('Bound task', createAgentStages(), {
      sessionId: 'missing-proof',
      dryRun: true,
      researchOverride: 'Research',
    });
    expect(result).toMatchObject({
      completed: false,
      securityRan: false,
      checkpoint: {
        status: 'unavailable',
        reason: 'approval-unavailable',
        recovery: 'new-session',
      },
    });
    expect(result.dryRun).toBeUndefined();
    expect(checkpointStore.loadCheckpointState('missing-proof')?.plan).toBeUndefined();
  });

  it('stops before planning when the bound research append fails', async () => {
    vi.spyOn(checkpointStore, 'saveBoundStageCheckpoint').mockReturnValueOnce({
      status: 'unavailable',
      reason: 'checkpoint-write-failed',
    });
    const calls = vi.spyOn(expertBridge, 'executeExpert');
    const result = await runDevPipeline('Bound task', createAgentStages(), {
      sessionId: 'write-failure',
      researchOverride: 'Research',
    });
    expect(result.checkpoint).toMatchObject({
      status: 'unavailable',
      reason: 'checkpoint-write-failed',
    });
    expect(calls).not.toHaveBeenCalled();
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it('rejects a cloned approved vote instead of inferring host evidence from its fields', async () => {
    const snapshot = captureAcceptanceContext({ kind: 'task', source: 'Bound task' });
    if (!snapshot.ok) throw snapshot.error;
    const stages = createAgentStages({ acceptance: snapshot.value });
    const vote = await stages.vote('Measured plan', '');
    const checkpoint = new DevPipelineCheckpoint(stages);
    expect(() => {
      checkpoint.accept('Measured plan', { ...vote });
    }).toThrow(CheckpointStopError);
    expect(() => {
      checkpoint.accept('Measured plan', vote);
    }).not.toThrow();
  });

  it.each(['plan', 'vote', 'decompose', 'implement', 'security'] as const)(
    'surfaces a failed %s append without falling back to legacy writes',
    async (stage) => {
      const snapshot = captureAcceptanceContext({ kind: 'task', source: 'Bound task' });
      if (!snapshot.ok) throw snapshot.error;
      const stages = createAgentStages({ acceptance: snapshot.value });
      const vote = await stages.vote('Measured plan', '');
      const checkpoint = new DevPipelineCheckpoint(stages, 'write-stages');
      checkpoint.accept('Measured plan', vote);
      if (stage === 'implement') checkpoint.save({ type: 'decompose', tasks: [] });
      const legacy = vi.spyOn(checkpointStore, 'saveStageCheckpoint');
      const writer = vi.spyOn(checkpointStore, 'saveBoundStageCheckpoint').mockReturnValueOnce({
        status: 'unavailable',
        reason: 'checkpoint-write-failed',
      });
      const data =
        stage === 'plan'
          ? { type: stage, text: 'Measured plan', iterations: 1 }
          : stage === 'vote'
            ? { type: stage, approved: true, iterations: 1 }
            : stage === 'security'
              ? { type: stage, passed: true }
              : { type: stage, tasks: [] };
      expect(() => {
        checkpoint.save(data);
      }).toThrow(CheckpointStopError);
      expect(writer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ stage }));
      expect(legacy).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'treats stored implementation as history, with terminal=%s',
    async (terminal) => {
      const snapshot = captureAcceptanceContext({ kind: 'task', source: 'Bound task' });
      if (!snapshot.ok) throw snapshot.error;
      const stages = createAgentStages({ acceptance: snapshot.value });
      const options = { sessionId: 'execution-history', researchOverride: 'Research' };
      await runDevPipeline('Bound task', stages, { ...options, dryRun: true });
      const coordinator = new DevPipelineCheckpoint(stages, options.sessionId);
      const task = {
        id: 'history',
        title: 'Task',
        description: 'Do work',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
        writeTargets: { kind: 'workspace-relative' as const, paths: ['src/history.ts'] },
      };
      coordinator.save({ type: 'decompose', tasks: [task] });
      coordinator.save({
        type: 'implement',
        tasks: [{ ...task, status: 'done', implementation: 'HISTORICAL_ONLY' }],
      });
      if (terminal) coordinator.save({ type: 'security', passed: false });
      vi.spyOn(workspace, 'withDevPipelineWorkspace').mockImplementation(async (bound, body) =>
        body(bound)
      );
      const experts = vi.spyOn(expertBridge, 'executeExpert').mockResolvedValue({
        success: true,
        text: 'PASS',
        expertType: 'code',
        cli: 'codex',
        durationMs: 1,
      });
      let implementationEntries = 0;
      const scan = vi.spyOn(securityGate, 'checkSecurityScan').mockReturnValue(() => {
        const file = join(directory, 'checkpoints', 'pipeline-execution-history.jsonl');
        implementationEntries = readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => line.includes('"stage":"implement"')).length;
        return Promise.resolve({
          name: 'security',
          verdict: 'pass',
          details: 'Local scan fixture',
        });
      });
      const result = await runDevPipeline('Bound task', stages, options);
      if (terminal) {
        expect(result.checkpoint).toMatchObject({
          status: 'blocked',
          reason: 'checkpoint-terminal',
        });
        expect(experts).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
      } else {
        expect(result.completed).toBe(true);
        expect(result.tasks[0]?.implementation).toBe('PASS');
        expect(experts).toHaveBeenCalledTimes(2);
        expect(scan).toHaveBeenCalledTimes(1);
        expect(implementationEntries).toBe(2);
        expect(result.checkpoint).toMatchObject({ status: 'verified', execution: 'fresh' });
      }
    }
  );

  it('blocks a partial bound plan and never manufactures an approved checkpoint line', async () => {
    const snapshot = captureAcceptanceContext({ kind: 'task', source: 'Bound task' });
    if (!snapshot.ok) throw snapshot.error;
    const stages = createAgentStages({ acceptance: snapshot.value });
    const coordinator = new DevPipelineCheckpoint(stages, 'partial-plan');
    const vote = await stages.vote('Measured plan', '');
    coordinator.accept('Measured plan', vote);
    coordinator.save({ type: 'research', text: 'Research' });
    coordinator.save({ type: 'plan', text: 'Measured plan', iterations: 1 });
    const file = join(directory, 'checkpoints', 'pipeline-partial-plan.jsonl');
    const before = readFileSync(file, 'utf8');
    const experts = vi.spyOn(expertBridge, 'executeExpert');
    const result = await runDevPipeline('Bound task', stages, { sessionId: 'partial-plan' });
    expect(result.checkpoint).toMatchObject({ status: 'blocked', reason: 'approval-missing' });
    expect(experts).not.toHaveBeenCalled();
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('blocks factory mutation rather than treating an existing bound checkpoint as legacy', async () => {
    const stages = createAgentStages();
    const options = { sessionId: 'mutated-bound', dryRun: true, researchOverride: 'Research' };
    await runDevPipeline('Bound task', stages, options);
    const replacement = vi.fn().mockResolvedValue('Changed implementation');
    stages.implement = replacement;
    const result = await runDevPipeline('Bound task', stages, options);
    expect(result.checkpoint).toMatchObject({ status: 'blocked', reason: 'binding-unavailable' });
    expect(replacement).not.toHaveBeenCalled();
  });

  it.each([
    { resumed: false, missing: true },
    { resumed: true, missing: true },
    { resumed: false, missing: false },
    { resumed: true, missing: false },
  ])(
    'refuses missing or changed implementation definitions before append: %j',
    async ({ resumed, missing }) => {
      const snapshot = captureAcceptanceContext({ kind: 'task', source: 'Bound task' });
      if (!snapshot.ok) throw snapshot.error;
      const stages = createAgentStages({ acceptance: snapshot.value });
      const vote = await stages.vote('Measured plan', '');
      let coordinator = new DevPipelineCheckpoint(stages, 'subset-history');
      coordinator.accept('Measured plan', vote);
      coordinator.save({ type: 'plan', text: 'Measured plan', iterations: 1 });
      coordinator.save({ type: 'vote', approved: true, iterations: 1 });
      coordinator.save({
        type: 'decompose',
        tasks: [
          {
            id: 'one',
            title: 'Task',
            description: 'Work',
            assignedTo: 'coder',
            status: 'pending',
            writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
          },
        ],
      });
      const file = join(directory, 'checkpoints', 'pipeline-subset-history.jsonl');
      const before = readFileSync(file, 'utf8');
      if (resumed) coordinator = new DevPipelineCheckpoint(stages, 'subset-history');
      expect(() => {
        coordinator.save({
          type: 'implement',
          tasks: missing
            ? []
            : [
                {
                  id: 'one',
                  title: 'Task',
                  description: 'Different work',
                  assignedTo: 'coder',
                  status: 'done',
                  writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
                },
              ],
        });
      }).toThrow(CheckpointStopError);
      expect(readFileSync(file, 'utf8')).toBe(before);
      expect(checkpointStore.loadCheckpointDiagnostic('subset-history').kind).toBe('bound');
    }
  );

  it.each([
    { resumed: false, oneSuccess: false },
    { resumed: false, oneSuccess: true },
    { resumed: true, oneSuccess: false },
    { resumed: true, oneSuccess: true },
  ])(
    'retains implementation failure results without a checkpoint error: %j',
    async ({ resumed, oneSuccess }) => {
      const snapshot = captureAcceptanceContext({ kind: 'task', source: 'Bound task' });
      if (!snapshot.ok) throw snapshot.error;
      const stages = createAgentStages({ acceptance: snapshot.value });
      const options = { sessionId: 'failed-run', researchOverride: 'Research' };
      const tasks = [
        {
          id: 'one',
          title: 'First',
          description: 'Work',
          assignedTo: 'coder' as const,
          status: 'pending' as const,
          writeTargets: { kind: 'workspace-relative' as const, paths: ['src/first.ts'] },
        },
        {
          id: 'two',
          title: 'Second',
          description: 'Work',
          assignedTo: 'coder' as const,
          status: 'pending' as const,
          writeTargets: { kind: 'workspace-relative' as const, paths: ['src/second.ts'] },
        },
      ];
      if (resumed) {
        await runDevPipeline('Bound task', stages, { ...options, dryRun: true });
        new DevPipelineCheckpoint(stages, options.sessionId).save({ type: 'decompose', tasks });
      }
      const file = join(directory, 'checkpoints', 'pipeline-failed-run.jsonl');
      let beforeImplementation: string | undefined;
      vi.spyOn(workspace, 'withDevPipelineWorkspace').mockImplementation(async (bound, body) =>
        body(bound)
      );
      vi.spyOn(expertBridge, 'executeExpert').mockImplementation((expertType, prompt) => {
        if (expertType === 'code') {
          beforeImplementation ??= readFileSync(file, 'utf8');
          const success = oneSuccess && prompt.includes('Second');
          return Promise.resolve({
            success,
            text: success ? 'Fresh implementation' : '',
            ...(success ? {} : { error: 'TEST adapter failure' }),
            expertType,
            cli: 'codex',
            durationMs: 1,
          });
        }
        return Promise.resolve({
          success: true,
          text:
            expertType === 'pm'
              ? JSON.stringify(tasks)
              : expertType === 'qa'
                ? 'PASS'
                : 'Measured plan',
          expertType,
          cli: 'codex',
          durationMs: 1,
        });
      });
      const scan = vi
        .spyOn(securityGate, 'checkSecurityScan')
        .mockReturnValue(() =>
          Promise.resolve({ name: 'security', verdict: 'pass', details: 'Local scan fixture' })
        );
      const writer = vi.spyOn(checkpointStore, 'saveBoundStageCheckpoint');
      const result = await runDevPipeline('Bound task', stages, options);
      expect(result).toMatchObject({
        completed: false,
        plan: 'Measured plan',
        taskStatus: oneSuccess ? 'partial' : 'none',
        securityRan: false,
        securityPassed: false,
      });
      expect(result.tasks).toHaveLength(oneSuccess ? 1 : 2);
      expect(result.checkpoint).toMatchObject({
        status: resumed ? 'verified' : 'fresh',
        execution: 'fresh',
      });
      expect(result.checkpoint).not.toHaveProperty('recovery');
      expect(result.checkpoint).not.toHaveProperty('reason');
      expect(scan).not.toHaveBeenCalled();
      expect(writer.mock.calls.filter(([entry]) => entry.stage === 'implement')).toHaveLength(0);
      expect(beforeImplementation).toBeDefined();
      expect(readFileSync(file, 'utf8')).toBe(beforeImplementation);
      expect(checkpointStore.loadCheckpointDiagnostic(options.sessionId).kind).toBe('bound');
      expect(readVoteRecords(ledger).records).toHaveLength(1);
    }
  );

  it('retains no approval evidence when canonical persistence fails', async () => {
    vi.spyOn(voteRecording, 'recordAuthenticVote').mockResolvedValueOnce({
      persisted: false,
      reason: 'write-failed',
      detail: 'TEST disk failure',
    });
    const snapshot = captureAcceptanceContext({ kind: 'goal', source: 'BASELINE_SENTINEL' });
    if (!snapshot.ok) throw snapshot.error;
    const stages = createAgentStages({ acceptance: snapshot.value });
    const vote = await stages.vote('Measured plan', 'PRIVATE_TEST_SUFFIX');
    expect(vote.kind).toBe('approved');
    expect(vote.voteRecordId).toBeUndefined();
    expect(getBuiltinVoteEvidence(stages, vote)).toBeUndefined();
    expect(JSON.stringify(vote)).not.toContain('PRIVATE_TEST_SUFFIX');
  });

  it('does not expose the bound research suffix as a rejected public diagnostic proposal', async () => {
    voters.decision = 'reject';
    const snapshot = captureAcceptanceContext({ kind: 'goal', source: 'ACCEPTANCE_SENTINEL' });
    if (!snapshot.ok) throw snapshot.error;
    const stages = createAgentStages({ acceptance: snapshot.value });
    const vote = await stages.vote('Measured plan', 'PRIVATE_TEST_SUFFIX');
    expect(vote.kind).toBe('rejected');
    expect(JSON.stringify(vote)).not.toContain('PRIVATE_TEST_SUFFIX');
    expect(getBuiltinVoteEvidence(stages, vote)).toBeUndefined();
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
    // #7181: the dry-run response carries the verdict and the id of the record
    // it persisted, so a caller need not read the ledger to learn the outcome.
    expect(result.planVoteDecision).toBe('approved');
    expect(result.planVoteApprovalPercentage).toBe(100);
    expect(result.planVoteRecordId).toBe(records[0]?.id);
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

  it.each([true, false])(
    'selects the canonical panel with quickMode=%s (#7297)',
    async (quickMode) => {
      // Reject to exercise panel selection without the documented approval escalation.
      voters.decision = 'reject';
      await createAgentStages({ quickMode, votingStrategy: 'simple_majority' }).vote(
        'Measured plan',
        ''
      );
      const seats = new DecisionCostStore().all()[0]?.summary.perVoter;
      expect(seats).toHaveLength(quickMode ? 3 : 7);
      expect(seats?.map((seat) => seat.role)).toEqual(getVoterRoles(quickMode));
    }
  );

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

  it('returns the exact executed proposal as diagnostic evidence for rejected plans (#7424)', async () => {
    voters.decision = 'reject';
    const vote = await createAgentStages({
      votingStrategy: 'simple_majority',
      quickMode: true,
    }).vote('Measured plan', 'Exact assembled research');
    expect(vote.kind).toBe('rejected');
    expect(vote).toMatchObject({
      proposal: buildVoteProposal('Measured plan', 'Exact assembled research'),
    });
  });

  it('retains the fully returned absolute approval-floor cause through the dry pipeline (#7412)', async () => {
    const recording = vi.spyOn(voteRecording, 'recordAuthenticVote');
    voters.decisions = ['approve', 'reject', 'approve', 'abstain', 'approve', 'reject', 'approve'];
    const result = await runDevPipeline(
      'Exercise the fully returned plan panel',
      createAgentStages({ votingStrategy: 'supermajority', quickMode: false }),
      { dryRun: true, researchOverride: 'Research' }
    );
    expect(result).toMatchObject({
      completed: false,
      planStatus: 'no_quorum',
      planVoteDecision: 'no_quorum',
      tasks: [],
      securityRan: false,
    });
    expect(result.planVoteReason).toBe(
      'no_quorum: absolute quorum not met (4/5 approvals over 7-voter panel, absolute_quorum)'
    );
    expect(result.planVoteReason).not.toContain('a voice was missing');
    const records = readVoteRecords(ledger).records;
    expect(records).toHaveLength(3); // One outer cycle, initial attempt plus two same-plan retries.
    for (const record of records) {
      expect(record).toMatchObject({
        decision: 'no_quorum',
        voteCounts: { approve: 4, reject: 2, abstain: 1, total: 7 },
      });
    }
    expect(recording).toHaveBeenCalledTimes(3);
    for (const [args] of recording.mock.calls) expect(args.errorVoided).toBe(false);
  });

  it.each(['missing', 'errored', 'unverifiable'] as const)(
    'retains the canonical %s-seat cause without changing no-quorum (#7412)',
    async (cause) => {
      if (cause === 'missing') voters.respondents = 6;
      if (cause === 'errored') voters.failed = true;
      if (cause === 'unverifiable') voters.unverifiable = true;
      const vote = await createAgentStages({
        votingStrategy: 'supermajority',
        quickMode: false,
      }).vote('Measured plan', '');
      expect(vote.kind).toBe('no_quorum');
      if (vote.kind === 'no_quorum') {
        expect(vote.reason).toContain(cause);
        expect(vote.reason).not.toContain('a voice was missing');
      }
    }
  );

  it('still approves five of seven and rejects genuine disagreement (#7412)', async () => {
    voters.decisions = ['approve', 'approve', 'approve', 'approve', 'approve', 'reject', 'reject'];
    const stages = createAgentStages({ votingStrategy: 'supermajority', quickMode: false });
    expect((await stages.vote('Five approvals', '')).kind).toBe('approved');
    voters.decisions = ['approve', 'approve', 'approve', 'reject', 'reject', 'reject', 'reject'];
    expect((await stages.vote('Genuine disagreement', '')).kind).toBe('rejected');
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
