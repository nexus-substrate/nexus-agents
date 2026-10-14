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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { detectCliBinaryMock } = vi.hoisted(() => ({
  detectCliBinaryMock: vi.fn<(name: string) => { installed: boolean; version: undefined }>(),
}));

vi.mock('./setup-cli-detection.js', () => ({ detectCliBinary: detectCliBinaryMock }));

import { runLiveReadiness } from './doctor-live.js';
import type { ServesProbeTarget } from './cli-readiness.js';
import type { CliName } from '../cli-adapters/types.js';

describe('runLiveReadiness default installed probe (#4840)', () => {
  beforeEach(() => {
    detectCliBinaryMock.mockReset();
    detectCliBinaryMock.mockReturnValue({ installed: false, version: undefined });
  });

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

  it('reaches the Gemini serving probe when only its canonical agy binary is installed', async () => {
    detectCliBinaryMock.mockImplementation((name: string) => ({
      installed: name === 'agy',
      version: undefined,
    }));
    const execute = vi.fn(() => Promise.resolve({ ok: true as const, value: { text: 'ok' } }));
    const report = await runLiveReadiness({
      adapters: new Map([['gemini', { execute }]]),
      authStates: new Map([['gemini', 'authenticated']]),
    });

    expect(detectCliBinaryMock).toHaveBeenCalledWith('agy');
    expect(report[0]?.cli).toBe('gemini');
    expect(report[0]?.levels.installed.status).toBe('verified');
    expect(report[0]?.levels.serves.status).toBe('verified');
    expect(execute).toHaveBeenCalledOnce();
  });

  it('does not bill a Gemini serving probe when only the retired gemini binary is installed', async () => {
    detectCliBinaryMock.mockImplementation((name: string) => ({
      installed: name === 'gemini',
      version: undefined,
    }));
    const execute = vi.fn(() => Promise.resolve({ ok: true as const, value: { text: 'ok' } }));
    const report = await runLiveReadiness({
      adapters: new Map([['gemini', { execute }]]),
      authStates: new Map([['gemini', 'authenticated']]),
    });

    expect(report[0]?.levels.installed.status).toBe('failed');
    expect(report[0]?.levels.authenticated.status).toBe('not-attempted');
    expect(report[0]?.levels.serves.status).toBe('not-attempted');
    expect(execute).not.toHaveBeenCalled();
  });
});
