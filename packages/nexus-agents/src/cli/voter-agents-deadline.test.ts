/**
 * Regression tests for Issue #1871 — consensus_vote hangs indefinitely.
 *
 * The production hang happened when one of N parallel agent votes never
 * settled (despite per-vote timeouts), leaving Promise.all() blocked and
 * the MCP tool_use entry without a tool_result.
 *
 * Fix: each vote promise is raced against an overall consensus deadline.
 * Any role that has not resolved when the deadline fires is returned as
 * createErrorVoteResult('overall consensus deadline exceeded'), so partial
 * results always come back within a bounded wall-clock time.
 */
import { describe, it, expect } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';

const silentLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
} as unknown as ILogger;

const stubAdapter: IModelAdapter = {
  modelId: 'stub',
  providerId: 'stub',
} as unknown as IModelAdapter;

function makeOkVote(role: VoterRole): AgentVoteResult {
  return {
    role,
    vote: {
      decision: 'approve',
      confidence: 0.9,
      reasoning: 'stub',
    },
    processingTimeMs: 10,
    source: 'llm',
    cli: 'stub',
  };
}

describe('launchVotesWithOverallDeadline (Issue #1871)', () => {
  it('returns partial results when one role never settles before the deadline', async () => {
    const roles: readonly VoterRole[] = ['architect', 'security', 'pm'];

    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => {
      if (role === 'security') return new Promise<AgentVoteResult>(() => undefined);
      return Promise.resolve(makeOkVote(role));
    };

    const start = Date.now();
    const results = await launchVotesWithOverallDeadline({
      roles,
      proposal: 'test proposal',
      roleAdapters: new Map(),
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 200,
      voteFn,
    });
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(3);
    expect(elapsed).toBeLessThan(1_000);

    const byRole = new Map(results.map((r) => [r.role, r]));
    expect(byRole.get('architect')?.source).toBe('llm');
    expect(byRole.get('pm')?.source).toBe('llm');
    const stuck = byRole.get('security');
    expect(stuck?.source).toBe('error');
    expect(stuck?.error ?? '').toMatch(/deadline/i);
  });

  it('returns all real results when every role settles before the deadline', async () => {
    const roles: readonly VoterRole[] = ['architect', 'pm'];
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => Promise.resolve(makeOkVote(role));

    const results = await launchVotesWithOverallDeadline({
      roles,
      proposal: 'test',
      roleAdapters: new Map(),
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results).toHaveLength(2);
    for (const r of results) expect(r.source).toBe('llm');
  });

  it('preserves role order in the returned results', async () => {
    const roles: readonly VoterRole[] = ['architect', 'security', 'devex', 'pm'];
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => {
      const delay = role === 'architect' ? 50 : 0;
      return new Promise((resolve) =>
        setTimeout(() => {
          resolve(makeOkVote(role));
        }, delay)
      );
    };

    const results = await launchVotesWithOverallDeadline({
      roles,
      proposal: 'test',
      roleAdapters: new Map(),
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results.map((r) => r.role)).toEqual([...roles]);
  });
});
