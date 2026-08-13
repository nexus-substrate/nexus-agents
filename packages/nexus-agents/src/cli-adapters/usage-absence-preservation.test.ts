/**
 * Absence of vendor usage must survive to the measurement layer (#4439).
 *
 * `CliToModelAdapter.toCompletionResponse` built usage as
 * `response.usage?.inputTokens ?? 0`, turning "the CLI reported nothing" into
 * a present `0/0/0`. Downstream that is indistinguishable from a real
 * zero-token call, which silently defeated #4436's measured-voter gate on
 * every live vote: the probe showed a fabricated-zero voter certifying as
 * `unmeasured: false, measuredVoters: 1`.
 *
 * Three sibling producers did the same thing (`openai-mappers`,
 * `gemini-adapter`, and the reverse `model-to-cli` bridge), so fixing only the
 * one on the path I happened to trace would have relocated the lie rather than
 * removed it — the point the contrarian voter made on the #4439 panel.
 *
 * @module cli-adapters/usage-absence-preservation.test
 */

import { describe, it, expect, vi } from 'vitest';
import { rollupDecisionCost } from '../observability/decision-cost.js';
import { mapResponseUsage } from '../adapters/openai-mappers.js';
import { CliToModelAdapter } from './cli-to-model-adapter.js';

function makeCli(cliUsage?: Record<string, number>): unknown {
  return {
    name: 'claude',
    transport: 'stdio' as const,
    capabilities: { reasoning: 9, contextWindow: 200_000, codeGeneration: 9, speed: 7, cost: 5 },
    execute: vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        value: {
          text: 'hi',
          model: 'claude-sonnet-4-6',
          ...(cliUsage !== undefined ? { usage: cliUsage } : {}),
        },
      })
    ),
    getModelInfo: vi.fn().mockReturnValue({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
    healthCheck: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: undefined })),
    initialize: vi.fn().mockImplementation(() => Promise.resolve()),
    dispose: vi.fn().mockImplementation(() => Promise.resolve()),
  };
}

describe('CLI→model bridge preserves usage absence (#4439)', () => {
  it('omits usage entirely when the CLI reported none', async () => {
    const adapter = new CliToModelAdapter(makeCli() as never);

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'x' }] });

    expect(result.ok).toBe(true);
    // Previously this was a fabricated { inputTokens: 0, outputTokens: 0,
    // totalTokens: 0 } — a measurement the CLI never made.
    expect(result.ok && result.value.usage).toBeUndefined();
  });

  it('passes reported counts through, including the cache fields', async () => {
    const adapter = new CliToModelAdapter(
      makeCli({
        inputTokens: 2,
        outputTokens: 500,
        totalTokens: 502,
        cachedInputTokens: 3980,
        cacheCreationInputTokens: 4000,
      }) as never
    );

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'x' }] });

    expect(result.ok && result.value.usage?.inputTokens).toBe(2);
    // #4438 stopped the parser discarding these; #4439 stops the bridge doing it.
    expect(result.ok && result.value.usage?.cachedInputTokens).toBe(3980);
    expect(result.ok && result.value.usage?.cacheCreationInputTokens).toBe(4000);
  });

  it('keeps a genuine zero-token report distinct from absence', () => {
    // The distinction the whole change exists to protect.
    const reported = rollupDecisionCost(
      [{ role: 'a', model: 'm', inputTokens: 0, outputTokens: 0, costUsd: 0 }],
      'plan'
    );
    const absent = rollupDecisionCost([{ role: 'a', model: 'm', costUsd: 0 }], 'plan');

    expect(reported.perVoter[0]?.unmeasured).toBe(false);
    expect(absent.perVoter[0]?.unmeasured).toBe(true);
  });
});

describe('OpenAI mapper preserves usage absence (#4439)', () => {
  it('returns undefined when the vendor omitted the usage block', () => {
    expect(mapResponseUsage({ model: 'gpt' } as never)).toBeUndefined();
  });

  it('maps reported counts, including cached prompt tokens', () => {
    const out = mapResponseUsage({
      model: 'gpt',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 80 },
      },
    } as never);

    expect(out?.inputTokens).toBe(100);
    expect(out?.cachedInputTokens).toBe(80);
  });

  it('omits the cache field when the vendor did not report it', () => {
    const out = mapResponseUsage({
      model: 'gpt',
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    } as never);

    expect(out?.cachedInputTokens).toBeUndefined();
  });
});
