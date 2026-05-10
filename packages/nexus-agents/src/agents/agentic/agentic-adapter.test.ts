/**
 * Tests for `AgenticAdapter`. Mocks `IModelAdapter.complete` via vi.fn
 * so no real provider API calls happen in CI.
 */
import { describe, it, expect, vi } from 'vitest';

import { ok, err, ModelError } from '../../core/index.js';
import type { CompletionResponse, ContentBlock, IModelAdapter } from '../../core/index.js';

import { AgenticAdapter } from './agentic-adapter.js';
import { createAgenticAdapter } from './factory.js';
import type { ToolCall, ToolResult } from './types.js';

function makeMockModel(
  responses: readonly Partial<CompletionResponse>[],
  providerId = 'anthropic',
  modelId = 'claude-mock'
): IModelAdapter {
  let callIndex = 0;
  const complete = vi.fn(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex += 1;
    return Promise.resolve(
      ok({
        content: response?.content ?? [{ type: 'text', text: 'no-op' }],
        usage: response?.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        stopReason: response?.stopReason ?? 'end_turn',
        model: modelId,
      })
    );
  });
  return {
    providerId,
    modelId,
    capabilities: [],
    complete: complete,
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  };
}

const TOOLS = [
  {
    name: 'lookup',
    description: 'look up a thing',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
  },
];

