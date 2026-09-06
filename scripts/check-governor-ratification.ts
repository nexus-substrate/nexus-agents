/**
 * Governor-path RATIFICATION gate (#4635).
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

import {
  GOVERNOR_SECTION_END_LINE,
  governorFilesTouched,
  governorPathsFromCodeowners,
  governorSectionLines,
} from './check-governor-review.js';

export { GOVERNOR_SECTION_END_LINE };

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CODEOWNERS_FILE = join(ROOT, 'CODEOWNERS');

/** The one label that asserts out-of-band owner ratification. */
export const RATIFICATION_LABEL = 'owner-ratified';

/** The outcome of a ratification check. */
export type RatificationVerdict =
  | { kind: 'not-applicable' }
  | { kind: 'ratified'; via: 'owner-approval' | 'ratification-label'; detail: string }
  | {
      kind: 'unratified';
      touched: readonly string[];
      /**
       * Present when the refusal is specifically a ratification label that
       * predates the head it would cover. The two timestamps travel with the
       * verdict so the CI line can tell the owner what to do — re-apply — rather
       * than leaving them to guess why a labelled PR came back unratified.
       */
      staleLabel?: { labelAppliedAt: string; headObservedAt: string };
    }
  | { kind: 'indeterminate'; reason: string };

/** Everything the verdict is computed from. */
export interface RatificationInputs {
  /** Changed files that matched a governor path. */
  readonly touchedGovernorFiles: readonly string[];
  /**
   * How many governor path patterns were parsed from CODEOWNERS (#5576). Zero
   * means the section could not be read — a missing or renamed start marker, or
   * an empty section — so an empty {@link touchedGovernorFiles} is absence of
   * measurement, not absence of governor files, and must not render as
   * `not-applicable`.
   */
  readonly governorPatternCount: number;
  /** Logins that submitted an APPROVED review. */
  readonly approvals: readonly string[];
  /** Labels currently on the PR. */
  readonly labels: readonly string[];
  /**
   * Login of whoever applied {@link RATIFICATION_LABEL}, from the PR timeline
   * (#4690).
   *
   * `undefined` means the applier could not be established — the timeline was
   * unavailable, or the label is present with no corresponding `labeled` event.
   * That is NOT the same as "nobody applied it", so it resolves to
   * `indeterminate` rather than ratified or unratified.
   */
  readonly labelAppliedBy?: string | undefined;
  /**
   * When {@link RATIFICATION_LABEL} was applied (ISO 8601), from the same
   * `labeled` timeline event that yields {@link labelAppliedBy}.
   *
   * A label is not dismissed when new commits arrive. An approval IS —
   * `dismiss_stale_reviews` is enabled on `main`, so GitHub flips a stale review
   * to `DISMISSED` and the workflow's `state == "APPROVED"` filter stops
   * matching it. Without a timestamp the two ratification routes were unequal in
   * the direction that matters: an `owner-ratified` label applied while the PR
   * touched only docs stayed valid after a later commit added
   * `packages/nexus-agents/src/audit/`, and the post-merge backstop reproduced
   * the same verdict, so nothing went red.
   *
   * `undefined` means the time could not be established — treated like an
   * unattributable applier, i.e. `indeterminate`, never ratified.
   */
  readonly labelAppliedAt?: string | undefined;
  /**
   * When GitHub FIRST OBSERVED the current head (ISO 8601) — the earliest
   * `created_at` among the workflow runs for that sha.
   *
   * Deliberately NOT the commit's committer date. Both author and committer
   * dates live in the commit object and are set by the client, so
   * `GIT_COMMITTER_DATE` backdates them freely: an attacker with a ratified
   * PR could push a commit stamped before the label and have the staleness
   * check read it as "the label is newer, therefore current". The panel's
   * contrarian voter raised exactly this on the first draft of this change and
   * was right. A workflow run's `created_at` is assigned server-side and cannot
   * be forged by the pusher.
   *
   * Compared against {@link labelAppliedAt} to answer "did the ratifier see
   * these bytes?". Any push invalidates the label, which is what
   * `dismiss_stale_reviews` already does to an approval — a ratification route
   * laxer than the review route it stands in for is the gap this closes.
   */
  readonly headObservedAt?: string | undefined;
  /** Logins permitted to ratify, from the CODEOWNERS governor section. */
  readonly owners: readonly string[];
}

