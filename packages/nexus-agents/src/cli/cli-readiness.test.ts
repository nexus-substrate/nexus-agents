import { describe, expect, it } from 'vitest';

import {
  LEVEL_MEANING,
  READINESS_LEVELS,
  buildReadiness,
  formatReadiness,
  highestVerified,
  probeServes,
} from './cli-readiness.js';
import type { LevelOutcome, ReadinessLevel, ServesProbeTarget } from './cli-readiness.js';

const verified: LevelOutcome = { status: 'verified' };
const failed = (reason: string): LevelOutcome => ({ status: 'failed', reason });
const notAttempted = (reason: string): LevelOutcome => ({ status: 'not-attempted', reason });

const ladder = (
  installed: LevelOutcome,
  authenticated: LevelOutcome,
  serves: LevelOutcome
): Record<ReadinessLevel, LevelOutcome> => ({ installed, authenticated, serves });

describe('highestVerified', () => {
  it('reports the top of an unbroken ladder', () => {
    expect(highestVerified(ladder(verified, verified, verified))).toBe('serves');
  });

  it('stops at the first failure', () => {
    expect(highestVerified(ladder(verified, failed('no creds'), verified))).toBe('installed');
  });

  it('stops at a level that was NOT attempted, exactly like a failure', () => {
    // The default run does not probe `serves`. Treating an unrun level as a
    // pass would report every adapter as fully ready without testing serving,
    // which is how #4351 went unnoticed.
    const l = ladder(verified, verified, notAttempted('--live not passed'));

    expect(highestVerified(l)).toBe('authenticated');
  });

  it('reports undefined when even the first level failed', () => {
    expect(highestVerified(ladder(failed('not installed'), verified, verified))).toBeUndefined();
  });

  it('does not skip past a gap to a later verified level', () => {
    // A `serves` verification under a failed `authenticated` means the two
    // checks disagree; reporting the higher one would hide that.
    const l = ladder(verified, failed('expired token'), verified);

    expect(highestVerified(l)).toBe('installed');
  });
});

describe('buildReadiness', () => {
  it('omits reached entirely when nothing was verified', () => {
    const r = buildReadiness('claude', ladder(failed('missing'), failed('n/a'), failed('n/a')));

    expect(r.reached).toBeUndefined();
  });

  it('carries every level through, including the unrun ones', () => {
    const r = buildReadiness('codex', ladder(verified, verified, notAttempted('opt-in')));

    expect(Object.keys(r.levels).sort()).toEqual([...READINESS_LEVELS].sort());
    expect(r.levels.serves.status).toBe('not-attempted');
  });
});

describe('formatReadiness', () => {
  it('prints the unrun level rather than omitting it', () => {
    // Omitting it would render a default run as a clean bill of health.
    const out = formatReadiness(
      buildReadiness('claude', ladder(verified, verified, notAttempted('--live not passed')))
    );

    expect(out).toContain('serves');
    expect(out).toContain('--live not passed');
  });

  it('does not claim readiness through a level that was not attempted', () => {
    const out = formatReadiness(
      buildReadiness('claude', ladder(verified, verified, notAttempted('opt-in')))
    );

    expect(out).toContain('ready through "authenticated"');
    expect(out).not.toContain('ready through "serves"');
  });

  it('says not ready when the ladder never started', () => {
    const out = formatReadiness(
      buildReadiness('gemini', ladder(failed('binary missing'), failed('n/a'), failed('n/a')))
    );

    expect(out).toContain('not ready');
  });

  it('surfaces the failure reason next to the level', () => {
    const out = formatReadiness(
      buildReadiness('opencode', ladder(verified, failed('token expired'), notAttempted('opt-in')))
    );

    expect(out).toContain('token expired');
  });
});

describe('LEVEL_MEANING', () => {
  it('states what every level does and does not prove', () => {
    // The acceptance criterion is that the docs say what each level covers —
    // the reason #4351 was missed is that a narrower check read as a broader one.
    for (const level of READINESS_LEVELS) {
      expect(LEVEL_MEANING[level].length).toBeGreaterThan(0);
    }
    expect(LEVEL_MEANING.authenticated).toContain('no API call');
    expect(LEVEL_MEANING.installed).toContain('proves nothing about');
  });
});

describe('probeServes', () => {
  const served = (text: string): ServesProbeTarget => ({
    execute: () => Promise.resolve({ ok: true as const, value: { text } }),
  });

  it('verifies when real content came back', async () => {
    expect(await probeServes(served('ok'))).toEqual({ status: 'verified' });
  });

  it('FAILS a successful call that returned nothing', async () => {
    // The #4351 signature exactly: every voter returned stop_sequence with
    // zero tokens. The call succeeded; nothing was served. Reading that as
    // ready is what made the incident invisible to every existing check.
    const outcome = await probeServes(served(''));

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.reason).toContain('no content');
  });

  it('treats whitespace-only output as no content', async () => {
    expect((await probeServes(served('   \n'))).status).toBe('failed');
  });

  it('fails with the adapter error when the call errored', async () => {
    const outcome = await probeServes({
      execute: () => Promise.resolve({ ok: false as const, error: { message: 'quota exceeded' } }),
    });

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.reason).toContain('quota exceeded');
  });

  it('does not let a thrown adapter crash the probe', async () => {
    const outcome = await probeServes({
      execute: () => Promise.reject(new Error('ENOENT')),
    });

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.reason).toContain('ENOENT');
  });
});

describe('probeServes deadline', () => {
  it('reports not-ready when the adapter never answers', async () => {
    // Found by running the real ladder: four unbounded probes hung past two
    // minutes with no output. A readiness check that never returns teaches the
    // operator nothing and costs them the wait.
    const hangs: ServesProbeTarget = { execute: () => new Promise(() => {}) };

    const outcome = await probeServes(hangs, 20);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.reason).toContain('no response within');
  });

  it('does not penalise an adapter that answers inside the window', async () => {
    const slowButFine: ServesProbeTarget = {
      execute: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve({ ok: true as const, value: { text: 'ok' } });
          }, 5)
        ),
    };

    expect((await probeServes(slowButFine, 500)).status).toBe('verified');
  });
});
