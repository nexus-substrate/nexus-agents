/**
 * The private-address guard's DNS lookup is bounded (#6671 review of #6659).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args) as unknown,
}));

import { checkGatewayHost } from './gateway-host-status.js';

describe('checkGatewayHost lookup bound', () => {
  beforeEach(() => {
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', undefined);
    lookupMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers within the bound when the resolver never does, failing open as on a DNS error', async () => {
    lookupMock.mockReturnValue(new Promise(() => {}));

    const outcome = await Promise.race([
      checkGatewayHost('https://gw.example/v1', { lookupTimeoutMs: 20 }),
      new Promise((resolve) =>
        setTimeout(() => {
          resolve('still waiting');
        }, 1_000)
      ),
    ]);

    expect(outcome).toEqual({ state: 'allowed', host: 'gw.example' });
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it('still refuses a private resolution that answers in time', async () => {
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);

    const status = await checkGatewayHost('https://gw.example/v1', { lookupTimeoutMs: 1_000 });

    expect(status.state).toBe('refused_private_host');
  });
});