/**
 * Extract the logins that may ratify a governor-path change.
 *
 * Scoped to the governor section only — owners of *other* CODEOWNERS sections
 * cannot ratify a governor change, because being trusted with `src/security/`
 * is not being trusted with the audit hash chain. Before #4683 that sentence
 * was a comment rather than behaviour: the section ran to end of file, so any
 * entry appended below it granted ratification rights.
 *
 * Fails CLOSED on an unterminated section by returning NO owners. An unbounded
 * section means we cannot say who is authorised, and
 * {@link evaluateRatification} turns an empty owner set into `indeterminate` —
 * which is the honest verdict, not a default dressed as a measurement.
 */
export function governorOwnersFromCodeowners(codeownersText: string): string[] {
  const { lines, terminated } = governorSectionLines(codeownersText);
  if (!terminated) return [];

  const owners = new Set<string>();
  for (const line of lines) {
    for (const token of line.split(/\s+/).slice(1)) {
      if (token.startsWith('@')) owners.add(token.slice(1).toLowerCase());
    }
  }
  return [...owners];
}

/**
 * Is the label older than the bytes it is claimed to ratify?
 *
 * Returns `null` when the label is current and the ratification may stand.
 * Anything else is a refusal: an unparseable or missing timestamp resolves to
 * `indeterminate`, because a ratification whose age cannot be established is
 * exactly what a later human spot-check trusts.
 */
function labelStaleness(
  labelAppliedAt: string | undefined,
  headObservedAt: string | undefined,
  touched: readonly string[]
): RatificationVerdict | null {
  const labelMs = labelAppliedAt === undefined ? NaN : Date.parse(labelAppliedAt);
  const headMs = headObservedAt === undefined ? NaN : Date.parse(headObservedAt);

  if (Number.isNaN(labelMs) || Number.isNaN(headMs)) {
    return {
      kind: 'indeterminate',
      reason:
        `the \`${RATIFICATION_LABEL}\` label is present and attributed, but we could not ` +
        'establish whether it predates the current head — a ratification of unknown age ' +
        'cannot be told apart from one granted for a different diff',
    };
  }

  if (labelMs < headMs) {
    return {
      kind: 'unratified',
      touched,
      staleLabel: {
        labelAppliedAt: String(labelAppliedAt),
        headObservedAt: String(headObservedAt),
      },
    };
  }

  return null;
}

/** Computes the ratification verdict. Pure — all evidence is passed in. */
export function evaluateRatification(inputs: RatificationInputs): RatificationVerdict {
  if (inputs.governorPatternCount === 0) {
    return {
      kind: 'indeterminate',
      reason:
        'no governor path patterns could be parsed from CODEOWNERS — the ' +
        'governance-of-the-governor section is missing, renamed or empty, so this gate ' +
        'cannot tell whether the PR touches a governor path (#5576)',
    };
  }
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
    return evaluateLabelRoute(inputs, ownerSet);
  }

  return { kind: 'unratified', touched: inputs.touchedGovernorFiles };
}

/**
 * The label route, attributed (#4690) and dated.
 *
 * This branch used to accept the label's mere PRESENCE and record no applier,
 * while the approval branch resolves a login and records `approved by @who`.
 * That made the two routes unequal in both directions: applying a label is a
 * weaker permission than submitting an owner review, and it was the route with
 * no provenance in the record. The date is the same asymmetry one level down —
 * `dismiss_stale_reviews` retires an approval when new commits arrive, and
 * nothing retired a label.
 */
