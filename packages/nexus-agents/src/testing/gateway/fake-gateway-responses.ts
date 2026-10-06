/** Responses API replies and SSE for the real HTTP fake gateway (#7150). */
import type { ServerResponse } from 'node:http';
import type { ChatScript, ChatScripter } from './fake-gateway.js';
import type { CatalogEntry } from './three-family-catalog.js';

interface ResponsesState {
  readonly catalog: readonly CatalogEntry[];
  readonly script: ChatScripter;
  readonly attempts: Map<string, number>;
}

interface FakeResponseBody {
  readonly status: 'incomplete' | 'completed';
  readonly output: Record<string, unknown>[];
  readonly [key: string]: unknown;
}

/** Serve the Responses surface with the same catalogue and reply scripts as chat. */
export function respondToResponses(
  state: ResponsesState,
  body: unknown,
  res: ServerResponse
): void {
  if (typeof body !== 'object' || body === null) {
    fail(res, 400, 'invalid Responses body');
    return;
  }
  const request = body as Record<string, unknown>;
  const model = request['model'];
  if (typeof model !== 'string' || !Array.isArray(request['input'])) {
    fail(res, 400, 'model and input are required');
    return;
  }
  if (!state.catalog.some((item) => item.id === model)) {
    fail(res, 404, `model ${model} not found`);
    return;
  }
  const attempt = (state.attempts.get(model) ?? 0) + 1;
  state.attempts.set(model, attempt);
  const script = state.script(model, { ...request, model, messages: [] }, attempt);
  if (script.kind === 'rate_limited') {
    res.setHeader('Retry-After', String(script.retryAfterSeconds));
    fail(res, 429, 'rate limit reached for requests');
    return;
  }
  const response = responseFor(model, script);
  if (request['stream'] === true) {
    streamResponse(res, response);
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  }
}

function responseFor(
  model: string,
  script: Exclude<ChatScript, { kind: 'rate_limited' }>
): FakeResponseBody {
  const output: Record<string, unknown>[] = [];
  if (script.kind === 'text')
    output.push({
      type: 'message',
      id: 'msg-fake',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: script.content, annotations: [] }],
    });
  if (script.kind === 'tool_calls')
    output.push(
      ...script.calls.map((call, index) => ({
        type: 'function_call',
        id: `fc-${String(index)}`,
        status: 'completed',
        call_id: call.id,
        name: call.name,
        arguments: call.arguments,
      }))
    );
  return {
    id: 'resp-fake',
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: script.kind === 'content_filter' ? 'incomplete' : 'completed',
    output,
    incomplete_details: script.kind === 'content_filter' ? { reason: 'content_filter' } : null,
    error: null,
    usage: {
      input_tokens: 42,
      output_tokens: 17,
      total_tokens: 59,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

function streamResponse(res: ServerResponse, response: ReturnType<typeof responseFor>): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  let sequence = 0;
  const emit = (type: string, payload: Record<string, unknown>): void => {
    res.write(
      `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...payload })}\n\n`
    );
  };
  emit('response.created', { response: { ...response, status: 'in_progress', output: [] } });
  if (response.status === 'incomplete') {
    emit('response.failed', {
      response: {
        ...response,
        status: 'failed',
        error: { code: 'content_filter', message: 'reply blocked by content filter' },
      },
    });
  } else {
    response.output.forEach((item, index) => {
      streamItem(emit, item, index);
    });
    emit('response.completed', { response });
  }
  res.end();
}

function streamItem(
  emit: (type: string, payload: Record<string, unknown>) => void,
  item: Record<string, unknown>,
  outputIndex: number
): void {
  const base = { item_id: item['id'], output_index: outputIndex };
  emit('response.output_item.added', { ...base, item: { ...item, arguments: '' } });
  if (item['type'] === 'message') {
    const content = item['content'] as { text: string }[];
    emit('response.output_text.delta', {
      ...base,
      content_index: 0,
      delta: content[0]?.text ?? '',
    });
    emit('response.output_text.done', { ...base, content_index: 0, text: content[0]?.text ?? '' });
  } else if (item['type'] === 'function_call') {
    const args = String(item['arguments']);
    const mid = Math.floor(args.length / 2);
    emit('response.function_call_arguments.delta', { ...base, delta: args.slice(0, mid) });
    emit('response.function_call_arguments.delta', { ...base, delta: args.slice(mid) });
    emit('response.function_call_arguments.done', { ...base, arguments: args });
  }
  emit('response.output_item.done', { ...base, item });
}

function fail(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message, type: 'invalid_request_error' } }));
}
