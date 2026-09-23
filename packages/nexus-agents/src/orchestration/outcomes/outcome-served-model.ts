/**
 * The served model and its cost on an outcome row (#6624).
 *
 * Three outcome writers put a marker in `TaskOutcome.model` instead of the
 * model that ran: the pipeline stages (`pipeline`), orchestrate workers
 * (`worker-<role>`) and consensus seats (`consensus`). Readers group on those
 * markers (the weather report and the aorchestra learnings key workers by
 * role through them), so the markers stay, and the model that answered goes
 * in `servedModel` beside them, with its cost.
 *
 * The cost comes from {@link servedCostDetail}, the wrapper the vote rollup
 * uses, so a row prices a call the way the usage log does. An unpriced model
 * is recorded as `priceBasis: 'unknown'` with no `costUsd`: an unknown, not $0.
 *
 * @module orchestration/outcomes/outcome-served-model
 */

import { servedCostDetail } from '../../cli-adapters/budget-arm-cost.js';
import type { EndpointArmId } from '../../cli-adapters/types-core.js';
import { priceBasisOf } from '../../learning/usage-log.js';
import type { TaskOutcome } from './outcome-types.js';

/** What a writer knows about the call it is recording. */
export interface ServedCall {
  /** Model id the adapter reported serving the call; undefined when it reported none. */
  readonly model: string | undefined;
  /** Gateway arm that served the call, when a gateway model did. Prices by its declaration. */
  readonly gatewayArm?: EndpointArmId | undefined;
  /** Token counts the adapter reported; undefined when it reported none. */
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
}

/** The outcome fields {@link servedOutcomeFields} sets. */
type ServedOutcomeFields = Pick<TaskOutcome, 'servedModel' | 'costUsd' | 'priceBasis'>;

/**
 * The `servedModel`, `costUsd` and `priceBasis` fields for an outcome row.
 *
 * - No call, or no served model: no fields. There is nothing to attribute.
 * - A served model without both token counts: `servedModel` only. No price is
 *   looked up, so no basis is claimed and the cost stays unknown.
 * - Both token counts: the cost detail. `costUsd` is present only when a
 *   price was found; an unpriced model reads `priceBasis: 'unknown'`.
 */
export function servedOutcomeFields(call: ServedCall | undefined): ServedOutcomeFields {
  const model = call?.model;
  if (call === undefined || model === undefined || model.length === 0) return {};
  const { inputTokens, outputTokens } = call;
  if (inputTokens === undefined || outputTokens === undefined) return { servedModel: model };
  const detail = servedCostDetail(call.gatewayArm, model, inputTokens, outputTokens);
  return {
    servedModel: model,
    priceBasis: priceBasisOf(detail),
    ...(detail.priced && { costUsd: detail.costUsd }),
  };
}
