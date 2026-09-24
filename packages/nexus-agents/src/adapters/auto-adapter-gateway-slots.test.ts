/**
 * createAutoAdapter family slots in gateway mode (#6604). The CLI boundary is
 * faked: the pinned CLI is never available, and `claude` is the one CLI that
 * IS installed, so a cross-family substitution would be visible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoAdapter } from './auto-adapter.js';
import { _resetGatewaySlotCatalog, setGatewaySlotCatalog } from './gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import { FAKE_ANTHROPIC_KEY, FAKE_OPENAI_KEY } from '../testing/test-secrets.js';
import { getAvailableClis } from '../cli-adapters/factory.js';
import { createResilientAdapter } from './resilient-adapter.js';
import { isGatewayModelAdapter } from './openai-compat-adapter.js';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import type { ILogger } from '../core/index.js';

vi.mock('../cli-adapters/factory.js', () => ({
  createCliAdapter: vi.fn().mockReturnValue({
    initialize: vi.fn().mockReturnValue(Promise.resolve()),
    execute: vi.fn(),
    name: 'claude',
  }),
  isCliAvailable: vi.fn().mockReturnValue(Promise.resolve(false)),
  getAvailableClis: vi.fn().mockReturnValue(Promise.resolve(['claude'])),
}));

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
        return [cli, s.adapter.modelId, s.adapter.providerId, s.name] as const;
      })
    );
    expect(served).toEqual([
      ['claude', 'claude-sonnet-4-6', 'cli-claude', 'claude'],
      ['codex', 'gpt-5.5', 'cli-codex', 'codex'],
      ['gemini', 'gemini-2.5-pro', 'cli-gemini', 'gemini'],
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
    expect(proxy.providerId).toBe('cli-codex');
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
    });

    it('with no gateway catalogue and no NEXUS_CUSTOM_MODEL the built-in default applies', async () => {
      vi.mocked(getAvailableClis).mockResolvedValueOnce([]);
      Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_MODEL');
      const s = await createAutoAdapter({ enableCache: false });
      expect(s.adapter.modelId).toBe(CUSTOM_API_DEFAULT_MODEL);
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

  it('exposes no gateway arm on a proxy served by a CLI', async () => {
    const proxy = createResilientAdapter({ preferredCli: 'codex' });
    await proxy.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isGatewayModelAdapter(proxy)).toBe(false);
  });
});
