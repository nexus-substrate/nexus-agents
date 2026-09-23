/**
 * OpenAI-compat response fidelity (#6607).
 *
 * Each test asserts the NON-SUCCESS signal or the COMPLETE payload: a refusal,
 * an empty `choices` array or a reasoning-exhausted reply must never come back
 * as a successful empty answer, and multi-part tool traffic must arrive whole.
 */

/* eslint-disable @typescript-eslint/require-await */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamChunk } from '../core/index.js';

const mocks = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', async () => {
  const actual = await vi.importActual<typeof import('openai')>('openai');
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mocks.mockCreate } };
    },
    APIError: actual.APIError,
  };
});

import { OpenAIAdapter } from './openai-adapter.js';

const API_KEY = 'test-api-key-12345';

function textChoice(content: string, finishReason: string): unknown {
  return {
    choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    model: 'served-model',
  };
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('refusals are errors, not empty answers (#6607 item 1)', () => {
  it('a content_filter finish returns an error naming the refusal', async () => {
    // Partial text before the filter fired: still not an answer.
    mockCreateOnce(textChoice('The first half of an ans', 'content_filter'));
    const adapter = new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY });

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context?.['reason']).toBe('content_filter');
      expect(result.error.message).toContain('content filter');
    }
  });

  it('an empty choices array returns an error, not a normal finish with empty text', async () => {
    mockCreateOnce({ choices: [], model: 'served-model' });
    const adapter = new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY });

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context?.['reason']).toBe('no_choices');
    }
  });

  it('a streamed content_filter finish errors the stream', async () => {
    async function* gen(): AsyncGenerator {
      yield {
        model: 'served-model',
        choices: [{ index: 0, delta: { content: 'Par' }, finish_reason: null }],
      };
      yield {
        model: 'served-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }],
      };
    }
    mocks.mockCreate.mockResolvedValueOnce(gen());
    const adapter = new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY });

    await expect(
      collect(adapter.stream({ messages: [{ role: 'user', content: 'q' }] }))
    ).rejects.toThrow(/content filter/);
  });
});

describe('every parallel tool result is sent (#6607 item 2)', () => {
  it('sends one tool message per tool_result block, in order', async () => {
    mockCreateOnce(textChoice('done', 'stop'));
    const adapter = new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY });

    await adapter.complete({
      messages: [
        { role: 'user', content: 'weather in two cities' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_a', name: 'weather', input: { city: 'Oslo' } },
            { type: 'tool_use', id: 'call_b', name: 'weather', input: { city: 'Lima' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_a', content: 'Oslo: 4C' },
            { type: 'tool_result', tool_use_id: 'call_b', content: 'Lima: 19C' },
          ],
        },
      ],
    });

    const sent = (mocks.mockCreate.mock.calls[0]?.[0] as { messages: unknown[] }).messages;
    expect(sent.slice(2)).toEqual([
      { role: 'tool', tool_call_id: 'call_a', content: 'Oslo: 4C' },
      { role: 'tool', tool_call_id: 'call_b', content: 'Lima: 19C' },
    ]);
  });
});

describe('streamed tool calls keep their arguments (#6607 item 3)', () => {
  it('reassembles argument fragments into the tool_use input', async () => {
    // Mid-stream chunks carry `finish_reason: null`, as on the wire.
    const midStream = (toolCall: unknown): unknown => ({
      model: 'served-model',
      choices: [{ index: 0, delta: { tool_calls: [toolCall] }, finish_reason: null }],
    });
    async function* gen(): AsyncGenerator {
      yield midStream({
        index: 0,
        id: 'call_z',
        type: 'function',
        function: { name: 'lookup', arguments: '' },
      });
      yield midStream({ index: 0, function: { arguments: '{"que' } });
      yield midStream({ index: 0, function: { arguments: 'ry":"tide tables"}' } });
      yield {
        model: 'served-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      };
    }
    mocks.mockCreate.mockResolvedValueOnce(gen());
    const adapter = new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY });

    const chunks = await collect(adapter.stream({ messages: [{ role: 'user', content: 'q' }] }));

    const starts = chunks.filter(
      (c) => c.type === 'content_block_start' && c.contentBlock.type === 'tool_use'
    );
    expect(starts).toEqual([
      {
        type: 'content_block_start',
        index: 0,
        contentBlock: {
          type: 'tool_use',
          id: 'call_z',
          name: 'lookup',
          input: { query: 'tide tables' },
        },
      },
    ]);
  });
});

describe('a reasoning model that spends its budget on reasoning (#6607 item 4)', () => {
  it('reports empty text with finish length as truncated-by-reasoning', async () => {
    mockCreateOnce({
      choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
      usage: {
        prompt_tokens: 30,
        completion_tokens: 4096,
        total_tokens: 4126,
        completion_tokens_details: { reasoning_tokens: 4096 },
      },
      model: 'served-reasoner',
    });
    const adapter = new OpenAIAdapter({ modelId: 'o3', apiKey: API_KEY });

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context?.['reason']).toBe('reasoning_truncated');
      expect(result.error.context?.['reasoningTokens']).toBe(4096);
    }
  });

  it('keeps a non-reasoning empty length finish as an ordinary truncation', async () => {
    mockCreateOnce(textChoice('', 'length'));
    const adapter = new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY });

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stopReason).toBe('max_tokens');
  });

  it('gives reasoning families a larger default completion budget', async () => {
    mockCreateOnce(textChoice('ok', 'stop'));
    mockCreateOnce(textChoice('ok', 'stop'));

    await new OpenAIAdapter({ modelId: 'o3', apiKey: API_KEY }).complete({
      messages: [{ role: 'user', content: 'q' }],
    });
    await new OpenAIAdapter({ modelId: 'gpt-4o', apiKey: API_KEY }).complete({
      messages: [{ role: 'user', content: 'q' }],
    });

    const budgets = mocks.mockCreate.mock.calls.map(
      (c) => (c[0] as { max_completion_tokens: number }).max_completion_tokens
    );
    expect(budgets).toEqual([25_000, 4096]);
  });
});

function mockCreateOnce(response: unknown): void {
  mocks.mockCreate.mockResolvedValueOnce(response);
}
