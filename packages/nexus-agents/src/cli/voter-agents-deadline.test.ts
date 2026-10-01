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
import { describe, it, expect, vi } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';
import { ResilientAdapter } from '../adapters/resilient-adapter.js';

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
  it('aborts the underlying voter at the overall deadline without changing the error seat', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
      let signal: AbortSignal | undefined;
      const voteFn = (
        role: VoterRole,
        _proposal: string,
        _adapter: IModelAdapter,
        _logger: ILogger,
        options: { signal?: AbortSignal | undefined }
      ): Promise<AgentVoteResult> => {
        signal = options.signal;
        return new Promise((resolve) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              resolve(makeOkVote(role));
            },
            { once: true }
          );
        });
      };
      const pending = launchVotesWithOverallDeadline({
        roles: ['architect'],
        proposal: 'test',
        roleAdapters: new Map(),
        fallbackAdapter: stubAdapter,
        logger: silentLogger,
        voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
        interDelay: 0,
        overallDeadlineMs: 10,
        voteFn,
      });

      await vi.advanceTimersByTimeAsync(10);
      const results = await pending;

      expect(signal?.aborted).toBe(true);
      expect((signal?.reason as { name?: string } | undefined)?.name).toBe('TimeoutError');
      expect(results[0]?.source).toBe('error');
      expect(results[0]?.error).toBe('overall consensus deadline exceeded');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not abort a voter that settles before the overall deadline', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
      let signal: AbortSignal | undefined;
      const results = await launchVotesWithOverallDeadline({
        roles: ['architect'],
        proposal: 'test',
        roleAdapters: new Map(),
        fallbackAdapter: stubAdapter,
        logger: silentLogger,
        voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
        interDelay: 0,
        overallDeadlineMs: 10,
        voteFn: (role, _proposal, _adapter, _logger, options) => {
          signal = options.signal;
          return Promise.resolve(makeOkVote(role));
        },
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(results[0]?.source).toBe('llm');
      expect(signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves the caller cancellation reason on the voter signal', async () => {
    const controller = new AbortController();
    let started: (() => void) | undefined;
    const voterStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let observedReason: unknown;
    const pending = launchVotesWithOverallDeadline({
      roles: ['architect'],
      proposal: 'test',
      roleAdapters: new Map(),
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      signal: controller.signal,
      voteFn: (role, _proposal, _adapter, _logger, options) =>
        new Promise((resolve) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              observedReason = options.signal?.reason;
              resolve({ ...makeOkVote(role), source: 'error', error: 'caller cancelled' });
            },
            { once: true }
          );
          started?.();
        }),
    });

    await voterStarted;
    controller.abort('operator cancel');
    const results = await pending;

    expect(observedReason).toBe('operator cancel');
    expect(results[0]?.source).toBe('error');
    expect(results[0]?.error).toBe('caller cancelled');
  });

  it('does not call a staggered voter after the shared absolute deadline', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
      const voteFn = vi.fn((role: VoterRole) => Promise.resolve(makeOkVote(role)));
      const pending = launchVotesWithOverallDeadline({
        roles: ['architect', 'security'],
        proposal: 'test',
        roleAdapters: new Map(),
        fallbackAdapter: stubAdapter,
        logger: silentLogger,
        voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
        interDelay: 20,
        overallDeadlineMs: 1_000,
        deadlineAtMs: Date.now() + 10,
        voteFn,
      });

      await vi.advanceTimersByTimeAsync(10);
      const results = await pending;

      expect(voteFn).toHaveBeenCalledTimes(1);
      expect(voteFn.mock.calls[0]?.[0]).toBe('architect');
      expect(results[1]?.source).toBe('error');
      expect(results[1]?.error).toBe('overall consensus deadline exceeded');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call a voter queued behind a stuck same-CLI seat after expiry', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
      const voteFn = vi.fn((role: VoterRole): Promise<AgentVoteResult> => {
        if (role === 'architect') return new Promise(() => undefined);
        return Promise.resolve(makeOkVote(role));
      });
      const pending = launchVotesWithOverallDeadline({
        roles: ['architect', 'security'],
        proposal: 'test',
        roleAdapters: new Map(),
        fallbackAdapter: stubAdapter,
        logger: silentLogger,
        voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
        interDelay: 0,
        overallDeadlineMs: 100,
        deadlineAtMs: Date.now() + 10,
        voteFn,
      });

      await vi.advanceTimersByTimeAsync(10);
      const results = await pending;

      expect(voteFn).toHaveBeenCalledTimes(1);
      expect(results.map((r) => r.source)).toEqual(['error', 'error']);
      expect(results[1]?.error).toBe('overall consensus deadline exceeded');
    } finally {
      vi.useRealTimers();
    }
  });

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
      // Keep the stuck seat off the other roles' serialized CLI lane: those
      // roles really can finish before the shared deadline.
      roleAdapters: new Map([['security', makeCliAdapter('security-cli')]]),
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

  it('reports each seat as it settles via onVoteCollected (#6162 heartbeat seam)', async () => {
    // The async-job liveness reaper measures silence between heartbeats; a
    // vote body's unit of progress is one seat settling. The launcher is the
    // one place every seat — first pass, fallback, retry — passes through.
    const roles: readonly VoterRole[] = ['architect', 'security', 'pm'];
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => Promise.resolve(makeOkVote(role));
    const collected: VoterRole[] = [];

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
      onVoteCollected: (vote) => {
        collected.push(vote.role);
      },
    });

    expect(results).toHaveLength(3);
    expect([...collected].sort()).toEqual([...roles].sort());
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

  // #6821: the failed primary's settled completions were billed; a seat that
  // fell over must not drop them when the fallback answers.
  it('a fallback seat keeps the attempt usage of the primary it fell over from', async () => {
    const roleAdapters = new Map<VoterRole, IModelAdapter>([
      ['architect', makeCliAdapter('badcli')],
    ]);
    const voteFn = (
      role: VoterRole,
      _p: string,
      adapter: IModelAdapter
    ): Promise<AgentVoteResult> => {
      const name = (adapter as { name?: string }).name ?? adapter.providerId;
      if (name === 'badcli') {
        return Promise.resolve({
          role,
          vote: { decision: 'abstain', confidence: 0, reasoning: '[Error] parse' },
          error: 'Vote parsing failed: no JSON',
          processingTimeMs: 5,
          source: 'error',
          cli: name,
          attemptUsage: { completions: 2, reportedCompletions: 1, inputTokens: 500 },
        });
      }
      return Promise.resolve({
        ...makeOkVote(role),
        inputTokens: 40,
        outputTokens: 10,
        attemptUsage: {
          completions: 1,
          reportedCompletions: 1,
          inputTokens: 40,
          outputTokens: 10,
        },
      });
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

    expect(results[0]?.source).toBe('llm');
    // The answering completion's own usage is unchanged …
    expect(results[0]?.inputTokens).toBe(40);
    // … and the seat's attempt usage now includes the primary's.
    expect(results[0]?.attemptUsage).toEqual({
      completions: 3,
      reportedCompletions: 2,
      inputTokens: 540,
      outputTokens: 10,
    });
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

describe('per-CLI lane width (#6103)', () => {
  const laneTest = async (
    cliName: string,
    roles: readonly VoterRole[]
  ): Promise<{ max: number; results: readonly AgentVoteResult[] }> => {
    const roleAdapters = new Map<VoterRole, IModelAdapter>(
      roles.map((r) => [r, makeCliAdapter(cliName)] as const)
    );
    let inFlight = 0;
    let max = 0;
    const voteFn = async (role: VoterRole): Promise<AgentVoteResult> => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
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
    return { max, results };
  };

  it('the claude lane admits two seats at once — the measured #6103 queue was all claude, and the #3348 race did not reproduce under a 3-way probe', async () => {
    const { max, results } = await laneTest('cli-claude', ['architect', 'security', 'devex', 'pm']);
    expect(results.every((r) => r.source === 'llm')).toBe(true);
    expect(max).toBe(2);
  });

  it('every other CLI keeps a lane of one (the #3348 serialization)', async () => {
    for (const cli of ['gemini', 'codex', 'cli-opencode']) {
      const { max } = await laneTest(cli, ['architect', 'security', 'devex']);
      expect(max, cli).toBe(1);
    }
  });

  it('a lane never exceeds its width even when a seat rejects', async () => {
    const roleAdapters = new Map<VoterRole, IModelAdapter>(
      (['architect', 'security', 'devex', 'pm'] as const).map(
        (r) => [r, makeCliAdapter('cli-claude')] as const
      )
    );
    let inFlight = 0;
    let max = 0;
    let n = 0;
    const voteFn = async (role: VoterRole): Promise<AgentVoteResult> => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      n += 1;
      if (n % 2 === 0) throw new Error('seat blew up');
      return makeOkVote(role);
    };
    const results = await launchVotesWithOverallDeadline({
      roles: ['architect', 'security', 'devex', 'pm'],
      proposal: 'test',
      roleAdapters,
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    }).catch(() => []);
    expect(max).toBeLessThanOrEqual(2);
    expect(results.length === 0 || results.length === 4).toBe(true);
  });
});

describe('per-seat timing (#6103)', () => {
  it('records how long each seat QUEUED behind its CLI lane and how long it RAN, per attempt', async () => {
    // Two seats on the same CLI: the second queues behind the first (#3348),
    // and the record must say so — the queue wait is the quantity #6103 asks
    // to measure before choosing a fallback lane.
    const roleAdapters = new Map<VoterRole, IModelAdapter>([
      ['architect', makeCliAdapter('claude')],
      ['security', makeCliAdapter('claude')],
    ]);
    const voteFn = async (role: VoterRole): Promise<AgentVoteResult> => {
      await new Promise((r) => setTimeout(r, 40));
      return makeOkVote(role);
    };
    const results = await launchVotesWithOverallDeadline({
      roles: ['architect', 'security'],
      proposal: 'test',
      roleAdapters,
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });
    const first = results[0]?.timing;
    const second = results[1]?.timing;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) throw new Error('unreachable');
    expect(first.attempts).toHaveLength(1);
    expect(first.attempts[0]?.cli).toBe('claude');
    expect(first.attempts[0]?.ranMs).toBeGreaterThanOrEqual(35);
    // The second seat waited for the first one's run before its own started.
    expect(second.attempts[0]?.queuedMs).toBeGreaterThanOrEqual(35);
    expect(second.attempts[0]?.ranMs).toBeGreaterThanOrEqual(35);
  });

  it('a fallback seat carries BOTH attempts: the failed primary and the queued fallback', async () => {
    const roleAdapters = new Map<VoterRole, IModelAdapter>([
      ['architect', makeCliAdapter('badcli')],
      ['security', makeCliAdapter('goodcli')],
    ]);
    const voteFn = async (
      role: VoterRole,
      _p: string,
      adapter: IModelAdapter
    ): Promise<AgentVoteResult> => {
      const name = (adapter as { name?: string }).name ?? adapter.providerId;
      if (name === 'badcli') {
        return {
          role,
          error: 'No endpoints found that support tool use',
          processingTimeMs: 5,
          source: 'error',
          cli: name,
        } as AgentVoteResult;
      }
      await new Promise((r) => setTimeout(r, 40));
      return makeOkVote(role);
    };
    const results = await launchVotesWithOverallDeadline({
      roles: ['architect', 'security'],
      proposal: 'test',
      roleAdapters,
      fallbackAdapter: makeCliAdapter('goodcli'),
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });
    const architect = results[0]?.timing;
    expect(architect?.attempts.map((a) => [a.cli, a.fallback])).toEqual([
      ['badcli', false],
      ['goodcli', true],
    ]);
    // The fallback attempt queued behind security's run on goodcli (#6103's
    // observation: a fallback seat waits behind the primary seats of that CLI).
    expect(architect?.attempts[1]?.queuedMs).toBeGreaterThanOrEqual(0);
  });

  it('an errored seat with no attempt has an empty attempts list, not a fabricated timing', async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await launchVotesWithOverallDeadline({
      roles: ['architect'],
      proposal: 'test',
      roleAdapters: new Map(),
      fallbackAdapter: stubAdapter,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn: () => Promise.resolve(makeOkVote('architect')),
      signal: controller.signal,
    });
    expect(results[0]?.source).toBe('error');
    expect(results[0]?.timing?.attempts ?? []).toEqual([]);
  });
});