describe('AgenticAdapter', () => {
  it('agent-stopped: model returns no tool_use → loop ends after one model call', async () => {
    const model = makeMockModel([
      { content: [{ type: 'text', text: 'I cannot help.' }], stopReason: 'end_turn' },
    ]);
    const adapter = new AgenticAdapter(model);
    const result = await adapter.runAgent({
      systemPrompt: 'be helpful',
      userPrompt: 'q',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: () => Promise.resolve({ content: '' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('agent-stopped');
    expect(result.value.turnsUsed).toBe(0);
    expect(result.value.finalContent).toBe('I cannot help.');
  });

  it('runs the tool-call loop until model stops', async () => {
    const model = makeMockModel([
      // Turn 1: model emits a tool_use
      {
        content: [
          { type: 'tool_use', id: 'tu-1', name: 'lookup', input: { id: 'x' } },
        ] as ContentBlock[],
        stopReason: 'tool_use',
      },
      // Turn 2: model emits another tool_use after seeing the result
      {
        content: [
          { type: 'tool_use', id: 'tu-2', name: 'lookup', input: { id: 'y' } },
        ] as ContentBlock[],
        stopReason: 'tool_use',
      },
      // Turn 3: model gives a final text response
      { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' },
    ]);
    const adapter = new AgenticAdapter(model);
    const observedTurns: number[] = [];
    const result = await adapter.runAgent({
      systemPrompt: 'be helpful',
      userPrompt: 'q',
      tools: TOOLS,
      turnBudget: 10,
      onToolCall: (call: ToolCall) =>
        Promise.resolve({ content: `result for ${String(call.arguments['id'])}` }),
      onTurn: (t) => observedTurns.push(t.turnIndex),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('agent-stopped');
    expect(result.value.turnsUsed).toBe(2);
    expect(observedTurns).toEqual([0, 1]);
    expect(result.value.finalContent).toBe('done');
    expect(result.value.providerId).toBe('anthropic');
    expect(result.value.adapterStrategy).toBe('native:anthropic');
    expect(result.value.totalInputTokens).toBe(30); // 3 calls * 10
    expect(result.value.totalOutputTokens).toBe(15); // 3 calls * 5
  });

  it('turn-budget: hits the budget before the model stops', async () => {
    // Endless loop — model keeps emitting tool_use forever.
    const model = makeMockModel([
      {
        content: [{ type: 'tool_use', id: 'tu', name: 'lookup', input: {} }] as ContentBlock[],
        stopReason: 'tool_use',
      },
    ]);
    const adapter = new AgenticAdapter(model);
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 3,
      onToolCall: () => Promise.resolve({ content: 'ok' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('turn-budget');
    expect(result.value.turnsUsed).toBe(3);
  });

  it('tool-error: onToolCall throw is captured + loop stops', async () => {
    const model = makeMockModel([
      {
        content: [{ type: 'tool_use', id: 'tu-1', name: 'lookup', input: {} }] as ContentBlock[],
        stopReason: 'tool_use',
      },
    ]);
    const adapter = new AgenticAdapter(model);
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: () => {
        throw new Error('database is down');
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('tool-error');
    expect(result.value.turns[0]?.toolResult.isError).toBe(true);
    expect(result.value.turns[0]?.toolResult.content).toContain('database is down');
  });

  it('cancelled: AbortSignal fires between turns → cancellation captured', async () => {
    const ac = new AbortController();
    const model = makeMockModel([
      {
        content: [{ type: 'tool_use', id: 'tu-1', name: 'lookup', input: {} }] as ContentBlock[],
        stopReason: 'tool_use',
      },
    ]);
    const adapter = new AgenticAdapter(model);
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: (): Promise<ToolResult> => {
        ac.abort();
        return Promise.resolve({ content: 'ok' });
      },
      signal: ac.signal,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('cancelled');
    expect(result.value.turnsUsed).toBe(1); // one tool call ran before cancel
  });

  it('returns Result.err when model.complete fails', async () => {
    const model: IModelAdapter = {
      providerId: 'anthropic',
      modelId: 'm',
      capabilities: [],
      complete: vi.fn(() => Promise.resolve(err(new ModelError('rate-limited')))),
      stream: (() => (async function* () {})()) as never,
      countTokens: () => Promise.resolve(0),
      validateConfig: () => ({ ok: true as const, value: undefined }),
    };
    const adapter = new AgenticAdapter(model);
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: () => Promise.resolve({ content: 'ok' }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Model call failed');
  });

  it('rejects turnBudget <= 0', async () => {
    const adapter = new AgenticAdapter(makeMockModel([{}]));
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 0,
      onToolCall: () => Promise.resolve({ content: '' }),
    });
    expect(result.ok).toBe(false);
  });

  it('handles multiple tool_use blocks in one assistant turn', async () => {
    const model = makeMockModel([
      {
        content: [
          { type: 'tool_use', id: 'a', name: 'lookup', input: { id: '1' } },
          { type: 'tool_use', id: 'b', name: 'lookup', input: { id: '2' } },
        ] as ContentBlock[],
        stopReason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' },
    ]);
    const adapter = new AgenticAdapter(model);
    const calls: string[] = [];
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 10,
      onToolCall: (call) => {
        calls.push(call.id);
        return Promise.resolve({ content: 'ok' });
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toEqual(['a', 'b']);
    expect(result.value.turnsUsed).toBe(2); // both tool calls counted
    expect(result.value.stopReason).toBe('agent-stopped');
  });

  it('passes systemPrompt + tools + temperature through to model.complete', async () => {
    const model = makeMockModel([
      { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' },
    ]);
    const adapter = new AgenticAdapter(model);
    await adapter.runAgent({
      systemPrompt: 'BE NICE',
      userPrompt: 'q',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: () => Promise.resolve({ content: '' }),
      temperature: 0.7,
      maxTokens: 1024,
    });
    const completeFn = model.complete as unknown as ReturnType<typeof vi.fn>;
    expect(completeFn).toHaveBeenCalledTimes(1);
    const firstCall = completeFn.mock.calls[0]?.[0] as {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: unknown[];
    };
    expect(firstCall.systemPrompt).toBe('BE NICE');
    expect(firstCall.temperature).toBe(0.7);
    expect(firstCall.maxTokens).toBe(1024);
    expect(firstCall.tools).toHaveLength(1);
  });

  it('adapterStrategy: known provider = native:<id>', () => {
    const adapter = new AgenticAdapter(makeMockModel([{}], 'openai', 'gpt-4o'));
    expect(adapter.adapterStrategy).toBe('native:openai');
  });

  it('adapterStrategy: unknown provider = wrapper', () => {
    const adapter = new AgenticAdapter(makeMockModel([{}], 'custom-vllm', 'mystery'));
    expect(adapter.adapterStrategy).toBe('wrapper');
  });

  it('factory createAgenticAdapter delegates to AgenticAdapter', () => {
    const adapter = createAgenticAdapter(makeMockModel([{}]));
    expect(adapter.providerId).toBe('anthropic');
    expect(adapter.modelId).toBe('claude-mock');
  });

  it('maxConcurrent caps concurrent model calls', async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const model: IModelAdapter = {
      providerId: 'anthropic',
      modelId: 'm',
      capabilities: [],
      complete: vi.fn(async () => {
        inFlight += 1;
        maxObserved = Math.max(maxObserved, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return ok({
          content: [{ type: 'text', text: 'done' }] as ContentBlock[],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          stopReason: 'end_turn',
          model: 'm',
        });
      }) as never,
      stream: (() => (async function* () {})()) as never,
      countTokens: () => Promise.resolve(0),
      validateConfig: () => ({ ok: true as const, value: undefined }),
    };
    const adapter = new AgenticAdapter(model, { maxConcurrent: 2 });
    const calls = Array.from({ length: 8 }, () =>
      adapter.runAgent({
        systemPrompt: 's',
        userPrompt: 'u',
        tools: TOOLS,
        turnBudget: 1,
        onToolCall: () => Promise.resolve({ content: '' }),
      })
    );
    await Promise.all(calls);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('records final assistant text after a tool_use round trip', async () => {
    const model = makeMockModel([
      {
        content: [{ type: 'tool_use', id: 'tu-1', name: 'lookup', input: {} }] as ContentBlock[],
        stopReason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'final answer' }] as ContentBlock[],
        stopReason: 'end_turn',
      },
    ]);
    const adapter = new AgenticAdapter(model);
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: () => Promise.resolve({ content: 'ok' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.finalContent).toBe('final answer');
  });

  it('refuses to construct for an embedding model', () => {
    expect(
      () => new AgenticAdapter(makeMockModel([{}], 'openai', 'text-embedding-3-large'))
    ).toThrow(/embedding/);
  });

  it('exposes the resolved profile via getProfile()', () => {
    const adapter = new AgenticAdapter(makeMockModel([{}], 'anthropic', 'claude-opus-4-1'));
    const profile = adapter.getProfile();
    expect(profile.profileId).toBe('claude-opus');
    expect(profile.parallelToolCalls).toBe(true);
    expect(profile.promptCaching).toBe('ephemeral');
    expect(profile.maxRecommendedTurnBudget).toBe(20);
  });

  it('exposes the resolved identity via getResolvedIdentity()', () => {
    const adapter = new AgenticAdapter(makeMockModel([{}], 'openai', 'claude-sonnet-4-6'));
    // providerId='openai' (gateway) but modelId says claude → vendor=anthropic
    const identity = adapter.getResolvedIdentity();
    expect(identity.vendor).toBe('anthropic');
    expect(identity.family).toBe('claude-sonnet');
  });

  it('strategy stamp uses resolved vendor, not providerId (gateway scenario)', () => {
    // Custom OpenAI gateway fronting Claude.
    const adapter = new AgenticAdapter(
      makeMockModel([{}], 'openai', 'anthropic/claude-sonnet-4-6')
    );
    expect(adapter.adapterStrategy).toBe('native:anthropic');
  });

  it('modelHints override force a different profile', () => {
    const adapter = new AgenticAdapter(makeMockModel([{}], 'openai', 'mystery-model'), {
      modelHints: { vendor: 'anthropic', family: 'claude-opus' },
    });
    expect(adapter.getProfile().profileId).toBe('claude-opus');
    expect(adapter.adapterStrategy).toBe('native:anthropic');
  });

  it('forceProfile bypasses identity-driven lookup', () => {
    const customProfile = {
      id: 'test-custom-model',
      vendor: 'unknown' as const,
      family: 'unknown',
      parallelToolCalls: false,
      promptCaching: 'none' as const,
      toolDefinitionFormat: 'openai' as const,
      maxRecommendedTurnBudget: 99,
      strictJson: true,
      quirks: [],
      profileId: 'test-custom',
      source: 'in-tree' as const,
    };
    const adapter = new AgenticAdapter(makeMockModel([{}], 'anthropic', 'claude-opus-4-1'), {
      forceProfile: customProfile,
    });
    expect(adapter.getProfile().profileId).toBe('test-custom');
    expect(adapter.getProfile().maxRecommendedTurnBudget).toBe(99);
  });

  it('parallel tool calls run via Promise.all when profile says so', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const adapter = new AgenticAdapter(
      makeMockModel(
        [
          {
            content: [
              { type: 'tool_use', id: 'a', name: 'lookup', input: { id: '1' } },
              { type: 'tool_use', id: 'b', name: 'lookup', input: { id: '2' } },
              { type: 'tool_use', id: 'c', name: 'lookup', input: { id: '3' } },
            ] as ContentBlock[],
            stopReason: 'tool_use',
          },
          { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' },
        ],
        'anthropic',
        'claude-opus-4-1'
      )
    );
    expect(adapter.getProfile().parallelToolCalls).toBe(true);

    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: async (): Promise<ToolResult> => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return { content: 'ok' };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
    expect(result.value.turnsUsed).toBe(3);
  });

  it('parallel tool execution preserves turn ordering in the trace', async () => {
    const adapter = new AgenticAdapter(
      makeMockModel(
        [
          {
            content: [
              { type: 'tool_use', id: 'first', name: 'lookup', input: {} },
              { type: 'tool_use', id: 'second', name: 'lookup', input: {} },
              { type: 'tool_use', id: 'third', name: 'lookup', input: {} },
            ] as ContentBlock[],
            stopReason: 'tool_use',
          },
          { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' },
        ],
        'anthropic',
        'claude-opus-4-1'
      )
    );
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: async (call): Promise<ToolResult> => {
        const delay = call.id === 'third' ? 0 : call.id === 'second' ? 5 : 10;
        await new Promise((r) => setTimeout(r, delay));
        return { content: call.id };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.turns.map((t) => t.toolCall.id)).toEqual(['first', 'second', 'third']);
  });

  it('parallel: tool error in any slot stops the loop', async () => {
    const adapter = new AgenticAdapter(
      makeMockModel(
        [
          {
            content: [
              { type: 'tool_use', id: 'a', name: 'lookup', input: {} },
              { type: 'tool_use', id: 'b', name: 'lookup', input: {} },
            ] as ContentBlock[],
            stopReason: 'tool_use',
          },
        ],
        'anthropic',
        'claude-opus-4-1'
      )
    );
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 5,
      onToolCall: (call) => {
        if (call.id === 'b') return Promise.reject(new Error('boom'));
        return Promise.resolve({ content: 'ok' });
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('tool-error');
  });

  it('turnBudget defaults to profile.maxRecommendedTurnBudget when omitted', async () => {
    const adapter = new AgenticAdapter(
      makeMockModel(
        [
          {
            content: [{ type: 'tool_use', id: 'tu', name: 'lookup', input: {} }] as ContentBlock[],
            stopReason: 'tool_use',
          },
        ],
        'anthropic',
        'claude-haiku-4'
      )
    );
    expect(adapter.getProfile().maxRecommendedTurnBudget).toBe(8);
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      onToolCall: () => Promise.resolve({ content: 'ok' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopReason).toBe('turn-budget');
    expect(result.value.turnsUsed).toBe(8);
  });

  it('explicit turnBudget overrides profile default', async () => {
    const adapter = new AgenticAdapter(
      makeMockModel(
        [
          {
            content: [{ type: 'tool_use', id: 'tu', name: 'lookup', input: {} }] as ContentBlock[],
            stopReason: 'tool_use',
          },
        ],
        'anthropic',
        'claude-haiku-4'
      )
    );
    const result = await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: TOOLS,
      turnBudget: 2,
      onToolCall: () => Promise.resolve({ content: 'ok' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.turnsUsed).toBe(2);
  });

  it('ephemeral cache marker added to last tool definition for anthropic', async () => {
    const adapter = new AgenticAdapter(
      makeMockModel(
        [{ content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }],
        'anthropic',
        'claude-sonnet-4-6'
      )
    );
    expect(adapter.getProfile().promptCaching).toBe('ephemeral');
    await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: [
        { name: 'a', description: 'a', inputSchema: {} },
        { name: 'b', description: 'b', inputSchema: {} },
      ],
      turnBudget: 1,
      onToolCall: () => Promise.resolve({ content: '' }),
    });
    const completeFn = (adapter as unknown as { model: { complete: ReturnType<typeof vi.fn> } })
      .model.complete;
    const firstCall = completeFn.mock.calls[0]?.[0] as {
      tools: Array<{ name: string; cacheControl?: unknown }>;
    };
    expect(firstCall.tools[0]?.cacheControl).toBeUndefined();
    expect(firstCall.tools[1]?.cacheControl).toEqual({ type: 'ephemeral' });
  });

  it('no cache marker when profile.promptCaching is none (e.g., openai)', async () => {
    const adapter = new AgenticAdapter(
      makeMockModel(
        [{ content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }],
        'openai',
        'gpt-4o'
      )
    );
    expect(adapter.getProfile().promptCaching).toBe('none');
    await adapter.runAgent({
      systemPrompt: 's',
      userPrompt: 'u',
      tools: [{ name: 'a', description: 'a', inputSchema: {} }],
      turnBudget: 1,
      onToolCall: () => Promise.resolve({ content: '' }),
    });
    const completeFn = (adapter as unknown as { model: { complete: ReturnType<typeof vi.fn> } })
      .model.complete;
    const firstCall = completeFn.mock.calls[0]?.[0] as {
      tools: Array<{ cacheControl?: unknown }>;
    };
    expect(firstCall.tools[0]?.cacheControl).toBeUndefined();
  });
});
