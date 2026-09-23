/**
 * A fake OpenAI-spec gateway on loopback, for end-to-end tests that drive the
 * real gateway code over real HTTP (#6610).
 *
 * `node:http` only, bound to 127.0.0.1 on an ephemeral port; start one per
 * test file and close it in `afterAll`. It serves:
 *
 * - `GET /v1/models` — the catalogue it was given (by default the recorded
 *   three-family catalogue), replaceable with {@link FakeGateway.setCatalog};
 * - `POST /v1/chat/completions` — whatever the {@link ChatScripter} returns for
 *   the request's model id and body: text, tool calls, a `content_filter`
 *   finish, an empty `choices` array or a 429 with `Retry-After`.
 *
 * Every request is recorded (method, path, headers with credentials removed,
 * parsed body) for assertions. The real code refuses a loopback gateway unless
 * `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1` is set, so callers set it.
 *
 * @module testing/gateway/fake-gateway
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { THREE_FAMILY_CATALOG, type CatalogEntry } from './three-family-catalog.js';

/** Header names that carry a credential; never recorded. */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'proxy-authorization',
  'api-key',
  'x-api-key',
]);

/** One request the gateway received. */
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  /** Lower-cased header names, credential headers removed. */
  readonly headers: Readonly<Record<string, string>>;
  /** Whether an `Authorization` header arrived (its value is not kept). */
  readonly hadAuthorization: boolean;
  /** The JSON body, or `undefined` for a bodyless request. */
  readonly body: unknown;
  /** `Date.now()` when the request finished arriving. */
  readonly receivedAt: number;
}

/** The chat-completions request fields the scripts branch on. */
export interface ChatRequestBody {
  readonly model: string;
  readonly messages: readonly { readonly role: string; readonly content?: unknown }[];
  readonly [key: string]: unknown;
}

/** One tool call a scripted reply makes. `arguments` is a JSON string, as on the wire. */
export interface ScriptedToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** What the gateway does with one chat-completions request. */
export type ChatScript =
  | { readonly kind: 'text'; readonly content: string }
  | { readonly kind: 'tool_calls'; readonly calls: readonly ScriptedToolCall[] }
  | { readonly kind: 'content_filter'; readonly partial: string }
  | { readonly kind: 'empty_choices' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number };

/**
 * Picks the reply. `attempt` counts this model's chat requests so far,
 * starting at 1, so a script can fail once and then answer.
 */
export type ChatScripter = (model: string, body: ChatRequestBody, attempt: number) => ChatScript;

/** Token counts every scripted success reports. */
export const SCRIPTED_USAGE = { prompt_tokens: 42, completion_tokens: 17, total_tokens: 59 };

/** Default script: a text reply naming the model that served it. */
export const echoModelScript: ChatScripter = (model) => ({
  kind: 'text',
  content: `reply from ${model}`,
});

export interface FakeGateway {
  /** `http://127.0.0.1:<port>/v1` — the value for `NEXUS_OPENAI_COMPAT_URL`. */
  readonly baseUrl: string;
  /** Every request received, in arrival order. */
  readonly requests: readonly RecordedRequest[];
  /** The chat-completions requests only. */
  chatRequests(): readonly RecordedRequest[];
  setCatalog(entries: readonly CatalogEntry[]): void;
  setScript(script: ChatScripter): void;
  /** Forget recorded requests and per-model attempt counts. */
  clearRequests(): void;
  close(): Promise<void>;
}

export interface FakeGatewayOptions {
  readonly catalog?: readonly CatalogEntry[];
  readonly script?: ChatScripter;
}

interface GatewayState {
  catalog: readonly CatalogEntry[];
  script: ChatScripter;
  readonly requests: RecordedRequest[];
  readonly attempts: Map<string, number>;
}

