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
  scratchSpace: [scratch('ok')],
  clis: [healthyCli],
};

describe('isAllHealthy', () => {
  it('is healthy when every input is fine', () => {
    expect(isAllHealthy(base)).toBe(true);
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
