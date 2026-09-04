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

/** A CLI-named adapter — the `.name` field is what carries the CLI identity. */
function makeCliAdapter(name: string): IModelAdapter {
  return { modelId: name, providerId: name, name } as unknown as IModelAdapter;
}

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

  it('serializes votes that share a CLI while running distinct CLIs concurrently (#3348)', async () => {
    // Two roles on "claude", two on "gemini". Concurrent same-CLI subprocess
    // calls race the CLI's OAuth refresh-token rotation ("refresh token already
    // used"). Per-CLI serialization must keep at most one same-CLI call in
    // flight, while still letting different CLIs overlap (no global serialization).
    const roles: readonly VoterRole[] = ['architect', 'security', 'devex', 'ai_ml'];
    const roleAdapters = new Map<VoterRole, IModelAdapter>([
      ['architect', makeCliAdapter('claude')],
      ['security', makeCliAdapter('claude')],
      ['devex', makeCliAdapter('gemini')],
      ['ai_ml', makeCliAdapter('gemini')],
    ]);

    const inFlight = new Map<string, number>();
    const maxByName = new Map<string, number>();
    let crossCliOverlapSeen = false;

    const voteFn = async (
      role: VoterRole,
      _proposal: string,
      adapter: IModelAdapter
    ): Promise<AgentVoteResult> => {
      const name = (adapter as { name?: string }).name ?? 'default';
      const cur = (inFlight.get(name) ?? 0) + 1;
      inFlight.set(name, cur);
      maxByName.set(name, Math.max(maxByName.get(name) ?? 0, cur));
      const distinctActive = [...inFlight.values()].filter((n) => n > 0).length;
      if (distinctActive >= 2) crossCliOverlapSeen = true;
      await new Promise((r) => setTimeout(r, 30));
      inFlight.set(name, (inFlight.get(name) ?? 1) - 1);
      return makeOkVote(role);
    };

    const results = await launchVotesWithOverallDeadline({
      roles,
      proposal: 'test',
      roleAdapters,
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results).toHaveLength(4);
    for (const r of results) expect(r.source).toBe('llm');
    // No concurrent same-CLI calls → no concurrent OAuth refresh.
    expect(maxByName.get('claude')).toBe(1);
    expect(maxByName.get('gemini')).toBe(1);
    // But distinct CLIs still overlap — we did not serialize globally.
    expect(crossCliOverlapSeen).toBe(true);
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

  it('retries on the fallback adapter when a diverse adapter hard-fails (#3587)', async () => {
    // architect lands on a bad CLI (OpenRouter tool-use 404 class); the
    // fallback CLI is healthy. The voter must end up with a real vote.
    const roleAdapters = new Map<VoterRole, IModelAdapter>([
      ['architect', makeCliAdapter('badcli')],
    ]);
    const seen: string[] = [];
    const voteFn = (
      role: VoterRole,
      _p: string,
      adapter: IModelAdapter
    ): Promise<AgentVoteResult> => {
      const name = (adapter as { name?: string }).name ?? adapter.providerId;
      seen.push(name);
      if (name === 'badcli') {
        return Promise.resolve({
          role,
          error: 'No endpoints found that support tool use',
          processingTimeMs: 5,
          source: 'error',
          cli: name,
        } as AgentVoteResult);
      }
      return Promise.resolve(makeOkVote(role));
    };

    const results = await launchVotesWithOverallDeadline({
      roles: ['architect'],
      proposal: 'test',
      roleAdapters,
      fallbackAdapter: makeCliAdapter('goodcli'),
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results[0]?.source).toBe('llm'); // recovered via fallback
    expect(seen).toEqual(['badcli', 'goodcli']); // tried diverse, then fallback
  });

  it('does not retry when the failing adapter IS the fallback (no loop)', async () => {
    // architect uses the fallback directly; a failure must not re-invoke it.
    const fallback = makeCliAdapter('only');
    const seen: string[] = [];
    const voteFn = (
      role: VoterRole,
      _p: string,
      adapter: IModelAdapter
    ): Promise<AgentVoteResult> => {
      seen.push((adapter as { name?: string }).name ?? adapter.providerId);
      return Promise.resolve({
        role,
        error: 'No endpoints found that support tool use',
        processingTimeMs: 5,
        source: 'error',
        cli: 'only',
      } as AgentVoteResult);
    };

    const results = await launchVotesWithOverallDeadline({
      roles: ['architect'],
      proposal: 'test',
      roleAdapters: new Map([['architect', fallback]]),
      fallbackAdapter: fallback,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results[0]?.source).toBe('error');
    expect(seen).toEqual(['only']); // exactly one attempt — no fallback loop
  });
});

describe('cancellation stops launching further voters (#5393)', () => {
  const ROLES = ['architect', 'security', 'scope_steward'] as unknown as VoterRole[];

  function baseInput(
    voteFn: (role: VoterRole) => Promise<AgentVoteResult>
  ): Omit<Parameters<typeof launchVotesWithOverallDeadline>[0], 'signal'> {
    return {
      roles: ROLES,
      proposal: 'p',
      roleAdapters: new Map<VoterRole, IModelAdapter>(),
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 5_000, maxRetries: 0, allowSimulation: false },
      interDelay: 1,
      overallDeadlineMs: 10_000,
      voteFn,
    };
  }

  it('does not call the adapter for voters not yet launched', async () => {
    // The acceptance criterion: prove the REMAINING adapter calls do not
    // happen. Asserting only that the job status became `cancelled` would pass
    // against code that cancels the bookkeeping and keeps spending.
    const controller = new AbortController();
    const called: VoterRole[] = [];
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => {
      called.push(role);
      controller.abort(); // abort as soon as the first voter runs
      return Promise.resolve(makeOkVote(role));
    };

    const results = await launchVotesWithOverallDeadline({
      ...baseInput(voteFn),
      signal: controller.signal,
    });

    expect(called).toHaveLength(1);
    expect(results).toHaveLength(ROLES.length);
  });

  it('reports the un-launched voters as errors, never as approvals', async () => {
    // A cancelled voter that returned a default `approve` would manufacture
    // consensus out of work that never ran.
    const controller = new AbortController();
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => {
      controller.abort();
      return Promise.resolve(makeOkVote(role));
    };

    const results = await launchVotesWithOverallDeadline({
      ...baseInput(voteFn),
      signal: controller.signal,
    });

    const cancelled = results.filter((r) => r.source === 'error');
    expect(cancelled).toHaveLength(ROLES.length - 1);
    for (const r of cancelled) {
      expect(r.error).toContain('cancelled');
      expect(r.vote?.decision).not.toBe('approve');
    }
  });

  it('runs every voter when the signal never fires', async () => {
    // The empty case: no signal, or an un-aborted one, must change nothing.
    const called: VoterRole[] = [];
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => {
      called.push(role);
      return Promise.resolve(makeOkVote(role));
    };

    const withUnabortedSignal = await launchVotesWithOverallDeadline({
      ...baseInput(voteFn),
      signal: new AbortController().signal,
    });
    expect(called).toHaveLength(ROLES.length);
    expect(withUnabortedSignal.every((r) => r.source === 'llm')).toBe(true);

    called.length = 0;
    await launchVotesWithOverallDeadline(baseInput(voteFn));
    expect(called).toHaveLength(ROLES.length);
  });
});
