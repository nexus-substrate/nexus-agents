/** Supplementary selections wait for the final panel, including recovered seats (#4495). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelError,
  type CompletionRequest,
  type CompletionResponse,
  type IModelAdapter,
  type ILogger,
} from '../core/index.js';
import { collectRealVotes } from './voter-agents.js';
import type { AgentVoteResult } from './vote-types.js';

const OPTIONS = ['split only', 'keep together'];
const APPROVAL = {
  decision: 'approve',
  confidence: 0.8,
  reasoning: 'The artifact supports approval.',
};
const TIMEOUT_MS = 120_000;
// The late first-pass error leaves less than a full selection timeout in the panel budget.
const LATE_ERROR_MS = 90_000;
// One verdict timeout plus the overall deadline buffer, with no retries or stagger.
const PANEL_MS = 180_000;
const QUIET = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

function answer(value: object): { ok: true; value: CompletionResponse } {
  return {
    ok: true,
    value: {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      stopReason: 'end_turn',
    },
  };
}

function panelAdapter(hanging: boolean, order: string[]): IModelAdapter {
  let verdictCalls = 0;
  let reaskCalls = 0;
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: [],
    complete: vi.fn().mockImplementation((request: CompletionRequest) => {
      const reask = request.messages.some(
        (message) =>
          typeof message.content === 'string' && message.content.includes('OPTION SELECTION RE-ASK')
      );
      if (reask) {
        order.push(`reask ${String(++reaskCalls)}`);
        if (hanging) return new Promise(() => undefined);
        return Promise.resolve(answer({ selectedOption: OPTIONS[0] }));
      }
      order.push(`verdict ${String(++verdictCalls)}`);
      if (verdictCalls === 2) {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve({
              ok: false,
              error: new ModelError('Temporary capacity failure', { retryable: true }),
            });
          }, LATE_ERROR_MS)
        );
      }
      return Promise.resolve(
        answer(
          verdictCalls === 3 && hanging
            ? { ...APPROVAL, decision: 'reject', reasoning: 'A real recovered verdict.' }
            : APPROVAL
        )
      );
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

function collect(adapter: IModelAdapter): Promise<readonly AgentVoteResult[]> {
  return collectRealVotes({
    roles: ['architect', 'security'],
    proposal: 'Choose the implementation scope.',
    adapter,
    logger: QUIET,
    timeoutMs: TIMEOUT_MS,
    maxRetries: 0,
    interAgentDelayMs: 0,
    erroredRoleBackoffMs: 0,
    declaredOptions: OPTIONS,
  });
}

describe('option re-asks after the errored-role retry (#4495)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a hanging re-ask cannot spend the retry window of a recoverable seat', async () => {
    const order: string[] = [];
    const adapter = panelAdapter(true, order);
    const pending = collect(adapter);
    await vi.advanceTimersByTimeAsync(PANEL_MS);
    const [first, recovered] = await pending;

    expect(recovered).toMatchObject({
      source: 'llm',
      retried: true,
      vote: { decision: 'reject', reasoning: 'A real recovered verdict.' },
    });
    expect(first).toMatchObject({
      source: 'llm',
      vote: APPROVAL,
      optionReask: { resolved: false },
    });
    expect(first?.selectedOption).toBeUndefined();
    expect(order).toEqual(['verdict 1', 'verdict 2', 'verdict 3', 'reask 1']);
  });

  it('re-asks final approving seats once, including a recovered seat', async () => {
    const order: string[] = [];
    const adapter = panelAdapter(false, order);
    const pending = collect(adapter);
    await vi.advanceTimersByTimeAsync(PANEL_MS);
    const [first, recovered] = await pending;

    expect(first).toMatchObject({ selectedOption: OPTIONS[0], optionReask: { resolved: true } });
    expect(recovered).toMatchObject({
      source: 'llm',
      retried: true,
      selectedOption: OPTIONS[0],
      optionReask: { resolved: true },
    });
    expect(order).toEqual(['verdict 1', 'verdict 2', 'verdict 3', 'reask 1', 'reask 2']);
    expect(recovered?.attemptTelemetry?.events.at(-1)).toMatchObject({
      attemptKind: 'option_reask',
      withinRoleRetry: true,
      outcome: 'parsed',
    });
  });
});
