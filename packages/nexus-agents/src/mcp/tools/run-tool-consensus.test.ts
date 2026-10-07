/** Registered `run` consensus enforcement and real-ledger seam tests (#4464). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { getVoterRoles } from '../../cli/voter-roles.js';
import type { ExtendedVotingResult } from './consensus-vote-types.js';
import type { ToolResult } from './tool-result.js';

const { voteMock } = vi.hoisted(() => ({
  voteMock: vi.fn<(...args: unknown[]) => Promise<ExtendedVotingResult>>(),
}));
vi.mock('./consensus-vote.js', () => ({ runConsensusForGoal: voteMock }));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler:
    (fn: (args: unknown, ctx: { requestContext: object }) => unknown) => (args: unknown) =>
      fn(args, { requestContext: {} }),
}));

import { registerRunTool } from './run-tool.js';
import { createLogger } from '../../core/index.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { resolveVoteRecordsPath, VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetGlobalPolicyFirewall } from '../middleware/policy-registry.js';
import { parseToolErrorEnvelope } from '../error-envelope.js';
import { resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import { DecisionCostStore } from '../../observability/decision-cost-store.js';
import { getMetaOutcomesFile } from '../../config/learning-persistence.js';

type Verdict = 'approved' | 'rejected' | 'no_quorum';
type Mode = 'off' | 'audit' | 'enforce';
const GOAL = 'Decide whether to approve the proposed implementation';

/** Full engine fixture: error seats stay on the roster, outside the engine tally. */
function panel(
  decision: Verdict,
  approve = decision === 'rejected' ? 2 : 5,
  reject = decision === 'rejected' ? 5 : 2,
  errors = 0
): ExtendedVotingResult {
  const votes: AgentVoteResult[] = getVoterRoles(false)
    .slice(0, approve + reject + errors)
    .map((role, index) => ({
      role,
      source: index >= approve + reject ? 'error' : 'llm',
      vote: {
        decision: index < approve ? 'approve' : index < approve + reject ? 'reject' : 'abstain',
        confidence: 0.9,
        reasoning: 'Fixture seat reviewed the proposal',
      },
      processingTimeMs: 1,
      ...(index >= approve + reject ? { error: 'Fixture voter timed out' } : {}),
    }));
  const total = approve + reject;
  const timestamp = '2026-10-05T12:00:00.000Z';
  return {
    proposal: GOAL,
    threshold: 'simple_majority',
    strategy: 'simple_majority',
    decision,
    simulateVotes: false,
    totalTimeMs: 1,
    votes,
    errorPolicy: 'reduce_denominator',
    panelSize: votes.length,
    result: {
      proposalId: 'proposal-4464',
      proposal: { title: 'Implementation', description: GOAL, algorithm: 'simple_majority' },
      outcome: decision === 'approved' ? 'approved' : 'rejected',
      votes: new Map(votes.filter((vote) => vote.source !== 'error').map((v) => [v.role, v.vote])),
      voteCounts: { approve, reject, abstain: 0, total },
      approvalPercentage: total > 0 ? (100 * approve) / total : 0,
      quorumReached: decision !== 'no_quorum',
      startedAt: timestamp,
      closedAt: timestamp,
      durationMs: 1,
    },
  };
}

function captureHandler(
  logger = createLogger({ test: 'consensus-enforcement' })
): (args: unknown) => Promise<ToolResult> {
  let handler: ((args: unknown) => Promise<ToolResult>) | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, callback: typeof handler) => {
      handler = callback;
    },
  };
  registerRunTool(server as unknown as McpServer, {
    logger,
    rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100, refillIntervalMs: 1000 }),
  });
  if (handler === undefined) throw new Error('run handler was not registered');
  return handler;
}

