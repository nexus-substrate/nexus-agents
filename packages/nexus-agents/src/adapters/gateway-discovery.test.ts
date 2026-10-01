/**
 * Process-wide gateway discovery outside the MCP server (#4392).
 *
 * Before this, only the server bootstrap (`cli-server-gateway.ts`) ran
 * discovery, so a CLI process (`nexus-agents orchestrate`, any direct
 * `createAutoAdapter` caller) never had a catalogue and the custom-openai
 * fallback sent `NEXUS_CUSTOM_MODEL ?? 'gpt-5.5'` to a gateway that may not
 * serve it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, err, ok, type ILogger, type IModelAdapter } from '../core/index.js';

const buildMock = vi.fn();

vi.mock('./openai-compat-adapter.js', () => ({
  buildOpenAICompatAdapters: (...args: unknown[]) => buildMock(...args) as unknown,
}));

import {
  _resetGatewayDiscovery,
  discoverGatewayOnce,
  ensureGatewayCatalogue,
  gatewayDiscoveryStatus,
} from './gateway-discovery.js';
import {
  _resetGatewaySlotCatalog,
  hasGatewaySlotCatalog,
  resolveGatewaySlot,
} from './gateway-family-slots.js';

function model(modelId: string): IModelAdapter {
  return {
    providerId: 'openai-compat',
    modelId,
    capabilities: [],
    complete: () => Promise.reject(new Error('not called')),
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  };
}

function logger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  const l = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    child: (): ILogger => l,
  };
  return l;
}

beforeEach(() => {
  buildMock.mockReset();
  _resetGatewayDiscovery();
  _resetGatewaySlotCatalog();
});
afterEach(() => {
  _resetGatewayDiscovery();
  _resetGatewaySlotCatalog();
});

describe('ensureGatewayCatalogue — lazy discovery for non-server processes', () => {
  it('is unattempted until first use', () => {
    expect(gatewayDiscoveryStatus()).toBe('unattempted');
    expect(buildMock).not.toHaveBeenCalled();
  });

  it('empty case: no gateway configured registers nothing and reports not_configured', async () => {
    buildMock.mockResolvedValue(null);
    const log = logger();

    await ensureGatewayCatalogue(log);

    expect(gatewayDiscoveryStatus()).toBe('not_configured');
    expect(hasGatewaySlotCatalog()).toBe(false);
    expect(resolveGatewaySlot('claude').kind).toBe('inactive');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('registers the discovered catalogue so family slots resolve to gateway models', async () => {
    buildMock.mockResolvedValue(ok([model('claude-sonnet-4-6')]));

    await ensureGatewayCatalogue(logger());

    expect(gatewayDiscoveryStatus()).toBe('discovered');
    const slot = resolveGatewaySlot('claude');
    expect(slot.kind).toBe('resolved');
    if (slot.kind === 'resolved') expect(slot.adapter.modelId).toBe('claude-sonnet-4-6');
  });

  it('discovers once per process: repeated and concurrent calls share one probe', async () => {
    buildMock.mockResolvedValue(ok([model('claude-sonnet-4-6')]));

    await Promise.all([ensureGatewayCatalogue(logger()), ensureGatewayCatalogue(logger())]);
    await ensureGatewayCatalogue(logger());
    await discoverGatewayOnce(logger());

    expect(buildMock).toHaveBeenCalledTimes(1);
  });

  it('a failed discovery is explicit: status failed, no catalogue, one warning naming the error', async () => {
    buildMock.mockResolvedValue(err(new ConfigError('gateway returned HTTP 503')));
    const log = logger();

    await ensureGatewayCatalogue(log);
    await ensureGatewayCatalogue(log);

    expect(gatewayDiscoveryStatus()).toBe('failed');
    expect(hasGatewaySlotCatalog()).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls[0])).toContain('HTTP 503');
  });

  it('a gateway listing zero models is a failure, not a catalogue', async () => {
    buildMock.mockResolvedValue(ok([]));

    await ensureGatewayCatalogue(logger());

    expect(gatewayDiscoveryStatus()).toBe('failed');
    expect(hasGatewaySlotCatalog()).toBe(false);
  });

  it('a thrown discovery is a failure, never an unhandled rejection', async () => {
    buildMock.mockRejectedValue(new Error('socket hang up'));

    await expect(ensureGatewayCatalogue(logger())).resolves.toBeUndefined();
    expect(gatewayDiscoveryStatus()).toBe('failed');
  });

  it('when the server bootstrap already discovered, the lazy path neither re-probes nor re-registers', async () => {
    buildMock.mockResolvedValue(ok([model('claude-sonnet-4-6')]));

    // The bootstrap owns registration (it also registers the arm); it calls
    // discoverGatewayOnce, not ensureGatewayCatalogue.
    await discoverGatewayOnce(logger());
    await ensureGatewayCatalogue(logger());

    expect(buildMock).toHaveBeenCalledTimes(1);
    expect(hasGatewaySlotCatalog()).toBe(false);
  });
});
