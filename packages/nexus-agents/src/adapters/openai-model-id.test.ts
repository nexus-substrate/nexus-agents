/** Regression coverage for verbatim OpenAI model ids (#7149, 11.0). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from './openai-adapter.js';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mocks.create } };
  },
}));

const modelIds = [
  'gpt-5.2-chat-latest',
  'gpt-4o-2024-11-20',
  'gpt-4o-mini-2024-07-18',
  'gpt-4-turbo-2024-04-09',
  'gpt-3.5-turbo-0125',
  // The registry does not map these former aliases to the snapshots above.
  'gpt-5.2-instant',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'custom-model-not-in-the-registry',
];
const request = { messages: [{ role: 'user' as const, content: 'hello' }] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OpenAI model ids pass through unchanged', () => {
  it.each(modelIds)('sends %s unchanged in a completion', async (modelId) => {
    mocks.create.mockResolvedValueOnce({
      model: modelId,
      choices: [{ message: { content: 'hello', role: 'assistant' }, finish_reason: 'stop' }],
    });
    const adapter = new OpenAIAdapter({ modelId, apiKey: 'test-api-key' });

    const result = await adapter.complete(request);

    expect(result.ok).toBe(true);
    expect(adapter.modelId).toBe(modelId);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: modelId }));
  });

  it.each(modelIds)('sends %s unchanged in a stream', async (modelId) => {
    async function* chunks(): AsyncGenerator {
      yield await Promise.resolve({
        model: modelId,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      });
    }
    mocks.create.mockResolvedValueOnce(chunks());
    const adapter = new OpenAIAdapter({ modelId, apiKey: 'test-api-key' });
    const received = [];

    for await (const chunk of adapter.stream(request)) received.push(chunk);

    expect(received.length).toBeGreaterThan(0);
    expect(adapter.modelId).toBe(modelId);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: modelId, stream: true })
    );
  });

  it.each([false, true])('passes ids unchanged with verbatimModelId=%s', (verbatimModelId) => {
    const adapter = new OpenAIAdapter({
      modelId: 'gpt-4o',
      apiKey: 'test-api-key',
      verbatimModelId,
    });

    expect(adapter.modelId).toBe('gpt-4o');
  });
});
