/**
 * Every CI job is either required or explicitly advisory (#4784/#4785).
 *
 * Branch protection requires exactly one context, "CI Success". A job absent
 * from `ci-success.needs` therefore cannot block a merge no matter how red it
 * goes — the can't-fail-by-construction shape. `producer-consumer-check` sat
 * there for its whole life, taking the #3024 wiring gate and the #4757
 * API-surface gate down with it.
 *
 * Being advisory is a legitimate choice. Being advisory by accident is not.
 * This test forces a new job to declare which it is.
 *
 * SCOPE — read this before trusting a green run (#4802). This file covers
 * `ci.yml` ONLY. Ten other workflows also run on pull requests, and because
 * `CI Success` aggregates `ci.yml` alone, every one of their jobs is advisory
 * too — including `governor-ratification` and the gitleaks `secrets-scan`.
 * That is a real hole, but it is not one a `needs:` entry can close: those jobs
 * would have to be added to branch protection's required contexts directly.
 * Tracked in #4802 as an owner decision. A green run here means "ci.yml is
 * classified", never "every PR gate can block".
 *
 * @module scripts/ci-required-jobs.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * Jobs deliberately left out of `ci-success.needs`.
 *
 * Each entry is a decision to let this job go red without blocking a merge.
 * Removing a job from this list makes it required; adding one to it needs a
 * reason. Tracked for review in #4790.
 */
const ADVISORY_JOBS = new Set([
  // Runs `pnpm audit`, a function of (tree x npm advisory DB at time t), so a
  // third-party publication can redden every open PR. Requiring it is approved
  // (consensus_vote 6-1) but gated on the reviewed-allowlist mechanism — #4794.
  'security',
]);

interface CiWorkflow {
  jobs: Record<string, { needs?: string[]; steps?: Array<{ run?: string }> }>;
}

const ci = parse(
  readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8')
) as CiWorkflow;
const required = new Set(ci.jobs['ci-success']?.needs ?? []);
const gateScript = (ci.jobs['ci-success']?.steps ?? []).map((s) => s.run ?? '').join('\n');

describe('CI required-job wiring', () => {
  it('finds the ci-success job and its gate script', () => {
    // Guard the guard: a renamed job would make every assertion below vacuous.
    expect(required.size).toBeGreaterThan(0);
    expect(gateScript).toContain('needs.');
  });

  it('classifies every job in ci.yml as either required or explicitly advisory', () => {
    const unclassified = Object.keys(ci.jobs).filter(
      (job) => job !== 'ci-success' && !required.has(job) && !ADVISORY_JOBS.has(job)
    );

    expect(
      unclassified,
      `These jobs are in neither ci-success.needs nor ADVISORY_JOBS, so they cannot block a merge and nobody decided that: ${unclassified.join(', ')}`
    ).toEqual([]);
  });

  it('checks the result of every job it depends on', () => {
    // The inverse can't-fail shape: listing a job in `needs` only makes
    // ci-success WAIT for it. Without a `needs.<job>.result` test in the gate
    // script, a red job still yields a green CI Success.
    const unchecked = [...required].filter((job) => !gateScript.includes(`needs.${job}.result`));

    expect(
      unchecked,
      `In ci-success.needs but never checked in the gate script, so a failure is awaited and then ignored: ${unchecked.join(', ')}`
    ).toEqual([]);
  });

  it('names the other PR workflows whose jobs this file does not govern', () => {
    // Guard against a false sense of coverage (#4802). If a new PR-triggered
    // workflow appears, this fails and forces the author to decide whether its
    // jobs need to be required contexts — the question `ci-success.needs`
    // cannot answer for a job in another file.
    const known = new Set([
      'ci.yml',
      'benchmark-extraction-gate.yml',
      'codeql.yml',
      'docs-check.yml',
      'governor-review.yml',
      'link-check.yml',
      'npm-verify.yml',
      'pr-review.yml',
      'self-dogfood.yml',
      'semgrep.yml',
      'verify-review.yml',
    ]);
    const dir = join(process.cwd(), '.github', 'workflows');
    const prTriggered = readdirSync(dir)
      .filter((f) => f.endsWith('.yml'))
      .filter((f) => {
        const wf = parse(readFileSync(join(dir, f), 'utf8')) as { on?: unknown; true?: unknown };
        // `on:` parses as the boolean `true` in YAML 1.1.
        const on = (wf.true ?? wf.on) as Record<string, unknown> | undefined;
        return typeof on === 'object' && on !== null && 'pull_request' in on;
      });

    expect(prTriggered.length).toBeGreaterThan(1);
    expect(
      prTriggered.filter((f) => !known.has(f)),
      'New PR-triggered workflow: decide whether its jobs must be required contexts (#4802), then add it here'
    ).toEqual([]);
  });

  it('requires producer-consumer-check, which carries the API-surface gate', () => {
    // Named explicitly: #4784 is why this file exists, and a regression here
    // would silently un-gate the public API surface again.
    expect(required.has('producer-consumer-check')).toBe(true);
    expect(gateScript).toContain('needs.producer-consumer-check.result');
  });

  it('treats a skipped pull-request-only job as success', () => {
    // These three are `if: github.event_name == 'pull_request'`, so on a push
    // they are skipped. Without the skipped branch every push to main reddens.
    for (const job of ['commitlint', 'changeset-check', 'producer-consumer-check']) {
      expect(gateScript, `${job} must accept "skipped"`).toContain(
        `needs.${job}.result }}" != "skipped"`
      );
    }
  });
});
