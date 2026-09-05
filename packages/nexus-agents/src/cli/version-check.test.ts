/**
 * Tests for the startup version-drift check (#3283). No real network — fetch is injected.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ILogger } from '../core/index.js';
import { NODE_ENGINE_RANGE, isNodeVersionSupported } from '../version.js';
import { checkVersionDrift, warnIfVersionStale } from './version-check.js';

function fetchReturning(version: unknown, ok = true): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve({ version }) } as unknown as Response)
  );
}

function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

afterEach(() => {
  delete process.env['NEXUS_VERSION_CHECK'];
  vi.restoreAllMocks();
});

describe('Node engine compatibility (#5608)', () => {
  it.each([
    ['v20.19.0', false],
    ['v22.4.1', false],
    ['v22.5.0', true],
    ['v24.0.0', true],
  ])('reports %s supported=%s', (version, supported) => {
    expect(isNodeVersionSupported(version)).toBe(supported);
  });

  it('pins the required range to package.json', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { engines: { node: string } };

    expect(NODE_ENGINE_RANGE).toBe(manifest.engines.node);
  });
});

describe('checkVersionDrift (#3283)', () => {
  it('flags stale when running version is behind latest', async () => {
    const drift = await checkVersionDrift({
      currentVersion: '2.76.0',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(drift).toEqual({ current: '2.76.0', latest: '2.96.0', stale: true });
  });

  it('not stale when running version equals latest', async () => {
    const drift = await checkVersionDrift({
      currentVersion: '2.96.0',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(drift?.stale).toBe(false);
  });

  it('not stale when running version is AHEAD of latest', async () => {
    const drift = await checkVersionDrift({
      currentVersion: '2.97.0',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(drift?.stale).toBe(false);
  });

  it('returns null for a dev/non-semver build (nothing to compare)', async () => {
    const drift = await checkVersionDrift({
      currentVersion: 'dev',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(drift).toBeNull();
  });

  it('returns null on a network error (fail-soft)', async () => {
    const drift = await checkVersionDrift({
      currentVersion: '2.76.0',
      fetchImpl: vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    });
    expect(drift).toBeNull();
  });

  it('returns null on a non-ok response or unparseable version', async () => {
    expect(
      await checkVersionDrift({
        currentVersion: '2.76.0',
        fetchImpl: fetchReturning('2.96.0', false),
      })
    ).toBeNull();
    expect(
      await checkVersionDrift({ currentVersion: '2.76.0', fetchImpl: fetchReturning(undefined) })
    ).toBeNull();
  });
});

describe('warnIfVersionStale (#3283)', () => {
  // warnIfVersionStale skips when CI is set; neutralize it so the logic is testable.
  let savedCI: string | undefined;
  beforeEach(() => {
    savedCI = process.env['CI'];
    delete process.env['CI'];
  });
  afterEach(() => {
    if (savedCI !== undefined) process.env['CI'] = savedCI;
  });

  it('warns once when stale', async () => {
    const logger = spyLogger();
    await warnIfVersionStale(logger, {
      currentVersion: '2.76.0',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('stale version'),
      expect.objectContaining({ running: '2.76.0', latestPublished: '2.96.0' })
    );
  });

  it('does NOT warn when up to date', async () => {
    const logger = spyLogger();
    await warnIfVersionStale(logger, {
      currentVersion: '2.96.0',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does NOT warn when disabled via NEXUS_VERSION_CHECK=0', async () => {
    process.env['NEXUS_VERSION_CHECK'] = '0';
    const logger = spyLogger();
    await warnIfVersionStale(logger, {
      currentVersion: '2.76.0',
      fetchImpl: fetchReturning('2.96.0'),
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