function evaluateLabelRoute(
  inputs: RatificationInputs,
  ownerSet: ReadonlySet<string>
): RatificationVerdict {
  const appliedBy = inputs.labelAppliedBy;

  if (appliedBy === undefined) {
    return {
      kind: 'indeterminate',
      reason:
        `the \`${RATIFICATION_LABEL}\` label is present but we could not establish ` +
        'who applied it — an unattributable ratification must not be recorded as ' +
        'ratified, because that is exactly what a later human spot-check trusts',
    };
  }

  if (!ownerSet.has(appliedBy.toLowerCase())) {
    return { kind: 'unratified', touched: inputs.touchedGovernorFiles };
  }

  const staleness = labelStaleness(
    inputs.labelAppliedAt,
    inputs.headObservedAt,
    inputs.touchedGovernorFiles
  );
  if (staleness !== null) return staleness;

  return {
    kind: 'ratified',
    via: 'ratification-label',
    detail: `labelled by @${appliedBy} at ${String(inputs.labelAppliedAt)}`,
  };
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
      if (verdict.staleLabel !== undefined) {
        return (
          `::error::The \`${RATIFICATION_LABEL}\` label predates the current head, so it ` +
          'ratifies a diff that is no longer the one being merged.\n' +
          `${list}\n` +
          `Label applied: ${verdict.staleLabel.labelAppliedAt}\n` +
          `Head first observed by GitHub: ${verdict.staleLabel.headObservedAt}\n` +
          'An approving review is dismissed automatically when new commits arrive ' +
          '(`dismiss_stale_reviews` on `main`); a label is not, so the gate applies the same\n' +
          'rule here. The head time is the earliest workflow run for the sha — server-assigned,\n' +
          'so a backdated commit date cannot defeat it. Remove and re-apply the label.'
        );
      }
      return (
        '::error::This PR modifies governance-of-the-governor paths without ratification.\n' +
        `${list}\n` +
        'These are NEVER auto-merged (CODEOWNERS, CLAUDE.md). To proceed, either\n' +
        `obtain an approving review from a governor-path owner, or have one of them\n` +
        `apply the \`${RATIFICATION_LABEL}\` label — since #4690 the label counts only when\n` +
        `the person who applied it is a governor-path owner.\n` +
        'If these files are here by accident, the usual cause is a branch created\n' +
        'off another feature branch instead of main — check `git log --oneline main..HEAD`.'
      );
    }
  }
}

/**
 * The label's provenance, from the workflow's evidence step.
 *
 * WHO applied it (#4690) and WHEN. An absent field is omitted rather than
 * defaulted, so the gate sees "could not establish" and reports `indeterminate`
 * instead of accepting an unattributed or undated ratification.
 */
function labelEvidenceFromEnv(
  env: NodeJS.ProcessEnv
): Pick<RatificationInputs, 'labelAppliedBy' | 'labelAppliedAt' | 'headObservedAt'> {
  const actor = (env['RATIFICATION_LABEL_ACTOR'] ?? '').trim();
  const labelTime = (env['RATIFICATION_LABEL_TIME'] ?? '').trim();
  const headTime = (env['HEAD_OBSERVED_AT'] ?? '').trim();
  return {
    ...(actor !== '' ? { labelAppliedBy: actor } : {}),
    ...(labelTime !== '' ? { labelAppliedAt: labelTime } : {}),
    ...(headTime !== '' ? { headObservedAt: headTime } : {}),
  };
}

/** Reads evidence from the environment and returns a process exit code. */
export function runRatificationGate(env: NodeJS.ProcessEnv): number {
  // #5444: distinguish "no file list was supplied" from "the file list is
  // empty". The workflow always supplies CHANGED_FILES (governor-review.yml);
  // a local run does not. Absent, the gate has measured nothing — and it used
  // to say "ratification not required", which is a verdict. A developer
  // running the gate locally before pushing governor files was told, twice in
  // one day, that none was needed. Nothing is asserted here, on purpose, and
  // the message says so; CI is unaffected because CI sets the variable.
  if (env['CHANGED_FILES'] === undefined) {
    console.log(
      'No CHANGED_FILES in the environment: this is a non-PR run, nothing was measured and ' +
        'nothing is asserted. In CI the workflow supplies the changed-file list; locally, set ' +
        'CHANGED_FILES to a newline-separated list to evaluate a diff.'
    );
    return 0;
  }
  const changed = env['CHANGED_FILES']
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
    governorPatternCount: governorPathsFromCodeowners(codeowners).length,
    approvals,
    labels,
    owners: governorOwnersFromCodeowners(codeowners),
    ...labelEvidenceFromEnv(env),
  });

  // stderr for every verdict, matching check-governor-review.ts — CI annotations
  // and the human-readable line belong on the same stream.
  console.error(formatVerdict(verdict));
  return verdict.kind === 'unratified' || verdict.kind === 'indeterminate' ? 1 : 0;
}

if (process.argv[1]?.endsWith('check-governor-ratification.ts') === true) {
  process.exit(runRatificationGate(process.env));
}
