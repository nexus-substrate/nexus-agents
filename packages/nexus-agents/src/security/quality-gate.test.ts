/**
 * Quality Gate Tests (#1684)
 *
 * @module security/quality-gate.test
 */

import { describe, it, expect } from 'vitest';
import { runQualityGate } from './quality-gate.js';
import type { GateCheckFn } from './quality-gate.js';
import type { GateCheckResult } from './quality-gate-types.js';

/** Create a check that always passes. */
function passingCheck(name: string): GateCheckFn {
  return (): Promise<GateCheckResult> =>
    Promise.resolve({ name, verdict: 'pass', details: 'OK', durationMs: 1 });
}

/** Create a check that always fails. */
function failingCheck(name: string, reason: string): GateCheckFn {
  return (): Promise<GateCheckResult> =>
    Promise.resolve({ name, verdict: 'fail', details: reason, durationMs: 1 });
}

/** Create a check that is skipped. */
function skippedCheck(name: string): GateCheckFn {
  return (): Promise<GateCheckResult> =>
    Promise.resolve({ name, verdict: 'skip', details: 'Skipped', durationMs: 0 });
}

describe('runQualityGate', () => {
  it('passes when all checks pass', async () => {
    const result = await runQualityGate('qa', [
      passingCheck('tests'),
      passingCheck('lint'),
      passingCheck('build'),
    ]);
    expect(result.verdict).toBe('pass');
    expect(result.summary).toEqual({ pass: 3, fail: 0, skip: 0 });
    expect(result.feedback).toBe('All 3 check(s) that ran passed.');
    expect(result.stage).toBe('qa');
    expect(result.iteration).toBe(1);
  });

  it('fails when any check fails', async () => {
    const result = await runQualityGate('implement', [
      passingCheck('tests'),
      failingCheck('lint', 'ESLint found 3 errors'),
      passingCheck('build'),
    ]);
    expect(result.verdict).toBe('fail');
    expect(result.summary).toEqual({ pass: 2, fail: 1, skip: 0 });
    expect(result.feedback).toContain('1 check(s) failed');
    expect(result.feedback).toContain('ESLint found 3 errors');
  });

  it('handles multiple failures', async () => {
    const result = await runQualityGate('scan', [
      failingCheck('sast', '5 critical findings'),
      failingCheck('sca', '2 vulnerable deps'),
    ]);
    expect(result.verdict).toBe('fail');
    expect(result.summary).toEqual({ pass: 0, fail: 2, skip: 0 });
    expect(result.feedback).toContain('2 check(s) failed');
  });

  it('passes with skipped checks (no fails)', async () => {
    const result = await runQualityGate('research', [
      passingCheck('sources'),
      skippedCheck('papers'),
    ]);
    expect(result.verdict).toBe('pass');
    expect(result.summary).toEqual({ pass: 1, fail: 0, skip: 1 });
  });

  it('tracks iteration number', async () => {
    const result = await runQualityGate('qa', [passingCheck('tests')], 3);
    expect(result.iteration).toBe(3);
  });

  it('handles empty checks list', async () => {
    const result = await runQualityGate('ship', []);
    expect(result.verdict).toBe('pass');
    expect(result.summary).toEqual({ pass: 0, fail: 0, skip: 0 });
  });
});

describe('#4355: a gate that ran nothing does not pass', () => {
  const skipped =
    (name: string): GateCheckFn =>
    () =>
      Promise.resolve({ name, verdict: 'skip' as const, details: 'Not run: no script declared' });
  const passing =
    (name: string): GateCheckFn =>
    () =>
      Promise.resolve({ name, verdict: 'pass' as const, details: 'ok' });
  const failing =
    (name: string): GateCheckFn =>
    () =>
      Promise.resolve({ name, verdict: 'fail' as const, details: 'boom' });

  it('reports skip, not pass, when every check was skipped', async () => {
    // The old rule was `fail > 0 ? 'fail' : 'pass'`, so a run that measured
    // nothing reported a clean pass — a verdict that could not fail by
    // construction, and the most dangerous reading of "we did not look".
    const result = await runQualityGate('qa', [skipped('lint'), skipped('tests')]);

    expect(result.verdict).toBe('skip');
    expect(result.summary).toEqual({ pass: 0, fail: 0, skip: 2 });
  });

  it('says plainly that no checks ran', async () => {
    const result = await runQualityGate('qa', [skipped('lint')]);

    expect(result.feedback).toContain('No checks ran.');
  });

  it('still passes on a partial run, while naming what did not run', async () => {
    const result = await runQualityGate('qa', [passing('tests'), skipped('lint')]);

    expect(result.verdict).toBe('pass');
    expect(result.feedback).toContain('did not run');
    expect(result.feedback).toContain('lint');
  });

  it('a real failure still outranks any number of skips', async () => {
    const result = await runQualityGate('qa', [failing('tests'), skipped('lint')]);

    expect(result.verdict).toBe('fail');
  });

  it('surfaces skipped checks even when the failures dominate the feedback', async () => {
    const result = await runQualityGate('qa', [failing('tests'), skipped('lint')]);

    expect(result.feedback).toContain('1 check(s) failed');
    expect(result.feedback).toContain('did not run');
  });
});
