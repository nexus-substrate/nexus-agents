import { describe, expect, it } from 'vitest';

import { assessCoverage } from './check-typedoc-coverage.js';

const EPS = ['core', 'pipeline', 'benchmarks'];

describe('assessCoverage', () => {
  it('passes when every declared entry point produced a page', () => {
    const v = assessCoverage({ declared: EPS, generated: EPS, allowlist: [] });

    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
  });

  it('fails when a declared entry point silently produced nothing', () => {
    const v = assessCoverage({ declared: EPS, generated: ['core', 'pipeline'], allowlist: [] });

    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['benchmarks']);
    expect(v.reason).toContain('benchmarks');
  });

  it('tolerates a known-missing entry point that is on the allowlist', () => {
    const v = assessCoverage({
      declared: EPS,
      generated: ['core'],
      allowlist: ['pipeline', 'benchmarks'],
    });

    expect(v.ok).toBe(true);
    expect(v.knownMissing).toEqual(['benchmarks', 'pipeline']);
  });

  it('still fails on a FOURTH regression even while the allowlist stands', () => {
    // The allowlist must not disarm the gate — that is the failure mode the
    // #4504 panel warned about when choosing this option.
    const v = assessCoverage({
      declared: [...EPS, 'security'],
      generated: ['core'],
      allowlist: ['pipeline', 'benchmarks'],
    });

    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['security']);
  });

  it('reports an allowlisted entry point that started generating, so the list can shrink', () => {
    const v = assessCoverage({
      declared: EPS,
      generated: EPS,
      allowlist: ['pipeline'],
    });

    expect(v.ok).toBe(true);
    expect(v.staleAllowlist).toEqual(['pipeline']);
    expect(v.reason).toContain('pipeline');
  });

  it('fails when generation produced nothing at all', () => {
    const v = assessCoverage({ declared: EPS, generated: [], allowlist: [] });

    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['benchmarks', 'core', 'pipeline']);
  });
});
