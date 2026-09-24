/**
 * The main doctor CLI list measures the CLI binary, never the gateway (#6782).
 *
 * In gateway mode a slot whose binary is on PATH and whose family model is on
 * the gateway is a `cli-or-gateway` arm. Its `healthCheck` delegates to
 * whichever target the arm picks, so when the binary's own health fails the
 * arm answers with the gateway model's health — and the CLI list credited the
 * CLI with it (`version: 'api'`, healthy, admitted). The list must report the
 * binary's own health.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../version.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../version.js')>();
  return { ...actual, VERSION: '1.0.0' };
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});
vi.mock('../cli-adapters/factory.js', () => ({ createAllAdapters: vi.fn() }));
// The slot's binary is "on PATH", so the arm is `cli-or-gateway`. Nothing spawns it.
vi.mock('../cli-adapters/cli-binary-on-path.js', () => ({ isCliBinaryOnPath: vi.fn(() => true) }));
vi.mock('../cli-adapters/codex-mcp-server-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-adapters/codex-mcp-server-probe.js')>();
  return { ...actual, codexMcpServerAvailable: vi.fn(() => true) };
});
vi.mock('./doctor-claude-model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./doctor-claude-model.js')>();
  return {
    ...actual,
    probeClaudePinnedModel: vi.fn(() =>
      Promise.resolve({ alias: 'fable', status: 'not-probed' as const, reason: 'stubbed' })
    ),
  };
});
vi.mock('../mcp/server.js', () => ({ createServer: vi.fn(() => ({ ok: true })) }));
vi.mock('./cli-auth-probe.js', () => ({
  probeCli: vi.fn((cli: string) =>
    Promise.resolve({ cli, state: 'authenticated' as const, via: 'cli-credentials' as const })
  ),
}));
vi.mock('./doctor-gateway.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./doctor-gateway.js')>();
  return {
    ...actual,
    checkGatewayHealth: vi.fn(() => Promise.resolve({ state: 'not_configured' as const })),
  };
});

import { runDoctor } from './doctor.js';
import { createAllAdapters } from '../cli-adapters/factory.js';
import { buildGatewaySlotRouterArm } from '../cli-adapters/gateway-slot-arm.js';
import { isCliBinaryOnPath } from '../cli-adapters/cli-binary-on-path.js';
import type { HealthStatus, ICliAdapter } from '../cli-adapters/types.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';

/** The binary's own health: installed, but on an unsupported version. */
const BINARY_HEALTH: HealthStatus = {
  healthy: false,
  version: '0.0.1',
  versionStatus: 'unsupported',
  message: 'claude 0.0.1 is below the supported minimum',
  lastChecked: new Date(0),
};

describe('doctor CLI list on a cli-or-gateway slot (#6782)', () => {
  let savedDisabled: string | undefined;

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6')]);
    savedDisabled = process.env['NEXUS_DISABLED_CLIS'];
    process.env['NEXUS_DISABLED_CLIS'] = 'gemini,codex,opencode';
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    if (savedDisabled === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DISABLED_CLIS');
    else process.env['NEXUS_DISABLED_CLIS'] = savedDisabled;
  });

  /** A cli-or-gateway arm whose binary is installed but unhealthy. */
  function armWithUnhealthyBinary(): ICliAdapter {
    const binary = {
      name: 'claude',
      healthCheck: vi.fn(() => Promise.resolve(BINARY_HEALTH)),
      getCapacity: vi.fn(() => Promise.reject(new Error('unsupported'))),
    } as unknown as ICliAdapter;
    const arm = buildGatewaySlotRouterArm(
      'claude',
      () => binary,
      () => Promise.resolve(false)
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('expected a gateway slot arm');
    return arm;
  }

  it("reports the binary's health, not the gateway's, when the binary's health fails", async () => {
    vi.mocked(createAllAdapters).mockReturnValue(
      new Map([['claude', armWithUnhealthyBinary()]]) as never
    );

    const result = await runDoctor();
    const claude = result.clis.find((c) => c.name === 'claude');

    expect(claude?.version).toBe('0.0.1');
    expect(claude?.versionStatus).toBe('unsupported');
    expect(claude?.routerAdmits).toBe(false);
    expect(claude?.error).toBe(BINARY_HEALTH.message);
  });

  it('reports a CLI whose binary is not on PATH as not installed, though the gateway serves its slot', async () => {
    vi.mocked(isCliBinaryOnPath).mockReturnValueOnce(false);
    const arm = buildGatewaySlotRouterArm(
      'claude',
      () => {
        throw new Error('a binary that is not on PATH is never constructed');
      },
      () => Promise.resolve(false)
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('expected a gateway slot arm');
    vi.mocked(createAllAdapters).mockReturnValue(new Map([['claude', arm]]) as never);

    const result = await runDoctor();
    const claude = result.clis.find((c) => c.name === 'claude');

    expect(claude?.installed).toBe(false);
    expect(claude?.routerAdmits).toBe(false);
  });
});
