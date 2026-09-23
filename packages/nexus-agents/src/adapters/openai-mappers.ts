/**
 * nexus-agents/adapters - OpenAI Message Mappers
 *
 * Functions for mapping between Nexus and OpenAI message formats.
 */

import type OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions';
import type {
  ContentBlock,
  Message,
  ToolDefinition,
  TokenUsage,
  StopReason,
  StreamChunk,
} from '../core/index.js';
import { isFunctionToolCall } from './openai-types.js';

/**
 * Maps OpenAI finish reasons to our StopReason type.
 */
export function mapStopReason(openaiReason: string | null | undefined): StopReason {
  switch (openaiReason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    // `content_filter` is never mapped as a finish: the adapter turns it into an
    // error before a response is built (#6607, see detectNonAnswer), because
    // every consumer reads a mapped response as an answer.
    default:
      return 'end_turn';
  }
}

/** A reply blocked by the provider's content filter, streamed or not (#6607). */
export const CONTENT_FILTERED: NonAnswer = {
  reason: 'content_filter',
  detail: 'the reply was blocked by a content filter',
};

/** A completion that must surface as an error, never as an empty success (#6607). */
export interface NonAnswer {
  /** Why the completion carries no answer. */
  readonly reason: 'content_filter' | 'no_choices' | 'reasoning_truncated';
  readonly detail: string;
  /** Reasoning tokens the vendor reported, when it reported them. */
  readonly reasoningTokens?: number;
}

/**
 * Classify a completion choice that is not an answer (#6607). The third kind,
 * `no_choices` (an empty `choices` array, which some gateways return for a
 * blocked prompt), has no choice to classify and is raised by the adapter.
 *
 * - `content_filter`: the provider's safety layer blocked or cut the reply. Any
 *   partial text is not an answer either.
 * - `reasoning_truncated`: a reasoning model hit the completion cap with no
 *   visible output, so the whole budget went to reasoning. This is distinct
 *   from an ordinary `length` truncation, which still carries partial text.
 *   `reasoningFamily` comes from the model id; a reported non-zero
 *   `reasoning_tokens` count is evidence on its own for ids the regex misses.
 *
 * Returns `undefined` for every other completion.
 */
export function detectNonAnswer(
  choice: ChatCompletion.Choice,
  usage: ChatCompletion['usage'],
  reasoningFamily: boolean
): NonAnswer | undefined {
  if (choice.finish_reason === 'content_filter') return CONTENT_FILTERED;
  if (choice.finish_reason !== 'length' || hasVisibleOutput(choice)) return undefined;
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
  if (!reasoningFamily && !(reasoningTokens !== undefined && reasoningTokens > 0)) {
    return undefined;
  }
  return {
    reason: 'reasoning_truncated',
    detail:
      'the completion budget was spent on reasoning before any output (empty reply, finish length)',
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  };
}

function hasVisibleOutput(choice: ChatCompletion.Choice): boolean {
  const text = choice.message.content;
  if (text !== null && text !== '') return true;
  return (choice.message.tool_calls?.length ?? 0) > 0;
}

/**
 * Parse a tool call's JSON `arguments` string. Unparseable text is kept under
 * `_raw` rather than dropped, so the caller still sees what the model sent.
 */
function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args) as unknown;
  } catch {
    return { _raw: args };
  }
}

/**
 * Maps OpenAI choice to our ContentBlock array.
 */
export function mapChoiceToContentBlocks(choice: ChatCompletion.Choice): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const message = choice.message;

  // Add text content if present
  if (message.content !== null && message.content !== '') {
    blocks.push({ type: 'text', text: message.content });
  }

  // Add tool calls if present
  if (message.tool_calls !== undefined && message.tool_calls.length > 0) {
    for (const toolCall of message.tool_calls) {
      if (isFunctionToolCall(toolCall)) {
        blocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseToolArguments(toolCall.function.arguments),
        });
      }
    }
  }

  // If no content at all, return empty text block
  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: '' });
  }

  return blocks;
}

/**
 * Maps our Message format to OpenAI's ChatCompletionMessageParam format.
 *
 * Returns an ARRAY: one user message holding several `tool_result` blocks
 * becomes one `tool` message per result (#6607). OpenAI requires a tool message
 * for every `tool_call_id` the assistant issued; sending only the first made
 * strict gateways reject the request with a 400.
 */
