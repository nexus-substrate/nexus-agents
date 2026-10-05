import { afterEach, describe, expect, it, vi } from 'vitest';

import { setup } from './setup.js';

afterEach(() => vi.restoreAllMocks());

describe('E2E Node requirement (#5163)', () => {
  it.each(['v22.22.3', 'v23.11.0'])('rejects unsupported %s', (version) => {
    vi.spyOn(process, 'version', 'get').mockReturnValue(version);
    expect(() => setup()).toThrow(`Node.js >=24 required for E2E tests. Found: ${version}`);
  });

  it('accepts Node 24', async () => {
    vi.spyOn(process, 'version', 'get').mockReturnValue('v24.0.0');
    await expect(setup()).resolves.toBeUndefined();
  });
});
