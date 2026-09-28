/**
 * `handleDoctorCommand --live` carries the CLI list into the live run (#6783).
 *
 * The handler reads the main CLI list from `doctorCommand`'s `onResult` and
 * passes it to `runLiveReadiness`. `doctor-live-gateway-attribution.test.ts`
 * tests the live half with the list supplied by hand; this tests the seam:
 * the list the handler received must reach the live run.
 *
 * Mocked at the boundaries only: `doctorCommand` reports a CLI list that
 * admitted `claude`. The live run is the real `runLiveReadiness` and the real
 * formatter; only the host-dependent inputs (the adapter map, auth states and
 * the install probe) are supplied, not the options the handler passes.
 *
 * @module cli-commands-handlers-doctor-live.test
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ParsedCliArgs } from './cli-types.js';
import type { DoctorResult } from './cli/doctor.js';
import type { ServesProbeTarget } from './cli/cli-readiness.js';
import type { CliName, ICliAdapter } from './cli-adapters/types.js';
import { buildGatewaySlotRouterArm } from './cli-adapters/gateway-slot-arm.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from './adapters/gateway-family-slots.js';
import { fakeGatewayModel } from './testing/adapters/fake-gateway-model.js';

const GATEWAY_MODEL = 'claude-sonnet-4-6';

vi.mock('./cli/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./cli/index.js')>();
  return {
    ...real,
    doctorCommand: vi.fn(
      (options: { onResult?: (result: DoctorResult) => void }): Promise<number> => {
        // The handler reads only `clis`; the rest of the result is not part
        // of this seam.
        options.onResult?.({
          clis: [{ name: 'claude', routerAdmits: true }],
        } as unknown as DoctorResult);
        return Promise.resolve(0);
      }
    ),
  };
});

vi.mock('./cli/doctor-live.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./cli/doctor-live.js')>();
  // An undecided gateway slot arm whose CLI is not available: the live run
  // serves the probe through the gateway, disagreeing with the CLI list.
  const liveDeps = (): Parameters<typeof real.runLiveReadiness>[0] => {
    const cliAdapter = {
      name: 'claude',
      execute: () => Promise.resolve({ ok: true as const, value: { text: 'cli' } }),
    } as unknown as ICliAdapter;
    const arm = buildGatewaySlotRouterArm(
      'claude',
      () => cliAdapter,
      () => Promise.resolve(false)
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('expected a gateway slot arm');
    return {
      adapters: new Map<CliName, ServesProbeTarget>([['claude', arm]]),
      authStates: new Map([['claude', 'authenticated']]),
      isInstalled: () => true,
    };
  };
  return {
    ...real,
    // The handler's options go through unchanged; the host-dependent inputs
    // are added alongside, never in place of, what it passed.
    runLiveReadiness: vi.fn((options: Parameters<typeof real.runLiveReadiness>[0] = {}) =>
      real.runLiveReadiness({ ...options, ...liveDeps() })
    ),
  };
});

import { handleDoctorCommand } from './cli-commands-handlers.js';

function doctorArgs(live: boolean): ParsedCliArgs {
  return {
    command: 'doctor',
    positionals: ['doctor'],
    options: {
      help: false,
      version: false,
      verbose: false,
      interactive: false,
      all: false,
      mode: 'server',
      force: false,
      format: 'table',
      dryRun: false,
      banditStats: false,
      setup: false,
      skipChecks: false,
      createIssue: false,
      fix: false,
      quick: false,
      nonInteractive: false,
      skipMcp: false,
      skipRules: false,
      skipHooks: false,
      skipConfig: false,
      skipOpencode: false,
      skipGemini: false,
      skipCodex: false,
      mock: false,
      deep: false,
      live,
      gateway: false,
      probe: false,
    },
  };
}

describe('handleDoctorCommand --live (#6783)', () => {
  let bin: string;
  let savedPath: string | undefined;
  let savedDisabled: string | undefined;
  let stdout: MockInstance<typeof process.stdout.write>;

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    setGatewaySlotCatalog([fakeGatewayModel(GATEWAY_MODEL)]);
    // An executable named `claude` on PATH makes the slot `cli-or-gateway`.
    // Only its presence is read; nothing spawns it.
    bin = mkdtempSync(join(tmpdir(), 'nexus-doctor-handler-'));
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(bin, 'claude'), 0o755);
    savedPath = process.env['PATH'];
    savedDisabled = process.env['NEXUS_DISABLED_CLIS'];
    process.env['PATH'] = bin;
    process.env['NEXUS_DISABLED_CLIS'] = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    _resetGatewaySlotCatalog();
    if (savedPath === undefined) Reflect.deleteProperty(process.env, 'PATH');
    else process.env['PATH'] = savedPath;
    if (savedDisabled === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DISABLED_CLIS');
    else process.env['NEXUS_DISABLED_CLIS'] = savedDisabled;
    rmSync(bin, { recursive: true, force: true });
  });

  it('prints that the CLI list admitted a CLI the live check found unavailable', async () => {
    await handleDoctorCommand(doctorArgs(true));

    const printed = stdout.mock.calls.map((call) => String(call[0])).join('');
    expect(printed).toContain(
      `claude: served by gateway model ${GATEWAY_MODEL} (CLI not available: its health/auth check failed in this live run, but the CLI list above admitted it)`
    );
  });
});