export function mapMessage(message: Message): ChatCompletionMessageParam[] {
  if (message.role === 'system') {
    return [mapSystemMessage(message)];
  }
  if (message.role === 'user') {
    return mapUserMessage(message);
  }
  return [mapAssistantMessage(message)];
}

/**
 * Maps a system message.
 */
function mapSystemMessage(message: Message): ChatCompletionMessageParam {
  const content =
    typeof message.content === 'string'
      ? message.content
      : message.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
  return { role: 'system', content };
}

/**
 * Maps a user message.
 */
function mapUserMessage(message: Message): ChatCompletionMessageParam[] {
  if (typeof message.content === 'string') {
    return [{ role: 'user', content: message.content }];
  }

  // Tool results become one `tool` message each, in order (#6607).
  const toolResults = message.content.filter(
    (b): b is { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean } =>
      b.type === 'tool_result'
  );

  if (toolResults.length > 0) {
    return toolResults.map((result) => ({
      role: 'tool' as const,
      tool_call_id: result.tool_use_id,
      content: result.content,
    }));
  }

  // Map to user message with content array
  const content = message.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text };
    }
    if (block.type === 'image') {
      return {
        type: 'image_url' as const,
        image_url: {
          url: `data:${block.source.media_type};base64,${block.source.data}`,
        },
      };
    }
    // Fallback for other types
    return { type: 'text' as const, text: '' };
  });

  return [{ role: 'user', content }];
}

/**
 * Maps an assistant message.
 */
function mapAssistantMessage(message: Message): ChatCompletionMessageParam {
  if (typeof message.content === 'string') {
    return { role: 'assistant', content: message.content };
  }

  // Check for tool uses in assistant message
  const toolUses = message.content.filter(
    (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } =>
      b.type === 'tool_use'
  );

  const textContent = message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (toolUses.length > 0) {
    const assistantMessage: ChatCompletionMessageParam = {
      role: 'assistant',
      content: textContent !== '' ? textContent : null,
      tool_calls: toolUses.map((tool) => ({
        id: tool.id,
        type: 'function' as const,
        function: {
          name: tool.name,
          arguments: JSON.stringify(tool.input),
        },
      })),
    };
    return assistantMessage;
  }

  return { role: 'assistant', content: textContent };
}

/**
 * Maps our ToolDefinition to OpenAI's tool format.
 */
export function mapTool(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

/**
 * Maps OpenAI API response to our CompletionResponse format.
 */
export function mapResponseUsage(response: ChatCompletion): TokenUsage | undefined {
  const u = response.usage;
  // #4439: `?? 0` here synthesised a measurement the vendor never sent. An
  // absent usage block must stay absent so the decision-cost rollup can tell
  // "zero tokens" from "we do not know".
  if (u === undefined) return undefined;
  const cached = u.prompt_tokens_details?.cached_tokens;
  return {
    inputTokens: u.prompt_tokens,
    outputTokens: u.completion_tokens,
    totalTokens: u.total_tokens,
    ...(cached !== undefined ? { cachedInputTokens: cached } : {}),
  };
}

/**
 * Maps content delta from stream chunk.
 */
function mapContentDelta(
  delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta,
  currentIndex: number,
  hasStarted: boolean
): StreamChunk[] {
  const chunks: StreamChunk[] = [];

  if (delta.content !== undefined && delta.content !== null && delta.content !== '') {
    // Start content block if this is the first content
    if (currentIndex === 0 && !hasStarted) {
      chunks.push({
        type: 'content_block_start',
        index: 0,
        contentBlock: { type: 'text', text: '' },
      });
    }

    chunks.push({
      type: 'content_block_delta',
      index: currentIndex,
      delta: { type: 'text_delta', text: delta.content },
    });
  }

  return chunks;
}

/**
 * Tool calls being assembled across a stream, keyed by the OpenAI tool index
 * (#6607). OpenAI sends the id and name in the first delta for a call and the
 * JSON `arguments` in fragments after it, so a call is only complete when the
 * choice finishes. Create one per stream with {@link createStreamToolCallState}.
 */
interface StreamToolCallState {
  readonly calls: Map<number, { id: string; name: string; args: string }>;
}

/** A fresh accumulator for one stream (#6607). */
export function createStreamToolCallState(): StreamToolCallState {
  return { calls: new Map() };
}

/**
 * Accumulates tool-call deltas. Emits nothing: the `tool_use` block is emitted
 * once, complete, at the finish chunk (see {@link flushToolCalls}). Emitting it
 * on the first delta, as this used to, fixed its `input` at `{}` (#6607).
 */
function accumulateToolCallsDelta(
  delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta,
  state: StreamToolCallState
): void {
  for (const toolCall of delta.tool_calls ?? []) {
    const entry = state.calls.get(toolCall.index) ?? { id: '', name: '', args: '' };
    if (toolCall.id !== undefined) entry.id = toolCall.id;
    if (toolCall.function?.name !== undefined) entry.name = toolCall.function.name;
    if (toolCall.function?.arguments !== undefined) entry.args += toolCall.function.arguments;
    state.calls.set(toolCall.index, entry);
  }
}

/** Emit each assembled tool call as one complete `tool_use` block, in index order. */
function flushToolCalls(state: StreamToolCallState): StreamChunk[] {
  const chunks: StreamChunk[] = [...state.calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, call]) => ({
      type: 'content_block_start' as const,
      index,
      contentBlock: {
        type: 'tool_use' as const,
        id: call.id,
        name: call.name,
        input: call.args === '' ? {} : parseToolArguments(call.args),
      },
    }));
  state.calls.clear();
  return chunks;
}

