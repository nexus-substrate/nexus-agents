/**
 * `doctor --live` attributes a probe to the route that served it (#6781).
 *
 * The slot's CLI binary is on PATH and the gateway has its family's model, so
 * the router arm is an UNDECIDED gateway slot arm. Its availability predicate
 * says the CLI is not available (its health check fails), so the arm serves
 * the probe through the gateway. The report must say so, and must not credit
 * the CLI's installed / authenticated / serves rungs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { formatLiveReadiness, runLiveReadiness } from './doctor-live.js';
import type { ServesProbeTarget } from './cli-readiness.js';
import { buildGatewaySlotRouterArm } from '../cli-adapters/gateway-slot-arm.js';
import type { CliName, ICliAdapter } from '../cli-adapters/types.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';

const GATEWAY_MODEL = 'claude-sonnet-4-6';

describe('doctor --live on an undecided gateway slot arm (#6781)', () => {
  let bin: string;
  let savedPath: string | undefined;
  let savedDisabled: string | undefined;

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    setGatewaySlotCatalog([fakeGatewayModel(GATEWAY_MODEL)]);
    // An executable named `claude` on PATH: the slot is `cli-or-gateway`.
    // Only its presence is read; nothing spawns it.
    bin = mkdtempSync(join(tmpdir(), 'nexus-live-attr-'));
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(bin, 'claude'), 0o755);
    savedPath = process.env['PATH'];
    savedDisabled = process.env['NEXUS_DISABLED_CLIS'];
    process.env['PATH'] = bin;
    process.env['NEXUS_DISABLED_CLIS'] = '';
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    if (savedPath === undefined) Reflect.deleteProperty(process.env, 'PATH');
    else process.env['PATH'] = savedPath;
    if (savedDisabled === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DISABLED_CLIS');
    else process.env['NEXUS_DISABLED_CLIS'] = savedDisabled;
    rmSync(bin, { recursive: true, force: true });
  });

  /** An undecided arm whose CLI target records any call it receives. */
  function undecidedArm(cliAvailable: boolean): {
    arm: ServesProbeTarget;
    cliExecute: ReturnType<typeof vi.fn>;
  } {
    const cliExecute = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { text: 'served by the cli' } })
    );
    const cliAdapter = { name: 'claude', execute: cliExecute } as unknown as ICliAdapter;
    const arm = buildGatewaySlotRouterArm(
      'claude',
      () => cliAdapter,
      () => Promise.resolve(cliAvailable)
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('expected a gateway slot arm');
    return { arm, cliExecute };
  }

  it('attributes the probe to the gateway when the CLI is not available', async () => {
    const { arm, cliExecute } = undecidedArm(false);

    const report = await runLiveReadiness({
      adapters: new Map<CliName, ServesProbeTarget>([['claude', arm]]),
      authStates: new Map([['claude', 'authenticated']]),
      isInstalled: () => true,
    });

    expect(cliExecute).not.toHaveBeenCalled();
    const claude = report[0];
    expect(claude?.gateway).toEqual({ gatewayModel: GATEWAY_MODEL, cliState: 'not-available' });
    expect(claude?.reached).toBe('serves');
    expect(claude?.levels.installed.status).toBe('not-attempted');
    expect(claude?.levels.authenticated.status).toBe('not-attempted');
    const text = formatLiveReadiness(report);
    expect(text).toContain(
      `claude: served by gateway model ${GATEWAY_MODEL} (CLI not available) — serves`
    );
    expect(text).not.toContain('ready through');
  });

  it('says so when the CLI list admitted the CLI the live check found unavailable', async () => {
    const { arm } = undecidedArm(false);

    const report = await runLiveReadiness({
      adapters: new Map<CliName, ServesProbeTarget>([['claude', arm]]),
      authStates: new Map([['claude', 'authenticated']]),
      isInstalled: () => true,
      cliListAdmits: new Map([['claude', true]]),
    });

    expect(report[0]?.gateway?.cliListAdmitted).toBe(true);
    expect(formatLiveReadiness(report)).toContain(
      'its health/auth check failed in this live run, but the CLI list above admitted it'
    );
  });

  it('keeps crediting the CLI when the arm decides the CLI serves', async () => {
    const { arm, cliExecute } = undecidedArm(true);

    const report = await runLiveReadiness({
      adapters: new Map<CliName, ServesProbeTarget>([['claude', arm]]),
      authStates: new Map([['claude', 'authenticated']]),
      isInstalled: () => true,
      cliListAdmits: new Map([['claude', true]]),
    });

    expect(cliExecute).toHaveBeenCalledTimes(1);
    expect(report[0]?.gateway).toBeUndefined();
    expect(report[0]?.reached).toBe('serves');
    expect(report[0]?.levels.installed.status).toBe('verified');
  });
});
