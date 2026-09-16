/**
 * Tests for the OpenAI-compatible gateway adapter (#2468).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readOpenAICompatEnv,
  discoverModels,
  buildOpenAICompatAdapters,
  createOpenAICompatAdapter,
  isGatewayModelAdapter,
  type OpenAICompatConfig,
} from './openai-compat-adapter.js';
import { ConfigError, ErrorCode, type ILogger } from '../core/index.js';
import type { UsageEvent } from '../learning/usage-log.js';

// Mock the OpenAI SDK so tests don't make real HTTP calls. `mockChatCreate` is
// hoisted so the #4606 delegation test can drive a 429 through the inner
// OpenAIAdapter; keep the real `APIError`, which that adapter does
// `instanceof` against.
const { mockList, mockChatCreate } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockChatCreate: vi.fn(),
}));
vi.mock('openai', async () => {
  const actual = await vi.importActual<typeof import('openai')>('openai');
  class MockOpenAI {
    models = { list: mockList };
    chat = { completions: { create: mockChatCreate } };
  }
  return { default: MockOpenAI, APIError: actual.APIError };
});

// #2503: stub the opencode-bridge so these tests stay focused on env-var
// precedence. Per-test overrides via mockReturnValueOnce when needed.
const { mockReadOpencodeGateway } = vi.hoisted(() => ({
  mockReadOpencodeGateway: vi.fn<(path: string) => unknown>(),
}));
// The discovery path reuses the SDK path's DNS-resolve-time SSRF guard (#3426).
// Stubbed so these tests perform no real lookups; two tests drive the rejection
// branch explicitly.
const { mockAssertHostPublic } = vi.hoisted(() => ({
  mockAssertHostPublic: vi.fn(),
}));
vi.mock('./sdk/custom-api-validation.js', () => ({
  assertCustomApiHostResolvesPublic: mockAssertHostPublic,
}));

vi.mock('../config/opencode-bridge.js', () => ({
  readOpencodeGateway: mockReadOpencodeGateway,
}));

// #4392 inc 2 step 4: capture the usage-log line the wrapper writes instead of
// appending to the data dir. Everything else in the module (the pricing chain
// `computeCostDetail`) stays real — the test is about what gets RECORDED.
const { mockRecordUsageEvent } = vi.hoisted(() => ({
  mockRecordUsageEvent: vi.fn<(event: UsageEvent) => void>(),
}));
vi.mock('../learning/usage-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../learning/usage-log.js')>();
  return { ...actual, recordUsageEvent: mockRecordUsageEvent };
});

describe('readOpenAICompatEnv (#2468 + #2503)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_OPENAI_COMPAT_URL'];
    delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
    delete process.env['NEXUS_OPENCODE_CONFIG'];
    delete process.env['NEXUS_OPENAI_COMPAT_ENDPOINT'];
    mockReadOpencodeGateway.mockReset();
    mockReadOpencodeGateway.mockReturnValue(null);
  });

  it('returns null when both env vars are unset', () => {
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns null when only URL is set', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns null when only key is set', () => {
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns null when env var is empty string', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = '';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns config when both vars are set', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    const result = readOpenAICompatEnv();
    // Previously `{ baseUrl, apiKey }` only; the config now carries the arm's
    // endpoint identity (#4392 inc 2 step 2), defaulted below.
    expect(result).toEqual({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
      endpoint: 'openai-compat',
    });
  });

  // #4392 increment 2 step 2: the gateway registers as ONE `api:<endpoint>`
  // arm. The identity is an operator-named endpoint id, never the URL.
  describe('endpoint identity (#4392 inc 2 step 2)', () => {
    beforeEach(() => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
      process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    });

    it('defaults the endpoint to openai-compat (the opencode.json providers key)', () => {
      expect(readOpenAICompatEnv()?.endpoint).toBe('openai-compat');
    });

    it('takes NEXUS_OPENAI_COMPAT_ENDPOINT when it is a valid endpoint id', () => {
      process.env['NEXUS_OPENAI_COMPAT_ENDPOINT'] = ' corp-proxy ';
      expect(readOpenAICompatEnv()?.endpoint).toBe('corp-proxy');
    });

    it.each(['Corp-Proxy', 'https://gateway.example/v1', 'a b', ''])(
      'falls back to the default when the override %j is not a valid endpoint id',
      (value) => {
        // The env schema reports the value as invalid at startup; the runtime
        // reader must never turn a URL (or a credential inside one) into an arm id.
        process.env['NEXUS_OPENAI_COMPAT_ENDPOINT'] = value;
        expect(readOpenAICompatEnv()?.endpoint).toBe('openai-compat');
      }
    );

    it('applies the same endpoint to the opencode.json path', () => {
      delete process.env['NEXUS_OPENAI_COMPAT_URL'];
      delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
      process.env['NEXUS_OPENCODE_CONFIG'] = '/tmp/opencode.json';
      process.env['NEXUS_OPENAI_COMPAT_ENDPOINT'] = 'corp-proxy';
      mockReadOpencodeGateway.mockReturnValue({
        baseURL: 'https://file-gateway/v1',
        apiKey: 'sk-from-file',
      });
      expect(readOpenAICompatEnv()?.endpoint).toBe('corp-proxy');
    });
  });

  it('trims whitespace from env vars', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = '  https://gateway.example/v1  ';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = '  sk-test  ';
    const result = readOpenAICompatEnv();
    expect(result?.baseUrl).toBe('https://gateway.example/v1');
    expect(result?.apiKey).toBe('sk-test');
  });

  // #4392 inc 3, panel option C: the deprecated NEXUS_CUSTOM_API_* pair is an
  // alias for the single-model `custom-openai` reader ONLY. This reader — the
  // gateway path (discovery, in-process voters, the api:<endpoint> arm) — is
  // reached through its own names, so renaming is what opts an operator in.
  describe('legacy NEXUS_CUSTOM_API_* pair does not feed this reader (#4392 inc 3, option C)', () => {
    const LEGACY = ['NEXUS_CUSTOM_API_BASE_URL', 'NEXUS_CUSTOM_API_KEY'] as const;
    const saved = new Map<string, string | undefined>();

    beforeEach(() => {
      for (const name of LEGACY) {
        saved.set(name, process.env[name]);
        Reflect.deleteProperty(process.env, name);
      }
    });

    afterEach(() => {
      for (const name of LEGACY) {
        const prev = saved.get(name);
        if (prev === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = prev;
      }
    });

    it('returns null when only the legacy pair is set', () => {
      process.env['NEXUS_CUSTOM_API_BASE_URL'] = 'https://legacy.example/v1';
      process.env['NEXUS_CUSTOM_API_KEY'] = 'sk-TESTFAKE-legacy-NOT-REAL-0000';
      expect(readOpenAICompatEnv()).toBeNull();
      expect(mockReadOpencodeGateway).not.toHaveBeenCalled();
    });

    it('does not complete a half-set new pair from the legacy spelling', () => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
      process.env['NEXUS_CUSTOM_API_KEY'] = 'sk-TESTFAKE-legacy-NOT-REAL-0000';
      expect(readOpenAICompatEnv()).toBeNull();
    });
  });

  // #2503: precedence — env > opencode.json > unconfigured
  describe('opencode.json precedence (#2503)', () => {
    it('env vars win over opencode.json when both are configured', () => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://env-gateway/v1';
      process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-from-env';
      process.env['NEXUS_OPENCODE_CONFIG'] = '/tmp/opencode.json';
      mockReadOpencodeGateway.mockReturnValue({
        baseURL: 'https://file-gateway/v1',
        apiKey: 'sk-from-file',
      });

      const result = readOpenAICompatEnv();
      expect(result?.baseUrl).toBe('https://env-gateway/v1');
      expect(result?.apiKey).toBe('sk-from-env');
      expect(mockReadOpencodeGateway).not.toHaveBeenCalled();
    });

    it('falls back to opencode.json when env vars are unset', () => {
      process.env['NEXUS_OPENCODE_CONFIG'] = '/tmp/opencode.json';
      mockReadOpencodeGateway.mockReturnValue({
        baseURL: 'https://file-gateway/v1',
        apiKey: 'sk-from-file',
      });

      const result = readOpenAICompatEnv();
      expect(result?.baseUrl).toBe('https://file-gateway/v1');
      expect(result?.apiKey).toBe('sk-from-file');
      expect(mockReadOpencodeGateway).toHaveBeenCalledWith('/tmp/opencode.json');
    });

    it('returns null when env unset, opencode path set, but file resolves to null', () => {
      process.env['NEXUS_OPENCODE_CONFIG'] = '/tmp/opencode.json';
      mockReadOpencodeGateway.mockReturnValue(null);
      expect(readOpenAICompatEnv()).toBeNull();
    });

    it('does not invoke opencode-bridge when NEXUS_OPENCODE_CONFIG is unset', () => {
      // Both env vars unset, no opencode path either.
      expect(readOpenAICompatEnv()).toBeNull();
      expect(mockReadOpencodeGateway).not.toHaveBeenCalled();
    });

    it('falls back to opencode.json when only one env var is set', () => {
      // Half-configured env (URL only) — must NOT be treated as configured;
      // fall through to opencode.json path.
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://env-gateway/v1';
      process.env['NEXUS_OPENCODE_CONFIG'] = '/tmp/opencode.json';
      mockReadOpencodeGateway.mockReturnValue({
        baseURL: 'https://file-gateway/v1',
        apiKey: 'sk-from-file',
      });

      const result = readOpenAICompatEnv();
      expect(result?.baseUrl).toBe('https://file-gateway/v1');
    });
  });
});

describe('discoverModels (#2468)', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockAssertHostPublic.mockReset();
    mockAssertHostPublic.mockResolvedValue({ ok: true });
  });

  const config: OpenAICompatConfig = {
    baseUrl: 'https://gateway.example/v1',
    apiKey: 'sk-test',
  };

  it('returns all models the gateway exposes', async () => {
    mockList.mockResolvedValue({
      data: [
        { id: 'gpt-4o', created: 1700000000, owned_by: 'openai' },
        { id: 'claude-sonnet-4', created: 1710000000, owned_by: 'anthropic' },
        { id: 'gemini-2-pro', created: 1720000000, owned_by: 'google' },
      ],
    });
    const result = await discoverModels(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((m) => m.id)).toEqual(['gpt-4o', 'claude-sonnet-4', 'gemini-2-pro']);
  });

  it('preserves created + ownedBy fields when present', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 'm1', created: 1234567890, owned_by: 'someone' }],
    });
    const result = await discoverModels(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.created).toBe(1234567890);
    expect(result.value[0]?.ownedBy).toBe('someone');
  });

  it('handles models without optional fields', async () => {
    mockList.mockResolvedValue({ data: [{ id: 'minimal-model' }] });
    const result = await discoverModels(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.id).toBe('minimal-model');
    expect(result.value[0]?.created).toBeUndefined();
    expect(result.value[0]?.ownedBy).toBeUndefined();
  });

  it('returns ConfigError with actionable message when gateway fails', async () => {
    mockList.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const result = await discoverModels(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConfigError);
    // Previously asserted the full URL; the message now names the host only
    // (#4392 inc 3) because it lands on a warn line and a URL can carry userinfo.
    expect(result.error.message).toContain('gateway.example');
    expect(result.error.message).toContain('NEXUS_OPENAI_COMPAT_URL');
    expect(result.error.message).toContain('connect ECONNREFUSED');
  });

  // #4392 inc 3, no-logging parity: the failure message is what
  // `cli-server-gateway` puts on its probe-failed warn line.
  describe('failure message carries neither the key nor the full URL (#4392 inc 3)', () => {
    const secretConfig: OpenAICompatConfig = {
      baseUrl: 'https://u:pw-TESTFAKE@gateway.example/v1',
      apiKey: 'sk-TESTFAKE-bearer-NOT-REAL-0000',
    };

    it('redacts a 401 body that echoes the bearer', async () => {
      mockList.mockRejectedValue(
        new Error(
          `401 Unauthorized: invalid api key "Bearer ${secretConfig.apiKey}" (${secretConfig.apiKey})`
        )
      );
      const result = await discoverModels(secretConfig);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).not.toContain(secretConfig.apiKey);
      expect(result.error.message).toContain('401 Unauthorized');
      expect(result.error.message).toContain('<redacted>');
    });

    it('names the host, not the URL with userinfo', async () => {
      mockList.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const result = await discoverModels(secretConfig);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('gateway.example');
      expect(result.error.message).not.toContain('pw-TESTFAKE');
    });

    it('names the host, not the URL, when the catalogue is over the cap', async () => {
      mockList.mockResolvedValue({
        data: Array.from({ length: 257 }, (_, i) => ({ id: `m${String(i)}` })),
      });
      const result = await discoverModels(secretConfig);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).not.toContain('pw-TESTFAKE');
    });
  });

  it('handles 401 / auth failures with the same actionable message', async () => {
    mockList.mockRejectedValue(new Error('401 Unauthorized'));
    const result = await discoverModels(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('NEXUS_OPENAI_COMPAT_KEY');
  });

  // #4392 inc 2 step 2: a discovered id becomes a dispatch target, a usage-log
  // key and (through the catalogue) a pricing key. Whitespace and control
  // characters have no place in any of those.
  describe('model-id validation (#4392 inc 2 step 2)', () => {
    function makeLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        setLevel: vi.fn(),
        getLevel: vi.fn(),
        setFormat: vi.fn(),
        setDestination: vi.fn(),
        child: vi.fn(),
      };
      logger.child.mockReturnValue(logger);
      return logger;
    }

    it('drops ids carrying whitespace or control characters and keeps the rest', async () => {
      mockList.mockResolvedValue({
        data: [
          { id: 'gpt-4o' },
          { id: 'bad id' },
          { id: 'bad\u0000id' },
          { id: 'bad\nid' },
          { id: 'org/model:tag_v1.2' },
        ],
      });
      const result = await discoverModels(config, makeLogger());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.map((m) => m.id)).toEqual(['gpt-4o', 'org/model:tag_v1.2']);
    });

    it('warns with the dropped COUNT only — never an offending id', async () => {
      mockList.mockResolvedValue({
        data: [{ id: 'gpt-4o' }, { id: 'sk-SECRET leaked' }, { id: '\u0007bell' }],
      });
      const logger = makeLogger();
      await discoverModels(config, logger);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const call = JSON.stringify(logger.warn.mock.calls[0]);
      expect(call).toContain('2');
      expect(call).not.toContain('sk-SECRET');
      expect(call).not.toContain('bell');
    });

    it('does not warn when every id is valid', async () => {
      mockList.mockResolvedValue({ data: [{ id: 'gpt-4o' }] });
      const logger = makeLogger();
      await discoverModels(config, logger);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rejects an id longer than 128 characters', async () => {
      mockList.mockResolvedValue({ data: [{ id: 'a'.repeat(129) }, { id: 'a'.repeat(128) }] });
      const result = await discoverModels(config, makeLogger());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
    });
  });

  // #4392: this path can take its base URL from a FILE
  // (`NEXUS_OPENCODE_CONFIG` → opencode.json), not only an env var, and it runs
  // during server bootstrap — so it needs the guards the sibling SDK path
  // already had.
  describe('discovery guards (#4392)', () => {
    it('refuses a gateway whose host resolves privately', async () => {
      mockAssertHostPublic.mockResolvedValue({
        ok: false,
        error: new Error('resolves to a private address'),
      });

      const result = await discoverModels(config);

      expect(result.ok).toBe(false);
    });

    it('checks the host BEFORE opening a connection', async () => {
      // The guard is worthless if the request has already gone out.
      mockAssertHostPublic.mockResolvedValue({ ok: false, error: new Error('blocked') });

      await discoverModels(config);

      expect(mockList).not.toHaveBeenCalled();
    });

    it('rejects an implausibly large catalogue rather than one adapter each', async () => {
      mockList.mockResolvedValue({
        data: Array.from({ length: 300 }, (_v, i) => ({
          id: `m-${String(i)}`,
          created: 1,
          owned_by: 'x',
        })),
      });

      const result = await discoverModels(config);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('cap');
    });

    it('still accepts a large-but-plausible catalogue', async () => {
      // Aggregators legitimately serve hundreds; the cap is a sanity ceiling on
      // adapter construction, not a claim about what a gateway may offer.
      mockList.mockResolvedValue({
        data: Array.from({ length: 200 }, (_v, i) => ({
          id: `m-${String(i)}`,
          created: 1,
          owned_by: 'x',
        })),
      });

      expect((await discoverModels(config)).ok).toBe(true);
    });
  });
});

describe('createOpenAICompatAdapter (#2468)', () => {
  it('creates an OpenAIAdapter pointed at the gateway', () => {
    const adapter = createOpenAICompatAdapter('any-model', {
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    expect(adapter).toBeDefined();
    // BaseAdapter.providerId is 'openai' by construction; modelId is what we passed.
    expect(adapter.modelId).toBe('any-model');
  });
});

// #4392 increment 2, step 4: the per-model adapter is the telemetry writer,
// so it carries the arm it belongs to, and the usage line it writes prices by
// the arm's `NEXUS_GATEWAY_COST` declaration — never by the model id alone.
// Before this, a `claude-*` id served by an undeclared gateway recorded
// Anthropic's list price as `priced: true`: a measurement of nothing.
describe('gateway cost in the usage log (#4392 inc 2 step 4)', () => {
  const gateway: OpenAICompatConfig = { baseUrl: 'https://gateway.example/v1', apiKey: 'sk-test' };

  function completion(prompt: number, output: number): unknown {
    return {
      choices: [{ message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt + output },
      model: 'claude-sonnet-4-6',
    };
  }

  async function recordedEvent(): Promise<UsageEvent> {
    const adapter = createOpenAICompatAdapter('claude-sonnet-4-6', gateway);
    mockChatCreate.mockResolvedValueOnce(completion(1000, 200));
    const result = await adapter.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.ok).toBe(true);
    expect(mockRecordUsageEvent).toHaveBeenCalledTimes(1);
    const event = mockRecordUsageEvent.mock.calls[0]?.[0];
    if (event === undefined) throw new Error('no usage event recorded');
    return event;
  }

  beforeEach(() => {
    mockChatCreate.mockReset();
    mockRecordUsageEvent.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks the adapter with the arm it registers under, defaulting the endpoint', () => {
    const defaulted = createOpenAICompatAdapter('any-model', gateway);
    expect(isGatewayModelAdapter(defaulted)).toBe(true);
    if (!isGatewayModelAdapter(defaulted)) return;
    expect(defaulted.gatewayArm).toBe('api:openai-compat');
    // `providerId` is unchanged: `inFamilyFallback` and `authRemediation` key on it.
    expect(defaulted.providerId).toBe('openai');

    const named = createOpenAICompatAdapter('any-model', { ...gateway, endpoint: 'corp-proxy' });
    expect(isGatewayModelAdapter(named) && named.gatewayArm).toBe('api:corp-proxy');
  });

  it('is not confused by an adapter that merely has a gatewayArm-shaped field', () => {
    const impostor = { ...createOpenAICompatAdapter('m', gateway), gatewayArm: 'not-an-arm' };
    expect(isGatewayModelAdapter(impostor)).toBe(false);
  });

  it('records UNKNOWN for an undeclared gateway — not the vendor list price (the #4392 misreport)', async () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    const event = await recordedEvent();
    expect(event.modelId).toBe('claude-sonnet-4-6');
    expect(event.inputTokens).toBe(1000);
    expect(event.outputTokens).toBe(200);
    expect(event.priced).toBe(false);
    expect(event.usdCost).toBe(0);
    expect(event).not.toHaveProperty('priceSource');
  });

  it('records a MEASURED $0 when the gateway is declared free, sourced to the arm', async () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'openai-compat=free');
    const event = await recordedEvent();
    expect(event.priced).toBe(true);
    expect(event.usdCost).toBe(0);
    expect(event.priceSource).toBe('api:openai-compat');
  });

  it('records the flat rate when the gateway is declared priced:<in>,<out>', async () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:2,10');
    const event = await recordedEvent();
    expect(event.priced).toBe(true);
    // 1000 in @ $2/1M + 200 out @ $10/1M
    expect(event.usdCost).toBeCloseTo(0.004, 9);
    expect(event.priceSource).toBe('api:openai-compat');
  });
});

describe('buildOpenAICompatAdapters (#2468)', () => {
  let originalUrl: string | undefined;
  let originalKey: string | undefined;
  let originalOpencode: string | undefined;

  beforeEach(() => {
    originalUrl = process.env['NEXUS_OPENAI_COMPAT_URL'];
    originalKey = process.env['NEXUS_OPENAI_COMPAT_KEY'];
    originalOpencode = process.env['NEXUS_OPENCODE_CONFIG'];
    delete process.env['NEXUS_OPENCODE_CONFIG'];
    mockList.mockReset();
    mockReadOpencodeGateway.mockReset();
    mockReadOpencodeGateway.mockReturnValue(null);
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env['NEXUS_OPENAI_COMPAT_URL'];
    else process.env['NEXUS_OPENAI_COMPAT_URL'] = originalUrl;
    if (originalKey === undefined) delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
    else process.env['NEXUS_OPENAI_COMPAT_KEY'] = originalKey;
    if (originalOpencode === undefined) delete process.env['NEXUS_OPENCODE_CONFIG'];
    else process.env['NEXUS_OPENCODE_CONFIG'] = originalOpencode;
  });

  it('returns null when env not configured (caller treats as "no source")', async () => {
    delete process.env['NEXUS_OPENAI_COMPAT_URL'];
    delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
    const result = await buildOpenAICompatAdapters();
    expect(result).toBeNull();
  });

  it('returns one adapter per discovered model when configured', async () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    mockList.mockResolvedValue({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    const result = await buildOpenAICompatAdapters();
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(true);
    if (result === null) return;
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((a) => a.modelId)).toEqual(['a', 'b', 'c']);
  });

  it('propagates discovery errors', async () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    mockList.mockRejectedValue(new Error('gateway down'));
    const result = await buildOpenAICompatAdapters();
    expect(result?.ok).toBe(false);
  });
});

/**
 * The gateway adapter delegates the actual request to an inner `OpenAIAdapter`
 * and returns its `Result` untouched, so the #4606 header capture reaches this
 * path for free. Pinned here so a future refactor that rebuilds the error on
 * the way out cannot silently drop the horizon again.
 */
describe('openai-compat retry-after delegation (#4606)', () => {
  it("passes the inner adapter's captured Retry-After straight through", async () => {
    const { APIError } = await import('openai');
    mockChatCreate.mockRejectedValueOnce(
      new APIError(
        429,
        { error: { message: 'Rate limit reached', type: 'rate_limit_exceeded' } },
        'Rate limit reached',
        new Headers({ 'retry-after': '3600' })
      )
    );
    const adapter = createOpenAICompatAdapter('gateway-model', {
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'test-key',
    });

    const result = await adapter.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      expect(result.error.context?.['retryAfterMs']).toBe(3_600_000);
    }
  });
});
