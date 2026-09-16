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
 * `ci.yml` and `docs-check.yml`. Nine other workflows also run on pull
 * requests, and because `CI Success` aggregates `ci.yml` alone, every one of
 * their jobs is advisory too — including `governor-ratification` and the
 * gitleaks `secrets-scan`.
 *
 * `docs-check.yml` gained a `docs-success` aggregator in #4809, so its verdict
 * is now expressible in one context and this file keeps that context complete.
 * It is still NOT a required context, so a red documentation gate does not yet
 * block a merge — that is the same branch-protection decision below.
 * That is a real hole, but it is not one a `needs:` entry can close: those jobs
 * would have to be added to branch protection's required contexts directly.
 * Tracked in #4802 as an owner decision. Part 1 of it landed: the
 * `Governor-path ratification gate` context now reports on EVERY PR
 * (`governor-review.yml` lost its `paths:` filter), which is the precondition
 * for requiring it; part 2 is the settings change. A green run here means
 * "ci.yml is classified", never "every PR gate can block".
 *
 * @module scripts/ci-required-jobs.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { extractWorkflowGate } from './aggregator-shape.js';

/**
 * Jobs deliberately left out of `ci-success.needs`.
 *
 * Each entry is a decision to let this job go red without blocking a merge.
 * Removing a job from this list makes it required; adding one to it needs a
 * reason. Tracked for review in #4790.
 *
 * Empty since #4794 stage 2: `security` was the last advisory job. It is now
 * required (see the dedicated describe block below), so every job in ci.yml
 * can block a merge. The set stays so a future advisory job must be declared
 * here rather than slipping out of `needs` unnoticed.
 */
const ADVISORY_JOBS = new Set<string>([]);

interface CiStep {
  run?: string;
  'continue-on-error'?: boolean | string;
}

interface CiWorkflow {
  jobs: Record<string, { needs?: string[]; steps?: CiStep[] }>;
}

const ci = parse(
  readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8')
) as CiWorkflow;
const ciGate = extractWorkflowGate(ci, 'ci-success');
const required = new Set(ciGate.needs);

