import { describe, expect, it } from 'vitest';
import { parsePnpmAuditResult } from './system-review-audit.js';

const ZERO = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } as const;
const OUTPUT_LIMIT_BYTES = 1024 * 1024;
const PRIVATE_MARKER = 'FIXTURE_DIAGNOSTIC_MUST_NOT_ENTER_RECORDS';

function reportData(counts: Record<string, unknown> = { ...ZERO }): Record<string, unknown> {
  return {
    actions: [],
    advisories: {},
    muted: [],
    metadata: { vulnerabilities: counts },
  };
}

function report(counts: Record<string, unknown> = { ...ZERO }): string {
  return JSON.stringify(reportData(counts));
}

function failedCommand(stdout: string, status = 1, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(PRIVATE_MARKER), { stdout, status, signal: null, ...extra });
}

describe('pnpm audit evidence for both System Review consumers', () => {
  it('measures a complete zero report without inventing a missing total', () => {
    expect(parsePnpmAuditResult(report())).toEqual({
      status: 'measured',
      exitCode: 0,
      counts: { ...ZERO, total: 0 },
    });
  });

  it('sums all five severity counters', () => {
    const counts = { info: 1, low: 2, moderate: 3, high: 4, critical: 5 };
    expect(parsePnpmAuditResult(report(counts))).toEqual({
      status: 'measured',
      exitCode: 0,
      counts: { ...counts, total: 15 },
    });
  });

  it('preserves a critical-only finding from the normal findings exit 1', () => {
    expect(parsePnpmAuditResult(failedCommand(report({ ...ZERO, critical: 2 })))).toEqual({
      status: 'measured',
      exitCode: 1,
      counts: { ...ZERO, critical: 2, total: 2 },
    });
  });

  it('accepts positive metadata with exit 0 after producer advisory filtering', () => {
    expect(parsePnpmAuditResult(report({ ...ZERO, high: 1 }))).toMatchObject({
      status: 'measured',
      exitCode: 0,
      counts: { high: 1, total: 1 },
    });
  });

  it('accepts a matching optional legacy total', () => {
    expect(parsePnpmAuditResult(report({ ...ZERO, low: 2, total: 2 }))).toMatchObject({
      status: 'measured',
      counts: { low: 2, total: 2 },
    });
  });

  it.each([
    ['', 'missing-output'],
    [' \n\t', 'missing-output'],
    ['{', 'invalid-json'],
    ['null', 'invalid-counts'],
    ['{}', 'invalid-counts'],
    ['[]', 'invalid-counts'],
    [JSON.stringify({ error: { code: 'EAI_AGAIN', summary: PRIVATE_MARKER } }), 'invalid-counts'],
    [report({}), 'invalid-counts'],
    [JSON.stringify({ metadata: null }), 'invalid-counts'],
    [report() + '\n' + report(), 'invalid-json'],
  ])('keeps unavailable/invalid evidence unmeasured: %s', (input, reason) => {
    expect(parsePnpmAuditResult(input)).toEqual({ status: 'unmeasured', reason, exitCode: 0 });
  });

  it.each(Object.keys(ZERO))('requires the %s counter explicitly', (key) => {
    const counts = Object.fromEntries(Object.entries(ZERO).filter(([name]) => name !== key));
    expect(parsePnpmAuditResult(report(counts))).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid-counts',
    });
  });

  it.each([-1, 0.5, null, '0', true])('rejects an invalid severity value: %s', (critical) => {
    expect(parsePnpmAuditResult(report({ ...ZERO, critical }))).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid-counts',
    });
  });

  it('rejects a JSON number that overflows to infinity', () => {
    const input = report().replace('"critical":0', '"critical":1e309');
    expect(parsePnpmAuditResult(input)).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid-counts',
    });
  });

  it('rejects unsafe totals even when each individual counter is safe', () => {
    expect(
      parsePnpmAuditResult(report({ ...ZERO, info: Number.MAX_SAFE_INTEGER, critical: 1 }))
    ).toMatchObject({ status: 'unmeasured', reason: 'invalid-counts' });
  });

  it('rejects a conflicting legacy total', () => {
    expect(parsePnpmAuditResult(report({ ...ZERO, critical: 2, total: 0 }))).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid-counts',
    });
  });

  it('does not silently omit an unknown severity counter', () => {
    expect(parsePnpmAuditResult(report({ ...ZERO, futureSeverity: 1 }))).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid-counts',
    });
  });

  it('rejects error-bearing JSON even when it includes plausible counts', () => {
    const input = { ...reportData(), error: { summary: PRIVATE_MARKER } };
    expect(parsePnpmAuditResult(JSON.stringify(input))).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid-counts',
    });
  });

  it.each([2, 124, 137])('does not trust captured stdout from execution failure %s', (status) => {
    expect(parsePnpmAuditResult(failedCommand(report({ ...ZERO, high: 1 }), status))).toEqual({
      status: 'unmeasured',
      reason: 'execution-failed',
      exitCode: status,
    });
  });

  it.each([{ signal: 'SIGTERM' }, { killed: true }, { code: 'ETIMEDOUT' }, { code: 'ENOBUFS' }])(
    'retains execution failure despite valid-looking stdout: %j',
    (extra) => {
      expect(parsePnpmAuditResult(failedCommand(report({ ...ZERO, high: 1 }), 1, extra))).toEqual({
        status: 'unmeasured',
        reason: 'execution-failed',
        exitCode: 1,
      });
    }
  );

  it('does not declare exit 1 with zero findings to be a clean audit', () => {
    expect(parsePnpmAuditResult(failedCommand(report()))).toEqual({
      status: 'unmeasured',
      reason: 'inconsistent-report',
      exitCode: 1,
    });
  });

  it.each([undefined, null])('names missing execution evidence: %s', (input) => {
    expect(parsePnpmAuditResult(input)).toEqual({ status: 'unmeasured', reason: 'missing-output' });
  });

  it('does not invent an exit code for an unknown command failure', () => {
    expect(parsePnpmAuditResult(new Error(PRIVATE_MARKER))).toEqual({
      status: 'unmeasured',
      reason: 'execution-failed',
    });
  });

  it('bounds original stdout before trimming whitespace', () => {
    expect(parsePnpmAuditResult(report().padEnd(OUTPUT_LIMIT_BYTES + 1, ' '))).toMatchObject({
      status: 'unmeasured',
      reason: 'output-too-large',
    });
    expect(parsePnpmAuditResult(report().padEnd(OUTPUT_LIMIT_BYTES, ' '))).toMatchObject({
      status: 'measured',
      counts: { total: 0 },
    });
  });

  it('bounds UTF-8 bytes rather than JavaScript character count', () => {
    const input = JSON.stringify({ ...reportData(), padding: 'é'.repeat(OUTPUT_LIMIT_BYTES / 2) });
    expect(input.length).toBeLessThan(OUTPUT_LIMIT_BYTES);
    expect(parsePnpmAuditResult(input)).toMatchObject({
      status: 'unmeasured',
      reason: 'output-too-large',
    });
  });

  it('retains no raw payload or error message in diagnostics', () => {
    const result = parsePnpmAuditResult(failedCommand(PRIVATE_MARKER, 137));
    expect(JSON.stringify(result)).not.toContain(PRIVATE_MARKER);
    expect(result).toEqual({ status: 'unmeasured', reason: 'execution-failed', exitCode: 137 });
  });
});
