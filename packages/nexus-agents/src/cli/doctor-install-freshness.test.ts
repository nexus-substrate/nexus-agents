/**
 * Tests for the doctor install-freshness sub-check (#4767).
 *
 * @module cli/doctor-install-freshness.test
 */

import { describe, it, expect } from 'vitest';
import {
  assessInstallFreshness,
  describeInstallFreshness,
  describeInstallFreshnessSummary,
  installFreshnessFailsVerdict,
  installFreshnessIsUnmeasured,
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

  it('reports a NEWER global install as ahead, not behind (#6782)', () => {
    // Exact equality reported 8.110.1 against 8.110.0 as `behind` — a false
    // failure on the exit code for an install that is not stale at all.
    expect(assessInstallFreshness('8.110.1', '8.110.0')).toEqual({
      state: 'ahead',
      global: '8.110.1',
      expected: '8.110.0',
    });
  });

  it('compares numerically, not as strings (#6782)', () => {
    // '8.10.0' < '8.9.0' as strings; as versions it is newer.
    expect(assessInstallFreshness('8.10.0', '8.9.0').state).toBe('ahead');
    expect(assessInstallFreshness('8.9.0', '8.10.0').state).toBe('behind');
  });

  it('orders a pre-release before its release (#6782)', () => {
    expect(assessInstallFreshness('8.110.0-rc.1', '8.110.0').state).toBe('behind');
    expect(assessInstallFreshness('8.110.0', '8.110.0-rc.1').state).toBe('ahead');
    expect(assessInstallFreshness('8.110.0-rc.2', '8.110.0-rc.1').state).toBe('ahead');
  });

  it('reports aligned when only build metadata differs (#6782)', () => {
    expect(assessInstallFreshness('8.110.0+sha.abc', '8.110.0').state).toBe('aligned');
  });

  it('reports an unparseable global version as unknown, naming it (#6782)', () => {
    const result = assessInstallFreshness('latest', '8.110.0');

    expect(result.state).toBe('unknown');
    if (result.state !== 'unknown') return;
    expect(result.reason).toContain('latest');
  });

  it('reports an unparseable build version as unknown, naming it (#6782)', () => {
    const result = assessInstallFreshness('8.110.0', 'not-a-version');

    expect(result.state).toBe('unknown');
    if (result.state !== 'unknown') return;
    expect(result.reason).toContain('not-a-version');
  });

  it('carries the reason for an unknown so the operator can act', () => {
    expect(assessInstallFreshness(null, '4.17.0', 'npm ls failed: ENOENT')).toEqual({
      state: 'unknown',
      reason: 'npm ls failed: ENOENT',
    });
  });
});

describe('installFreshnessFailsVerdict (#4767, #6782)', () => {
  it('fails the verdict when the global install is strictly older', () => {
    expect(
      installFreshnessFailsVerdict({ state: 'behind', global: '1.0.0', expected: '2.0.0' })
    ).toBe(true);
  });

  it('does not fail on aligned or ahead', () => {
    expect(installFreshnessFailsVerdict({ state: 'aligned', version: '1.0.0' })).toBe(false);
    expect(
      installFreshnessFailsVerdict({ state: 'ahead', global: '2.0.0', expected: '1.0.0' })
    ).toBe(false);
  });

  it('does not fail on unknown by itself: unmeasured is reported, not failed (#6782)', () => {
    // One rule for every section that feeds the verdict: unmeasured renders ⚠
    // and is named in the summary (installFreshnessIsUnmeasured) but does not
    // fail the exit code — the rule scratch space already follows. #4767's
    // concern (nobody knew) is met by naming it, not by failing on it.
    expect(installFreshnessFailsVerdict({ state: 'unknown', reason: 'not installed' })).toBe(false);
  });
});

describe('installFreshnessIsUnmeasured (#6782)', () => {
  it('is true only for unknown', () => {
    expect(installFreshnessIsUnmeasured({ state: 'unknown', reason: 'x' })).toBe(true);
    expect(installFreshnessIsUnmeasured({ state: 'aligned', version: '1.0.0' })).toBe(false);
    expect(
      installFreshnessIsUnmeasured({ state: 'ahead', global: '2.0.0', expected: '1.0.0' })
    ).toBe(false);
    expect(
      installFreshnessIsUnmeasured({ state: 'behind', global: '1.0.0', expected: '2.0.0' })
    ).toBe(false);
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

  it('says it could not confirm, with a warning glyph, when unknown', () => {
    const line = describeInstallFreshness({ state: 'unknown', reason: 'not installed' });

    expect(line).toMatch(/not determined|cannot confirm/i);
    expect(line).toMatch(/^⚠/);
  });

  it('warns, without the stale-install remedy, when the global install is newer (#6782)', () => {
    const line = describeInstallFreshness({
      state: 'ahead',
      global: '8.110.1',
      expected: '8.110.0',
    });

    expect(line).toMatch(/^⚠/);
    expect(line).toContain('8.110.1');
    expect(line).toContain('8.110.0');
    expect(line).toMatch(/newer/i);
    expect(line).not.toContain('npm install -g');
  });

  it('names a newer global install in the summary note, not a stale one (#6782)', () => {
    const note = describeInstallFreshnessSummary({
      state: 'ahead',
      global: '8.110.1',
      expected: '8.110.0',
    });

    expect(note).toMatch(/newer/i);
    expect(note).not.toMatch(/stale/i);
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
