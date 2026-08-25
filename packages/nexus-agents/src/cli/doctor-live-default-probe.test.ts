/**
 * The default `installed` probe is wired to the real binary detector (#4840).
 *
 * Separate file because it mocks `setup-cli-detection`, which the main
 * doctor-live suite deliberately does not — every case there injects
 * `isInstalled`, so none of them can see whether the DEFAULT reaches a real
 * probe. That is the seam: with the injection point tested and the default
 * untested, replacing the default with `() => true` passes the whole suite.
 *
 * @module cli/doctor-live-default-probe.test
 */

import { describe, expect, it, vi } from 'vitest';

const { detectCliBinaryMock } = vi.hoisted(() => ({
  detectCliBinaryMock: vi.fn(() => ({ installed: false, version: undefined })),
}));

vi.mock('./setup-cli-detection.js', () => ({ detectCliBinary: detectCliBinaryMock }));

import { runLiveReadiness } from './doctor-live.js';
import type { ServesProbeTarget } from './cli-readiness.js';
import type { CliName } from '../cli-adapters/types.js';

describe('runLiveReadiness default installed probe (#4840)', () => {
  it('consults the real binary detector when no override is supplied', async () => {
    const adapters = new Map<CliName, ServesProbeTarget>([
      ['claude', { execute: () => Promise.resolve({ ok: true as const, value: { text: 'ok' } }) }],
    ]);

    const report = await runLiveReadiness({
      adapters,
      authStates: new Map([['claude', 'authenticated']]),
    });

    expect(detectCliBinaryMock).toHaveBeenCalledWith('claude');
    expect(report[0]?.levels.installed.status).toBe('failed');
  });
});