/**
 * Maps finish reason from stream chunk.
 */
function mapFinishChunks(
  choice: ChatCompletionChunk.Choice,
  chunk: ChatCompletionChunk,
  currentIndex: number,
  toolCalls: StreamToolCallState
): StreamChunk[] {
  const chunks: StreamChunk[] = [];

  if (choice.finish_reason !== null) {
    chunks.push(...flushToolCalls(toolCalls));

    // End current content block
    chunks.push({
      type: 'content_block_stop',
      index: currentIndex,
    });

    // Emit message_delta with stop reason.
    //
    // NO `usage` on this path. OpenAI populates `chunk.usage` on a streaming
    // response only when the request sets `stream_options: { include_usage:
    // true }`, and nothing in this tree does — so both `??` fallbacks always
    // took the `0` branch and every stream emitted
    // `{inputTokens: 0, outputTokens: 0, totalTokens: 0}`: a usage block in
    // which nothing whatsoever was measured.
    //
    // `inputTokensMeasured: false` covered only the first of those three. Its
    // own contract is "whether `inputTokens` is a measurement", and there is no
    // `outputTokensMeasured`, so a consumer honouring the flag correctly
    // discounted `inputTokens` and then read `outputTokens: 0` as a measured
    // zero. That is the #4439 policy this violated, stated on the field itself:
    // "Where NOTHING is known, prefer omitting `usage` entirely." The SDK
    // adapter's stream path already does exactly that (#4835), for the same
    // reason.
    chunks.push({
      type: 'message_delta',
      delta: { stop_reason: mapStopReason(choice.finish_reason) },
      // A stream whose usage IS reported keeps it — when `include_usage` is
      // wired, this is the branch that carries a real measurement.
      ...(chunk.usage !== undefined && chunk.usage !== null
        ? {
            usage: {
              // OpenAI still omits prompt_tokens on the final chunk (#4835).
              inputTokens: 0,
              inputTokensMeasured: false,
              outputTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            },
          }
        : {}),
    });

    // Emit message_stop
    chunks.push({ type: 'message_stop' });
  }

  return chunks;
}

/**
 * Maps OpenAI stream chunks to our StreamChunk format.
 */
export function mapStreamChunk(
  chunk: ChatCompletionChunk,
  currentIndex: number,
  hasStarted: boolean,
  toolCalls: StreamToolCallState
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  const choice = chunk.choices[0];

  // Emit message_start on first chunk
  if (!hasStarted) {
    chunks.push({
      type: 'message_start',
      message: { model: chunk.model },
    });
  }

  if (choice === undefined) {
    return chunks;
  }

  const delta = choice.delta;

  // Map content delta
  chunks.push(...mapContentDelta(delta, currentIndex, hasStarted));

  // Accumulate tool calls; they are emitted whole at the finish chunk.
  accumulateToolCallsDelta(delta, toolCalls);

  // Map finish reason
  chunks.push(...mapFinishChunks(choice, chunk, currentIndex, toolCalls));

  return chunks;
}
