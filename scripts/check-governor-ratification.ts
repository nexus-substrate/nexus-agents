/**
 * Governor-path RATIFICATION gate (#4634).
 *
 * ## Why this exists
 *
 * CODEOWNERS and CLAUDE.md both say the governance-of-the-governor paths are
 * *never auto-merged* — human ratification is required. Until now nothing
 * enforced that. `governor-review.yml` checks whether a sha-bound pr_review
 * audit record exists (warn-first), which is a different question: it asks
 * whether the change was *reviewed*, not whether the owner *ratified* it.
 *
 * On 2026-08-23 `src/audit/` reached `main` in commit `a48aa881d8` without
 * ratification. The proximate cause was a branch created off a feature branch
 * instead of `main`, so an unrelated PR carried the audit commits along. But
 * the reason it *landed* is that the only thing standing between an agent and
 * the audit hash chain was that agent reading its own PR's file list. A
 * control that depends on the diligence of the party it constrains is not a
 * control.
 *
 * ## What counts as ratification
 *
 * Either an approving review from an owner of a governor path (per the
 * governance-of-the-governor section of CODEOWNERS — the same single source
 * `check-governor-review.ts` parses), or the explicit `owner-ratified` label.
 * The label exists because ratification sometimes happens out of band; it is
 * deliberately narrow and named for exactly what it asserts.
 *
 * ## The verdict names its empty cases
 *
 * Four outcomes, kept distinct on purpose:
 *
 * | Verdict | Meaning |
 * | --- | --- |
 * | `not-applicable` | no governor path touched — nothing to ratify |
 * | `ratified` | governor paths touched, and ratification evidence found |
 * | `unratified` | governor paths touched, and none found — the blocking case |
 * | `indeterminate` | no ratifier could be resolved: the gate itself is broken |
 *
 * `not-applicable` must never render as `ratified`, or every ordinary PR would
 * report a ratification it never received. `indeterminate` must never render as
 * `unratified`, or a broken CODEOWNERS parse would blame the PR. Both are the
 * empty-case discipline from `.rules/development-disciplines.md` (#4580).
 *
 * @module scripts/check-governor-ratification
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { governorFilesTouched, governorPathsFromCodeowners } from './check-governor-review.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CODEOWNERS_FILE = join(ROOT, 'CODEOWNERS');

/** The marker heading for the governance-of-the-governor CODEOWNERS section. */
const GOVERNOR_SECTION_MARKER = "Governor's own core";

/** The one label that asserts out-of-band owner ratification. */
export const RATIFICATION_LABEL = 'owner-ratified';

/** The outcome of a ratification check. */
export type RatificationVerdict =
  | { kind: 'not-applicable' }
  | { kind: 'ratified'; via: 'owner-approval' | 'ratification-label'; detail: string }
  | { kind: 'unratified'; touched: readonly string[] }
  | { kind: 'indeterminate'; reason: string };

/** Everything the verdict is computed from. */
export interface RatificationInputs {
  /** Changed files that matched a governor path. */
  readonly touchedGovernorFiles: readonly string[];
  /** Logins that submitted an APPROVED review. */
  readonly approvals: readonly string[];
  /** Labels currently on the PR. */
  readonly labels: readonly string[];
  /** Logins permitted to ratify, from the CODEOWNERS governor section. */
  readonly owners: readonly string[];
}

/**
 * Extract the logins that may ratify a governor-path change.
 *
 * Reads the same governance-of-the-governor section as
 * {@link governorPathsFromCodeowners}, taking every `@login` token after the
 * path pattern. Owners of *other* CODEOWNERS sections cannot ratify a governor
 * change — being trusted with `src/security/` is not being trusted with the
 * audit hash chain.
 */
export function governorOwnersFromCodeowners(codeownersText: string): string[] {
  const owners = new Set<string>();
  let inSection = false;
  for (const raw of codeownersText.split('\n')) {
    if (raw.includes(GOVERNOR_SECTION_MARKER)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    for (const token of line.split(/\s+/).slice(1)) {
      if (token.startsWith('@')) owners.add(token.slice(1).toLowerCase());
    }
  }
  return [...owners];
}

/** Computes the ratification verdict. Pure — all evidence is passed in. */
export function evaluateRatification(inputs: RatificationInputs): RatificationVerdict {
  if (inputs.touchedGovernorFiles.length === 0) return { kind: 'not-applicable' };

  if (inputs.owners.length === 0) {
    return {
      kind: 'indeterminate',
      reason:
        'no ratifier could be resolved from the CODEOWNERS governor section — ' +
        'the gate cannot answer the question it was asked',
    };
  }

  const ownerSet = new Set(inputs.owners.map((o) => o.toLowerCase()));
  const approver = inputs.approvals.find((a) => ownerSet.has(a.toLowerCase()));
  if (approver !== undefined) {
    return { kind: 'ratified', via: 'owner-approval', detail: `approved by @${approver}` };
  }

  if (inputs.labels.some((l) => l.toLowerCase() === RATIFICATION_LABEL)) {
    return {
      kind: 'ratified',
      via: 'ratification-label',
      detail: `carries the \`${RATIFICATION_LABEL}\` label`,
    };
  }

  return { kind: 'unratified', touched: inputs.touchedGovernorFiles };
}

/** Renders a verdict for the CI log / job summary. */
export function formatVerdict(verdict: RatificationVerdict): string {
  switch (verdict.kind) {
    case 'not-applicable':
      return 'No governance-of-the-governor path touched — ratification not required.';
    case 'ratified':
      return `Governor paths touched and ratified (${verdict.detail}).`;
    case 'indeterminate':
      return `::error::Ratification gate is broken: ${verdict.reason}`;
    case 'unratified': {
      const list = verdict.touched.map((f) => `  - ${f}`).join('\n');
      return (
        '::error::This PR modifies governance-of-the-governor paths without ratification.\n' +
        `${list}\n` +
        'These are NEVER auto-merged (CODEOWNERS, CLAUDE.md). To proceed, either\n' +
        `obtain an approving review from a governor-path owner, or apply the \`${RATIFICATION_LABEL}\` label.\n` +
        'If these files are here by accident, the usual cause is a branch created\n' +
        'off another feature branch instead of main — check `git log --oneline main..HEAD`.'
      );
    }
  }
}

/** Reads evidence from the environment and returns a process exit code. */
export function runRatificationGate(env: NodeJS.ProcessEnv): number {
  const changed = (env['CHANGED_FILES'] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const approvals = (env['APPROVALS'] ?? '')
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const labels = (env['PR_LABELS'] ?? '')
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

  let codeowners = '';
  try {
    codeowners = readFileSync(CODEOWNERS_FILE, 'utf-8');
  } catch {
    console.error(formatVerdict({ kind: 'indeterminate', reason: 'CODEOWNERS is unreadable' }));
    return 1;
  }

  const verdict = evaluateRatification({
    touchedGovernorFiles: governorFilesTouched(changed, governorPathsFromCodeowners(codeowners)),
    approvals,
    labels,
    owners: governorOwnersFromCodeowners(codeowners),
  });

  // stderr for every verdict, matching check-governor-review.ts — CI annotations
  // and the human-readable line belong on the same stream.
  console.error(formatVerdict(verdict));
  return verdict.kind === 'unratified' || verdict.kind === 'indeterminate' ? 1 : 0;
}

if (process.argv[1]?.endsWith('check-governor-ratification.ts') === true) {
  process.exit(runRatificationGate(process.env));
}