describe('CI required-job wiring', () => {
  it('finds the ci-success job and its aggregator step', () => {
    // Guard the guard: a renamed job would make every assertion below vacuous.
    expect(required.size).toBeGreaterThan(0);
    expect(ciGate.gate.verifiesEveryNeed).toBe(true);
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

  it('verifies every job it depends on through toJSON(needs), with the skip list pinned by the governor manifest (#6382)', () => {
    // The inverse can't-fail shape: listing a job in `needs` only makes
    // ci-success WAIT for it. The aggregator reads ALL of `needs` at once,
    // so there is no per-job line that could be dropped or commented out;
    // the only policy it carries — which jobs may be skipped — must equal the
    // governor-owned manifest, which the ratification gate enforces from the
    // base ref.
    expect(ciGate.gate.verifiesEveryNeed).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'governance', 'required-jobs.json'), 'utf8')
    ) as { skip_allowed: string[]; ci_success_needs: string[] };
    expect(new Set(ciGate.gate.skipAllowed)).toEqual(new Set(manifest.skip_allowed));
    for (const job of manifest.skip_allowed) expect(required.has(job), job).toBe(true);
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
    expect(ciGate.gate.verifiesEveryNeed).toBe(true);
  });

  it('treats a skipped pull-request-only job as success, and only those', () => {
    // These three are `if: github.event_name == 'pull_request'`, so on a push
    // they are skipped. Without the skip allowance every push to main reddens;
    // with a wider one, a skipped required job would pass.
    expect(new Set(ciGate.gate.skipAllowed)).toEqual(
      new Set(['commitlint', 'changeset-check', 'producer-consumer-check'])
    );
  });

  it('does not let a required job swallow its own failure with continue-on-error', () => {
    // The third can't-fail shape, after "absent from needs" and "awaited but
    // unchecked": a job IS in needs and IS checked, but every step that could
    // fail carries `continue-on-error: true`, so the job's result is always
    // success. That is how `security` was advisory before #4794 stage 2.
    const swallowed = [...required].flatMap((job) =>
      (ci.jobs[job]?.steps ?? [])
        .filter((step) => step['continue-on-error'] === true)
        .map(() => job)
    );

    expect(
      swallowed,
      `Required job with a continue-on-error step, so it cannot go red: ${swallowed.join(', ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// Security Audit (#4794 stage 2)
// ============================================================================

describe('Security Audit is a required job (#4794 stage 2)', () => {
  // Approved by consensus_vote 6-1 and gated on the exception ledger
  // (.github/audit-exceptions.json + pnpm.auditConfig, #4796) landing first.
  // Before this, a high-severity advisory sat under a green CI Success — a
  // misreporting record, not merely a missing check. Named explicitly, like
  // producer-consumer-check above, so the flip cannot be undone by a quiet
  // edit to ADVISORY_JOBS: removing any of these three lines is the change.
  const security = ci.jobs['security'];

  it('exists in ci.yml with an audit step', () => {
    // Guard the guard: a renamed job would make the assertions below vacuous.
    expect(security).toBeDefined();
    expect((security?.steps ?? []).some((s) => s.run?.includes('pnpm audit') === true)).toBe(true);
  });

  it('is in ci-success.needs and may not be skipped', () => {
    expect(required.has('security')).toBe(true);
    expect(ciGate.gate.skipAllowed ?? []).not.toContain('security');
  });

  it('has no continue-on-error step, so a failing audit reddens CI Success', () => {
    const swallowing = (security?.steps ?? []).filter((s) => s['continue-on-error'] === true);
    expect(swallowing).toEqual([]);
  });
});

// ============================================================================
// Documentation Gate (#4809)
// ============================================================================

/**
 * Jobs in `docs-check.yml` deliberately left out of `docs-success.needs`.
 *
 * Both already carry `continue-on-error: true`, so they cannot fail their own
 * workflow either — listing them here records that as a decision rather than
 * an accident.
 */
const DOCS_ADVISORY_JOBS = new Set(['docs-coverage', 'spell-check']);

const docs = parse(
  readFileSync(join(process.cwd(), '.github', 'workflows', 'docs-check.yml'), 'utf8')
) as CiWorkflow;
const docsGate = extractWorkflowGate(docs, 'docs-success');
const docsRequired = new Set(docsGate.needs);

describe('Documentation Gate required-job wiring (#4809)', () => {
  // `docs-check.yml` had twenty jobs and no aggregator, so not one of them
  // could block a merge. That is not hypothetical: #4808 drifted
  // `docs/reference/tools/run.md`, `Tool Reference Drift` went red, and the
  // merge was stopped only by a duplicate assertion in `Script Tests`.
  //
  // SCOPE: an aggregator makes the workflow's verdict expressible in ONE
  // context. It does not make it blocking — that needs `Docs Success` added to
  // branch protection, which is owner work in #4802. What this file enforces
  // today is that the aggregator stays COMPLETE, so the context is correct
  // whenever protection starts requiring it.

  it('finds the docs-success job and its aggregator step, in the one accepted shape (#6387)', () => {
    expect(docsRequired.size).toBeGreaterThan(0);
    expect(docsGate.gate.verifiesEveryNeed).toBe(true);
    expect(docsGate.gate.neutralized).toEqual([]);
  });

  it('classifies every job in docs-check.yml as required or explicitly advisory', () => {
    const unclassified = Object.keys(docs.jobs).filter(
      (job) => job !== 'docs-success' && !docsRequired.has(job) && !DOCS_ADVISORY_JOBS.has(job)
    );

    expect(
      unclassified,
      `In neither docs-success.needs nor DOCS_ADVISORY_JOBS, so nobody decided whether they matter: ${unclassified.join(', ')}`
    ).toEqual([]);
  });

  it('verifies every job it depends on through toJSON(needs) (#6382)', () => {
    // Same inverse shape as ci-success: `needs` only makes the aggregator
    // WAIT. The aggregator reads all of `needs` at once, so a red job that
    // ran cannot be awaited and then ignored; every docs gate may skip (path
    // filters), so no SKIP_ALLOWED list is declared and skipped is accepted.
    expect(docsGate.gate.verifiesEveryNeed).toBe(true);
  });

  it('does not list an advisory job as required', () => {
    // The pair. Both advisory jobs carry continue-on-error, so requiring them
    // would be a gate that cannot fail — worse than leaving them advisory.
    const contradictory = [...docsRequired].filter((job) => DOCS_ADVISORY_JOBS.has(job));

    expect(contradictory).toEqual([]);
  });
});
