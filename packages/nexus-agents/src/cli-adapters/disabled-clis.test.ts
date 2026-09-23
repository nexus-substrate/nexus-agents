/**
 * NEXUS_DISABLED_CLIS (#6590): the parser, and the two factory entry points
 * every routing path draws its CLI arms from.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { CliName, HealthStatus } from './types.js';

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  probeCli: vi.fn(),
}));

vi.mock('../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/index.js')>();
  return {
    ...actual,
    createLogger: (...args: Parameters<typeof actual.createLogger>) => {
      const real = actual.createLogger(...args);
      return { ...real, warn: mocks.warn };
    },
  };
});

function mockAdapterClass(cli: CliName): new () => {
  name: CliName;
  healthCheck: () => Promise<HealthStatus>;
} {
  return class {
    readonly name = cli;
    healthCheck(): Promise<HealthStatus> {
      return Promise.resolve({
        healthy: true,
        version: '1.0.0',
        versionStatus: 'supported',
        message: 'ok',
        lastChecked: new Date(0),
      });
    }
  };
}

vi.mock('./adapters/claude-adapter.js', () => ({ ClaudeCliAdapter: mockAdapterClass('claude') }));
vi.mock('./adapters/gemini-adapter.js', () => ({ GeminiCliAdapter: mockAdapterClass('gemini') }));
vi.mock('./adapters/codex-adapter.js', () => ({ CodexCliAdapter: mockAdapterClass('codex') }));
vi.mock('./adapters/codex-mcp-adapter.js', () => ({ CodexMcpAdapter: mockAdapterClass('codex') }));
vi.mock('./adapters/opencode-adapter.js', () => ({
  OpenCodeCliAdapter: mockAdapterClass('opencode'),
}));
vi.mock('../cli/cli-auth-probe.js', () => ({ probeCli: mocks.probeCli }));
vi.mock('./codex-mcp-server-probe.js', () => ({ codexMcpServerAvailable: () => true }));
vi.mock('./cli-circuit-breaker.js', () => ({ getCliCircuitBreakerSnapshot: () => undefined }));

const ALL: readonly CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

describe('NEXUS_DISABLED_CLIS (#6590)', () => {
  const saved = process.env['NEXUS_DISABLED_CLIS'];

  beforeEach(() => {
    mocks.warn.mockClear();
    mocks.probeCli.mockImplementation((cli: CliName) =>
      Promise.resolve({ cli, state: 'authenticated', via: 'cli-credentials' })
    );
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['NEXUS_DISABLED_CLIS'];
    else process.env['NEXUS_DISABLED_CLIS'] = saved;
  });

  describe('getDisabledClis', () => {
    it('disables nothing when unset', async () => {
      delete process.env['NEXUS_DISABLED_CLIS'];
      const { getDisabledClis } = await import('./disabled-clis.js');
      expect([...getDisabledClis()]).toEqual([]);
    });

    it('disables nothing when empty or only separators', async () => {
      const { getDisabledClis } = await import('./disabled-clis.js');
      process.env['NEXUS_DISABLED_CLIS'] = '';
      expect([...getDisabledClis()]).toEqual([]);
      process.env['NEXUS_DISABLED_CLIS'] = ' , ,';
      expect([...getDisabledClis()]).toEqual([]);
      expect(mocks.warn).not.toHaveBeenCalled();
    });

    it('trims and lowercases each name', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = ' Gemini ,CODEX';
      const { getDisabledClis, isCliDisabled } = await import('./disabled-clis.js');
      expect([...getDisabledClis()].sort()).toEqual(['codex', 'gemini']);
      expect(isCliDisabled('gemini')).toBe(true);
      expect(isCliDisabled('claude')).toBe(false);
    });

    it('warns once about an unknown name and ignores it', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'codex,copilot';
      const { getDisabledClis, isCliDisabled } = await import('./disabled-clis.js');
      expect([...getDisabledClis()]).toEqual(['codex']);
      expect(isCliDisabled('copilot')).toBe(false);
      // Re-parsed under a different raw value, still only one warning.
      process.env['NEXUS_DISABLED_CLIS'] = 'copilot, codex';
      getDisabledClis();
      const unknownWarnings = mocks.warn.mock.calls.filter(
        (c) =>
          String(c[0]).includes('unknown CLI name') && (c[1] as { name: string }).name === 'copilot'
      );
      expect(unknownWarnings).toHaveLength(1);
    });
  });

  describe('getAvailableClis', () => {
    it('is unchanged when the variable is unset', async () => {
      delete process.env['NEXUS_DISABLED_CLIS'];
      const { getAvailableClis } = await import('./factory.js');
      await expect(getAvailableClis()).resolves.toEqual([...ALL]);
    });

    it('drops disabled CLIs that are detectable and authenticated', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'gemini,codex';
      const { getAvailableClis } = await import('./factory.js');
      await expect(getAvailableClis()).resolves.toEqual(['claude', 'opencode']);
    });

    it('returns an empty list when every CLI is disabled', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'claude,gemini,codex,opencode';
      const { getAvailableClis } = await import('./factory.js');
      await expect(getAvailableClis()).resolves.toEqual([]);
    });
  });

  describe('createAllAdapters (the CompositeRouter arm set)', () => {
    it('registers all four CLI slots when unset', async () => {
      delete process.env['NEXUS_DISABLED_CLIS'];
      const { createAllAdapters } = await import('./factory.js');
      expect([...createAllAdapters().keys()]).toEqual([...ALL]);
    });

    it('omits disabled CLI slots, so the router cannot select them', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'gemini,codex';
      const { createAllAdapters } = await import('./factory.js');
      expect([...createAllAdapters().keys()]).toEqual(['claude', 'opencode']);
    });

    it('returns an empty arm set when every CLI is disabled', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'claude,gemini,codex,opencode';
      const { createAllAdapters } = await import('./factory.js');
      expect(createAllAdapters().size).toBe(0);
    });

    it('CompositeRouter never selects a disabled CLI', async () => {
      process.env['NEXUS_DISABLED_CLIS'] = 'gemini,codex';
      const { createAllAdapters } = await import('./factory.js');
      const { createCompositeRouter } = await import('./composite-router.js');
      const router = createCompositeRouter(createAllAdapters());
      const tasks = [
        'Write a Python function that parses a CSV file',
        'Summarize this 900-page document about distributed systems',
        'Review the security of this authentication flow',
        'Quick: rename a variable',
      ];
      const selected: string[] = [];
      for (const content of tasks) {
        const result = await router.route({ content });
        if (!result.ok) throw new Error(`routing failed: ${result.error.message}`);
        selected.push(result.value.cliName);
      }
      expect(selected).toHaveLength(tasks.length);
      expect(selected.filter((cli) => cli === 'gemini' || cli === 'codex')).toEqual([]);
    });
  });
});
