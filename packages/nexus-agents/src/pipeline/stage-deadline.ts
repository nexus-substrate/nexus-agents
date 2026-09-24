/**
 * Per-stage deadline resolution shared by both pipeline runners (#6730, #6736).
 *
 * `run_pipeline` (graph executor) and `run_dev_pipeline` (`runDevPipeline`)
 * both accept `timeoutMs` as a deadline for EACH stage. They resolve it the
 * same way: an explicit value applies to every stage, a panel stage otherwise
 * gets the `multi-llm-panel` class guard, and every result is clamped to the
 * `pipeline` class guard. Only the default for a non-panel stage differs by
 * runner, so the caller passes it.
 *
 * @module pipeline/stage-deadline
 */

import { resolveClassGuardMs } from '../config/timeouts.js';

/**
 * Stages that run a multi-voter panel. Their default deadline is the panel's
 * own runaway-guard, not a generic stage default: a full 7-seat vote took
 * 190 s live, and the graph default is 120 s (#6730).
 */
const PANEL_STAGE_IDS: ReadonlySet<string> = new Set(['vote']);

/**
 * The deadline one stage runs under.
 *
 * An explicit `stageTimeoutMs` applies to every stage, the vote included.
 * Without one, a panel stage gets the `multi-llm-panel` class guard (which is
 * above `VOTE_TIMEOUTS.defaultMs`, and above the consensus engine's own overall
 * deadline, so the engine returns partial results before this guard fires) and
 * every other stage gets `otherStageDefaultMs`. Either way the result is
 * clamped to the `pipeline` class guard: no stage may outlive the run.
 */
export function resolveStageTimeoutMs(
  stageId: string,
  stageTimeoutMs: number | undefined,
  otherStageDefaultMs: number
): number {
  const stageDefault = PANEL_STAGE_IDS.has(stageId)
    ? resolveClassGuardMs('multi-llm-panel')
    : otherStageDefaultMs;
  return Math.min(stageTimeoutMs ?? stageDefault, resolveClassGuardMs('pipeline'));
}
