/** Wire translation for the gateway's opt-in Responses surface (#7150). */
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions';
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseInputContent,
  ResponseUsage,
} from 'openai/resources/responses/responses';
import { ErrorCode, ModelError } from '../core/index.js';
import type OpenAI from 'openai';
import type { DroppedParam } from './optional-params.js';

interface ResponsesCompletionPlan {
  readonly params: ChatCompletionCreateParamsNonStreaming;
  readonly dropped: readonly DroppedParam[];
}

/** Send Responses input and report requested parameters this surface cannot send. */
export async function completeResponses(
  client: OpenAI,
  plan: ResponsesCompletionPlan,
  signal?: AbortSignal
): Promise<{ response: ChatCompletion; dropped: readonly DroppedParam[] }> {
  const response = await client.responses.create(buildResponsesParams(plan.params), {
    signal,
  });
  const dropped: readonly DroppedParam[] =
    plan.params.stop === undefined
      ? plan.dropped
      : [
          ...plan.dropped,
          {
            param: 'stop',
            reason: 'The Responses API does not support stop sequences; omitted.',
            severity: 'behavioral',
          },
        ];
  return { response: responsesToChatCompletion(response), dropped };
}

/** Build Responses parameters from the same model/optional-parameter plan as chat. */
export function buildResponsesParams(
  chat: ChatCompletionCreateParamsNonStreaming
): ResponseCreateParamsNonStreaming {
  const params: ResponseCreateParamsNonStreaming = {
    model: chat.model,
    input: chat.messages.flatMap(mapInputMessage),
    ...(chat.max_completion_tokens !== undefined && {
      max_output_tokens: chat.max_completion_tokens,
    }),
    ...(chat.temperature !== undefined && { temperature: chat.temperature }),
  };
  if (chat.tools !== undefined) {
    params.tools = chat.tools.flatMap((tool) =>
      tool.type === 'function'
        ? [
            {
              type: 'function' as const,
              name: tool.function.name,
              parameters: tool.function.parameters ?? {},
              strict: tool.function.strict ?? false,
              ...(tool.function.description !== undefined && {
                description: tool.function.description,
              }),
            },
          ]
        : []
    );
  }
  if (chat.response_format?.type === 'json_object') {
    params.text = { format: { type: 'json_object' } };
  } else if (chat.response_format?.type === 'json_schema') {
    params.text = {
      format: {
        type: 'json_schema',
        name: chat.response_format.json_schema.name,
        schema: chat.response_format.json_schema.schema ?? {},
        ...(chat.response_format.json_schema.strict !== undefined && {
          strict: chat.response_format.json_schema.strict,
        }),
      },
    };
  }
  return params;
}

function mapInputMessage(message: ChatCompletionMessageParam): ResponseInputItem[] {
  if (message.role === 'tool')
    return [
      {
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output:
          typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      },
    ];
  if (message.role === 'function') return [];
  const items: ResponseInputItem[] = [];
  if (message.content !== null && message.content !== undefined) {
    items.push({
      role: message.role,
      content:
        typeof message.content === 'string'
          ? [{ type: 'input_text', text: message.content }]
          : message.content.flatMap(mapInputContent),
    });
  }
  items.push(...mapInputToolCalls(message));
  return items;
}

function mapInputToolCalls(message: ChatCompletionMessageParam): ResponseInputItem[] {
  if (message.role !== 'assistant') return [];
  return (message.tool_calls ?? []).flatMap((call) =>
    call.type === 'function'
      ? [
          {
            type: 'function_call',
            call_id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          },
        ]
      : []
  );
}

function mapInputContent(
  part: ChatCompletionContentPart | { type: 'refusal'; refusal: string }
): ResponseInputContent[] {
  if (part.type === 'text') return [{ type: 'input_text', text: part.text }];
  if (part.type === 'image_url')
    return [
      {
        type: 'input_image',
        image_url: part.image_url.url,
        detail: part.image_url.detail ?? 'auto',
      },
    ];
  return [];
}

/** Reuse chat's answer validation, tool parsing, token accounting and stop reasons. */
export function responsesToChatCompletion(response: Response): ChatCompletion {
  if (response.status === 'failed' || response.status === 'cancelled') {
    throw new ModelError(response.error?.message ?? `Responses request ${response.status}`, {
      code: ErrorCode.MODEL_ERROR,
      context: { reason: response.status },
    });
  }
  const usage = responseUsage(response.usage);
  return {
    id: response.id,
    model: response.model,
    object: 'chat.completion',
    created: response.created_at,
    choices: responseChoices(response),
    ...(usage !== undefined && { usage }),
  };
}

function responseText(response: Response): string {
  return response.output
    .flatMap((item) =>
      item.type === 'message'
        ? item.content.filter((part) => part.type === 'output_text').map((part) => part.text)
        : []
    )
    .join('');
}

function responseToolCalls(
  response: Response
): NonNullable<ChatCompletion.Choice['message']['tool_calls']> {
  return response.output.flatMap((item) =>
    item.type === 'function_call'
      ? [
          {
            id: item.call_id,
            type: 'function' as const,
            function: { name: item.name, arguments: item.arguments },
          },
        ]
      : []
  );
}

function responseChoices(response: Response): ChatCompletion.Choice[] {
  const text = responseText(response);
  const calls = responseToolCalls(response);
  const refused = responseRefused(response);
  const finishReason = refused
    ? 'content_filter'
    : response.status === 'incomplete'
      ? 'length'
      : calls.length > 0
        ? 'tool_calls'
        : 'stop';
  // No output is unmeasured, never a successful answer. Keep a length choice
  // for the shared reasoning-budget exhaustion classifier.
  if (text === '' && calls.length === 0 && !refused && finishReason !== 'length') return [];
  return [
    {
      index: 0,
      finish_reason: finishReason,
      logprobs: null,
      message: {
        role: 'assistant',
        content: text,
        refusal: null,
        ...(calls.length > 0 && { tool_calls: calls }),
      },
    },
  ];
}

function responseRefused(response: Response): boolean {
  return (
    response.incomplete_details?.reason === 'content_filter' ||
    response.output.some(
      (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal')
    )
  );
}

function responseUsage(usage: Partial<ResponseUsage> | null | undefined): ChatCompletion['usage'] {
  if (
    usage === undefined ||
    usage === null ||
    typeof usage.input_tokens !== 'number' ||
    typeof usage.output_tokens !== 'number' ||
    typeof usage.total_tokens !== 'number'
  )
    return undefined;
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    ...(usage.input_tokens_details !== undefined && {
      prompt_tokens_details: { cached_tokens: usage.input_tokens_details.cached_tokens },
    }),
    ...(usage.output_tokens_details !== undefined && {
      completion_tokens_details: { reasoning_tokens: usage.output_tokens_details.reasoning_tokens },
    }),
  };
}