/** Start a fake gateway on an ephemeral loopback port. */
export async function startFakeGateway(options: FakeGatewayOptions = {}): Promise<FakeGateway> {
  const state: GatewayState = {
    catalog: options.catalog ?? THREE_FAMILY_CATALOG,
    script: options.script ?? echoModelScript,
    requests: [],
    attempts: new Map(),
  };
  const server = createServer((req, res) => {
    void handle(state, req, res).catch((error: unknown) => {
      sendJson(res, 500, openAiError(`fake gateway fault: ${String(error)}`, 'server_error'));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(port)}/v1`,
    requests: state.requests,
    chatRequests: () => state.requests.filter((r) => r.path === '/v1/chat/completions'),
    setCatalog: (entries) => {
      state.catalog = entries;
    },
    setScript: (script) => {
      state.script = script;
    },
    clearRequests: () => {
      state.requests.length = 0;
      state.attempts.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}

async function handle(
  state: GatewayState,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const raw = await readBody(req);
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const body: unknown = raw === '' ? undefined : JSON.parse(raw);
  state.requests.push({
    method: req.method ?? 'GET',
    path,
    headers: recordableHeaders(req),
    hadAuthorization: req.headers.authorization !== undefined,
    body,
    receivedAt: Date.now(),
  });

  if (req.method === 'GET' && path === '/v1/models') {
    sendJson(res, 200, { object: 'list', data: state.catalog });
    return;
  }
  if (req.method === 'POST' && path === '/v1/chat/completions') {
    respondToChat(state, body, res);
    return;
  }
  sendJson(res, 404, openAiError(`no route ${req.method ?? ''} ${path}`, 'invalid_request_error'));
}

function respondToChat(state: GatewayState, body: unknown, res: ServerResponse): void {
  if (!isChatRequestBody(body)) {
    sendJson(res, 400, openAiError('body is not a chat request', 'invalid_request_error'));
    return;
  }
  if (body['stream'] === true) {
    // Nothing in the acceptance suite streams; fail loudly rather than fake it.
    sendJson(res, 400, openAiError('the fake gateway does not stream', 'invalid_request_error'));
    return;
  }
  if (!state.catalog.some((m) => m.id === body.model)) {
    sendJson(res, 404, {
      error: {
        message: `model ${body.model} not found`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }
  const attempt = (state.attempts.get(body.model) ?? 0) + 1;
  state.attempts.set(body.model, attempt);
  const script = state.script(body.model, body, attempt);
  if (script.kind === 'rate_limited') {
    res.setHeader('Retry-After', String(script.retryAfterSeconds));
    sendJson(res, 429, openAiError('rate limit reached for requests', 'rate_limit_exceeded'));
    return;
  }
  sendJson(res, 200, completionFor(body.model, script));
}

/** A `POST /v1/chat/completions` response body. */
type CompletionBody = Record<string, unknown>;

function completionFor(
  model: string,
  script: Exclude<ChatScript, { kind: 'rate_limited' }>
): CompletionBody {
  const envelope = {
    id: `chatcmpl-fake-${String(Date.now())}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    usage: SCRIPTED_USAGE,
  };
  switch (script.kind) {
    case 'empty_choices':
      return { ...envelope, choices: [] };
    case 'content_filter':
      return { ...envelope, choices: [choice({ content: script.partial }, 'content_filter')] };
    case 'text':
      return { ...envelope, choices: [choice({ content: script.content }, 'stop')] };
    case 'tool_calls':
      return {
        ...envelope,
        choices: [
          choice(
            {
              content: null,
              tool_calls: script.calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: c.arguments },
              })),
            },
            'tool_calls'
          ),
        ],
      };
  }
}

function choice(message: Record<string, unknown>, finishReason: string): Record<string, unknown> {
  return { index: 0, message: { role: 'assistant', ...message }, finish_reason: finishReason };
}

function openAiError(message: string, type: string): Record<string, unknown> {
  return { error: { message, type, code: null } };
}

function isChatRequestBody(value: unknown): value is ChatRequestBody {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['model'] === 'string' && Array.isArray(v['messages']);
}

function recordableHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (CREDENTIAL_HEADERS.has(name) || value === undefined) continue;
    out[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}
