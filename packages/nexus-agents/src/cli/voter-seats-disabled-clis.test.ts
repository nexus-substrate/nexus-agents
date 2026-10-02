/**
 * #6590: with all four CLIs detectable and `NEXUS_DISABLED_CLIS=gemini,codex`,
 * no voter seat lands on gemini or codex.
 *
 * Runs the REAL `getAvailableClis` (only the adapter classes, auth probe and
 * breaker snapshot are stubbed), so the seat assignment exercises the same
 * detection the panel uses in production.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import type { CliName, HealthStatus } from '../cli-adapters/types.js';
import type { IModelAdapter } from '../core/index.js';
import { createLogger } from '../core/index.js';

// Each mock carries its class's real read-only declaration (#6962): gemini's
// agy adapter declares false, the other three true.
function mockAdapterClass(
  enforcesReadOnlyAnalysis = true
): new () => { healthCheck: () => Promise<HealthStatus>; enforcesReadOnlyAnalysis: boolean } {
  return class {
    enforcesReadOnlyAnalysis = enforcesReadOnlyAnalysis;
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

vi.mock('../cli-adapters/adapters/claude-adapter.js', () => ({
  ClaudeCliAdapter: mockAdapterClass(),
}));
vi.mock('../cli-adapters/adapters/gemini-adapter.js', () => ({
  GeminiCliAdapter: mockAdapterClass(false),
}));
vi.mock('../cli-adapters/adapters/codex-adapter.js', () => ({
  CodexCliAdapter: mockAdapterClass(),
}));
vi.mock('../cli-adapters/adapters/codex-mcp-adapter.js', () => ({
  CodexMcpAdapter: mockAdapterClass(),
}));
vi.mock('../cli-adapters/adapters/opencode-adapter.js', () => ({
  OpenCodeCliAdapter: mockAdapterClass(),
}));
vi.mock('./cli-auth-probe.js', () => ({
  probeCli: (cli: CliName) =>
    Promise.resolve({ cli, state: 'authenticated', via: 'cli-credentials' }),
}));
vi.mock('../cli-adapters/codex-mcp-server-probe.js', () => ({
  codexMcpServerAvailable: () => true,
}));
vi.mock('../cli-adapters/cli-circuit-breaker.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cli-adapters/cli-circuit-breaker.js')>()),
  getCliCircuitBreakerSnapshot: () => undefined,
}));
// Each seat's adapter carries its CLI as `modelId`, so the assignment names the CLI.
vi.mock('../adapters/unified-registry.js', () => ({
  getGlobalRegistry: () => ({
    getAdapterForCli: (cli: CliName) => ({ modelId: cli, providerId: cli }),
  }),
}));

const ROLES = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
] as const;
const FALLBACK = { modelId: 'fallback', providerId: 'fallback' } as unknown as IModelAdapter;

async function seatMap(roles: readonly string[] = ROLES): Promise<Record<string, string>> {
  const { assignPanelSeats } = await import('./voter-agents.js');
  const seats = await assignPanelSeats(
    FALLBACK,
    { roles: [...roles] as (typeof ROLES)[number][] },
    createLogger({ component: 'test' })
  );
  expect(seats.size).toBe(roles.length);
  return Object.fromEntries([...seats].map(([role, a]) => [role, a.modelId]));
}

async function seatClis(): Promise<string[]> {
  return Object.values(await seatMap());
}

describe('voter seat assignment honors NEXUS_DISABLED_CLIS (#6590)', () => {
  const saved = process.env['NEXUS_DISABLED_CLIS'];
  afterEach(() => {
    if (saved === undefined) delete process.env['NEXUS_DISABLED_CLIS'];
    else process.env['NEXUS_DISABLED_CLIS'] = saved;
  });

  it('spreads seats over the three read-only-enforcing CLIs when unset (#6962)', async () => {
    delete process.env['NEXUS_DISABLED_CLIS'];
    expect(new Set(await seatClis())).toEqual(new Set(['claude', 'codex', 'opencode']));
  });

  it('seats no voter on gemini or codex when both are disabled', async () => {
    process.env['NEXUS_DISABLED_CLIS'] = 'gemini,codex';
    const clis = await seatClis();
    expect(clis).not.toContain('gemini');
    expect(clis).not.toContain('codex');
    expect(new Set(clis)).toEqual(new Set(['claude', 'opencode']));
  });
});

describe('default panel seats only CLIs that enforce read-only analysis (#6962)', () => {
  const saved = process.env['NEXUS_DISABLED_CLIS'];
  afterEach(() => {
    if (saved === undefined) delete process.env['NEXUS_DISABLED_CLIS'];
    else process.env['NEXUS_DISABLED_CLIS'] = saved;
  });

  // Before #6962 security and catfish were dealt to gemini, whose agy adapter
  // refuses read-only analysis, so both seats errored on every panel.
  it('moves security to codex and keeps no seat on gemini', async () => {
    delete process.env['NEXUS_DISABLED_CLIS'];
    expect(await seatMap()).toEqual({
      architect: 'claude',
      security: 'codex',
      devex: 'opencode',
      ai_ml: 'claude',
      pm: 'codex',
      catfish: 'opencode',
      scope_steward: 'claude',
    });
  });

  it('keeps the anthropic and openai families both seated', async () => {
    delete process.env['NEXUS_DISABLED_CLIS'];
    const clis = await seatClis();
    expect(clis).toContain('claude');
    expect(clis).toContain('codex');
  });

  it('quick panel seats claude, codex and opencode', async () => {
    delete process.env['NEXUS_DISABLED_CLIS'];
    expect(await seatMap(['architect', 'security', 'scope_steward'])).toEqual({
      architect: 'claude',
      security: 'codex',
      scope_steward: 'opencode',
    });
  });
});
