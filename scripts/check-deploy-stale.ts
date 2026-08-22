#!/usr/bin/env npx tsx
/**
 * Deploy-staleness detector (#4506).
 *
 * The website went **14 days** without a successful deploy. One run wedged in
 * `queued` on 2026-08-09 held the `pages` concurrency group, and 34 subsequent
 * runs were cancelled before starting a job. Nothing reported it: the site
 * returned HTTP 200 the whole time, serving v2.173.6 while `main` reached
 * v3.3.2 — a full major version behind, including documentation for a method
 * that had been deleted weeks earlier.
 *
 * ## Why state-divergence rather than run age
 *
 * Chosen 7/7 by a `higher_order` panel on #4506. Age-based and queue-health
 * alarms both measure *mechanisms*; this measures the **outcome** anyone
 * actually cares about — is the published artifact current? That catches every
 * upstream cause: the wedged run, a fail-fast pipeline, a disabled workflow, a
 * trigger that silently stopped matching, or a deploy that succeeds while
 * publishing nothing (which is #4507, and happened).
 *
 * Two conditions the panel attached, both load-bearing:
 *
 *  - **Fail closed on unmeasured.** An unreachable or unparsable site is NOT
 *    evidence of health. It reports `unmeasured`, which is a failure — per the
 *    repo rule that a gate must be able to represent absence rather than
 *    defaulting to a pass.
 *  - **A grace window.** The contrarian correctly noted that "no threshold
 *    tuning" was overclaimed: deploys take time, so a version bump legitimately
 *    leads the site briefly. That window is minutes, not days, and is far
 *    easier to set than an age threshold.
 *
 * Security posture: read-only, no credentials, bounded response read, and the
 * version is extracted with an anchored pattern rather than a loose digit
 * scan — the fetched page is untrusted input.
 *
 * @module scripts/check-deploy-stale
 * (Source: Issue #4506)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './script-paths.js';

/** Deploys legitimately lag a version bump by minutes. Beyond this, it is stale. */
export const GRACE_MINUTES = 45;

/** Cap on the fetched page so an unbounded response cannot exhaust memory. */
const MAX_BYTES = 512 * 1024;

const SITE_URL = 'https://nexus-substrate.github.io/nexus-agents/';

export type DeployStatus = 'current' | 'deploying' | 'stale' | 'unmeasured';

export interface StalenessInput {
  readonly siteVersion: string | undefined;
  readonly repoVersion: string;
  readonly minutesSincePublish: number;
}

export interface StalenessVerdict {
  readonly status: DeployStatus;
  readonly ok: boolean;
  readonly reason: string;
}

/**
 * Extract the published version from the rendered page.
 *
 * Anchored on the site's own title convention rather than scanning for any
 * digit triple, so unrelated version-shaped text cannot be mistaken for the
 * deployed version. Untrusted input: no eval, no interpolation.
 */
export function parseSiteVersion(html: string): string | undefined {
  // Anchored on the site's own `hero-version` element rather than scanning for
  // any digit triple, so unrelated version-shaped text cannot be mistaken for
  // the deployed version. The first draft anchored on the TypeDoc HTML title
  // format instead — a different artifact — and reported `unmeasured` against
  // a perfectly healthy site. Verified against the real page.
  const m = /hero-version[^>]*>v?(\d+\.\d+\.\d+)</.exec(html);
  return m?.[1];
}

/** Compare the deployed surface against the repo's source of truth. */
export function assessDeployStaleness(input: StalenessInput): StalenessVerdict {
  if (input.siteVersion === undefined) {
    return {
      status: 'unmeasured',
      ok: false,
      reason:
        'The live site version could not be read. That is not evidence the deploy is healthy — ' +
        'an unreadable surface is unmeasured, and unmeasured fails.',
    };
  }

  if (input.siteVersion === input.repoVersion) {
    return {
      status: 'current',
      ok: true,
      reason: `Live site and package.json agree at ${input.repoVersion}.`,
    };
  }

  // An unreadable publish time is not "a long time ago". Defaulting it that
  // way is what made the grace window dead: the workflow never supplied
  // MINUTES_SINCE_PUBLISH, the script fell back to 9999, and the branch below
  // could not be reached — so the detector fired on every release during the
  // normal deploy window. Report the gap in the input rather than guessing
  // past it.
  if (!Number.isFinite(input.minutesSincePublish) || input.minutesSincePublish < 0) {
    return {
      status: 'unmeasured',
      ok: false,
      reason:
        `Site at ${input.siteVersion}, repo at ${input.repoVersion}, but the publish time ` +
        'could not be read — so whether this gap is a normal deploy window or a real stall ' +
        'is unmeasured. Not evidence of either.',
    };
  }

  if (input.minutesSincePublish < GRACE_MINUTES) {
    return {
      status: 'deploying',
      ok: true,
      reason: `Site at ${input.siteVersion}, repo at ${input.repoVersion}, within the ${String(GRACE_MINUTES)}-minute deploy window.`,
    };
  }

  return {
    status: 'stale',
    ok: false,
    reason:
      `Live site is serving ${input.siteVersion} but package.json is ${input.repoVersion}. ` +
      'The published site does not reflect main — readers are getting documentation for an older release.',
  };
}

/** Read the repo's source-of-truth version. */
function readRepoVersion(): string {
  const p = join(ROOT, 'packages/nexus-agents/package.json');
  return (JSON.parse(readFileSync(p, 'utf-8')) as { version: string }).version;
}

/** Fetch the live page, bounded; undefined on any failure (reported as unmeasured). */
async function fetchSite(): Promise<string | undefined> {
  try {
    const res = await fetch(SITE_URL, { redirect: 'follow' });
    if (!res.ok) return undefined;
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } catch {
    return undefined;
  }
}

/* eslint-disable no-console */
async function main(): Promise<void> {
  const html = await fetchSite();
  const verdict = assessDeployStaleness({
    siteVersion: html === undefined ? undefined : parseSiteVersion(html),
    repoVersion: readRepoVersion(),
    // The workflow supplies elapsed minutes; absent it, assume past the window
    // so a genuine divergence is reported rather than excused.
    // NaN when unset or unparseable, which `assessDeployStaleness` reports as
    // unmeasured. Deliberately NOT a large default: that silently disabled the
    // grace window for the detector's whole life.
    minutesSincePublish: Number(process.env['MINUTES_SINCE_PUBLISH'] ?? 'nan'),
  });

  console.log(`[${verdict.status}] ${verdict.reason}`);
  if (!verdict.ok) {
    console.log(`::error::Deploy staleness: ${verdict.reason}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-deploy-stale.ts') === true) {
  void main();
}
