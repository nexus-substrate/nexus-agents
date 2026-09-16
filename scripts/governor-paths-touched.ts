/**
 * Which governor paths does this change set touch? (#4802 part 1)
 *
 * The detector step of `governor-review.yml`. Branch protection can only
 * require a status context that appears on EVERY pull request, and the
 * workflow used to be path-filtered to the governor set — so the ratification
 * gate, as a required context, would have sat `expected` forever on a PR that
 * touches no governor path. The filter is gone: the ratification job runs on
 * every PR and its gate exits 0 on `not-applicable`. The two jobs that ARE
 * expensive or redundant on an ordinary PR (the pr_review audit gate and the
 * CODEOWNERS parse) read this step's output instead of a `paths:` filter.
 *
 * ## One parse of one source
 *
 * The governor set is parsed from the directive-bounded section of
 * `/CODEOWNERS` by `governor-section.ts` and matched by `isGovernorPath` —
 * the same parser and matcher both governor gates use. This script adds no
 * second copy of the set: the `paths:` filters it replaces WERE a second copy,
 * kept in lockstep by a test (#5997). Now there is nothing to keep in lockstep.
 *
 * ## The empty cases are named
 *
 * | Input | stdout | Exit |
 * | --- | --- | --- |
 * | governor path in the list | `true` | 0 |
 * | no governor path in the list (an empty list included) | `false` | 0 |
 * | `CHANGED_FILES` absent | nothing | 1 |
 * | governor section unparseable | nothing | 1 |
 *
 * An absent list is not "nothing touched": the step that supplies it broke,
 * and `false` would skip the dependent jobs while reading as a measured
 * verdict. The step fails instead, which fails the ratification job (its own
 * gate would report `indeterminate` on the same input), and the dependent
 * jobs see an empty output and do not run — fail-closed in the same direction
 * as the gate.
 *
 * ## stdout is the VALUE, not the output line
 *
 * The workflow step writes `governor_touched=<stdout>` to `$GITHUB_OUTPUT`
 * itself. The #4698 wiring test (`workflow-output-wiring.test.ts`) resolves
 * every consumed `steps.<id>.outputs.<name>` to a `name=` written INSIDE that
 * step's `run:` body; a key written by a script is invisible to it, so the
 * producer lives in the YAML where the check can see it (#6260). Under the
 * runner's `bash -e` a non-zero exit here fails the substitution, the
 * assignment and the step, so no `governor_touched=` line is written at all.
 *
 * Usage (the workflow step body):
 *   TOUCHED=$(pnpm exec tsx scripts/governor-paths-touched.ts)
 *   echo "governor_touched=${TOUCHED}" >> "$GITHUB_OUTPUT"
 *
 * @module scripts/governor-paths-touched
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { governorFilesTouched } from './check-governor-review.js';
import { governorPathsFromCodeowners } from './governor-section.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * The `$GITHUB_OUTPUT` key the WORKFLOW writes (`governor_touched=<stdout>`).
 * Dereferenced as `needs.governor-ratification.outputs.governor_touched` (and
 * the backstop's twin); pinned by the workflow test so the two sides cannot
 * drift apart. This script never prints the key itself — see the header.
 */
export const GOVERNOR_TOUCHED_OUTPUT_KEY = 'governor_touched';

/** The two values the detector can print; anything else is unmeasured. */
export type GovernorTouchedValue = 'true' | 'false';

/** The value the workflow step assigns to `governor_touched`. */
export function governorTouchedValue(touched: boolean): GovernorTouchedValue {
  return touched ? 'true' : 'false';
}

/** What the step prints and how it exits. */
export interface GovernorTouchedReport {
  readonly exitCode: 0 | 1;
  /** For stdout, the bare value the workflow assigns. Absent when nothing was measured. */
  readonly value: GovernorTouchedValue | undefined;
  /** For stderr: what was measured, or why it could not be. */
  readonly messages: readonly string[];
}

/**
 * Compute the report from the environment and the CODEOWNERS text.
 *
 * Pure over its inputs so the table in the module header is testable without
 * a working tree; `main` below supplies the real file.
 */
export function governorPathsTouchedReport(
  env: NodeJS.ProcessEnv,
  codeownersText: string
): GovernorTouchedReport {
  const raw = env['CHANGED_FILES'];
  if (raw === undefined) {
    return {
      exitCode: 1,
      value: undefined,
      messages: [
        '[governor-paths-touched] No CHANGED_FILES in the environment: nothing was measured, ' +
          'so no output is written. The workflow supplies the changed-file list from its ' +
          'changed-files step; a missing list is a broken step, not an empty diff.',
      ],
    };
  }
  const changed = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  let patterns: string[];
  try {
    patterns = governorPathsFromCodeowners(codeownersText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      value: undefined,
      messages: [
        `[governor-paths-touched] the governor path set could not be derived, so nothing is ` +
          `reported: ${reason}`,
      ],
    };
  }

  const touched = governorFilesTouched(changed, patterns);
  const summary =
    `[governor-paths-touched] ${String(touched.length)} of ${String(changed.length)} changed ` +
    `file(s) match the ${String(patterns.length)} governor pattern(s) in CODEOWNERS.`;
  return {
    exitCode: 0,
    value: governorTouchedValue(touched.length > 0),
    messages: touched.length === 0 ? [summary] : [summary, ...touched.map((f) => `  - ${f}`)],
  };
}

/**
 * Run the detector. The governor path SET is POLICY and is parsed from the
 * CODEOWNERS of the checkout this script runs from — the gate (base) checkout
 * under the two-checkout job (#6369), the repo itself for a local run — never
 * from the tree under review: a PR that narrows the governor section must be
 * judged by the set it is narrowing, not by its own (#6377 finding). The
 * changed-file list is DATA and arrives in the environment.
 */
export function runGovernorPathsTouched(policyDir: string): number {
  let codeowners: string;
  try {
    codeowners = readFileSync(join(policyDir, 'CODEOWNERS'), 'utf-8');
  } catch {
    console.error('[governor-paths-touched] CODEOWNERS is unreadable; nothing is reported.');
    return 1;
  }
  const report = governorPathsTouchedReport(process.env, codeowners);
  for (const line of report.messages) console.error(line);
  // stdout IS the contract: the workflow assigns it to `governor_touched`.
  if (report.value !== undefined) process.stdout.write(`${report.value}\n`);
  return report.exitCode;
}

if (process.argv[1]?.endsWith('governor-paths-touched.ts') === true) {
  process.exit(runGovernorPathsTouched(ROOT));
}
