/**
 * Distiller training population (#6512 panel option B; keyed on the routed
 * marker since #6521).
 *
 * `StrategyDistiller` turns outcomes into routing rules that `DistilledRuleStage`
 * applies to the router's scores. Only outcomes the ROUTER produced may train
 * those rules: an outcome whose CLI was picked by something else (the
 * server's configured adapter, a voter panel, a synthetic prior) tells the
 * router nothing about its own decisions.
 *
 * @module learning/distiller-eligibility
 */

import { existsSync, readFileSync } from 'node:fs';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { TaskOutcomeSchema, hasMeasuredCategory } from '../orchestration/outcomes/outcome-types.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

/** The fields eligibility reads. */
export type DistillerEligibilityInput = Pick<
  TaskOutcome,
  'source' | 'cli' | 'routedBy' | 'durationMs' | 'categorySource'
>;

const ROUTABLE_CLIS: ReadonlySet<string> = new Set(CLI_NAMES);

/**
 * Whether an outcome may train distilled routing rules.
 *
 * - `routedBy: 'composite-router'` is required. Writers set it only when
 *   `CompositeRouter` chose the CLI for that task (today: the dev-pipeline
 *   stages, via `expert-bridge`). Warm-up priors and e2e-eval runs never carry
 *   it, so they are out by construction.
 * - There is deliberately NO fallback to the #6512 inference
 *   (`source: 'delegate'` + `cliSource: 'executed'`). The one writer of
 *   `cliSource: 'executed'` is the `orchestrate` tool, which runs the server's
 *   configured `deps.modelAdapter`, never a CLI the router selected. Keeping it
 *   would train routing rules on the default adapter's own record, feeding the
 *   router's default back to it as evidence. The live store held one such row
 *   (2026-09-22) when this changed, so the fallback also bought nothing.
 * - `source: 'consensus'` is excluded even when routed: a voter seat's
 *   "success" is "returned a parseable vote", not "did this category of work".
 * - `durationMs > 0` is required: a run that took no time did not execute.
 * - `cli` must be in `CLI_NAMES`: `'unknown'` names no CLI, and an `api:*` arm
 *   id can never equal a candidate slot the stage matches against (and
 *   `RulesSnapshotSchema` rejects the whole rules file if one rule carries it).
 * - `categorySource: 'defaulted'` is excluded (#6549): a rule is keyed on
 *   cli×category, and a defaulted row names no category.
 */
export function isDistillerEligible(outcome: DistillerEligibilityInput): boolean {
  if (outcome.routedBy !== 'composite-router') return false;
  if (outcome.source === 'consensus') return false;
  if (!(outcome.durationMs > 0)) return false;
  if (!hasMeasuredCategory(outcome)) return false;
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

/** The fields `doctor` reads from each outcomes.jsonl line. */
type FileOutcomeFields = DistillerEligibilityInput & Pick<TaskOutcome, 'timestamp'>;

/**
 * Built on first use, not at module load: this module sits in an import cycle
 * through `strategy-distiller`, and `TaskOutcomeSchema` can still be
 * uninitialised when this file is evaluated.
 */
let fileFieldsSchema:
  | ReturnType<
      typeof TaskOutcomeSchema.pick<{
        source: true;
        cli: true;
        routedBy: true;
        durationMs: true;
        timestamp: true;
        categorySource: true;
      }>
    >
  | undefined;

function getFileFieldsSchema(): NonNullable<typeof fileFieldsSchema> {
  fileFieldsSchema ??= TaskOutcomeSchema.pick({
    source: true,
    cli: true,
    routedBy: true,
    durationMs: true,
    timestamp: true,
    categorySource: true,
  });
  return fileFieldsSchema;
}

function parseLine(line: string): FileOutcomeFields | undefined {
  try {
    const parsed = getFileFieldsSchema().safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parsed records of an outcomes JSONL file. A missing file yields none; a
 * blank line, a line that is not JSON, or one whose fields do not validate
 * (including an unrecognised `routedBy`) is skipped.
 */
function readOutcomeFields(filePath: string): FileOutcomeFields[] {
  if (!existsSync(filePath)) return [];
  const records: FileOutcomeFields[] = [];
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    if (line.trim().length === 0) continue;
    const fields = parseLine(line);
    if (fields !== undefined) records.push(fields);
  }
  return records;
}

/** Count eligible records in an outcomes JSONL file, for `doctor`. Read-only. */
export function countEligibleOutcomesInFile(filePath: string): number {
  return readOutcomeFields(filePath).filter(isDistillerEligible).length;
}

/** Routed-outcome counts for `doctor` (#6521): the routing loop's input rate. */
export interface RoutedOutcomeCounts {
  /** Records carrying `routedBy: 'composite-router'`, eligible or not. */
  readonly total: number;
  /** Of those, records whose timestamp parses and falls in the 7 days up to `nowMs`. */
  readonly last7Days: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Count routed records in an outcomes JSONL file (#6521). Read-only. A missing
 * file, or a store with no routed rows, is `{ total: 0, last7Days: 0 }`. A row
 * whose timestamp does not parse counts toward `total` only: nothing shows it
 * is recent.
 */
export function countRoutedOutcomesInFile(filePath: string, nowMs: number): RoutedOutcomeCounts {
  let total = 0;
  let last7Days = 0;
  for (const record of readOutcomeFields(filePath)) {
    if (record.routedBy !== 'composite-router') continue;
    total++;
    const at = Date.parse(record.timestamp);
    if (at > nowMs - WEEK_MS && at <= nowMs) last7Days++;
  }
  return { total, last7Days };
}
