import { describe, expect, it } from 'vitest';

import {
  GRACE_MINUTES,
  assessDeployStaleness,
  elapsedMinutesFrom,
  parseSiteVersion,
} from './check-deploy-stale.js';
import type { StalenessInput } from './check-deploy-stale.js';

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

describe('#4516 follow-up: the grace window has to be reachable', () => {
  const gap = (minutesSincePublish: number): StalenessInput => ({
    siteVersion: '3.5.5',
    repoVersion: '3.5.6',
    minutesSincePublish,
  });

  it('reports deploying inside the grace window', () => {
    // The real 2026-08-22 case: 3.5.6 published at 06:40Z, the check ran at
    // 07:09Z — 29 minutes, well inside the window — and still failed, because
    // the workflow never supplied the input and the script defaulted to 9999.
    const verdict = assessDeployStaleness(gap(29));

    expect(verdict.status).toBe('deploying');
    expect(verdict.ok).toBe(true);
  });

  it('still reports stale once the window has passed', () => {
    expect(assessDeployStaleness(gap(GRACE_MINUTES + 1)).status).toBe('stale');
  });

  it('reports unmeasured when the publish time could not be read', () => {
    // NOT "a long time ago". Treating an unreadable input as a large number is
    // exactly what made the window unreachable for the detector's whole life.
    const verdict = assessDeployStaleness(gap(Number.NaN));

    expect(verdict.status).toBe('unmeasured');
    expect(verdict.reason).toContain('unmeasured');
  });

  it('reports unmeasured rather than trusting a negative elapsed time', () => {
    // Clock skew between the runner and the registry should not silently buy
    // an unbounded grace.
    expect(assessDeployStaleness(gap(-5)).status).toBe('unmeasured');
  });

  it('does not consult the window at all when the versions already agree', () => {
    const verdict = assessDeployStaleness({
      siteVersion: '3.5.6',
      repoVersion: '3.5.6',
      minutesSincePublish: Number.NaN,
    });

    expect(verdict.status).toBe('current');
    expect(verdict.ok).toBe(true);
  });
});

describe('#4516 follow-up: not-yet-published is a deploy in flight', () => {
  it('treats a zero elapsed time as inside the window', () => {
    // What an unpublished repo version resolves to: the release is mid-flight
    // and the site cannot be serving a version npm does not have yet.
    // Reporting that as unmeasured failed the check on every single release.
    const verdict = assessDeployStaleness({
      siteVersion: '3.6.9',
      repoVersion: '3.6.10',
      minutesSincePublish: 0,
    });

    expect(verdict.status).toBe('deploying');
    expect(verdict.ok).toBe(true);
  });

  it('still reports unmeasured when the publish time is genuinely unreadable', () => {
    // A registry that could not be fetched is a different fact from a version
    // that is not there yet, and must not be laundered into either verdict.
    expect(
      assessDeployStaleness({
        siteVersion: '3.6.9',
        repoVersion: '3.6.10',
        minutesSincePublish: Number.NaN,
      }).status
    ).toBe('unmeasured');
  });
});

