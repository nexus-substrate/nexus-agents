/**
 * The `serves` readiness level (#4376).
 *
 * @module cli/doctor-live.test
 */

import { describe, expect, it } from 'vitest';

import { formatLiveReadiness, runLiveReadiness } from './doctor-live.js';
import type { ServesProbeTarget } from './cli-readiness.js';
import type { CliName } from '../cli-adapters/types.js';

const serving = (text: string): ServesProbeTarget => ({
  execute: () => Promise.resolve({ ok: true as const, value: { text } }),
});

const adapters = (m: Record<string, ServesProbeTarget>): Map<CliName, ServesProbeTarget> =>
  new Map(Object.entries(m) as Array<[CliName, ServesProbeTarget]>);

type AuthState = 'authenticated' | 'unknown' | 'not-ok';

const auth = (m: Record<string, AuthState>): ReadonlyMap<CliName, AuthState> =>
  new Map(Object.entries(m)) as ReadonlyMap<CliName, AuthState>;

/**
 * These cases exercise the auth and serves rungs, so they declare the binary
 * present. Before #4840 the `installed` rung was a literal, and every one of
 * them depended on that constant without saying so — they broke the moment it
 * became a real probe, which is how the dependency surfaced.
 */
const INSTALLED = { isInstalled: (): boolean => true };

describe('runLiveReadiness', () => {
  it('reaches serves when the adapter returns content', async () => {
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('ok') }),
      ...INSTALLED,
      authStates: auth({ claude: 'authenticated' }),
    });

    expect(report[0]?.reached).toBe('serves');
  });

  it('catches the #4351 case: authenticated, healthy, serves nothing', async () => {
    // The whole point. Every prior check passes; the completion returns empty.
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('') }),
      ...INSTALLED,
      authStates: auth({ claude: 'authenticated' }),
    });

    expect(report[0]?.reached).toBe('authenticated');
    expect(report[0]?.levels.serves.status).toBe('failed');
  });

  it('does not bill a completion for an unauthenticated adapter', async () => {
    let called = false;
    const spy: ServesProbeTarget = {
      execute: () => {
        called = true;
        return Promise.resolve({ ok: true as const, value: { text: 'ok' } });
      },
    };

    const report = await runLiveReadiness({
      adapters: adapters({ claude: spy }),
      ...INSTALLED,
      authStates: auth({ claude: 'not-ok' }),
    });

    expect(called).toBe(false);
    expect(report[0]?.levels.serves.status).toBe('not-attempted');
  });

  it('records a skipped level as not-attempted, never failed', async () => {
    // Nothing was learned about serving, so claiming it failed would invent a
    // measurement just as much as claiming it passed.
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('ok') }),
      ...INSTALLED,
      authStates: auth({ claude: 'not-ok' }),
    });

    const serves = report[0]?.levels.serves;
    expect(serves?.status).toBe('not-attempted');
    if (serves?.status !== 'not-attempted') return;
    expect(serves.reason).toContain('not attempted');
  });

  it('probes an adapter whose auth signal is unreadable, rather than assuming', async () => {
    // #4391: agy exposes no non-interactive auth check, so the auth probe says
    // `unknown`. The live probe is exactly what settles it.
    const report = await runLiveReadiness({
      adapters: adapters({ gemini: serving('ok') }),
      ...INSTALLED,
      authStates: auth({ gemini: 'unknown' }),
    });

    expect(report[0]?.reached).toBe('serves');
  });

  it('reports each adapter independently', async () => {
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('ok'), codex: serving('') }),
      ...INSTALLED,
      authStates: auth({ claude: 'authenticated', codex: 'authenticated' }),
    });

    expect(report.map((r) => r.reached)).toEqual(['serves', 'authenticated']);
  });
});

describe('formatLiveReadiness', () => {
  it('says nothing was probed rather than printing an empty success', () => {
    expect(formatLiveReadiness([])).toContain('nothing was probed');
  });

  it('names the failing level in the output', async () => {
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('') }),
      ...INSTALLED,
      authStates: auth({ claude: 'authenticated' }),
    });

    expect(formatLiveReadiness(report)).toContain('no content');
  });
});

// ============================================================================
// The installed rung is measured, not asserted (#4840)
// ============================================================================

describe('installed level reflects a real probe (#4840)', () => {
  // `installed` was the literal `{ status: 'verified' }`. Nothing probed PATH,
  // so a CLI that is not on the system still reported the first rung green —
  // and every existing test above depends on that constant without saying so.

  it('fails the ladder at installed when the binary is absent', async () => {
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('ok') }),
      authStates: auth({ claude: 'authenticated' }),
      isInstalled: () => false,
    });

    expect(report[0]?.levels.installed.status).toBe('failed');
    // `reached` is undefined, not a level name, when even installed failed.
    expect(report[0]?.reached).toBeUndefined();
  });

  it('does not probe auth or serves for a CLI that is not installed', async () => {
    // The ladder's own contract: a skipped level reports not-attempted, never
    // failed — nothing was learned about it. Probing a missing binary for
    // credentials is also how "not installed" became "no usable credentials
    // found" in the reason string.
    let served = false;
    const report = await runLiveReadiness({
      adapters: adapters({
        claude: {
          execute: () => {
            served = true;
            return Promise.resolve({ ok: true as const, value: { text: 'ok' } });
          },
        },
      }),
      authStates: auth({ claude: 'authenticated' }),
      isInstalled: () => false,
    });

    expect(served).toBe(false);
    expect(report[0]?.levels.authenticated.status).toBe('not-attempted');
    expect(report[0]?.levels.serves.status).toBe('not-attempted');
  });

  it('still reaches serves when the binary is present', async () => {
    // The pair. Without it, "always report not installed" satisfies both
    // tests above and breaks every real run.
    const report = await runLiveReadiness({
      adapters: adapters({ claude: serving('ok') }),
      authStates: auth({ claude: 'authenticated' }),
      isInstalled: () => true,
    });

    expect(report[0]?.levels.installed.status).toBe('verified');
    expect(report[0]?.reached).toBe('serves');
  });
});