describe('undetected seat still falls over (#6119)', () => {
  // Fixture from the #6115 investigation: scope_steward was pinned to codex via
  // the registry, codex never detected (codex-cli 0.154 has no `mcp-server`),
  // and the seat errored "No model adapter available". Both the seat and the
  // fallback were undetected ResilientAdapters, so both keyed as
  // `resilient-proxy` — equal keys read as "already on the fallback", and the
  // #3587 fallover never ran. The seat must be keyed by the CLI it REQUESTED.
  it('retries an undetected codex seat on the fallback adapter exactly once', async () => {
    const seat = new ResilientAdapter({ preferredCli: 'codex', logger: silentLogger });
    const fallback = new ResilientAdapter({ logger: silentLogger });
    const seen: string[] = [];
    const voteFn = (
      role: VoterRole,
      _p: string,
      adapter: IModelAdapter
    ): Promise<AgentVoteResult> => {
      seen.push(adapter.providerId);
      if (adapter === seat) {
        return Promise.resolve({
          role,
          error: 'No model adapter available',
          processingTimeMs: 5,
          source: 'error',
        } as AgentVoteResult);
      }
      return Promise.resolve(makeOkVote(role));
    };

    const results = await launchVotesWithOverallDeadline({
      roles: ['scope_steward'],
      proposal: 'test',
      roleAdapters: new Map([['scope_steward', seat]]),
      fallbackAdapter: fallback,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results[0]?.source).toBe('llm');
    expect(seen).toEqual(['cli-codex', 'resilient-proxy']);
  });

  it('still does not fall over from the fallback to itself', async () => {
    const fallback = new ResilientAdapter({ logger: silentLogger });
    let calls = 0;
    const voteFn = (role: VoterRole): Promise<AgentVoteResult> => {
      calls++;
      return Promise.resolve({
        role,
        error: 'No model adapter available',
        processingTimeMs: 5,
        source: 'error',
      } as AgentVoteResult);
    };

    const results = await launchVotesWithOverallDeadline({
      roles: ['scope_steward'],
      proposal: 'test',
      roleAdapters: new Map([['scope_steward', fallback]]),
      fallbackAdapter: fallback,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn,
    });

    expect(results[0]?.source).toBe('error');
    expect(calls).toBe(1);
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

describe('fallover disclosure (#6115)', () => {
  // Fixture from the #6115 investigation: three claude seats fell over to the
  // gemini fallback during a claude capacity window, and the result said
  // nothing about the assignment or the cause. Uses the #3587 harness.
  function erroredOn(role: VoterRole, name: string, error: string): AgentVoteResult {
    return {
      role,
      vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
      error,
      processingTimeMs: 5,
      source: 'error',
      cli: name,
    };
  }

  async function launchOne(
    role: VoterRole,
    seat: IModelAdapter,
    fallback: IModelAdapter,
    error: string
  ): Promise<AgentVoteResult | undefined> {
    const results = await launchVotesWithOverallDeadline({
      roles: [role],
      proposal: 'test',
      roleAdapters: new Map([[role, seat]]),
      fallbackAdapter: fallback,
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn: (r, _p, adapter) => {
        const name = (adapter as { name?: string }).name ?? adapter.providerId;
        return Promise.resolve(
          adapter === seat
            ? erroredOn(r, name, error)
            : { ...makeOkVote(r), cli: name, model: 'gemini-3.1-pro' }
        );
      },
    });
    return results[0];
  }

  it('a seat that fell over carries assignedCli and fallback { fromCli, fromModel, reason }', async () => {
    const result = await launchOne(
      'devex',
      makeCliAdapter('cli-claude'),
      makeCliAdapter('cli-gemini'),
      "You're out of usage credits. Switch to another model, or manage usage credits."
    );
    expect(result?.source).toBe('llm');
    expect(result?.assignedCli).toBe('claude');
    expect(result?.fallback).toEqual({
      fromCli: 'claude',
      fromModel: 'cli-claude',
      reason: 'capacity',
    });
  });

  it('classifies a rate-limit fallover as rate-limit and an auth one as auth', async () => {
    const rateLimited = await launchOne(
      'architect',
      makeCliAdapter('codex'),
      makeCliAdapter('gemini'),
      'HTTP 429 Too Many Requests: rate limit exceeded'
    );
    expect(rateLimited?.fallback?.reason).toBe('rate-limit');
    const auth = await launchOne(
      'architect',
      makeCliAdapter('codex'),
      makeCliAdapter('gemini'),
      'Not logged in. Please run /login'
    );
    expect(auth?.fallback?.reason).toBe('auth');
  });

  it('a seat that answered where it was assigned carries assignedCli and no fallback', async () => {
    const seat = makeCliAdapter('gemini');
    const results = await launchVotesWithOverallDeadline({
      roles: ['security'],
      proposal: 'test',
      roleAdapters: new Map([['security', seat]]),
      fallbackAdapter: makeCliAdapter('claude'),
      logger: silentLogger,
      voteOptions: { timeoutMs: 1_000, maxRetries: 0, allowSimulation: false },
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteFn: (r) => Promise.resolve(makeOkVote(r)),
    });
    expect(results[0]?.assignedCli).toBe('gemini');
    expect(results[0]?.fallback).toBeUndefined();
  });

  it('an undetected seat (pending-detection) discloses no fromModel', async () => {
    const seat = new ResilientAdapter({ preferredCli: 'codex', logger: silentLogger });
    const fallback = new ResilientAdapter({ logger: silentLogger });
    const result = await launchOne('scope_steward', seat, fallback, 'No model adapter available');
    expect(result?.assignedCli).toBe('codex');
    expect(result?.fallback).toEqual({ fromCli: 'codex', reason: 'unknown' });
  });
});
