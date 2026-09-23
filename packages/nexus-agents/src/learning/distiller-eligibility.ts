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
export type DistillerEligibilityInput = Pick<
  TaskOutcome,
  'source' | 'cli' | 'cliSource' | 'durationMs'
>;

const ROUTABLE_CLIS: ReadonlySet<string> = new Set(CLI_NAMES);

/**
 * Whether an outcome may train distilled routing rules.
 *
 * Eligibility requires POSITIVE evidence that the named CLI ran. It is not a
 * blacklist of known-bad writers (#6512 review C1):
 *
 * - `cliSource: 'executed'` is required. It is the only marker in the
 *   `cliSource` vocabulary (`'executed' | 'category-default'`) that says the CLI
 *   actually ran, and today only `mcp/tools/orchestrate.ts` writes it. Rows
 *   without it are excluded, which drops two populations:
 *   - legacy orchestrate rows written before `cliSource` existed (the last is
 *     from 2026-08-29): `model: 'orchestrator'`, `durationMs: 0`, and a
 *     `cli`/`category` filled from `DEFAULT_CLI` / `'exploration'` defaults.
 *     In the real store they were 235 of the 241 rows the first version of
 *     this filter admitted, and they would have minted an active
 *     `success-rate:claude:exploration` boost at confidence 1.0;
 *   - every other `delegate` writer (agent-executor, parallel-exploration,
 *     triangulated-review, consensus-plan, execute_expert, …). None of them
 *     records how its cli was attributed, and several do not route through
 *     `CompositeRouter` at all, so nothing shows the CLI they name is the one
 *     the router would be learning about.
 * - `durationMs > 0` is required: a run that took no time did not execute.
 * - `source` must be `'delegate'`. `consensus` (voter seats, where "returned a
 *   parseable vote" is success) and `manual` (warm-up pings in `cli/warm-up.ts`,
 *   e2e-eval runs in `cli/e2e-eval.ts`, tool bookkeeping rows) never train
 *   routing rules.
 * - `cli` must be in `CLI_NAMES`: `'unknown'` names no CLI, and an `api:*` arm
 *   id can never equal a candidate slot the stage matches against (and
 *   `RulesSnapshotSchema` rejects the whole rules file if one rule carries it).
 *
 * The result is a near-zero population until writers record an explicit
 * routed-origin tag; #6521 tracks that, and this function is the one place to
 * change when it lands.
 */
export function isDistillerEligible(outcome: DistillerEligibilityInput): boolean {
  if (outcome.source !== 'delegate') return false;
  if (outcome.cliSource !== 'executed') return false;
  if (!(outcome.durationMs > 0)) return false;
  return ROUTABLE_CLIS.has(outcome.cli);
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
  | ReturnType<
      typeof TaskOutcomeSchema.pick<{ source: true; cli: true; cliSource: true; durationMs: true }>
    >
  | undefined;

function getEligibilityFieldsSchema(): NonNullable<typeof eligibilityFieldsSchema> {
  eligibilityFieldsSchema ??= TaskOutcomeSchema.pick({
    source: true,
    cli: true,
    cliSource: true,
    durationMs: true,
  });
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
