/**
 * Distiller training population (#6512, panel option B).
 *
 * `StrategyDistiller` turns outcomes into routing rules that `DistilledRuleStage`
 * applies to the router's scores. Only outcomes whose success means "this CLI
 * did this category of work" may train those rules. The store mixes in records
 * whose success means something else, and they are most of it.
 *
 * No outcome carries a routed-origin marker yet, so eligibility is inferred
 * as conservatively as the data allows.
 *
 * TODO(#6521): once outcomes carry a routed-origin tag, key eligibility on
 * that tag and drop the inference below.
 *
 * @module learning/distiller-eligibility
 */

import { existsSync, readFileSync } from 'node:fs';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { TaskOutcomeSchema } from '../orchestration/outcomes/outcome-types.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

/** The fields eligibility reads. */
export type DistillerEligibilityInput = Pick<TaskOutcome, 'source' | 'cli' | 'cliSource'>;

const ROUTABLE_CLIS: ReadonlySet<string> = new Set(CLI_NAMES);

/**
 * Whether an outcome may train distilled routing rules.
 *
 * - `source: 'consensus'` is excluded: voter-seat records, where "returned a
 *   parseable vote" is scored as success.
 * - `source: 'manual'` is excluded: warm-up pings (`cli/warm-up.ts`), e2e-eval
 *   runs (`cli/e2e-eval.ts`), and tool bookkeeping rows (execute_spec,
 *   issue_triage, research_discover, run_graph_workflow, create_expert,
 *   self-eval). None of them is the router picking a CLI.
 * - `source: 'delegate'` is INCLUDED. Verified: not every delegate writer goes
 *   through `CompositeRouter` (parallel-exploration picks its own CLIs;
 *   triangulated-review and consensus-plan run fixed panels), so this is wider
 *   than "routed". It is kept because every delegate writer records a real
 *   execution of the named CLI on the named category, which is the thing a
 *   rule claims about, and excluding it would leave the loop with no data at
 *   all until #6521 lands.
 * - A `cli` outside `CLI_NAMES` is excluded: `'unknown'` names no CLI, and an
 *   `api:*` arm id can never equal a candidate slot the stage matches against
 *   (the stage sees display slots, and `RulesSnapshotSchema` rejects the whole
 *   rules file if one rule carries such a cli).
 * - `cliSource: 'category-default'` is excluded: the cli is a default filled in
 *   for the category, not the CLI that ran.
 */
export function isDistillerEligible(outcome: DistillerEligibilityInput): boolean {
  if (outcome.source !== 'delegate') return false;
  if (!ROUTABLE_CLIS.has(outcome.cli)) return false;
  return outcome.cliSource !== 'category-default';
}

/**
 * Eligible outcomes strictly newer than `sinceMs` (epoch ms).
 *
 * `sinceMs` undefined means no snapshot exists, so every eligible outcome
 * counts. An outcome whose timestamp does not parse is not counted as newer:
 * nothing shows it arrived after the snapshot. Empty input is 0.
 */
export function countEligibleSince(
  outcomes: readonly TaskOutcome[],
  sinceMs: number | undefined
): number {
  let count = 0;
  for (const outcome of outcomes) {
    if (!isDistillerEligible(outcome)) continue;
    if (sinceMs !== undefined && !(Date.parse(outcome.timestamp) > sinceMs)) continue;
    count++;
  }
  return count;
}

/**
 * Built on first use, not at module load: this module sits in an import cycle
 * through `strategy-distiller`, and `TaskOutcomeSchema` can still be
 * uninitialised when this file is evaluated.
 */
let eligibilityFieldsSchema:
  | ReturnType<typeof TaskOutcomeSchema.pick<{ source: true; cli: true; cliSource: true }>>
  | undefined;

function getEligibilityFieldsSchema(): NonNullable<typeof eligibilityFieldsSchema> {
  eligibilityFieldsSchema ??= TaskOutcomeSchema.pick({ source: true, cli: true, cliSource: true });
  return eligibilityFieldsSchema;
}

function parseLine(line: string): DistillerEligibilityInput | undefined {
  try {
    const parsed = getEligibilityFieldsSchema().safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Count eligible records in an outcomes JSONL file, for `doctor`. Read-only.
 * A missing file is 0; a line that is not JSON, or whose source/cli fields do
 * not validate, is not eligible.
 */
export function countEligibleOutcomesInFile(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  let count = 0;
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    if (line.trim().length === 0) continue;
    const fields = parseLine(line);
    if (fields !== undefined && isDistillerEligible(fields)) count++;
  }
  return count;
}
