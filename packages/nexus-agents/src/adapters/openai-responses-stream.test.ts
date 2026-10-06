/** Edge contracts for Responses events that the basic fake script cannot emit. */
import { describe, expect, it } from 'vitest';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import type { CompletionResponse, StreamChunk } from '../core/index.js';
import { mapResponsesStream } from './openai-responses-stream.js';

const FINISH: CompletionResponse = {
  model: 'gateway-model',
  content: [{ type: 'text', text: 'reply' }],
  stopReason: 'end_turn',
};

async function collect(events: ResponseStreamEvent[]): Promise<StreamChunk[]> {
  async function* source(): AsyncIterable<ResponseStreamEvent> {
    for (const event of events) yield await Promise.resolve(event);
  }
  const chunks: StreamChunk[] = [];
  for await (const chunk of mapResponsesStream(source(), () => FINISH)) chunks.push(chunk);
  return chunks;
}

describe('Responses streaming edges', () => {
  it('allocates separate public blocks to content parts within one output item', async () => {
    const chunks = await collect([
      { type: 'response.output_text.delta', output_index: 2, content_index: 0, delta: 'first' },
      { type: 'response.output_text.done', output_index: 2, content_index: 0, text: 'first' },
      { type: 'response.output_text.delta', output_index: 2, content_index: 1, delta: 'second' },
      { type: 'response.output_text.done', output_index: 2, content_index: 1, text: 'second' },
      { type: 'response.completed', response: {} },
    ] as ResponseStreamEvent[]);
    expect(
      chunks.filter((chunk) => chunk.type === 'content_block_start').map((chunk) => chunk.index)
    ).toEqual([0, 1]);
    expect(
      chunks.filter((chunk) => chunk.type === 'content_block_stop').map((chunk) => chunk.index)
    ).toEqual([0, 1]);
  });

  it('rejects an empty stream as unmeasured instead of completing successfully', async () => {
    await expect(collect([])).rejects.toThrow('ended without a terminal response');
  });

  it('rejects an interrupted stream even after visible text', async () => {
    await expect(
      collect([
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'partial' },
      ] as ResponseStreamEvent[])
    ).rejects.toThrow('ended without a terminal response');
  });

  it('propagates Responses error events', async () => {
    await expect(
      collect([{ type: 'error', message: 'gateway stream failed' }] as ResponseStreamEvent[])
    ).rejects.toThrow('gateway stream failed');
  });
});
