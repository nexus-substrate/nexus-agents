/** Interrupted SDK output is partial evidence, never a completed answer (#7623). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorCode,
  ModelError,
  type CompletionRequest,
  type CompletionResponse,
  type Result,
  type StreamChunk,
} from '../../core/index.js';
import { FAKE_ANTHROPIC_KEY } from '../../testing/test-secrets.js';
import { SdkAdapter } from './sdk-adapter.js';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateObject: vi.fn(),
  Output: { object: vi.fn((options: unknown) => options) },
  jsonSchema: vi.fn((schema: unknown) => ({ jsonSchema: schema })),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId })),
}));

const MODEL_ID = 'test-model';
const REQUEST: CompletionRequest = {
  messages: [{ role: 'user', content: 'Diagnostic contract check' }],
};
const INTERRUPTED_OUTPUTS = [
  ['empty', ''],
  ['partial', 'partial output'],
] as const;

function createAdapter(): SdkAdapter {
  return new SdkAdapter({
    providerId: 'anthropic',
    modelId: MODEL_ID,
    apiKey: FAKE_ANTHROPIC_KEY,
  });
}

function completionFixture(text: string, finishReason = 'interrupted'): object {
  return {
    text,
    finishReason,
    // Synthetic usage only: no provider request is issued by these tests.
    usage: { inputTokens: 1, outputTokens: 1 },
    response: { id: 'test-response', timestamp: new Date(0), modelId: MODEL_ID },
  };
}

function expectInterrupted(result: Result<CompletionResponse, ModelError>): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(ModelError);
    expect(result.error.code).toBe(ErrorCode.MODEL_ERROR);
    expect(result.error.context?.['reason']).toBe('completion_interrupted');
  }
}

async function collectStream(adapter: SdkAdapter, chunks: StreamChunk[]): Promise<void> {
  for await (const chunk of adapter.stream(REQUEST)) chunks.push(chunk);
}

beforeEach(async () => {
  const { generateText, streamText } = await import('ai');
  vi.mocked(generateText).mockReset();
  vi.mocked(streamText).mockReset();
});

describe('interrupted completions (#7623)', () => {
  it.each(INTERRUPTED_OUTPUTS)('rejects %s interrupted text', async (_kind, text) => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce(
      completionFixture(text) as unknown as Awaited<ReturnType<typeof generateText>>
    );

    expectInterrupted(await createAdapter().complete(REQUEST));
  });

  it.each(INTERRUPTED_OUTPUTS)(
    'rejects %s interrupted structured output before reading its getter',
    async (_kind, text) => {
      const { generateText } = await import('ai');
      const readOutput = vi.fn(() => {
        throw new Error('Interrupted output must not be decoded');
      });
      const fixture = Object.defineProperty(completionFixture(text), 'output', { get: readOutput });
      vi.mocked(generateText).mockResolvedValueOnce(
        fixture as unknown as Awaited<ReturnType<typeof generateText>>
      );

      expectInterrupted(
        await createAdapter().complete({ ...REQUEST, responseFormat: { type: 'json_object' } })
      );
      expect(readOutput).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['stop', 'end_turn'],
    ['length', 'max_tokens'],
  ] as const)('preserves a content-bearing %s completion', async (finishReason, stopReason) => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce(
      completionFixture('normal output', finishReason) as unknown as Awaited<
        ReturnType<typeof generateText>
      >
    );

    const result = await createAdapter().complete(REQUEST);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stopReason).toBe(stopReason);
  });
});

describe('interrupted streams (#7623)', () => {
  it.each(INTERRUPTED_OUTPUTS)(
    'rejects %s interruption without successful final markers',
    async (_kind, text) => {
      const { streamText } = await import('ai');
      const textStream = new ReadableStream<string>({
        start(controller) {
          if (text !== '') controller.enqueue(text);
          controller.close();
        },
      });
      vi.mocked(streamText).mockReturnValueOnce({
        textStream,
        finishReason: Promise.resolve('interrupted'),
      } as unknown as ReturnType<typeof streamText>);
      const chunks: StreamChunk[] = [];

      await expect(collectStream(createAdapter(), chunks)).rejects.toMatchObject({
        code: ErrorCode.MODEL_ERROR,
        context: { reason: 'completion_interrupted' },
      });
      expect(chunks.some((chunk) => chunk.type === 'message_start')).toBe(true);
      const deltas = chunks.filter((chunk) => chunk.type === 'content_block_delta');
      // Empty output is explicit; a partial response retains the already emitted text.
      expect(deltas).toHaveLength(text === '' ? 0 : 1);
      if (text !== '') expect(deltas[0]).toMatchObject({ delta: { text } });
      expect(chunks.some((chunk) => chunk.type === 'message_delta')).toBe(false);
      expect(chunks.some((chunk) => chunk.type === 'message_stop')).toBe(false);
    }
  );
});
