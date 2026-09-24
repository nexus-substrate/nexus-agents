/**
 * The doctor verdict must account for scratch space (#4488).
 *
 * `worstSeverity` shipped in #4528 and was then called nowhere: `allHealthy`
 * was computed from node version, auth, MCP readiness and CLI status only, so
 * `nexus-agents doctor` exited 0 with a 100%-full tmpfs. The check reported
 * the exact condition it was built for and still could not fail on it.
 *
 * @module cli/doctor-verdict.test
 */

import { describe, expect, it } from 'vitest';

import { isAllHealthy } from './doctor.js';
import type { CliCheckResult } from './doctor.js';
import type { ScratchSpaceCheck, ScratchSpaceSeverity } from './doctor-scratch-space.js';

const healthyCli: CliCheckResult = {
  name: 'claude',
  installed: true,
  authenticated: true,
  authState: 'authenticated',
  routerAdmits: true,
  version: '1.0.0',
  versionStatus: 'supported',
};

const scratch = (severity: ScratchSpaceSeverity): ScratchSpaceCheck => ({
  label: 'system',
  root: '/tmp',
  available: true,
  freeBytes: 0,
  totalBytes: 32 * 1024 ** 3,
  percentUsed: 100,
  severity,
  message: 'test reading',
});

/** Everything healthy; each test perturbs exactly one input. */
const base = {
  nodeSupported: true,
  hasAuthMethod: true,
  mcpServerReady: true,
  installFreshness: { state: 'aligned' as const, version: '1.0.0' },
  scratchSpace: [scratch('ok')],
  clis: [healthyCli],
  gateway: 'absent' as const,
  gatewayCoveredClis: [],
};

describe('isAllHealthy', () => {
  it('is healthy when every input is fine', () => {
    expect(isAllHealthy(base)).toBe(true);
  });

  it('is UNHEALTHY when the global install is behind (#5613)', () => {
    const installFreshness = { state: 'behind' as const, global: '1.0.0', expected: '2.0.0' };

    expect(isAllHealthy({ ...base, installFreshness })).toBe(false);
  });

  it('stays healthy when install freshness is unmeasured: named in the summary, not failed (#6782)', () => {
    // #5613 asked for exactly this ("unknown → not a failure but reported as
    // unmeasured"); the implementation failed on it. One rule now covers every
    // verdict section, the one scratch space already follows.
    const installFreshness = { state: 'unknown' as const, reason: 'not installed' };

    expect(isAllHealthy({ ...base, installFreshness })).toBe(true);
  });

  it('stays healthy when the global install is newer than this build (#6782)', () => {
    const installFreshness = { state: 'ahead' as const, global: '8.110.1', expected: '8.110.0' };

    expect(isAllHealthy({ ...base, installFreshness })).toBe(true);
  });

  it('is UNHEALTHY when a scratch filesystem is critical', () => {
    expect(isAllHealthy({ ...base, scratchSpace: [scratch('critical')] })).toBe(false);
  });

  it('stays healthy on a warn-level reading', () => {
    // warn leaves room for the current run. Failing on it would collapse the
    // two thresholds into one and make the distinction meaningless.
    expect(isAllHealthy({ ...base, scratchSpace: [scratch('warn')] })).toBe(true);
  });

  it('takes the WORST reading across filesystems', () => {
    // A roomy nexus root must not mask a starved shared one — the same
    // masking #4528 fixed in the display, now in the verdict.
    const mixed = [scratch('ok'), scratch('critical')];

    expect(isAllHealthy({ ...base, scratchSpace: mixed })).toBe(false);
  });

  it('stays healthy when no filesystem could be measured', () => {
    // Absence of a reading is not evidence of a full disk, and doctor must
    // not fail closed on a diagnostic it could not run.
    expect(isAllHealthy({ ...base, scratchSpace: [] })).toBe(true);
  });

  it('is UNHEALTHY when no CLI was detected at all (#4581)', () => {
    // `[].every()` is `true`, so an empty CLI list used to satisfy the CLI
    // clause outright: doctor reported a healthy install having measured no
    // CLI whatsoever. Zero detected CLIs is an unusable install, not a clean
    // bill of health.
    expect(isAllHealthy({ ...base, clis: [] })).toBe(false);
  });

  it('still fails on the pre-existing inputs', () => {
    expect(isAllHealthy({ ...base, nodeSupported: false })).toBe(false);
    expect(isAllHealthy({ ...base, hasAuthMethod: false })).toBe(false);
    expect(isAllHealthy({ ...base, mcpServerReady: false })).toBe(false);
    expect(isAllHealthy({ ...base, clis: [{ ...healthyCli, authenticated: false }] })).toBe(false);
  });
});

describe('isAllHealthy with a gateway (#6609)', () => {
  const missing = (name: CliCheckResult['name']): CliCheckResult => ({
    name,
    installed: false,
    authenticated: false,
    authState: 'unverified',
    routerAdmits: false,
    version: 'N/A',
    versionStatus: 'unsupported',
  });
  const noClis = (['claude', 'gemini', 'codex', 'opencode'] as const).map(missing);

  it('PASSES a gateway-only host: no CLI installed, a passing gateway', () => {
    expect(isAllHealthy({ ...base, clis: noClis, gateway: 'pass' })).toBe(true);
  });

  it('PASSES a passing gateway with every CLI disabled (empty CLI list)', () => {
    expect(isAllHealthy({ ...base, clis: [], gateway: 'pass' })).toBe(true);
  });

  it('fails the same host with no gateway', () => {
    expect(isAllHealthy({ ...base, clis: noClis, gateway: 'absent' })).toBe(false);
  });

  it('FAILS a failing gateway even when every CLI is healthy', () => {
    expect(isAllHealthy({ ...base, gateway: 'fail' })).toBe(false);
  });

  it('still fails an installed CLI that is not authenticated when the gateway does not serve its slot', () => {
    const clis = [{ ...healthyCli, authenticated: false }];
    expect(isAllHealthy({ ...base, clis, gateway: 'pass' })).toBe(false);
  });

  it('passes a broken installed CLI whose slot the gateway serves (#6782)', () => {
    const clis = [{ ...healthyCli, versionStatus: 'unsupported' as const }];
    expect(isAllHealthy({ ...base, clis, gateway: 'pass', gatewayCoveredClis: ['claude'] })).toBe(
      true
    );
    // The pair: the same CLI with its slot unserved still fails.
    expect(isAllHealthy({ ...base, clis, gateway: 'pass', gatewayCoveredClis: [] })).toBe(false);
  });
});