function payload(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

const runArgs = { goal: GOAL, forceStrategy: 'consensus', execute: true };

describe('registered run consensus enforcement (#4464)', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'nexus-run-consensus-'));
    vi.stubEnv('NEXUS_DATA_DIR', directory);
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, join(directory, 'governance', 'vote-records.jsonl'));
    vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '0');
    resetNexusDataDirCache();
    resetOutcomeStore();
    resetJobConcurrency();
    resetGlobalPolicyFirewall();
    voteMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    resetOutcomeStore();
    resetJobConcurrency();
    resetGlobalPolicyFirewall();
    rmSync(directory, { recursive: true, force: true });
  });

  function ledgerLines(): string[] {
    const path = resolveVoteRecordsPath();
    if (path === undefined) throw new Error('Temporary vote ledger path could not be resolved');
    return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean) : [];
  }

  const cases: Array<[Mode, Verdict]> = ['off', 'audit', 'enforce'].flatMap((mode) =>
    ['approved', 'rejected', 'no_quorum'].map((verdict): [Mode, Verdict] => [
      mode as Mode,
      verdict as Verdict,
    ])
  );
  it.each(cases)('%s mode handles %s and records the final panel once', async (mode, verdict) => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', mode);
    voteMock.mockResolvedValue(panel(verdict));
    const result = await captureHandler()(runArgs);
    const blocked = mode === 'enforce' && verdict !== 'approved';
    const retried = mode === 'enforce' && verdict === 'no_quorum';
    expect(result.isError === true).toBe(blocked);
    expect(voteMock).toHaveBeenCalledTimes(retried ? 2 : 1);
    expect(ledgerLines()).toHaveLength(1);
    if (blocked) {
      expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
      expect(result.content[0]!.text).toMatch(verdict === 'rejected' ? /rejected/i : /no.quorum/i);
    } else {
      if (mode === 'off') {
        expect(payload(result)['enforcement']).not.toHaveProperty('wouldBlock');
        expect(payload(result)['enforcement']).toMatchObject({ reason: 'unmeasured' });
      }
      expect(payload(result)['enforcement']).toMatchObject({
        mode,
        ...(mode !== 'off' ? { wouldBlock: verdict !== 'approved' } : {}),
        attempts: retried ? 2 : 1,
        reason: expect.any(String),
      });
    }
  });

  it('defaults to audit and discloses a rejected verdict without blocking', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', undefined);
    voteMock.mockResolvedValue(panel('rejected', 2, 5));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBeFalsy();
    expect(payload(result)['enforcement']).toMatchObject({ mode: 'audit', wouldBlock: true });
  });

  it('uses the mode resolved before voting even if the environment changes during the panel', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock.mockImplementation(() => {
      vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'off');
      return Promise.resolve(panel('rejected'));
    });
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBe(true);
    expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
    expect(voteMock).toHaveBeenCalledTimes(1);
  });

  it('retries no_quorum exactly once and accepts a recovered approval', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    const engineFirst = panel('no_quorum');
    const first = {
      ...engineFirst,
      votes: engineFirst.votes.map((seat) => ({ ...seat, inputTokens: 100, outputTokens: 50 })),
    };
    voteMock.mockResolvedValueOnce(first).mockResolvedValueOnce(panel('approved'));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBeFalsy();
    expect(voteMock).toHaveBeenCalledTimes(2);
    const costs = new DecisionCostStore().all();
    expect(costs).toHaveLength(2);
    expect(costs[0]?.decisionId).not.toBe(costs[1]?.decisionId);
    expect(costs.map((cost) => cost.summary.voterCount)).toEqual([7, 7]);
    expect(costs[0]?.summary.totalTokens).toBe(1050);
    expect(payload(result)['enforcement']).toMatchObject({ attempts: 2 });
    expect(ledgerLines()).toHaveLength(1);
    expect(JSON.parse(ledgerLines()[0]!) as { decision: string }).toMatchObject({
      decision: 'approved',
    });
  });

  it('blocks a rejection returned by the one no_quorum retry', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock
      .mockResolvedValueOnce(panel('no_quorum'))
      .mockResolvedValueOnce(panel('rejected', 2, 5));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/rejected/i);
    expect(voteMock).toHaveBeenCalledTimes(2);
    expect(ledgerLines()).toHaveLength(1);
    expect(JSON.parse(ledgerLines()[0]!) as { decision: string }).toMatchObject({
      decision: 'rejected',
    });
  });

  it('preserves the engine approval when 3 approvals, 2 rejections and 2 errored seats block', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock.mockResolvedValue(panel('approved', 3, 2, 2));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBe(true);
    expect(JSON.parse(ledgerLines()[0]!) as { decision: string }).toMatchObject({
      decision: 'approved',
    });
    expect(result.content[0]!.text).toMatch(/outage.invariant/i);
    expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
    // Ratified on #4464: a non-outage-invariant approval is treated as no_quorum (one retry).
    expect(voteMock).toHaveBeenCalledTimes(2);
    expect(parseToolErrorEnvelope(result._meta)?.detail).toMatchObject({
      decision: 'approved',
      enforcement: { reason: 'not_outage_invariant', attempts: 2, wouldBlock: true },
      voteRecord: { persisted: true },
    });
    expect(ledgerLines()).toHaveLength(1);
    expect(JSON.parse(ledgerLines()[0]!) as { decision: string }).toMatchObject({
      decision: 'approved',
    });
  });

  it.each(['llm', 'unverifiable'] as const)(
    '3 approvals and 1 rejection with 3 %s abstentions use the ratified denominator',
    async (source) => {
      vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
      const enginePanel = panel('approved', 3, 1, 3);
      const votes = enginePanel.votes.map((seat): AgentVoteResult =>
        seat.source === 'error'
          ? {
              role: seat.role,
              source,
              vote: { ...seat.vote, decision: 'abstain' },
              processingTimeMs: seat.processingTimeMs,
            }
          : seat
      );
      voteMock.mockResolvedValue({ ...enginePanel, votes });
      const result = await captureHandler()(runArgs);
      expect(result.isError === true).toBe(source === 'unverifiable');
      expect(voteMock).toHaveBeenCalledTimes(source === 'unverifiable' ? 2 : 1);
      expect(ledgerLines()).toHaveLength(1);
    }
  );

  it('returns the rejected panel details without repeating the verdict in its message', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock.mockResolvedValue(panel('rejected'));
    const result = await captureHandler()(runArgs);
    const envelope = parseToolErrorEnvelope(result._meta);
    expect(envelope?.message).not.toContain('rejected: rejected');
    expect(envelope?.detail).toMatchObject({
      decision: 'rejected',
      enforcement: { reason: 'rejected', attempts: 1, wouldBlock: true },
      voteRecord: { persisted: true },
    });
  });

  it('retries a non-outage-invariant approval once and accepts a recovered panel', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock
      .mockResolvedValueOnce(panel('approved', 3, 2, 2))
      .mockResolvedValueOnce(panel('approved', 5, 0, 2));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBeFalsy();
    expect(voteMock).toHaveBeenCalledTimes(2);
    expect(payload(result)['enforcement']).toMatchObject({ wouldBlock: false, attempts: 2 });
    expect(ledgerLines()).toHaveLength(1);
  });

  it('accepts 5 approvals and 2 errored seats without a retry', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock.mockResolvedValue(panel('approved', 5, 0, 2));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBeFalsy();
    expect(payload(result)['enforcement']).toMatchObject({ mode: 'enforce', wouldBlock: false });
    expect(voteMock).toHaveBeenCalledTimes(1);
    expect(ledgerLines()).toHaveLength(1);
  });

  it('audits a non-outage-invariant approval without retrying or blocking', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'audit');
    voteMock.mockResolvedValue(panel('approved', 3, 2, 2));
    const result = await captureHandler()(runArgs);
    expect(result.isError).toBeFalsy();
    expect(payload(result)['enforcement']).toMatchObject({ mode: 'audit', wouldBlock: true });
    expect(voteMock).toHaveBeenCalledTimes(1);
  });

  it.each(['off', 'audit', 'enforce'] as const)(
    '%s handles AllVotersFailedError honestly',
    async (mode) => {
      vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', mode);
      voteMock.mockResolvedValue(panel('no_quorum', 0, 0, 7));
      const logger = createLogger({ test: 'all-voters-failed' });
      const warning = vi.spyOn(logger, 'warn');
      const result = await captureHandler(logger)(runArgs);
      expect(result.isError === true).toBe(mode === 'enforce');
      if (mode === 'enforce') {
        expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
        expect(result.content[0]!.text).toMatch(/all.*voters.*failed/i);
      } else {
        expect(warning).toHaveBeenCalled();
      }
      expect(ledgerLines()).toHaveLength(0);
    }
  );

  it.each(['off', 'audit', 'enforce'] as const)(
    '%s handles an empty panel honestly',
    async (mode) => {
      vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', mode);
      voteMock.mockResolvedValue(panel('no_quorum', 0, 0, 0));
      const logger = createLogger({ test: 'empty-panel' });
      const warning = vi.spyOn(logger, 'warn');
      const result = await captureHandler(logger)(runArgs);
      expect(result.isError === true).toBe(mode === 'enforce');
      if (mode === 'enforce') {
        expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
      } else {
        expect(warning).toHaveBeenCalled();
      }
      expect(ledgerLines()).toHaveLength(0);
    }
  );

  it.each(['off', 'audit', 'enforce'] as const)(
    '%s handles a ledger append that reports persisted false',
    async (mode) => {
      vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', mode);
      // An existing directory is a real EISDIR write failure, without a recorder mock.
      vi.stubEnv(VOTE_RECORDS_PATH_ENV, directory);
      voteMock.mockResolvedValue(panel('approved'));
      const logger = createLogger({ test: 'ledger-write-failed' });
      const warning = vi.spyOn(logger, 'warn');
      const result = await captureHandler(logger)(runArgs);
      expect(result.isError === true).toBe(mode === 'enforce');
      expect(warning).toHaveBeenCalled();
      if (mode === 'enforce') {
        expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
        expect(result.content[0]!.text).toMatch(/persist|record|ledger/i);
      } else {
        expect(payload(result)['enforcement']).toMatchObject({
          mode,
          reason: mode === 'off' ? 'unmeasured' : 'approved',
          ...(mode === 'audit'
            ? { recordingError: expect.stringMatching(/ledger/i), wouldBlock: true }
            : {}),
        });
      }
      expect(voteMock).toHaveBeenCalledTimes(1);
    }
  );

  describe('dispatch-outcome telemetry reads the panel, not the gate (#7127)', () => {
    /** The default sink's outcome lines and the shadow-train file, for one run. */
    async function runAndCollect(
      mode: Mode,
      fixture: ExtendedVotingResult
    ): Promise<{
      result: ToolResult;
      sink: Record<string, unknown>[];
      trained: Array<{ strategy: string; success: boolean }>;
    }> {
      vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', mode);
      vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '1');
      voteMock.mockResolvedValue(fixture);
      const logger = createLogger({ test: 'outcome-telemetry' });
      const info = vi.spyOn(logger, 'info');
      const result = await captureHandler(logger)(runArgs);
      const sink = info.mock.calls
        .filter(([message]) => message === 'MetaDispatcher execution outcome')
        .map(([, context]) => context as Record<string, unknown>);
      const file = getMetaOutcomesFile();
      const trained = existsSync(file)
        ? readFileSync(file, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as { strategy: string; success: boolean })
        : [];
      return { result, sink, trained };
    }

    it('enforce + rejected panel: business error, strategy success with a refusal marker', async () => {
      const { result, sink, trained } = await runAndCollect('enforce', panel('rejected'));
      expect(result.isError).toBe(true);
      expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('business');
      expect(sink).toHaveLength(1);
      expect(sink[0]).toMatchObject({ strategy: 'consensus', success: true });
      expect(sink[0]?.['gateRefusal']).toMatch(/rejected/);
      expect(sink[0]).not.toHaveProperty('failureReason');
      expect(trained).toEqual([expect.objectContaining({ strategy: 'consensus', success: true })]);
    });

    it('enforce + all voters failed: strategy failure, no refusal marker', async () => {
      const { result, sink, trained } = await runAndCollect('enforce', panel('no_quorum', 0, 0, 7));
      expect(result.isError).toBe(true);
      expect(sink).toHaveLength(1);
      expect(sink[0]).toMatchObject({ strategy: 'consensus', success: false });
      expect(sink[0]).not.toHaveProperty('gateRefusal');
      expect(trained).toEqual([expect.objectContaining({ strategy: 'consensus', success: false })]);
    });

    it.each(['audit', 'off'] as const)(
      '%s + rejected panel: unchanged success, no refusal marker',
      async (mode) => {
        const { result, sink, trained } = await runAndCollect(mode, panel('rejected'));
        expect(result.isError).toBeFalsy();
        expect(sink).toHaveLength(1);
        expect(sink[0]).toMatchObject({ strategy: 'consensus', success: true });
        expect(sink[0]).not.toHaveProperty('gateRefusal');
        expect(trained).toEqual([
          expect.objectContaining({ strategy: 'consensus', success: true }),
        ]);
      }
    );
  });

  it('ends an async rejected consensus job as failed', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock.mockResolvedValue(panel('rejected', 2, 5));
    const result = await captureHandler()({ ...runArgs, dispatch: 'async' });
    const jobId = payload(result)['jobId'];
    if (typeof jobId !== 'string') throw new Error('async run returned no jobId');
    await vi.waitFor(() => {
      expect(readJobResult(jobId)?.status).toBe('failed');
    });
    expect(ledgerLines()).toHaveLength(1);
  });

  it('ends an async AllVotersFailedError consensus job as failed', async () => {
    vi.stubEnv('NEXUS_CONSENSUS_ENFORCE', 'enforce');
    voteMock.mockResolvedValue(panel('no_quorum', 0, 0, 7));
    const result = await captureHandler()({ ...runArgs, dispatch: 'async' });
    const jobId = payload(result)['jobId'];
    if (typeof jobId !== 'string') throw new Error('async run returned no jobId');
    await vi.waitFor(() => {
      expect(readJobResult(jobId)?.status).toBe('failed');
    });
    expect(ledgerLines()).toHaveLength(0);
  });
});
