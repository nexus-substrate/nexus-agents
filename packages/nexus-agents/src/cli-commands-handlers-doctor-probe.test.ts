/** CLI live readiness exercised through the existing adapter enumeration (#4376). */
import { parseArgs } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliName, ICliAdapter } from './cli-adapters/types.js';
import type { ServesProbeTarget } from './cli/cli-readiness.js';
import { PARSE_ARGS_CONFIG } from './cli-types.js';
import { buildOptions } from './cli/cli-options-builders.js';
import { resolveClassGuardMs } from './config/timeouts.js';

const seam = vi.hoisted(() => ({
  execute: vi.fn<ServesProbeTarget['execute']>(),
  auth: vi.fn(() => Promise.resolve({ cli: 'claude', state: 'authenticated' })),
}));
vi.mock('./cli/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cli/index.js')>()),
  doctorCommand: vi.fn().mockResolvedValue(0),
}));
vi.mock('./cli-adapters/factory.js', () => ({
  createAllAdapters: () =>
    new Map<CliName, ICliAdapter>([
      ['claude', { execute: seam.execute } as unknown as ICliAdapter],
    ]),
}));
vi.mock('./cli/cli-auth-probe.js', () => ({ probeCli: seam.auth }));
vi.mock('./cli/setup-cli-detection.js', () => ({ detectCliBinary: () => ({ installed: true }) }));

import { handleDoctorCommand } from './cli-commands-handlers.js';

function invokeDoctor(live: boolean): ReturnType<typeof handleDoctorCommand> {
  const args = live ? ['doctor', '--live'] : ['doctor'];
  const { values } = parseArgs({ ...PARSE_ARGS_CONFIG, args });
  return handleDoctorCommand({
    command: 'doctor',
    positionals: ['doctor'],
    options: buildOptions(values),
  });
}

describe('doctor completion seam (#4376)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXUS_DISABLED_CLIS', '');
    seam.execute.mockReset().mockResolvedValue({ ok: true, value: { text: 'ok' } });
    seam.auth.mockReset().mockResolvedValue({ cli: 'claude', state: 'authenticated' });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('plain doctor makes zero completion calls', async () => {
    expect((await invokeDoctor(false)).exitCode).toBe(0);
    expect(seam.execute).not.toHaveBeenCalled();
  });

  it('live doctor sends exactly one tiny completion and reports ok with latency', async () => {
    expect((await invokeDoctor(true)).exitCode).toBe(0);
    expect(seam.execute).toHaveBeenCalledTimes(1);
    expect(seam.execute).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 16 }),
      expect.anything()
    );
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringMatching(/ok \(\d+ms\)/));
  });

  it('fails an authenticated adapter refused at the provider tier', async () => {
    seam.execute.mockResolvedValue({
      ok: false,
      error: { message: 'IneligibleTierError: client no longer supported' },
    });
    expect((await invokeDoctor(true)).exitCode).toBe(1);
    expect(seam.execute).toHaveBeenCalledTimes(1);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('failed (auth)'));
  });

  it('fails an empty completion rather than calling it ready', async () => {
    seam.execute.mockResolvedValue({ ok: true, value: { text: '' } });
    expect((await invokeDoctor(true)).exitCode).toBe(1);
  });

  it('times out a hung adapter and exits nonzero', async () => {
    vi.useFakeTimers();
    seam.execute.mockImplementation(() => new Promise<never>(() => {}));
    const pending = invokeDoctor(true);
    await vi.advanceTimersByTimeAsync(resolveClassGuardMs('interactive'));
    expect((await pending).exitCode).toBe(1);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('failed (timeout)'));
  });

  it('skips an adapter without usable credentials without sending a completion', async () => {
    seam.auth.mockResolvedValue({ cli: 'claude', state: 'needs-login' });
    expect((await invokeDoctor(true)).exitCode).toBe(0);
    expect(seam.execute).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('skipped (credentials unavailable)')
    );
  });
});