describe('elapsedMinutesFrom — the seam all three bugs lived in', () => {
  const NOW = Date.parse('2026-08-23T01:00:00.000Z');

  it('computes elapsed minutes for a published version', () => {
    const body = { time: { '3.6.10': '2026-08-23T00:30:00.000Z' } };

    expect(elapsedMinutesFrom(body, '3.6.10', NOW)).toBe(30);
  });

  it('returns 0 for an absent version while the registry is still active', () => {
    // Not published yet — the window between a version PR merging and the
    // publish landing. Returning NaN here made the check fail on every release.
    // The sibling publish is RECENT, which is what makes "in flight" credible.
    expect(
      elapsedMinutesFrom(
        { time: { modified: '2026-08-23T00:58:00.000Z', '3.6.9': '2026-08-23T00:58:00.000Z' } },
        '3.6.10',
        NOW
      )
    ).toBe(0);
  });

  it('returns NaN for an absent version when the registry has been idle (#5430)', () => {
    // "npm does not have it YET" is a bounded-time claim, and #5077 is the
    // proof it can be unbounded: four versions were skipped on npm while every
    // release run reported success. With the site also wedged, `0` put the
    // detector permanently inside the grace window and it reported
    // `deploying / ok` forever — the exact "healthy while stale" outcome #4506
    // built it to end.
    const idle = {
      time: { modified: '2026-08-20T00:00:00.000Z', '3.6.9': '2026-08-20T00:00:00.000Z' },
    };

    expect(Number.isNaN(elapsedMinutesFrom(idle, '3.6.10', NOW))).toBe(true);
  });

  it('falls back to the newest version entry when `modified` is missing', () => {
    // Not every registry mirror returns `modified`. Absent it, the newest
    // version timestamp answers the same question, so a missing convenience
    // field must not silently restore the always-in-flight verdict.
    const recent = { time: { '3.6.9': '2026-08-23T00:59:00.000Z' } };
    const stale = { time: { '3.6.9': '2026-08-22T00:00:00.000Z' } };

    expect(elapsedMinutesFrom(recent, '3.6.10', NOW)).toBe(0);
    expect(Number.isNaN(elapsedMinutesFrom(stale, '3.6.10', NOW))).toBe(true);
  });

  it('reports an idle registry as unmeasured end to end, not as deploying', () => {
    // The two halves must compose: NaN is only useful if the assessor refuses
    // to call it healthy.
    const idle = {
      time: { modified: '2026-08-20T00:00:00.000Z', '3.6.9': '2026-08-20T00:00:00.000Z' },
    };

    expect(
      assessDeployStaleness({
        siteVersion: '3.6.9',
        repoVersion: '3.6.10',
        minutesSincePublish: elapsedMinutesFrom(idle, '3.6.10', NOW),
      }).ok
    ).toBe(false);
  });

  it('does not treat a recent `created` as publish activity', () => {
    // `created` dates the package, not a publish. A freshly created package
    // with ZERO published versions would otherwise read as "activity one
    // minute ago" — in flight, forever. This is the only fixture where the
    // exclusion changes the answer, so it is the only one that can catch its
    // removal: with `created` counted, this returns 0 instead of NaN.
    const body = { time: { created: '2026-08-23T00:59:00.000Z' } };

    expect(Number.isNaN(elapsedMinutesFrom(body, '3.6.10', NOW))).toBe(true);
  });

  it('keeps an old `created` from displacing a recent publish', () => {
    const body = {
      time: { created: '2020-01-01T00:00:00.000Z', '3.6.9': '2026-08-23T00:59:00.000Z' },
    };

    expect(elapsedMinutesFrom(body, '3.6.10', NOW)).toBe(0);
  });

  it('returns NaN when the registry body has no time map at all', () => {
    // A malformed or unexpected response is unmeasured, not "just published".
    expect(Number.isNaN(elapsedMinutesFrom({}, '3.6.10', NOW))).toBe(true);
  });

  it('returns NaN for an unparseable publish date', () => {
    expect(
      Number.isNaN(elapsedMinutesFrom({ time: { '3.6.10': 'not-a-date' } }, '3.6.10', NOW))
    ).toBe(true);
  });

  it('yields a negative value on clock skew, which the assessor treats as unmeasured', () => {
    // Registry ahead of the runner. The assessor rejects negatives rather than
    // granting an unbounded grace, so the two halves compose correctly.
    const body = { time: { '3.6.10': '2026-08-23T01:30:00.000Z' } };
    const elapsed = elapsedMinutesFrom(body, '3.6.10', NOW);

    expect(elapsed).toBeLessThan(0);
    expect(
      assessDeployStaleness({
        siteVersion: '3.6.9',
        repoVersion: '3.6.10',
        minutesSincePublish: elapsed,
      }).status
    ).toBe('unmeasured');
  });
});
