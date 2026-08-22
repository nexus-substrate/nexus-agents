/**
 * A gate that measured nothing must not report a pass (#4355).
 *
 * `createAgentStages`' quality-gate and security stages read the gate verdict
 * as `verdict !== 'fail'`. That was equivalent to `=== 'pass'` only while the
 * checks were two-valued. Once an unconfigured check could return `skip`, a
 * run in which NO check executed reported `passed: true` — and
 * `runDevPipeline` in `blocking` mode gates on `!qaGate.passed`, so it shipped
 * code with zero typecheck/lint/test coverage and recorded a success.
 *
 * @module pipeline/agent-executor-gate-skip.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above these declarations, so the factories must reach the
// spies lazily via vi.hoisted rather than closing over module-level consts.
const { runQualityGateMock, securityCheckMock } = vi.hoisted(() => ({
  runQualityGateMock: vi.fn(),
  securityCheckMock: vi.fn(),
}));

vi.mock('../security/quality-gate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../security/quality-gate.js')>();
  return { ...actual, runQualityGate: runQualityGateMock };
});

vi.mock('./security-gate.js', () => ({
  checkSecurityScan: () => securityCheckMock,
}));

import { createAgentStages } from './agent-executor.js';

beforeEach(() => {
  runQualityGateMock.mockReset();
  securityCheckMock.mockReset();
});

describe('#4355: an unmeasured gate does not pass', () => {
  it('reports not-passed when every quality check was skipped', async () => {
    runQualityGateMock.mockResolvedValue({
      stage: 'qa',
      verdict: 'skip',
      checks: [],
      summary: { pass: 0, fail: 0, skip: 3 },
      feedback: 'No checks ran.',
      iteration: 1,
    });

    const stages = createAgentStages();
    const result = await stages.qualityGate?.();

    expect(result?.passed).toBe(false);
  });

  it('still passes when the checks actually ran and passed', async () => {
    runQualityGateMock.mockResolvedValue({
      stage: 'qa',
      verdict: 'pass',
      checks: [],
      summary: { pass: 3, fail: 0, skip: 0 },
      feedback: 'All 3 check(s) that ran passed.',
      iteration: 1,
    });

    const stages = createAgentStages();

    expect((await stages.qualityGate?.())?.passed).toBe(true);
  });

  it('still reports not-passed on a real failure', async () => {
    runQualityGateMock.mockResolvedValue({
      stage: 'qa',
      verdict: 'fail',
      checks: [],
      summary: { pass: 0, fail: 1, skip: 0 },
      feedback: '1 check(s) failed',
      iteration: 1,
    });

    const stages = createAgentStages();

    expect((await stages.qualityGate?.())?.passed).toBe(false);
  });

  it('does not report a security scan that failed to run as clean', async () => {
    // checkSecurityScan returns `skip` when the scan ERRORED
    // (security-gate.ts:99-102). Reading that as passed is the one result a
    // security gate must never launder — fail closed per untrusted-input rules.
    securityCheckMock.mockResolvedValue({
      name: 'security_scan',
      verdict: 'skip',
      details: 'Security scan skipped: scanner unavailable',
    });

    const stages = createAgentStages();
    const result = await stages.securityScan?.();

    expect(result?.passed).toBe(false);
  });

  it('passes a security scan that actually ran clean', async () => {
    securityCheckMock.mockResolvedValue({
      name: 'security_scan',
      verdict: 'pass',
      details: 'no findings',
    });

    const stages = createAgentStages();

    expect((await stages.securityScan?.())?.passed).toBe(true);
  });
});
