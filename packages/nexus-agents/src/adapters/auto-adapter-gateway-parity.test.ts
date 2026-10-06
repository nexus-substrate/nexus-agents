/** Wire contract measured on mechanism A before #7150's thin alias. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../core/index.js';
import { FAKE_OPENAI_KEY } from '../testing/test-secrets.js';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import { tryCustomOpenAiAdapter } from './auto-adapter-gateway.js';
import { readOpenAICompatEnv, createOpenAICompatAdapter } from './openai-compat-adapter.js';
import { _resetGatewaySlotCatalog, setGatewaySlotCatalog } from './gateway-family-slots.js';
import { recordUsageEvent } from '../learning/usage-log.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(() => Promise.resolve([{ address: '8.8.8.8', family: 4 }])),
}));
vi.mock('../learning/usage-log.js', () => ({ recordUsageEvent: vi.fn() }));
vi.mock('./gateway-discovery.js', () => ({ gatewayDiscoveryStatus: () => 'failed' }));

const BASE = 'https://gateway.example.com/v1';
const logger = createLogger();
logger.setLevel('error');
const cases = [true, false].flatMap((catalogue) =>
  [true, false].flatMap((modelSet) =>
    ['chat', 'responses'].flatMap((surface) =>
      [true, false].flatMap((allowPrivate) =>
        ['bearer', 'api-key', 'extras'].map((auth) => ({
          catalogue,
          modelSet,
          surface,
          allowPrivate,
          auth,
        }))
      )
    )
  )
);

interface WireRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}
let requests: WireRequest[];

function reply(surface: string, model: string): Response {
  const body =
    surface === 'responses'
      ? {
          id: 'resp-TEST',
          object: 'response',
          created_at: 1,
          status: 'completed',
          model,
          output: [
            {
              id: 'msg-TEST',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'parity reply', annotations: [] }],
            },
          ],
          usage: { input_tokens: 42, output_tokens: 17, total_tokens: 59 },
        }
      : {
          id: 'chatcmpl-TEST',
          object: 'chat.completion',
          created: 1,
          model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'parity reply' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 42, completion_tokens: 17, total_tokens: 59 },
        };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetGatewaySlotCatalog();
  requests = [];
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'NEXUS_CUSTOM_MODEL',
    'NEXUS_OPENAI_COMPAT_AUTH_HEADER',
    'NEXUS_OPENAI_COMPAT_EXTRA_HEADERS',
  ])
    vi.stubEnv(name, '');
  vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', BASE);
  vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', FAKE_OPENAI_KEY);
  vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
  vi.stubGlobal('fetch', captureRequest);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  _resetGatewaySlotCatalog();
});

type ParityCase = (typeof cases)[number];

function captureRequest(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  if (typeof init?.body !== 'string') throw new Error('expected JSON request body');
  const body = JSON.parse(init.body) as Record<string, unknown>;
  if (typeof body['model'] !== 'string') throw new Error('expected wire model');
  requests.push({ url, headers: new Headers(init.headers), body });
  return Promise.resolve(reply(url.endsWith('/responses') ? 'responses' : 'chat', body['model']));
}

function configureCase(c: ParityCase): void {
  vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', c.surface);
  vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', c.allowPrivate ? '1' : '');
  // Missing means undefined, not the explicitly configured empty string.
  if (c.modelSet) vi.stubEnv('NEXUS_CUSTOM_MODEL', 'gpt-5.5');
  else Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_MODEL');
  if (c.auth === 'api-key') vi.stubEnv('NEXUS_OPENAI_COMPAT_AUTH_HEADER', 'api-key');
  if (c.auth === 'extras') vi.stubEnv('NEXUS_OPENAI_COMPAT_EXTRA_HEADERS', 'X-Tenant=TEST-tenant');
  if (c.catalogue) {
    const config = readOpenAICompatEnv();
    if (config === null) throw new Error('configured gateway required');
    setGatewaySlotCatalog([
      createOpenAICompatAdapter('gpt-5.5', { ...config, modelVerified: true }),
      createOpenAICompatAdapter('claude-opus-4-6', { ...config, modelVerified: true }),
    ]);
  }
}

function assertWire(c: ParityCase, expectedModel: string): void {
  expect(requests).toHaveLength(1);
  const wire = requests[0];
  if (wire === undefined) throw new Error('no outbound request measured');
  expect(wire.url).toBe(`${BASE}/${c.surface === 'responses' ? 'responses' : 'chat/completions'}`);
  expect(wire.body['model']).toBe(expectedModel);
  expect(wire.headers.get('authorization')).toBe(
    c.auth === 'api-key' ? null : `Bearer ${FAKE_OPENAI_KEY}`
  );
  expect(wire.headers.get('api-key')).toBe(c.auth === 'api-key' ? FAKE_OPENAI_KEY : null);
  expect(wire.headers.get('x-tenant')).toBe(c.auth === 'extras' ? 'TEST-tenant' : null);
  expect(wire.body[c.surface === 'responses' ? 'input' : 'messages']).toEqual([
    {
      role: 'user',
      content:
        c.surface === 'responses'
          ? [{ type: 'input_text', text: 'parity prompt' }]
          : 'parity prompt',
    },
  ]);
}

describe('custom-openai wire parity (48 environment combinations)', () => {
  it.each(cases)(
    '$catalogue catalogue, model=$modelSet, $surface, private=$allowPrivate, $auth',
    async (c) => {
      configureCase(c);
      const expectedModel = c.modelSet
        ? 'gpt-5.5'
        : c.catalogue
          ? 'claude-opus-4-6'
          : CUSTOM_API_DEFAULT_MODEL;
      const selection = tryCustomOpenAiAdapter(logger);
      expect(selection?.name).toBe('custom-openai');
      expect((selection?.adapter as { gatewayArm?: string }).gatewayArm).toBe('api:custom-openai');
      expect(selection?.modelVerified).toBe(c.catalogue);
      const result = await selection?.adapter.complete({
        messages: [{ role: 'user', content: 'parity prompt' }],
      });
      expect(result?.ok).toBe(true);
      assertWire(c, expectedModel);
      expect(recordUsageEvent).toHaveBeenCalledTimes(1);
      expect(recordUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'sdk-custom-openai',
          modelId: expectedModel,
          modelVerified: c.catalogue,
          inputTokens: 42,
          outputTokens: 17,
          success: true,
          priced: true,
        })
      );
    }
  );

  it('refuses a loopback fallback with ALLOW_PRIVATE off before an outbound request', () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'http://127.0.0.1:4000/v1');
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '');
    expect(() => tryCustomOpenAiAdapter(logger)).toThrow(/SSRF/);
    expect(requests).toHaveLength(0);
  });
});
