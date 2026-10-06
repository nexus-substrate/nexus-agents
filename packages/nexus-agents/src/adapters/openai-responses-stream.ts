/** Map Responses SSE events to the existing adapter streaming contract. */
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses';
import type { CompletionResponse, StreamChunk } from '../core/index.js';
import { ErrorCode, ModelError } from '../core/index.js';

/** Tool argument fragments are emitted as a completed tool block, as in chat. */
export async function* mapResponsesStream(
  events: AsyncIterable<ResponseStreamEvent>,
  mapResponse: (response: Response) => CompletionResponse
): AsyncIterable<StreamChunk> {
  const blocks = new Map<string, number>();
  let completed = false;
  for await (const event of events) {
    assertStreamEvent(event);
    if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      const response = mapResponse(event.response);
      yield {
        type: 'message_delta',
        delta: { stop_reason: response.stopReason },
        ...(response.usage !== undefined && { usage: response.usage }),
      };
      yield { type: 'message_stop' };
      completed = true;
    } else {
      yield* mapContentEvent(event, blocks);
    }
  }
  if (!completed)
    throw new ModelError('Responses stream ended without a terminal response', {
      code: ErrorCode.MODEL_ERROR,
    });
}

function assertStreamEvent(event: ResponseStreamEvent): void {
  if (event.type === 'response.failed')
    throw new ModelError(event.response.error?.message ?? 'Responses stream failed', {
      code: ErrorCode.MODEL_ERROR,
    });
  if (event.type === 'error') throw new ModelError(event.message, { code: ErrorCode.MODEL_ERROR });
  if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') {
    throw new ModelError('Responses reply was refused', { code: ErrorCode.MODEL_ERROR });
  }
}

function mapContentEvent(event: ResponseStreamEvent, blocks: Map<string, number>): StreamChunk[] {
  switch (event.type) {
    case 'response.created':
      return [{ type: 'message_start', message: { model: event.response.model } }];
    case 'response.output_text.delta':
      return textDeltaChunks(event, blocks);
    case 'response.output_text.done': {
      const index = blocks.get(textBlockKey(event));
      return index === undefined ? [] : [{ type: 'content_block_stop', index }];
    }
    case 'response.output_item.done': {
      if (event.item.type !== 'function_call') return [];
      const index = blocks.size;
      blocks.set(`tool:${String(event.output_index)}`, index);
      return [
        {
          type: 'content_block_start',
          index,
          contentBlock: {
            type: 'tool_use',
            id: event.item.call_id,
            name: event.item.name,
            input: parseArguments(event.item.arguments),
          },
        },
        { type: 'content_block_stop', index },
      ];
    }
    default:
      // Metadata, reasoning, and tool-argument fragments carry no public chunk.
      return [];
  }
}

function textBlockKey(event: { output_index: number; content_index: number }): string {
  return `${String(event.output_index)}:${String(event.content_index)}`;
}

function textDeltaChunks(
  event: Extract<ResponseStreamEvent, { type: 'response.output_text.delta' }>,
  blocks: Map<string, number>
): StreamChunk[] {
  const key = textBlockKey(event);
  const chunks: StreamChunk[] = [];
  let index = blocks.get(key);
  if (index === undefined) {
    index = blocks.size;
    blocks.set(key, index);
    chunks.push({ type: 'content_block_start', index, contentBlock: { type: 'text', text: '' } });
  }
  chunks.push({
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text: event.delta },
  });
  return chunks;
}

function parseArguments(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText) as unknown;
  } catch {
    return { _raw: argumentsText };
  }
}
