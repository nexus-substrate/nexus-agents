/** Real HTTP contract tests for the gateway Responses surface (#7150). */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletionRequest, StreamChunk } from '../core/index.js';
import { ConfigError, ErrorCode } from '../core/index.js';
import { OpenAIAdapter } from './openai-adapter.js';
import {
  startFakeGateway,
  type FakeGateway,
  SCRIPTED_USAGE,
} from '../testing/gateway/fake-gateway.js';
import { createOpenAICompatAdapter, readOpenAICompatEnv } from './openai-compat-adapter.js';

const MODEL = 'gpt-4o-mini';
const REQUEST: CompletionRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  systemPrompt: 'Be helpful',
  maxTokens: 123,
  temperature: 0.5,
};
const TOOL = { name: 'lookup', description: 'Look up a value', inputSchema: { type: 'object' } };

describe('gateway Responses API', () => {
  let gateway: FakeGateway;
  beforeAll(async () => {
    gateway = await startFakeGateway();
  });
  afterAll(async () => {
    await gateway.close();
  });
  beforeEach(() => {
    gateway.clearRequests();
    gateway.setScript((model) => ({ kind: 'text', content: `reply from ${model}` }));
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', gateway.baseUrl);
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'gateway-test-key');
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'responses');
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_AUTH_HEADER', 'X-Gateway-Key');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_EXTRA_HEADERS', 'X-Tenant=example');
    vi.stubEnv('NO_PROXY', '*');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function adapter(): ReturnType<typeof createOpenAICompatAdapter> {
    const config = readOpenAICompatEnv();
    expect(config).not.toBeNull();
    if (config === null) throw new Error('gateway configuration is absent');
    return createOpenAICompatAdapter(MODEL, config);
  }

  it('sends Responses input, model, output cap and gateway headers and parses text/usage', async () => {
    const result = await adapter().complete(REQUEST);
    const sent = gateway.requests[0];
    expect(sent).toMatchObject({
      method: 'POST',
      path: '/v1/responses',
      hadAuthorization: false,
      headers: { 'x-gateway-key': 'gateway-test-key', 'x-tenant': 'example' },
      body: {
        model: MODEL,
        max_output_tokens: 123,
        temperature: 0.5,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: 'Be helpful' }] },
          { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
        ],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        model: MODEL,
        content: [{ type: 'text', text: `reply from ${MODEL}` }],
        stopReason: 'end_turn',
        usage: {
          inputTokens: SCRIPTED_USAGE.prompt_tokens,
          outputTokens: SCRIPTED_USAGE.completion_tokens,
          totalTokens: SCRIPTED_USAGE.total_tokens,
        },
      },
    });
  });

  it.each(['chat', ''])('keeps chat.completions for surface %j', async (surface) => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', surface);
    const result = await adapter().complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(gateway.requests[0]?.path).toBe('/v1/chat/completions');
  });

  it('rejects an unknown surface instead of guessing a protocol', () => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'unknown');
    expect(() => adapter()).toThrow('must be one of');
  });

  it('sends flat function tools and preserves tool-call identity and arguments', async () => {
    gateway.setScript(() => ({
      kind: 'tool_calls',
      calls: [
        {
          id: 'call-1',
          name: 'lookup',
          arguments: '{"key":"value"}',
        },
      ],
    }));
    const result = await adapter().complete({ ...REQUEST, tools: [TOOL] });
    expect(gateway.requests[0]?.body).toMatchObject({
      tools: [
        {
          type: 'function',
          name: 'lookup',
          description: TOOL.description,
          parameters: TOOL.inputSchema,
          strict: false,
        },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        stopReason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'lookup',
            input: { key: 'value' },
          },
        ],
      },
    });
  });

  it('sends assistant function calls and their results as Responses input items', async () => {
    await adapter().complete({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call-1', name: 'lookup', input: { key: 'v' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'found' }],
        },
      ],
    });
    expect(gateway.requests[0]?.body).toMatchObject({
      input: [
        { type: 'function_call', call_id: 'call-1', name: 'lookup', arguments: '{"key":"v"}' },
        { type: 'function_call_output', call_id: 'call-1', output: 'found' },
      ],
    });
  });

  it('maps JSON schema formatting to Responses text.format', async () => {
    const schema = { type: 'object', properties: { value: { type: 'string' } } };
    await adapter().complete({ ...REQUEST, responseFormat: { type: 'json_schema', schema } });
    expect(gateway.requests[0]?.body).toMatchObject({
      text: {
        format: {
          type: 'json_schema',
          name: 'response',
          schema,
        },
      },
    });
  });

  it('warns when stop sequences cannot be sent on the Responses surface', async () => {
    const result = await adapter().complete({ ...REQUEST, stop: ['END'] });
    expect(gateway.requests[0]?.body).not.toHaveProperty('stop');
    expect(result).toMatchObject({
      ok: true,
      value: {
        warnings: [
          {
            param: 'stop',
            reason: expect.stringContaining('does not support'),
            severity: 'behavioral',
          },
        ],
      },
    });
  });

  async function collect(): Promise<StreamChunk[]> {
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter().stream({ ...REQUEST, tools: [TOOL] })) chunks.push(chunk);
    return chunks;
  }

  it('streams text deltas and completion usage from Responses events', async () => {
    const chunks = await collect();
    expect(gateway.requests[0]).toMatchObject({ path: '/v1/responses', body: { stream: true } });
    expect(chunks).toContainEqual({ type: 'message_start', message: { model: MODEL } });
    expect(chunks).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: `reply from ${MODEL}` },
    });
    expect(chunks).toContainEqual({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { inputTokens: 42, outputTokens: 17, totalTokens: 59, cachedInputTokens: 0 },
    });
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
  });

  it('streams complete tool blocks after fragmented function arguments', async () => {
    gateway.setScript(() => ({
      kind: 'tool_calls',
      calls: [
        { id: 'call-1', name: 'lookup', arguments: '{"key":"value"}' },
        { id: 'call-2', name: 'lookup', arguments: '{"key":"second"}' },
      ],
    }));
    const chunks = await collect();
    expect(chunks).toContainEqual({
      type: 'content_block_start',
      index: 0,
      contentBlock: {
        type: 'tool_use',
        id: 'call-1',
        name: 'lookup',
        input: { key: 'value' },
      },
    });
    expect(chunks).toContainEqual({
      type: 'content_block_start',
      index: 1,
      contentBlock: {
        type: 'tool_use',
        id: 'call-2',
        name: 'lookup',
        input: { key: 'second' },
      },
    });
    expect(chunks).toContainEqual({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { inputTokens: 42, outputTokens: 17, totalTokens: 59, cachedInputTokens: 0 },
    });
  });

  it.each(['content_filter', 'empty_choices'] as const)('rejects %s nonanswers', async (kind) => {
    gateway.setScript(() => (kind === 'content_filter' ? { kind, partial: 'blocked' } : { kind }));
    const result = await adapter().complete(REQUEST);
    expect(result.ok).toBe(false);
  });

  it('rejects a failed Responses stream', async () => {
    gateway.setScript(() => ({ kind: 'content_filter', partial: 'blocked' }));
    await expect(collect()).rejects.toThrow();
  });

  it('preserves HTTP failures from the Responses surface', async () => {
    const result = await createOpenAICompatAdapter(
      'missing-model',
      readOpenAICompatEnv()!
    ).complete(REQUEST);
    expect(gateway.requests[0]?.path).toBe('/v1/responses');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.message).toContain('HTTP 404');
  });

  it('preserves a guarded fetch configuration refusal under the SDK connection error', async () => {
    const guarded = new OpenAIAdapter({
      modelId: MODEL,
      apiKey: 'gateway-test-key',
      baseUrl: gateway.baseUrl,
      apiSurface: 'responses',
      maxRetries: 0,
      fetch: () => Promise.reject(new ConfigError('Gateway URL rejected: private address')),
    });
    const result = await guarded.complete(REQUEST);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: ErrorCode.CONFIG_ERROR,
        message: 'Gateway URL rejected: private address',
      },
    });
    expect(gateway.requests).toHaveLength(0);
  });

  it('translates image content into Responses input_image items', async () => {
    await adapter().complete({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'aW1hZ2U=' },
            },
          ],
        },
      ],
    });
    expect(gateway.requests[0]?.body).toMatchObject({
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,aW1hZ2U=',
              detail: 'auto',
            },
          ],
        },
      ],
    });
  });
});
