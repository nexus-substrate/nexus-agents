/**
 * `doctor --live` never runs a CLI disabled by `NEXUS_DISABLED_CLIS` (#6720),
 * even when a gateway model serves its slot. Nothing is mocked: the real
 * `createAllAdapters`, binary detector and auth probe run against a PATH that
 * holds only recording shims, so a disabled binary that is spawned for ANY
 * reason leaves a marker file behind.
 *
 * - claude's auth probe reads files, so a claude run can only come from the
 *   `installed` rung (`which` + `claude --version`).
 * - codex's auth probe spawns `codex login status`, so with the `installed`
 *   rung skipped a codex run can only come from the auth probe.
 *
 * The shared spawn guard (`cli-spawn-guard.setup.ts`) blocks any spawn of a
 * CLI name; `SHIM_PATH_E2E` opts this file out of it, which is safe because
 * PATH holds nothing but the shims and `which`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { formatLiveReadiness, runLiveReadiness } from './doctor-live.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';

const WHICH = ['/usr/bin/which', '/bin/which'].find((p) => existsSync(p));

describe('doctor --live with disabled CLIs (#6720)', () => {
  let bin: string;
  const saved: Record<string, string | undefined> = {};

  /** A recording shim for `name`; returns the marker it writes when run. */
  function shim(name: string): string {
    const marker = join(bin, `${name}-ran`);
    writeFileSync(join(bin, name), `#!/bin/sh\necho "$@" >> '${marker}'\necho 9.9.9\n`);
    chmodSync(join(bin, name), 0o755);
    return marker;
  }

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    bin = mkdtempSync(join(tmpdir(), 'nexus-live-shims-'));
    if (WHICH !== undefined) symlinkSync(WHICH, join(bin, 'which'));
    for (const k of ['PATH', 'NEXUS_DISABLED_CLIS', 'SHIM_PATH_E2E']) saved[k] = process.env[k];
    process.env['PATH'] = bin;
    process.env['NEXUS_DISABLED_CLIS'] = 'claude,codex';
    process.env['SHIM_PATH_E2E'] = '1';
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
    rmSync(bin, { recursive: true, force: true });
  });

  it.skipIf(WHICH === undefined)(
    'never spawns a disabled binary, and reports its slot as gateway-served',
    async () => {
      setGatewaySlotCatalog(['claude-sonnet-4-6', 'gpt-5.5'].map((id) => fakeGatewayModel(id)));
      const claudeRan = shim('claude');
      const codexRan = shim('codex');

      const report = await runLiveReadiness();

      expect(existsSync(claudeRan)).toBe(false);
      expect(existsSync(codexRan)).toBe(false);
      const claude = report.find((r) => r.cli === 'claude');
      expect(claude?.gateway).toEqual({
        gatewayModel: 'claude-sonnet-4-6',
        cliState: 'disabled',
      });
      expect(claude?.levels.serves.status).toBe('verified');
      expect(claude?.levels.installed.status).toBe('not-attempted');
      expect(formatLiveReadiness(report)).toContain(
        'claude: served by gateway model claude-sonnet-4-6 (CLI disabled by NEXUS_DISABLED_CLIS) — serves'
      );
    }
  );

  it('skips a disabled CLI handed in as a plain arm, never checking its binary', async () => {
    // Defence in depth: `createAllAdapters` never builds such an arm, but a
    // caller-supplied map can. It must not reach the installed rung.
    const claudeRan = shim('claude');
    const execute = (): Promise<{ ok: true; value: { text: string } }> =>
      Promise.resolve({ ok: true, value: { text: 'ok' } });
    const installedChecks: string[] = [];
    const report = await runLiveReadiness({
      adapters: new Map([['claude', { execute }]]),
      authStates: new Map([['claude', 'authenticated']]),
      isInstalled: (cli) => {
        installedChecks.push(cli);
        return true;
      },
    });
    expect(installedChecks).toEqual([]);
    expect(report).toEqual([]);
    expect(existsSync(claudeRan)).toBe(false);
  });

  it.skipIf(WHICH === undefined)('the shim records a run when the CLI is enabled', async () => {
    // Guard the guard: the same shim DOES record when the CLI is not disabled.
    process.env['NEXUS_DISABLED_CLIS'] = '';
    const claudeRan = shim('claude');
    // `not-ok` auth stops the ladder before a completion is sent to the shim.
    await runLiveReadiness({ authStates: new Map([['claude', 'not-ok']]) });
    expect(existsSync(claudeRan)).toBe(true);
  });
});
