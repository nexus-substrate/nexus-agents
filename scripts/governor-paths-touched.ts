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
 * | Input | Output line | Exit |
 * | --- | --- | --- |
 * | governor path in the list | `governor_touched=true` | 0 |
 * | no governor path in the list (an empty list included) | `governor_touched=false` | 0 |
 * | `CHANGED_FILES` absent | none | 1 |
 * | governor section unparseable | none | 1 |
 *
 * An absent list is not "nothing touched": the evidence step that supplies it
 * broke, and `false` would skip the dependent jobs while reading as a measured
 * verdict. The step fails instead, which fails the ratification job (its own
 * gate would report `indeterminate` on the same input), and the dependent
 * jobs see an empty output and do not run — fail-closed in the same direction
 * as the gate.
 *
 * Usage (the workflow appends stdout to `$GITHUB_OUTPUT`):
 *   CHANGED_FILES="$(git diff --name-only base head)" \
 *     npx tsx scripts/governor-paths-touched.ts >> "$GITHUB_OUTPUT"
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
const CODEOWNERS_FILE = join(ROOT, 'CODEOWNERS');

/**
 * The `$GITHUB_OUTPUT` key. Dereferenced by the workflow as
 * `needs.governor-ratification.outputs.governor_touched` (and the backstop's
 * twin); pinned by the workflow test so the two sides cannot drift apart.
 */
export const GOVERNOR_TOUCHED_OUTPUT_KEY = 'governor_touched';

/** The one line the workflow appends to `$GITHUB_OUTPUT`. */
export function governorTouchedOutputLine(touched: boolean): string {
  return `${GOVERNOR_TOUCHED_OUTPUT_KEY}=${touched ? 'true' : 'false'}`;
}

/** What the step prints and how it exits. */
export interface GovernorTouchedReport {
  readonly exitCode: 0 | 1;
  /** For stdout → `$GITHUB_OUTPUT`. Absent when nothing was measured. */
  readonly outputLine: string | undefined;
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
      outputLine: undefined,
      messages: [
        '[governor-paths-touched] No CHANGED_FILES in the environment: nothing was measured, ' +
          'so no output is written. The workflow supplies the changed-file list from its ' +
          'evidence step; a missing list is a broken step, not an empty diff.',
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
      outputLine: undefined,
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
    outputLine: governorTouchedOutputLine(touched.length > 0),
    messages: touched.length === 0 ? [summary] : [summary, ...touched.map((f) => `  - ${f}`)],
  };
}

function main(): number {
  let codeowners: string;
  try {
    codeowners = readFileSync(CODEOWNERS_FILE, 'utf-8');
  } catch {
    console.error('[governor-paths-touched] CODEOWNERS is unreadable; nothing is reported.');
    return 1;
  }
  const report = governorPathsTouchedReport(process.env, codeowners);
  for (const line of report.messages) console.error(line);
  // stdout IS the contract: the workflow appends it to $GITHUB_OUTPUT.
  if (report.outputLine !== undefined) process.stdout.write(`${report.outputLine}\n`);
  return report.exitCode;
}

if (process.argv[1]?.endsWith('governor-paths-touched.ts') === true) {
  process.exit(main());
}
