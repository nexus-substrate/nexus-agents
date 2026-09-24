/**
 * The private-address guard's DNS lookup is bounded, and a lookup that does
 * not answer in time fails CLOSED for that attempt (#6671 review of #6659).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args) as unknown,
}));

import { FixedTimeProvider, resetTimeProvider, setTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { EndpointArmId } from '../cli-adapters/types.js';
import type { IResilientAdapter } from './resilient-adapter-types.js';
import { checkGatewayHost } from './gateway-host-status.js';
import { ensureGatewayDiscovered, setGatewayRediscovery } from './gateway-rediscovery.js';
import { wireGateway } from '../cli-server-gateway.js';

/** A resolver that never answers. */
const blackholed = (): Promise<never> => new Promise(() => {});

describe('checkGatewayHost lookup bound', () => {
  beforeEach(() => {
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', undefined);
    lookupMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers within the bound when the resolver never does, and does NOT allow the host', async () => {
    lookupMock.mockImplementation(blackholed);

    const outcome = await Promise.race([
      checkGatewayHost('https://gw.example/v1', { lookupTimeoutMs: 20 }),
      new Promise((resolve) =>
        setTimeout(() => {
          resolve('still waiting');
        }, 1_000)
      ),
    ]);

    expect(outcome).toEqual({ state: 'lookup_timed_out', host: 'gw.example' });
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it('keeps failing open on a DNS error (the connection cannot resolve either)', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND gw.example'));

    const status = await checkGatewayHost('https://gw.example/v1', { lookupTimeoutMs: 1_000 });

    expect(status).toEqual({ state: 'allowed', host: 'gw.example' });
  });

  it('still refuses a private resolution that answers in time', async () => {
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);

    const status = await checkGatewayHost('https://gw.example/v1', { lookupTimeoutMs: 1_000 });

    expect(status.state).toBe('refused_private_host');
  });
});

describe('a host-check timeout at boot: not wired, retried by lazy re-discovery', () => {
  const BOOT = Date.parse('2026-09-23T12:00:00Z');
  let clock: FixedTimeProvider;

  beforeEach(() => {
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', undefined);
    vi.stubEnv('NEXUS_SANDBOX', undefined);
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://gw.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'sk-TESTFAKE-lookup-timeout');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_ENDPOINT', undefined);
    vi.stubEnv('NEXUS_OPENCODE_CONFIG', undefined);
    lookupMock.mockReset();
    clock = new FixedTimeProvider(BOOT);
    setTimeProvider(clock);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    setGatewayRediscovery(undefined);
    resetTimeProvider();
    vi.unstubAllEnvs();
  });

  it('does not wire the gateway, says it will retry, and runs the guard again after the floor', async () => {
    lookupMock.mockImplementation(blackholed);
    const warnings: string[] = [];
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn((message: string, context?: unknown) => {
        warnings.push(`${message} ${JSON.stringify(context ?? {})}`);
      }),
      error: vi.fn(),
      setLevel: vi.fn(),
      child: (): ILogger => logger,
    } as unknown as ILogger;
    const registry = {
      registerApiArm: vi.fn<(arm: EndpointArmId, adapter: IResilientAdapter) => void>(),
      getLogger: (): ILogger => logger,
    };

    const booting = wireGateway(logger, registry);
    await vi.advanceTimersByTimeAsync(5_000);
    const live = await booting;

    // Not wired: an empty live list, no arm, and the reason is logged.
    expect(live).toEqual([]);
    expect(registry.registerApiArm).not.toHaveBeenCalled();
    expect(warnings.join('\n')).toContain('gateway host check timed out');
    expect(warnings.join('\n')).toContain('will retry');
    expect(lookupMock).toHaveBeenCalledTimes(1);

    // Retried, not refused: past the 60 s floor the guard runs again, and a
    // second timeout, now on the lazy path, is not a refusal either.
    clock.setTime(BOOT + 61_000);
    const retry = ensureGatewayDiscovered();
    await vi.advanceTimersByTimeAsync(5_000);
    await retry;
    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(live).toEqual([]);

    // A third attempt after another floor runs the guard again. This time the
    // host answers with a private address, which IS a refusal.
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    clock.setTime(BOOT + 122_000);
    await ensureGatewayDiscovered();

    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(live).toEqual([]);
    expect(registry.registerApiArm).not.toHaveBeenCalled();
  });
});
