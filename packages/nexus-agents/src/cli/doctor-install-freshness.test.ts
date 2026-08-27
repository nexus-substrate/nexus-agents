/**
 * Tests for the doctor install-freshness sub-check (#4767).
 *
 * @module cli/doctor-install-freshness.test
 */

import { describe, it, expect } from 'vitest';
import {
  assessInstallFreshness,
  describeInstallFreshness,
  installFreshnessIsHealthy,
  readGlobalVersion,
} from './doctor-install-freshness.js';

describe('assessInstallFreshness (#4767)', () => {
  it('reports aligned when the versions match', () => {
    expect(assessInstallFreshness('4.17.0', '4.17.0')).toEqual({
      state: 'aligned',
      version: '4.17.0',
    });
  });

  it('reports behind with both versions named', () => {
    // The operator needs both numbers to know how far they have drifted —
    // eleven minors, in the case that produced this check.
    expect(assessInstallFreshness('4.3.1', '4.14.1')).toEqual({
      state: 'behind',
      global: '4.3.1',
      expected: '4.14.1',
    });
  });

  it('reports unknown when this build has no version, not a false drift', () => {
    // `VERSION` is `'dev'` when running from source. Comparing a real global
    // version against it reported `behind` on every developer checkout —
    // observed live: "Global install is 4.18.1, this build is dev". A check
    // that cries wolf in the commonest context is one people learn to skip,
    // which is the failure #4904 was about.
    const result = assessInstallFreshness('4.18.1', 'dev');

    expect(result.state).toBe('unknown');
    if (result.state !== 'unknown') return;
    expect(result.reason).toMatch(/from source|no version/i);
  });

  it('still compares two real versions', () => {
    // The pair: short-circuiting on any expected value would disable the check.
    expect(assessInstallFreshness('4.18.1', '4.19.0').state).toBe('behind');
  });

  it('reports unknown rather than aligned when there is no global install', () => {
    // The distinction the whole check exists for. "Nobody checked" must not
    // render as "the versions match".
    expect(assessInstallFreshness(null, '4.17.0').state).toBe('unknown');
  });

  it('treats an empty version string as unknown, not as a mismatch', () => {
    // An npm query that returns nothing is a failed measurement, not evidence
    // of drift — reporting it as `behind` would cry wolf.
    expect(assessInstallFreshness('', '4.17.0').state).toBe('unknown');
  });

  it('carries the reason for an unknown so the operator can act', () => {
    expect(assessInstallFreshness(null, '4.17.0', 'npm ls failed: ENOENT')).toEqual({
      state: 'unknown',
      reason: 'npm ls failed: ENOENT',
    });
  });
});

describe('installFreshnessIsHealthy (#4767)', () => {
  it('counts only aligned as healthy', () => {
    expect(installFreshnessIsHealthy({ state: 'aligned', version: '1.0.0' })).toBe(true);
  });

  it('does not count unknown as healthy', () => {
    // This is the load-bearing assertion. #4767 happened because nobody knew
    // the versions had diverged; a check that passes when it could not measure
    // reproduces exactly that.
    expect(installFreshnessIsHealthy({ state: 'unknown', reason: 'not installed' })).toBe(false);
  });

  it('does not count behind as healthy', () => {
    expect(installFreshnessIsHealthy({ state: 'behind', global: '1.0.0', expected: '2.0.0' })).toBe(
      false
    );
  });
});

describe('describeInstallFreshness (#4767)', () => {
  it('names both versions when behind', () => {
    const line = describeInstallFreshness({ state: 'behind', global: '4.3.1', expected: '4.14.1' });

    expect(line).toContain('4.3.1');
    expect(line).toContain('4.14.1');
  });

  it('tells the operator to restart the MCP server, not just update', () => {
    // Updating the global package does NOT fix a running server: the process
    // was spawned against the old code and keeps it until restarted. A remedy
    // that stops at `npm install -g` reports resolved while the session
    // continues on the stale build.
    // Asserted against literals, NOT against INSTALL_FRESHNESS_REMEDY: an
    // assertion that compares the output to the same constant it is rendered
    // from mutates with it and can never fail. Deleting the restart clause
    // passed such a test.
    const line = describeInstallFreshness({ state: 'behind', global: '4.3.1', expected: '4.14.1' });

    expect(line).toContain('npm install -g');
    expect(line).toContain('RESTART');
    expect(line).toMatch(/already-spawned|until it is restarted/i);
  });

  it('says it could not confirm, rather than reporting a pass, when unknown', () => {
    const line = describeInstallFreshness({ state: 'unknown', reason: 'not installed' });

    expect(line).toMatch(/not determined|cannot confirm/i);
    expect(line).not.toMatch(/^✓/);
  });
});

describe('readGlobalVersion (#4767)', () => {
  it('extracts the version from npm ls output', () => {
    const out = JSON.stringify({ dependencies: { 'nexus-agents': { version: '4.17.0' } } });

    expect(readGlobalVersion(() => out).version).toBe('4.17.0');
  });

  it('returns null with a reason when npm itself failed', () => {
    // Distinct from "not installed": the operator needs to know whether the
    // measurement failed or the package is absent.
    expect(readGlobalVersion(() => null)).toEqual({
      version: null,
      reason: 'npm ls -g failed',
    });
  });

  it('returns null when the package is absent from the global tree', () => {
    expect(readGlobalVersion(() => JSON.stringify({ dependencies: {} })).version).toBeNull();
  });

  it('does not throw on unparseable output', () => {
    // `npm ls -g` prints warnings to stdout in some configurations, so the
    // JSON parse is not guaranteed. A crash here would take doctor down.
    const result = readGlobalVersion(() => 'npm warn something\nnot json');

    expect(result.version).toBeNull();
    expect(result.reason).toMatch(/unparseable/i);
  });
});
