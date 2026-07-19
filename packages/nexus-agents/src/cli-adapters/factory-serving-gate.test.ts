import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { CliName, HealthStatus } from './types.js';

const mocks = vi.hoisted(() => {
  const healthy: HealthStatus = {
    healthy: true,
    version: '1.0.0',
    versionStatus: 'supported',
    message: 'ok',
    lastChecked: new Date(0),
  };

  return {
    healthy,
    healthByCli: new Map<string, HealthStatus>(),
    probeCli: vi.fn(),
    getCliCircuitBreakerSnapshot: vi.fn(),
  };
});

function mockAdapterClass(cli: CliName): new () => { healthCheck: () => Promise<HealthStatus> } {
  return class {
    healthCheck(): Promise<HealthStatus> {
      return Promise.resolve(mocks.healthByCli.get(cli) ?? mocks.healthy);
    }
  };
}

vi.mock('./adapters/claude-adapter.js', () => ({
  ClaudeCliAdapter: mockAdapterClass('claude'),
}));

vi.mock('./adapters/gemini-adapter.js', () => ({
  GeminiCliAdapter: mockAdapterClass('gemini'),
}));

vi.mock('./adapters/codex-adapter.js', () => ({
  CodexCliAdapter: mockAdapterClass('codex'),
}));

vi.mock('./adapters/codex-mcp-adapter.js', () => ({
  CodexMcpAdapter: mockAdapterClass('codex'),
}));

vi.mock('./adapters/opencode-adapter.js', () => ({
  OpenCodeCliAdapter: mockAdapterClass('opencode'),
}));

vi.mock('../cli/cli-auth-probe.js', () => ({
  probeCli: mocks.probeCli,
}));

vi.mock('./cli-circuit-breaker.js', () => ({
  getCliCircuitBreakerSnapshot: mocks.getCliCircuitBreakerSnapshot,
}));

describe('getAvailableClis serving gate', () => {
  beforeEach(() => {
    mocks.healthByCli.clear();
    mocks.probeCli.mockImplementation((cli: CliName) =>
      Promise.resolve({ cli, state: 'authenticated', via: 'cli-credentials' })
    );
    mocks.getCliCircuitBreakerSnapshot.mockReturnValue(undefined);
  });

  it('excludes an authenticated healthy CLI whose circuit breaker is open', async () => {
    const { getAvailableClis } = await import('./factory.js');
    mocks.getCliCircuitBreakerSnapshot.mockImplementation((cli: CliName) =>
      cli === 'opencode'
        ? {
            state: 'open',
            failureCount: 5,
            successCount: 0,
            lastFailureTime: 1,
            lastStateChange: 1,
            halfOpenRequests: 0,
            config: {
              failureThreshold: 5,
              resetTimeoutMs: 30_000,
              halfOpenSuccessThreshold: 2,
              countTimeoutsAsFailures: true,
              countAuthFailuresAsFailures: false,
              countRateLimitsAsFailures: true,
              halfOpenMaxRequests: 3,
            },
          }
        : undefined
    );

    await expect(getAvailableClis()).resolves.toEqual(['claude', 'gemini', 'codex']);
  });

  it('includes an authenticated healthy CLI when breaker state is unavailable', async () => {
    const { getAvailableClis } = await import('./factory.js');
    mocks.getCliCircuitBreakerSnapshot.mockImplementation((cli: CliName) => {
      if (cli === 'opencode') {
        throw new Error('breaker unavailable');
      }
      return undefined;
    });

    await expect(getAvailableClis()).resolves.toEqual(['claude', 'gemini', 'codex', 'opencode']);
  });
});
