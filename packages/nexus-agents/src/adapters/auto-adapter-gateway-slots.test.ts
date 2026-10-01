/**
 * createAutoAdapter family slots in gateway mode (#6604). The CLI boundary is
 * faked: the pinned CLI is never available, and `claude` is the one CLI that
 * IS installed, so a cross-family substitution would be visible.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SdkAdapter } from './sdk/index.js';
import { ok, err, ModelError } from '../core/index.js';
import { loadUsageEvents } from '../learning/usage-log.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoAdapter } from './auto-adapter.js';
import { _resetGatewaySlotCatalog, setGatewaySlotCatalog } from './gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import { FAKE_ANTHROPIC_KEY, FAKE_OPENAI_KEY } from '../testing/test-secrets.js';
import { getAvailableClis, isCliAvailable } from '../cli-adapters/factory.js';
import { createResilientAdapter } from './resilient-adapter.js';
import { isGatewayModelAdapter } from './openai-compat-adapter.js';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import type { ILogger } from '../core/index.js';

// No network from unit tests: createAutoAdapter now runs the process's one
// gateway discovery on first use (#4392), and these suites point the gateway
// env at hosts that do not exist. Discovery itself is tested in
// gateway-discovery.test.ts and over HTTP in the gateway acceptance suite.
const gatewayDiscovery = vi.hoisted(() => ({
  ensure: vi.fn(() => Promise.resolve()),
  status: vi.fn((): string => 'unattempted'),
}));
vi.mock('./gateway-discovery.js', () => ({
  ensureGatewayCatalogue: gatewayDiscovery.ensure,
  gatewayDiscoveryStatus: gatewayDiscovery.status,
}));

vi.mock('../cli-adapters/factory.js', () => ({
  createCliAdapter: vi.fn().mockReturnValue({
    initialize: vi.fn().mockReturnValue(Promise.resolve()),
    execute: vi.fn(),
    name: 'claude',
  }),
  isCliAvailable: vi.fn().mockReturnValue(Promise.resolve(false)),
  getAvailableClis: vi.fn().mockReturnValue(Promise.resolve(['claude'])),
}));

// Counts every direct-API SDK adapter constructed, so a test can prove none was.
const { sdkAdapterCtor } = vi.hoisted(() => ({ sdkAdapterCtor: vi.fn() }));
vi.mock('./sdk/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sdk/index.js')>();
  class SdkAdapter extends actual.SdkAdapter {
    constructor(...args: ConstructorParameters<typeof actual.SdkAdapter>) {
      super(...args);
      sdkAdapterCtor(...args);
    }
  }
  return { ...actual, SdkAdapter };
});

vi.mock('../cli-adapters/cli-to-model-adapter.js', () => ({
  createCliToModelAdapter: vi.fn().mockReturnValue({
    providerId: 'cli-claude',
    modelId: 'claude-cli-default',
    complete: () =>
      Promise.resolve({
        ok: true,
        value: { content: [], model: 'claude-cli-default', stopReason: 'end_turn' },
      }),
  }),
}));

const GATEWAY_ENV = [
  'NEXUS_OPENAI_COMPAT_URL',
  'NEXUS_OPENAI_COMPAT_KEY',
  'NEXUS_CUSTOM_MODEL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'NEXUS_DISABLED_CLIS',
  'NEXUS_CUSTOM_API_BASE_URL',
  'NEXUS_CUSTOM_API_KEY',
];

describe('createAutoAdapter gateway family slots (#6604)', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    _resetGatewaySlotCatalog();
    for (const k of GATEWAY_ENV) saved[k] = process.env[k];
    // The single-model custom-openai fallback is configured, so a slot that
    // fell through to it would be visible as NEXUS_CUSTOM_MODEL.
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example.com/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = FAKE_OPENAI_KEY;
    process.env['NEXUS_CUSTOM_MODEL'] = 'custom-fallback-model';
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY']) {
      Reflect.deleteProperty(process.env, k);
    }
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    for (const k of GATEWAY_ENV) {
      if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = saved[k];
    }
  });

  it('serves each pinned slot from its own family', async () => {
    setGatewaySlotCatalog(
      ['gpt-5.5', 'claude-sonnet-4-6', 'gemini-2.5-pro'].map((id) => fakeGatewayModel(id))
    );
    const served = await Promise.all(
      (['claude', 'codex', 'gemini'] as const).map(async (cli) => {
        const s = await createAutoAdapter({ preferredCli: cli, enableCache: false });
        return [
          cli,
          s.adapter.modelId,
          s.adapter.providerId,
          s.name,
          Reflect.get(s, 'modelVerified'),
        ] as const;
      })
    );
    expect(served).toEqual([
      ['claude', 'claude-sonnet-4-6', 'cli-claude', 'claude', true],
      ['codex', 'gpt-5.5', 'cli-codex', 'codex', true],
      ['gemini', 'gemini-2.5-pro', 'cli-gemini', 'gemini', true],
    ]);
  });

  it('refuses a slot whose family the gateway lacks, rather than substituting', async () => {
    setGatewaySlotCatalog(['gpt-5.5', 'claude-sonnet-4-6'].map((id) => fakeGatewayModel(id)));
    await expect(createAutoAdapter({ preferredCli: 'gemini', enableCache: false })).rejects.toThrow(
      /gemini.*unavailable.*google/
    );
  });

  it('lets a same-family API key serve a slot the gateway lacks', async () => {
    setGatewaySlotCatalog([fakeGatewayModel('gpt-5.5')]);
    process.env['ANTHROPIC_API_KEY'] = FAKE_ANTHROPIC_KEY;
    const s = await createAutoAdapter({ preferredCli: 'claude', enableCache: false });
    expect(s.source).toBe('api');
    expect(s.name).toBe('anthropic');
    expect(s).not.toHaveProperty('modelVerified');
  });

  it("never lets another family's API key serve the slot", async () => {
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6')]);
    process.env['OPENAI_API_KEY'] = FAKE_OPENAI_KEY;
    process.env['ANTHROPIC_API_KEY'] = FAKE_ANTHROPIC_KEY;
    await expect(createAutoAdapter({ preferredCli: 'gemini', enableCache: false })).rejects.toThrow(
      /gemini.*unavailable.*google/
    );
  });

  it('keeps the pre-#6604 NEXUS_CUSTOM_MODEL fallback with no gateway catalogue', async () => {
    vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
    const s = await createAutoAdapter({ preferredCli: 'gemini', enableCache: false });
    expect(s.name).toBe('custom-openai');
    expect(s.adapter.modelId).toBe('custom-fallback-model');
  });

  it('keeps the pre-#6604 path with no gateway catalogue: the installed CLI', async () => {
    const s = await createAutoAdapter({ preferredCli: 'codex', enableCache: false });
    expect(s.source).toBe('cli');
    expect(s.name).toBe('claude');
  });

  it('prices a gateway-served seat by its arm: the resilient proxy exposes it', async () => {
    setGatewaySlotCatalog([fakeGatewayModel('gpt-5.5', 'api:openai-compat')]);
    const proxy = createResilientAdapter({ preferredCli: 'codex' });
    await proxy.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isGatewayModelAdapter(proxy)).toBe(true);
    expect(proxy.modelId).toBe('gpt-5.5');
    expect(proxy.getHealth()).toHaveProperty('modelVerified', true);
    expect(proxy.providerId).toBe('cli-codex');
  });

  it.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ])('persists SDK fallback calls (success=%s, verified=%s)', async (success, modelVerified) => {
    vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
    gatewayDiscovery.status.mockReturnValue(modelVerified ? 'discovered' : 'failed');
    if (modelVerified) setGatewaySlotCatalog([fakeGatewayModel('custom-fallback-model')]);
    const dir = mkdtempSync(join(tmpdir(), 'unverified-model-'));
    const previous = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    const complete = vi.spyOn(SdkAdapter.prototype, 'complete').mockResolvedValueOnce(
      success
        ? ok({
            content: [],
            model: 'custom-fallback-model',
            stopReason: 'end_turn',
            usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
          })
        : err(new ModelError('model not found'))
    );
    const proxy = createResilientAdapter();
    try {
      const result = await proxy.complete({ messages: [] });
      expect(result.ok).toBe(success);
      expect(proxy.getHealth()).toHaveProperty('modelVerified', modelVerified);
      const events = loadUsageEvents().events;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        modelId: 'custom-fallback-model',
        providerId: 'sdk-custom-openai',
        success,
        modelVerified,
      });
    } finally {
      complete.mockRestore();
      proxy.dispose();
      gatewayDiscovery.status.mockReturnValue('unattempted');
      if (previous === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
      else process.env['NEXUS_DATA_DIR'] = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['discovered', 'failed'])(
    'does not apply another gateway discovery (%s) to deprecated SDK transport',
    async (status) => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      gatewayDiscovery.status.mockReturnValue(status);
      // Discovery's catalogue can come from OpenCode while the legacy SDK
      // transport points elsewhere. Its models say nothing about that SDK URL.
      if (status === 'discovered')
        setGatewaySlotCatalog([fakeGatewayModel('custom-fallback-model')]);
      Reflect.deleteProperty(process.env, 'NEXUS_OPENAI_COMPAT_URL');
      Reflect.deleteProperty(process.env, 'NEXUS_OPENAI_COMPAT_KEY');
      process.env['NEXUS_CUSTOM_API_BASE_URL'] = 'https://other-gateway.example.com/v1';
      process.env['NEXUS_CUSTOM_API_KEY'] = FAKE_OPENAI_KEY;
      try {
        const selection = await createAutoAdapter({ enableCache: false });
        expect(selection.adapter.modelId).toBe('custom-fallback-model');
        expect(selection).not.toHaveProperty('modelVerified');
        // Pricing must not depend on verification: an unmeasured fallback is
        // still a gateway call, priced by the gateway declaration.
        expect(Reflect.get(selection.adapter, 'gatewayArm')).toBe('api:custom-openai');
      } finally {
        gatewayDiscovery.status.mockReturnValue('unattempted');
      }
    }
  );

  it('keeps an in-flight call unverified after refresh selects a verified model', async () => {
    vi.mocked(getAvailableClis).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    gatewayDiscovery.status.mockReturnValue('failed');
    const dir = mkdtempSync(join(tmpdir(), 'verification-refresh-'));
    const previous = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    let finish = (): void => {
      throw new Error('completion not pending');
    };
    const response = ok({
      content: [],
      model: 'custom-fallback-model',
      stopReason: 'end_turn' as const,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
    const delayed = new Promise<typeof response>((resolve) => {
      finish = () => {
        resolve(response);
      };
    });
    const complete = vi.spyOn(SdkAdapter.prototype, 'complete').mockReturnValueOnce(delayed);
    const proxy = createResilientAdapter();
    try {
      const inFlight = proxy.complete({ messages: [] });
      await vi.waitFor(() => {
        expect(complete).toHaveBeenCalledTimes(1);
      });
      expect(proxy.getHealth()).toHaveProperty('modelVerified', false);
      gatewayDiscovery.status.mockReturnValue('discovered');
      setGatewaySlotCatalog([fakeGatewayModel('custom-fallback-model')]);
      await proxy.refresh();
      expect(proxy.getHealth()).toHaveProperty('modelVerified', true);
      finish();
      expect((await inFlight).ok).toBe(true);
      const events = loadUsageEvents().events;
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty('modelVerified', false);
    } finally {
      finish();
      complete.mockRestore();
      proxy.dispose();
      gatewayDiscovery.status.mockReturnValue('unattempted');
      if (previous === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
      else process.env['NEXUS_DATA_DIR'] = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #6626: the unpinned default and the opencode slot.
  describe('the unpinned default and the opencode slot (#6626)', () => {
    const captureLogger = (): ILogger & { warn: ReturnType<typeof vi.fn> } =>
      ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      }) as unknown as ILogger & { warn: ReturnType<typeof vi.fn> };

    // A queued one-shot answer must not leak between cases: `claude` is the
    // installed CLI unless a case says otherwise.
    beforeEach(() => {
      vi.mocked(getAvailableClis).mockReset().mockResolvedValue(['claude']);
    });

    it('serves the unpinned default from the gateway top-ranked model, and warns about NEXUS_CUSTOM_MODEL', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      setGatewaySlotCatalog(
        ['gpt-5.5', 'claude-sonnet-4-6', 'claude-opus-4-6'].map((id) => fakeGatewayModel(id))
      );
      const logger = captureLogger();
      const s = await createAutoAdapter({ enableCache: false, logger });
      expect(s.name).toBe('custom-openai');
      expect(s.adapter.modelId).toBe('claude-opus-4-6');
      expect(s.reason).toContain('gateway default');
      expect(s).toHaveProperty('modelVerified', true);
      const warned = logger.warn.mock.calls.map((c) => String(c[0]));
      expect(warned.some((m) => m.includes('NEXUS_CUSTOM_MODEL'))).toBe(true);
    });

    it('uses NEXUS_CUSTOM_MODEL for the default when the catalogue lists it', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      setGatewaySlotCatalog(
        ['custom-fallback-model', 'claude-opus-4-6'].map((id) => fakeGatewayModel(id))
      );
      const s = await createAutoAdapter({ enableCache: false });
      expect(s.adapter.modelId).toBe('custom-fallback-model');
    });

    it('with no gateway catalogue the default is unchanged: NEXUS_CUSTOM_MODEL, no warning', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      const logger = captureLogger();
      const s = await createAutoAdapter({ enableCache: false, logger });
      expect({
        name: s.name,
        source: s.source,
        model: s.adapter.modelId,
        reason: s.reason,
      }).toEqual({
        name: 'custom-openai',
        source: 'api',
        model: 'custom-fallback-model',
        reason:
          'Using custom OpenAI-compatible gateway at gateway.example.com (model: custom-fallback-model)',
      });
      expect(logger.warn).not.toHaveBeenCalled();
      expect(s).not.toHaveProperty('modelVerified');
    });

    it('with no gateway catalogue and no NEXUS_CUSTOM_MODEL the built-in default applies', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_MODEL');
      const s = await createAutoAdapter({ enableCache: false });
      expect(s.adapter.modelId).toBe(CUSTOM_API_DEFAULT_MODEL);
    });

    it('runs the process gateway discovery before selecting, so a CLI process gets the catalogue (#4392)', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      gatewayDiscovery.ensure.mockClear();
      // What discovery does on success: registers the catalogue. Before
      // #4392 nothing outside the MCP server did, so this never ran.
      gatewayDiscovery.ensure.mockImplementationOnce(() => {
        setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6')]);
        return Promise.resolve();
      });
      Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_MODEL');

      const s = await createAutoAdapter({ enableCache: false });

      expect(gatewayDiscovery.ensure).toHaveBeenCalledTimes(1);
      expect(s.adapter.modelId).toBe('claude-sonnet-4-6');
    });

    it('a failed gateway discovery still sends the configured model, but says it is unverified (#4392)', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      gatewayDiscovery.status.mockReturnValue('failed');
      const logger = captureLogger();
      try {
        const s = await createAutoAdapter({ enableCache: false, logger });

        expect(s.adapter.modelId).toBe('custom-fallback-model');
        expect(s.reason).toContain('unverified: gateway discovery failed');
        expect(s).toHaveProperty('modelVerified', false);
        expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).toContain(
          "'custom-fallback-model' is sent unverified"
        );
      } finally {
        gatewayDiscovery.status.mockReturnValue('unattempted');
      }
    });

    it('refuses a pinned opencode slot with no binary in gateway mode, never substituting', async () => {
      setGatewaySlotCatalog(['claude-opus-4-6', 'gpt-5.5'].map((id) => fakeGatewayModel(id)));
      await expect(
        createAutoAdapter({ preferredCli: 'opencode', enableCache: false })
      ).rejects.toThrow(/opencode.*unavailable/);
    });

    it('keeps the pre-#6626 opencode path with no gateway catalogue: the installed CLI', async () => {
      const s = await createAutoAdapter({ preferredCli: 'opencode', enableCache: false });
      expect(s.source).toBe('cli');
      expect(s.name).toBe('claude');
    });
  });

  describe('a CLI disabled by NEXUS_DISABLED_CLIS is transport-scoped (#6720)', () => {
    it('serves the pinned slot from its family gateway model, never probing the CLI', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'claude';
      setGatewaySlotCatalog(['gpt-5.5', 'claude-sonnet-4-6'].map((id) => fakeGatewayModel(id)));
      vi.mocked(isCliAvailable).mockClear();
      const s = await createAutoAdapter({ preferredCli: 'claude', enableCache: false });
      expect([s.adapter.modelId, s.adapter.providerId, s.name]).toEqual([
        'claude-sonnet-4-6',
        'cli-claude',
        'claude',
      ]);
      const probed = vi.mocked(isCliAvailable).mock.calls.map(([cli]) => cli);
      expect(probed).not.toContain('claude');
    });

    it('refuses the slot when the gateway has no model of its family', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'claude';
      setGatewaySlotCatalog([fakeGatewayModel('gpt-5.5')]);
      await expect(
        createAutoAdapter({ preferredCli: 'claude', enableCache: false })
      ).rejects.toThrow(/claude.*unavailable.*anthropic/);
    });

    it('never lets a same-family API key serve a disabled CLI slot', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'codex';
      process.env['OPENAI_API_KEY'] = FAKE_OPENAI_KEY;
      setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6')]);
      sdkAdapterCtor.mockClear();
      await expect(
        createAutoAdapter({ preferredCli: 'codex', enableCache: false })
      ).rejects.toThrow(/codex.*unavailable.*openai/);
      expect(sdkAdapterCtor).not.toHaveBeenCalled();
    });

    it('still lets a same-family API key serve an ENABLED CLI slot', async () => {
      process.env['OPENAI_API_KEY'] = FAKE_OPENAI_KEY;
      setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6')]);
      const s = await createAutoAdapter({ preferredCli: 'codex', enableCache: false });
      expect(s.name).toBe('openai');
    });

    it('keeps the pre-#6720 path with no gateway catalogue: another installed CLI', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'codex';
      const s = await createAutoAdapter({ preferredCli: 'codex', enableCache: false });
      expect(s.source).toBe('cli');
      expect(s.name).toBe('claude');
    });
  });

  it('exposes no gateway arm on a proxy served by a CLI', async () => {
    const proxy = createResilientAdapter({ preferredCli: 'codex' });
    await proxy.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isGatewayModelAdapter(proxy)).toBe(false);
  });
});
