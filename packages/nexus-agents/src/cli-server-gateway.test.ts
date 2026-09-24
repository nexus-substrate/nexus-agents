/**
 * Tests for tryWireGatewayAdapter (#2502, child 2 of epic #2500).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ok,
  err,
  ConfigError,
  FixedTimeProvider,
  resetTimeProvider,
  setTimeProvider,
  type IModelAdapter,
  type ILogger,
} from './core/index.js';
import { checkGatewayHost, GatewayHostRefusedError } from './adapters/gateway-host-status.js';
import { ensureGatewayDiscovered, setGatewayRediscovery } from './adapters/gateway-rediscovery.js';

const buildOpenAICompatAdaptersMock = vi.fn();
const readOpenAICompatEnvMock = vi.fn();
const readOpenAICompatEndpointMock = vi.fn(() => 'openai-compat');

vi.mock('./adapters/openai-compat-adapter.js', () => ({
  buildOpenAICompatAdapters: (...args: unknown[]) =>
    buildOpenAICompatAdaptersMock(...args) as unknown,
  readOpenAICompatEnv: (...args: unknown[]) => readOpenAICompatEnvMock(...args) as unknown,
  readOpenAICompatEndpoint: () => readOpenAICompatEndpointMock(),
}));

import {
  tryWireGatewayAdapter,
  tryWireGatewayAdapters,
  resolveDefaultModelAdapter,
  registerGatewayArm,
  wireGateway,
  _resetCliSubprocessFallbackNotice,
} from './cli-server-gateway.js';
import { _resetGatewayCatalogs, getGatewayCatalog } from './adapters/sdk/gateway-catalog.js';
import {
  _resetGatewaySlotCatalog,
  resolveGatewaySlot,
  setGatewaySlotCatalog,
} from './adapters/gateway-family-slots.js';
import { createUnifiedRegistry } from './adapters/unified-registry.js';
import type { EndpointArmId } from './cli-adapters/types.js';
import type { IResilientAdapter } from './adapters/resilient-adapter-types.js';

function makeMockAdapter(modelId: string): IModelAdapter {
  return {
    providerId: 'openai-compat',
    modelId,
    capabilities: [],
    complete: () =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'EXECUTION_ERROR' as const, message: 'mock' },
      } as never),
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  };
}

type MockLogger = ILogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

function makeMockLogger(): MockLogger {
  const logger: MockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
    child: vi.fn(),
  } as unknown as MockLogger;
  (logger.child as unknown as ReturnType<typeof vi.fn>).mockReturnValue(logger);
  return logger;
}

describe('tryWireGatewayAdapter', () => {
  let savedSandbox: string | undefined;
  let savedExit: typeof process.exit;

  beforeEach(() => {
    savedSandbox = process.env['NEXUS_SANDBOX'];
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    savedExit = process.exit;
    process.exit = vi.fn((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    if (savedSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
    else process.env['NEXUS_SANDBOX'] = savedSandbox;
    process.exit = savedExit;
  });

  describe('non-sandbox mode', () => {
    it('returns undefined when env vars unset', async () => {
      readOpenAICompatEnvMock.mockReturnValue(null);
      const result = await tryWireGatewayAdapter(makeMockLogger());
      expect(result).toBeUndefined();
      expect(buildOpenAICompatAdaptersMock).not.toHaveBeenCalled();
    });

    it('returns undefined + warns when probe fails', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(err(new ConfigError('ENOTFOUND')));
      const logger = makeMockLogger();
      const result = await tryWireGatewayAdapter(logger);
      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('probe failed'),
        expect.objectContaining({ error: expect.stringContaining('ENOTFOUND') as unknown })
      );
    });

    it('returns first adapter when probe succeeds', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      const adapters = [makeMockAdapter('claude-sonnet-4-6'), makeMockAdapter('gpt-5-nano')];
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
      const logger = makeMockLogger();
      const result = await tryWireGatewayAdapter(logger);
      expect(result).toBe(adapters[0]);
      // Previously pinned `baseUrl: 'https://gateway.example/v1'`; the line
      // carries the host only since #4392 inc 3 (a base URL can carry userinfo).
      expect(logger.info).toHaveBeenCalledWith(
        'OpenAI-compatible gateway wired',
        expect.objectContaining({
          host: 'gateway.example',
          modelCount: 2,
        })
      );
    });

    it('returns undefined when gateway returns 0 models (without exiting)', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok([]));
      const logger = makeMockLogger();
      const result = await tryWireGatewayAdapter(logger);
      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('0 models'));
    });
  });

  describe('sandbox mode', () => {
    beforeEach(() => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
    });

    it('exits when env vars unset', async () => {
      readOpenAICompatEnvMock.mockReturnValue(null);
      const logger = makeMockLogger();
      await expect(tryWireGatewayAdapter(logger)).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Sandbox mode active but NEXUS_OPENAI_COMPAT_URL'),
        expect.any(Error)
      );
    });

    it('exits when probe fails', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(err(new ConfigError('ECONNREFUSED')));
      const logger = makeMockLogger();
      await expect(tryWireGatewayAdapter(logger)).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Sandbox mode active and OpenAI-compatible gateway probe failed'),
        expect.any(Error)
      );
    });

    it('exits when gateway returns 0 models', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok([]));
      const logger = makeMockLogger();
      await expect(tryWireGatewayAdapter(logger)).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('returns first adapter when probe succeeds', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      const adapters = [makeMockAdapter('m1'), makeMockAdapter('m2')];
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
      const result = await tryWireGatewayAdapter(makeMockLogger());
      expect(result).toBe(adapters[0]);
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('does not log the API key when wiring succeeds', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-secret-key-should-not-leak',
      });
      const adapters = [makeMockAdapter('m1')];
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
      const logger = makeMockLogger();
      await tryWireGatewayAdapter(logger);
      const allLogCalls = [
        ...logger.info.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls,
        ...logger.debug.mock.calls,
      ];
      const flat = JSON.stringify(allLogCalls);
      expect(flat).not.toContain('sk-secret-key-should-not-leak');
    });

    it('logs the gateway hostname only — never the full base URL (#4392 inc 3)', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://u:pw-TESTFAKE@gateway.example/v1',
        apiKey: 'sk-TESTFAKE-NOT-REAL-0000',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok([makeMockAdapter('m1')]));
      const logger = makeMockLogger();
      await tryWireGatewayAdapter(logger);
      const flat = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
      expect(flat).toContain('gateway.example');
      expect(flat).not.toContain('pw-TESTFAKE');
      expect(flat).not.toContain('https://u:');
    });
  });

  // #4392 inc 3, panel option C: the deprecated NEXUS_CUSTOM_API_* pair is an
  // alias for the single-model `custom-openai` reader only. Driven through the
  // REAL env reader (not the file-level mock) so the pin covers the seam.
  describe('legacy NEXUS_CUSTOM_API_* pair alone does not wire the gateway (#4392 inc 3)', () => {
    const NAMES = [
      'NEXUS_CUSTOM_API_BASE_URL',
      'NEXUS_CUSTOM_API_KEY',
      'NEXUS_OPENAI_COMPAT_URL',
      'NEXUS_OPENAI_COMPAT_KEY',
      'NEXUS_OPENCODE_CONFIG',
    ] as const;
    const saved = new Map<string, string | undefined>();

    beforeEach(async () => {
      for (const name of NAMES) {
        saved.set(name, process.env[name]);
        Reflect.deleteProperty(process.env, name);
      }
      const actual = await vi.importActual<typeof import('./adapters/openai-compat-adapter.js')>(
        './adapters/openai-compat-adapter.js'
      );
      readOpenAICompatEnvMock.mockImplementation(() => actual.readOpenAICompatEnv());
      _resetCliSubprocessFallbackNotice();
    });

    afterEach(() => {
      for (const name of NAMES) {
        const prev = saved.get(name);
        if (prev === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = prev;
      }
    });

    it('returns undefined, never probes, and tells the operator which names opt in', async () => {
      process.env['NEXUS_CUSTOM_API_BASE_URL'] = 'https://legacy.example/v1';
      process.env['NEXUS_CUSTOM_API_KEY'] = 'sk-TESTFAKE-legacy-NOT-REAL-0000';
      const logger = makeMockLogger();

      const result = await tryWireGatewayAdapters(logger);

      expect(result).toBeUndefined();
      expect(buildOpenAICompatAdaptersMock).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('NEXUS_OPENAI_COMPAT_URL') as unknown
      );
    });

    it('control: the same values under the NEW names do reach the probe', async () => {
      process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://legacy.example/v1';
      process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-TESTFAKE-legacy-NOT-REAL-0000';
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok([makeMockAdapter('m1')]));

      const result = await tryWireGatewayAdapters(makeMockLogger());

      expect(result).toHaveLength(1);
      expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('tryWireGatewayAdapters (#4040 — full list for voter diversity)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
  });

  it('returns ALL discovered adapters (not just the first)', async () => {
    readOpenAICompatEnvMock.mockReturnValue({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    const adapters = [
      makeMockAdapter('model-a'),
      makeMockAdapter('model-b'),
      makeMockAdapter('model-c'),
    ];
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
    const result = await tryWireGatewayAdapters(makeMockLogger());
    expect(result).toEqual(adapters);
    // The singular wrapper still yields only the first (existing single-adapter consumers).
    expect(await tryWireGatewayAdapter(makeMockLogger())).toBe(adapters[0]);
  });

  it('returns undefined when no gateway is configured', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    expect(await tryWireGatewayAdapters(makeMockLogger())).toBeUndefined();
  });
});

describe('CLI subprocess fallback notice (#4255)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    _resetCliSubprocessFallbackNotice();
  });

  it('logs once when no gateway env is configured', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    const logger = makeMockLogger();
    await tryWireGatewayAdapters(logger);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('NEXUS_OPENAI_COMPAT_URL') as unknown
    );
  });

  it('does not log when a gateway is configured and wiring succeeds', async () => {
    readOpenAICompatEnvMock.mockReturnValue({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok([makeMockAdapter('model-a')]));
    const logger = makeMockLogger();
    await tryWireGatewayAdapters(logger);
    const calls = [...logger.info.mock.calls, ...logger.warn.mock.calls] as unknown[][];
    const flat = JSON.stringify(calls);
    expect(flat).not.toContain('NEXUS_OPENAI_COMPAT_URL');
  });

  it('logs once even when the probe fails or returns 0 models (still no usable gateway)', async () => {
    readOpenAICompatEnvMock.mockReturnValue({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok([]));
    const logger = makeMockLogger();
    await tryWireGatewayAdapters(logger);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('NEXUS_OPENAI_COMPAT_URL') as unknown
    );
  });

  it('is emitted only once per process even across repeated calls (once-guard)', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    const loggerA = makeMockLogger();
    const loggerB = makeMockLogger();
    await tryWireGatewayAdapters(loggerA);
    await tryWireGatewayAdapters(loggerB);
    expect(loggerA.info).toHaveBeenCalledTimes(1);
    expect(loggerB.info).not.toHaveBeenCalled();
  });
});

describe('resolveDefaultModelAdapter (#4040 / #6651)', () => {
  const registryDefault = makeMockAdapter('cli-default');
  const registry = { getDefault: () => registryDefault };

  beforeEach(() => {
    _resetGatewaySlotCatalog();
  });

  afterEach(() => {
    _resetGatewaySlotCatalog();
  });

  it('falls back to the primary gateway adapter when no catalogue is registered', () => {
    const gw = [makeMockAdapter('gw-a'), makeMockAdapter('gw-b')];
    expect(resolveDefaultModelAdapter(gw, registry)).toBe(gw[0]);
  });

  it('falls back to the registry default when no gateway adapters and no catalogue', () => {
    expect(resolveDefaultModelAdapter(undefined, registry)).toBe(registryDefault);
    expect(resolveDefaultModelAdapter([], registry)).toBe(registryDefault);
  });

  it('uses the ranked default over listing order when catalogue is registered (#6651)', () => {
    // Listing order puts gpt-4o-mini first, but claude-3-7-sonnet is a tier 3 flagship.
    const mini = makeMockAdapter('gpt-4o-mini');
    const sonnet = makeMockAdapter('claude-3-7-sonnet');
    const gw = [mini, sonnet];
    setGatewaySlotCatalog(gw);

    expect(resolveDefaultModelAdapter(gw, registry)).toBe(sonnet);
  });

  it('honours NEXUS_CUSTOM_MODEL override when catalogue lists it (#6651)', () => {
    const mini = makeMockAdapter('gpt-4o-mini');
    const sonnet = makeMockAdapter('claude-3-7-sonnet');
    const gw = [mini, sonnet];
    setGatewaySlotCatalog(gw);

    const env = { NEXUS_CUSTOM_MODEL: 'gpt-4o-mini' };
    expect(resolveDefaultModelAdapter(gw, registry, env)).toBe(mini);
  });

  it('falls back to registry default when catalogue holds no chat models (#6651)', () => {
    const whisper = makeMockAdapter('whisper-1');
    const gw = [whisper];
    setGatewaySlotCatalog(gw);

    expect(resolveDefaultModelAdapter(gw, registry)).toBe(registryDefault);
  });
});

// #4392 increment 2 step 2: the discovered models become ONE `api:<endpoint>`
// arm in the adapter registry, in EVERY billing mode — the arm is what the
// breaker, the cost declaration and (later) routing key on.
describe('registerGatewayArm (#4392 inc 2 step 2)', () => {
  let savedBilling: string | undefined;

  function makeRegistry(): {
    registerApiArm: ReturnType<
      typeof vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>
    >;
    getLogger: () => ILogger;
  } {
    return {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };
  }

  beforeEach(() => {
    savedBilling = process.env['NEXUS_BILLING_MODE'];
    _resetGatewayCatalogs();
  });

  afterEach(() => {
    if (savedBilling === undefined) delete process.env['NEXUS_BILLING_MODE'];
    else process.env['NEXUS_BILLING_MODE'] = savedBilling;
  });

  it.each(['plan', 'api'])('registers one api:<endpoint> arm in billing mode %s', (mode) => {
    process.env['NEXUS_BILLING_MODE'] = mode;
    const registry = makeRegistry();
    const adapters = [makeMockAdapter('gw-a'), makeMockAdapter('gw-b')];

    const arm = registerGatewayArm(adapters, 'openai-compat', registry);

    expect(arm).toBe('api:openai-compat');
    expect(registry.registerApiArm).toHaveBeenCalledTimes(1);
    const [registeredId, registered] = registry.registerApiArm.mock.calls[0] ?? [];
    expect(registeredId).toBe('api:openai-compat');
    expect(registered?.modelId).toBe('gw-a');
    expect(registered?.getHealth()?.source).toBe('api');
  });

  it('publishes the catalogue under the arm so bare priced can price per model', () => {
    const registry = makeRegistry();
    registerGatewayArm([makeMockAdapter('gw-a'), makeMockAdapter('gw-b')], 'corp-proxy', registry);
    expect(getGatewayCatalog('api:corp-proxy')).toEqual(['gw-a', 'gw-b']);
  });

  it('re-registering the same arm keeps the NEW catalogue (the old arm is disposed first)', () => {
    // Uses the real registry: registerApiArm disposes the earlier adapter,
    // whose dispose() clears the catalogue — so the set must come after.
    const registry = createUnifiedRegistry({ logger: makeMockLogger() });
    registerGatewayArm([makeMockAdapter('gw-a')], 'openai-compat', registry);
    registerGatewayArm(
      [makeMockAdapter('gw-b'), makeMockAdapter('gw-c')],
      'openai-compat',
      registry
    );
    expect(getGatewayCatalog('api:openai-compat')).toEqual(['gw-b', 'gw-c']);
    registry.dispose();
  });

  it('registers nothing when no gateway is configured (undefined or empty)', () => {
    const registry = makeRegistry();
    expect(registerGatewayArm(undefined, 'openai-compat', registry)).toBeUndefined();
    expect(registerGatewayArm([], 'openai-compat', registry)).toBeUndefined();
    expect(registry.registerApiArm).not.toHaveBeenCalled();
    expect(getGatewayCatalog('api:openai-compat')).toBeUndefined();
  });

  it('refuses an endpoint that is not a valid endpoint id rather than minting a garbage arm', () => {
    const registry = makeRegistry();
    expect(registerGatewayArm([makeMockAdapter('gw-a')], 'https://x', registry)).toBeUndefined();
    expect(registry.registerApiArm).not.toHaveBeenCalled();
  });
});

describe('wireGateway (#4392 inc 2 step 2 — discovery + arm in one call)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    readOpenAICompatEndpointMock.mockReset();
    readOpenAICompatEndpointMock.mockReturnValue('corp-proxy');
    _resetGatewayCatalogs();
    _resetGatewaySlotCatalog();
  });

  it('registers the discovered models as api:<endpoint> and returns them for the tools', async () => {
    readOpenAICompatEnvMock.mockReturnValue({ baseUrl: 'https://gw/v1', apiKey: 'sk' });
    const adapters = [makeMockAdapter('gw-a'), makeMockAdapter('gw-b')];
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };

    const returned = await wireGateway(makeMockLogger(), registry);

    expect(returned).toBe(adapters);
    expect(registry.registerApiArm).toHaveBeenCalledTimes(1);
    expect(registry.registerApiArm.mock.calls[0]?.[0]).toBe('api:corp-proxy');
    expect(getGatewayCatalog('api:corp-proxy')).toEqual(['gw-a', 'gw-b']);
  });

  it('registers nothing and returns undefined when no gateway is configured', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };
    // A stale catalogue from an earlier wiring must not outlive the gateway.
    setGatewaySlotCatalog([makeMockAdapter('gpt-5.5')]);

    expect(await wireGateway(makeMockLogger(), registry)).toBeUndefined();
    expect(registry.registerApiArm).not.toHaveBeenCalled();
    expect(resolveGatewaySlot('claude')).toEqual({ kind: 'inactive' });
  });

  it('registers the family-slot catalogue, so each slot resolves in its family (#6604)', async () => {
    readOpenAICompatEnvMock.mockReturnValue({ baseUrl: 'https://gw/v1', apiKey: 'sk' });
    buildOpenAICompatAdaptersMock.mockResolvedValue(
      ok([makeMockAdapter('gpt-5.5'), makeMockAdapter('claude-sonnet-4-6')])
    );
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };

    await wireGateway(makeMockLogger(), registry);

    const claude = resolveGatewaySlot('claude');
    expect(claude.kind === 'resolved' && claude.adapter.modelId).toBe('claude-sonnet-4-6');
    expect(resolveGatewaySlot('gemini')).toEqual({ kind: 'unavailable', family: 'google' });
  });
});

describe('private-address guard refusal is reported, not silent (#6608 item 3)', () => {
  let savedAllow: string | undefined;
  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    savedAllow = process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'];
    delete process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    readOpenAICompatEndpointMock.mockReturnValue('openai-compat');
  });
  afterEach(() => {
    if (savedAllow === undefined) delete process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'];
    else process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'] = savedAllow;
    setGatewayRediscovery(undefined);
  });

  it('exposes the refusal as a status and names the variable and "NOT in use" at startup', async () => {
    const baseUrl = 'http://10.44.0.9:4000/v1';
    const status = await checkGatewayHost(baseUrl);
    expect(status).toMatchObject({ state: 'refused_private_host', host: '10.44.0.9' });
    if (status.state !== 'refused_private_host') return;
    expect(status.remedy).toContain('NEXUS_CUSTOM_API_ALLOW_PRIVATE=1');

    readOpenAICompatEnvMock.mockReturnValue({ baseUrl, apiKey: 'sk-test' });
    buildOpenAICompatAdaptersMock.mockResolvedValue(err(new GatewayHostRefusedError(status)));
    const logger = makeMockLogger();
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };

    // Not retryable: allowing the host is an env change, so no live list is armed.
    expect(await wireGateway(logger, registry)).toBeUndefined();
    const messages = logger.warn.mock.calls.map((c) => String(c[0]));
    const refusal = messages.find((m) => m.includes('10.44.0.9'));
    expect(refusal).toBeDefined();
    expect(refusal).toContain('NEXUS_CUSTOM_API_ALLOW_PRIVATE=1');
    expect(refusal).toContain('NOT in use');
    expect(messages.some((m) => m.includes('probe failed'))).toBe(false);
  });

  it('lets the host through once the variable is set', async () => {
    process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'] = '1';
    expect(await checkGatewayHost('http://10.44.0.9:4000/v1')).toEqual({
      state: 'allowed',
      host: '10.44.0.9',
    });
  });
});

describe('lazy re-discovery of a gateway down at boot (#6608 item 4)', () => {
  const BOOT = Date.parse('2026-09-23T12:00:00Z');
  let clock: FixedTimeProvider;

  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    readOpenAICompatEndpointMock.mockReturnValue('corp-proxy');
    _resetGatewayCatalogs();
    clock = new FixedTimeProvider(BOOT);
    setTimeProvider(clock);
  });
  afterEach(() => {
    setGatewayRediscovery(undefined);
    resetTimeProvider();
  });

  it('fills the live list on the first call after the backoff, at most once per interval', async () => {
    readOpenAICompatEnvMock.mockReturnValue({ baseUrl: 'https://gw.example/v1', apiKey: 'sk' });
    buildOpenAICompatAdaptersMock.mockResolvedValue(err(new ConfigError('ECONNREFUSED')));
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };

    const live = await wireGateway(makeMockLogger(), registry);
    expect(live).toEqual([]);
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(1); // the boot attempt

    const at = async (secondsAfterBoot: number): Promise<void> => {
      clock.setTime(BOOT + secondsAfterBoot * 1000);
      await ensureGatewayDiscovered();
    };
    await at(0);
    await at(59);
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(1);
    await at(61); // first call past the backoff: retried, still down
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(2);
    await at(100); // 39 s after that attempt
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(2);
    expect(live).toEqual([]);

    const adapters = [makeMockAdapter('gw-late-a'), makeMockAdapter('gw-late-b')];
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
    clock.setTime(BOOT + 125_000);
    await Promise.all([ensureGatewayDiscovered(), ensureGatewayDiscovered()]); // one shared attempt
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(3);
    expect(live).toEqual(adapters);
    expect(registry.registerApiArm).toHaveBeenCalledTimes(1);
    expect(registry.registerApiArm.mock.calls[0]?.[0]).toBe('api:corp-proxy');
    expect(getGatewayCatalog('api:corp-proxy')).toEqual(['gw-late-a', 'gw-late-b']);

    await at(1000); // wired: no further discovery, ever
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(3);
  });

  it('registers the family slots once a gateway down at boot is re-discovered (#6604)', async () => {
    _resetGatewaySlotCatalog();
    readOpenAICompatEnvMock.mockReturnValue({ baseUrl: 'https://gw.example/v1', apiKey: 'sk' });
    buildOpenAICompatAdaptersMock.mockResolvedValue(err(new ConfigError('ECONNREFUSED')));
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };
    await wireGateway(makeMockLogger(), registry);
    expect(resolveGatewaySlot('claude')).toEqual({ kind: 'inactive' });

    buildOpenAICompatAdaptersMock.mockResolvedValue(
      ok([makeMockAdapter('gpt-5.5'), makeMockAdapter('claude-sonnet-4-6')])
    );
    clock.setTime(BOOT + 125_000);
    await ensureGatewayDiscovered();

    const claude = resolveGatewaySlot('claude');
    expect(claude.kind === 'resolved' && claude.adapter.modelId).toBe('claude-sonnet-4-6');
    _resetGatewaySlotCatalog();
  });

  it('arms nothing when the gateway wired at boot', async () => {
    readOpenAICompatEnvMock.mockReturnValue({ baseUrl: 'https://gw.example/v1', apiKey: 'sk' });
    const adapters = [makeMockAdapter('gw-a')];
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: () => makeMockLogger(),
    };
    expect(await wireGateway(makeMockLogger(), registry)).toBe(adapters);
    clock.setTime(BOOT + 3_600_000);
    await ensureGatewayDiscovered();
    expect(buildOpenAICompatAdaptersMock).toHaveBeenCalledTimes(1);
  });
});
