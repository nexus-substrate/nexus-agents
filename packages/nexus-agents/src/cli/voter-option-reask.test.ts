import { describe, expect, it, vi } from 'vitest';
import { type CompletionRequest, type IModelAdapter, type ILogger } from '../core/index.js';
import { ModelError } from '../core/index.js';
import { tallyOptions } from '../consensus/option-tally.js';
import { collectRealVotes, executeAgentVote } from './voter-agents.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';
import type { AgentVoteResult } from './vote-types.js';

const OPTIONS = ['split only', 'keep together'];
const FIRST = {
  decision: 'approve',
  reasoning: 'The split is justified by the artifact.',
  confidence: 0.8,
} satisfies AgentVoteResult['vote'];
const QUIET = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

function adapterFor(
  first: object,
  second: object | Error = { selectedOption: 'split only' }
): IModelAdapter {
  const answer = (value: object): unknown => ({
    ok: true,
    value: {
      content: JSON.stringify(value),
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      stopReason: 'end_turn',
    },
  });
  const complete = vi.fn().mockResolvedValueOnce(answer(first));
  if (second instanceof Error) complete.mockRejectedValue(second);
  else complete.mockResolvedValue(answer(second));
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: [],
    complete,
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

async function collect(
  adapter: IModelAdapter,
  options: { declaredOptions?: readonly string[] | undefined } = { declaredOptions: OPTIONS }
): Promise<AgentVoteResult> {
  const [seat] = await collectRealVotes({
    roles: ['architect'],
    proposal: 'Choose the implementation scope.',
    adapter,
    logger: QUIET,
    timeoutMs: 5_000,
    maxRetries: 2,
    interAgentDelayMs: 0,
    erroredRoleBackoffMs: 0,
    ...options,
  });
  if (seat === undefined) throw new Error('Expected the requested seat');
  return seat;
}

describe('bounded option re-ask (#4495)', () => {
  it.each([false, true])(
    're-asks the answering adapter with cross-CLI fallback %s',
    async (crossCli) => {
      const assigned = adapterFor({ selectedOption: 'split only' });
      const fallback = {
        ...adapterFor({ selectedOption: 'keep together' }),
        providerId: 'other-cli',
      };
      const [seat] = await launchVotesWithOverallDeadline({
        roles: ['architect'],
        proposal: 'Choose the scope.',
        roleAdapters: new Map([['architect', assigned]]),
        fallbackAdapter: fallback,
        logger: QUIET,
        voteOptions: {
          timeoutMs: 100,
          maxRetries: 0,
          allowSimulation: false,
          declaredOptions: OPTIONS,
        },
        interDelay: 0,
        overallDeadlineMs: 100,
        voteFn: (role, _proposal, adapter) =>
          Promise.resolve({
            role,
            vote: FIRST,
            processingTimeMs: 0,
            source: crossCli && adapter === assigned ? 'error' : 'llm',
            ...(crossCli && adapter === assigned ? { error: 'capacity exhausted' } : {}),
            // A primary CLI can also disclose substitution within its own model family.
            fallback: { fromCli: assigned.providerId, fromModel: 'test-alias', reason: 'capacity' },
          }),
      });
      expect(seat?.selectedOption).toBe(crossCli ? 'keep together' : 'split only');
      expect(assigned.complete).toHaveBeenCalledTimes(crossCli ? 0 : 1);
      expect(fallback.complete).toHaveBeenCalledTimes(crossCli ? 1 : 0);
    }
  );
  it('a hanging re-ask cannot cost a second seat on the same lane its verdict', async () => {
    vi.useFakeTimers();
    try {
      const adapter = adapterFor(FIRST);
      let firstPassCalls = 0;
      vi.mocked(adapter.complete)
        .mockReset()
        .mockImplementation((request) => {
          const reask = request.messages.some(
            (message) =>
              typeof message.content === 'string' &&
              message.content.includes('OPTION SELECTION RE-ASK')
          );
          if (reask) return new Promise(() => undefined);
          firstPassCalls += 1;
          return Promise.resolve({
            ok: true,
            value: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    firstPassCalls === 1
                      ? FIRST
                      : { ...FIRST, decision: 'reject', reasoning: 'A real second verdict.' }
                  ),
                },
              ],
              model: adapter.modelId,
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
              stopReason: 'end_turn',
            },
          });
        });
      const pending = launchVotesWithOverallDeadline({
        roles: ['architect', 'security'],
        proposal: 'Choose the scope.',
        roleAdapters: new Map(),
        fallbackAdapter: adapter,
        logger: QUIET,
        voteOptions: {
          timeoutMs: 100,
          maxRetries: 0,
          allowSimulation: false,
          declaredOptions: OPTIONS,
        },
        interDelay: 0,
        overallDeadlineMs: 50,
        voteFn: executeAgentVote,
      });
      await vi.advanceTimersByTimeAsync(50);
      const [first, second] = await pending;
      expect(second?.source).toBe('llm');
      expect(second?.vote).toMatchObject({
        decision: 'reject',
        reasoning: 'A real second verdict.',
      });
      expect(first?.vote).toMatchObject(FIRST);
      expect(first?.optionReask).toEqual({ resolved: false });
      expect(firstPassCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('preserves the received approval when the panel deadline expires during the re-ask', async () => {
    vi.useFakeTimers();
    try {
      const adapter = adapterFor(FIRST);
      vi.mocked(adapter.complete).mockImplementation(() => new Promise(() => undefined));
      const pending = launchVotesWithOverallDeadline({
        roles: ['architect'],
        proposal: 'Choose the scope.',
        roleAdapters: new Map(),
        fallbackAdapter: adapter,
        logger: QUIET,
        voteOptions: {
          timeoutMs: 100,
          maxRetries: 0,
          allowSimulation: false,
          ...{ declaredOptions: OPTIONS },
        },
        interDelay: 0,
        overallDeadlineMs: 50,
        voteFn: executeAgentVote,
      });
      await vi.advanceTimersByTimeAsync(50);
      const [seat] = await pending;
      expect(adapter.complete).toHaveBeenCalledTimes(2);
      expect(seat?.vote).toMatchObject(FIRST);
      expect(seat?.source).toBe('llm');
      expect(seat).toHaveProperty('optionReask', { resolved: false });
      expect(seat?.attemptTelemetry?.observableAttempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([undefined, 'not declared'])(
    're-ask resolves an approving seat with selection %s before tally',
    async (selectedOption) => {
      const adapter = adapterFor({ ...FIRST, selectedOption });
      const seat = await collect(adapter);
      expect(adapter.complete).toHaveBeenCalledTimes(2);
      expect(seat.selectedOption).toBe('split only');
      expect(seat.vote).toMatchObject({ ...FIRST, selectedOption: 'split only' });
      expect(seat).toHaveProperty('optionReask', { resolved: true });
      expect(
        tallyOptions(
          [
            {
              decision: seat.vote.decision,
              ...(seat.selectedOption !== undefined ? { selectedOption: seat.selectedOption } : {}),
            },
          ],
          OPTIONS
        )
      ).toMatchObject({ selectedCount: 1, unattributedApprovals: 0 });
      const request = vi.mocked(adapter.complete).mock.calls[1]?.[0] as CompletionRequest;
      const prompt = request.messages
        .map((message) => {
          if (typeof message.content !== 'string') throw new Error('Expected a text prompt');
          return message.content;
        })
        .join('\n');
      for (const option of OPTIONS) expect(prompt).toContain(option);
      expect(prompt).toContain(FIRST.reasoning);
      expect(seat.attemptUsage).toMatchObject({
        completions: 2,
        inputTokens: 20,
        outputTokens: 10,
      });
      expect(
        seat.attemptTelemetry?.events.map((event) => [event.attemptKind, event.outcome])
      ).toEqual([
        ['initial', 'final'],
        ['option_reask', 'parsed'],
      ]);
    }
  );

  it.each([{}, { selectedOption: 'not declared' }, { malformed: true }])(
    'unresolved re-ask %j retains credit-no-option without a loop',
    async (second) => {
      const adapter = adapterFor(FIRST, second);
      const seat = await collect(adapter);
      expect(adapter.complete).toHaveBeenCalledTimes(2);
      expect(seat.vote).toMatchObject(FIRST);
      expect(seat.selectedOption).toBeUndefined();
      expect(seat).toHaveProperty('optionReask', { resolved: false });
      expect(tallyOptions([{ decision: seat.vote.decision }], OPTIONS)).toMatchObject({
        approverCount: 1,
        selectedCount: 0,
        unattributedApprovals: 1,
      });
    }
  );

  it.each(['reject', 'abstain'])('%s seat is not re-asked', async (decision) => {
    const adapter = adapterFor({ ...FIRST, decision });
    const seat = await collect(adapter);
    expect(adapter.complete).toHaveBeenCalledTimes(1);
    expect(seat).not.toHaveProperty('optionReask');
  });

  it('already resolved selection is not re-asked or changed', async () => {
    const adapter = adapterFor({ ...FIRST, selectedOption: ' keep TOGETHER ' });
    const seat = await collect(adapter);
    expect(adapter.complete).toHaveBeenCalledTimes(1);
    expect(seat.selectedOption).toBe('keep together');
    expect(seat).not.toHaveProperty('optionReask');
  });

  it.each([
    { label: 'absent', options: undefined },
    { label: 'empty', options: [] },
  ])('no declared options ($label) means no re-ask', async ({ options }) => {
    const adapter = adapterFor(FIRST);
    const seat = await collect(adapter, { declaredOptions: options });
    expect(adapter.complete).toHaveBeenCalledTimes(1);
    expect(seat).not.toHaveProperty('optionReask');
  });

  it.each(['reject', 'abstain'])(
    'a returned %s leaves the re-ask unresolved and preserves approval',
    async (decision) => {
      const adapter = adapterFor(FIRST, {
        decision,
        reasoning: 'Changed my mind.',
        confidence: 0.1,
        selectedOption: 'split only',
      });
      const seat = await collect(adapter);
      expect(seat.vote).toMatchObject(FIRST);
      expect(seat.selectedOption).toBeUndefined();
      expect(seat.vote.selectedOption).toBeUndefined();
      expect(seat.optionReask).toEqual({ resolved: false });
      expect(adapter.complete).toHaveBeenCalledTimes(2);
    }
  );

  it('adapter error on re-ask is unresolved, not thrown or retried', async () => {
    const adapter = adapterFor(FIRST, new Error('adapter unavailable'));
    const seat = await collect(adapter);
    expect(adapter.complete).toHaveBeenCalledTimes(2);
    expect(seat.vote).toMatchObject(FIRST);
    expect(seat.source).toBe('llm');
    expect(seat).toHaveProperty('optionReask', { resolved: false });
  });

  it('structured-output adapter refusal is unresolved with no format fallback', async () => {
    const adapter = adapterFor(FIRST);
    vi.mocked(adapter.complete).mockResolvedValue({
      ok: false,
      error: new ModelError('No endpoints found that support tool use'),
    });
    const seat = await collect(adapter);
    expect(adapter.complete).toHaveBeenCalledTimes(2);
    expect(seat.vote).toMatchObject(FIRST);
    expect(seat).toHaveProperty('optionReask', { resolved: false });
  });

  it('cancelling an in-flight re-ask preserves the approval and records it unresolved', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const adapter = adapterFor(FIRST);
      vi.mocked(adapter.complete).mockImplementation(() => new Promise(() => undefined));
      const pending = collectRealVotes({
        roles: ['architect'],
        proposal: 'Choose the scope.',
        adapter,
        logger: QUIET,
        timeoutMs: 5_000,
        maxRetries: 0,
        interAgentDelayMs: 0,
        declaredOptions: OPTIONS,
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(adapter.complete).toHaveBeenCalledTimes(2);
      controller.abort();
      const [seat] = await pending;
      expect(seat?.vote).toMatchObject(FIRST);
      expect(seat).toHaveProperty('optionReask', { resolved: false });
      expect(adapter.complete).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
