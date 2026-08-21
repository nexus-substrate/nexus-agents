import { describe, expect, it } from 'vitest';

import { assessDeployStaleness, parseSiteVersion } from './check-deploy-stale.js';

describe('parseSiteVersion', () => {
  it('extracts a semver from the real page markup', () => {
    // Markup copied from the live site, not invented — the first version of
    // this parser matched a different artifact's format and silently reported
    // a healthy site as unmeasured.
    const real = '="hero-version" data-astro-cid-lcdefpme>v3.4.3</span><span class="';
    expect(parseSiteVersion(real)).toBe('3.4.3');
  });

  it('returns undefined when no version is present', () => {
    expect(parseSiteVersion('<html><body>hello</body></html>')).toBeUndefined();
  });

  it('ignores version-shaped noise outside the anchor', () => {
    // Bounded, anchored match — not "first digits anywhere".
    expect(parseSiteVersion('built 2026-08-21 in 1.2.3 seconds')).toBeUndefined();
    expect(parseSiteVersion('<span class="other">v9.9.9</span>')).toBeUndefined();
  });
});

describe('assessDeployStaleness', () => {
  it('passes when the live site matches package.json', () => {
    const v = assessDeployStaleness({
      siteVersion: '3.4.2',
      repoVersion: '3.4.2',
      minutesSincePublish: 999,
    });

    expect(v.status).toBe('current');
  });

  it('flags a stale deploy once the grace window has passed', () => {
    const v = assessDeployStaleness({
      siteVersion: '2.173.6',
      repoVersion: '3.4.2',
      minutesSincePublish: 999,
    });

    expect(v.status).toBe('stale');
    expect(v.reason).toContain('2.173.6');
    expect(v.reason).toContain('3.4.2');
  });

  it('does not flag a divergence inside the grace window', () => {
    // Deploys take time; a version bump is expected to lead the site briefly.
    const v = assessDeployStaleness({
      siteVersion: '3.4.1',
      repoVersion: '3.4.2',
      minutesSincePublish: 5,
    });

    expect(v.status).toBe('deploying');
  });

  it('reports unmeasured when the site could not be read, never current', () => {
    // Fail closed: an unreachable surface is not evidence of health.
    const v = assessDeployStaleness({
      siteVersion: undefined,
      repoVersion: '3.4.2',
      minutesSincePublish: 999,
    });

    expect(v.status).toBe('unmeasured');
    expect(v.reason).toContain('could not');
  });

  it('treats unmeasured as a failure condition, not a pass', () => {
    const unmeasured = assessDeployStaleness({
      siteVersion: undefined,
      repoVersion: '3.4.2',
      minutesSincePublish: 999,
    });
    const current = assessDeployStaleness({
      siteVersion: '3.4.2',
      repoVersion: '3.4.2',
      minutesSincePublish: 999,
    });

    expect(unmeasured.ok).toBe(false);
    expect(current.ok).toBe(true);
  });

  it('would have caught the 14-day freeze', () => {
    // Live site sat at 2.173.6 while main reached 3.3.2 — a full major behind.
    const v = assessDeployStaleness({
      siteVersion: '2.173.6',
      repoVersion: '3.3.2',
      minutesSincePublish: 20160,
    });

    expect(v.ok).toBe(false);
    expect(v.status).toBe('stale');
  });
});
