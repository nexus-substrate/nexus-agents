/**
 * The served model and its cost on an outcome row (#6624).
 *
 * Three outcome writers put a marker in `TaskOutcome.model` instead of the
 * model that ran: the pipeline stages (`pipeline`), orchestrate workers
 * (`worker-<role>`) and consensus seats (`consensus`). These legacy markers
 * remain unchanged. An admitted upstream model report is recorded separately
 * in `servedModel`, with its cost when pricing is available.
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
type ServedOutcomeFields = Pick<
  TaskOutcome,
  'servedModel' | 'costUsd' | 'priceBasis' | 'gatewayArm'
>;

/**
 * The `servedModel`, `costUsd`, `priceBasis` and `gatewayArm` fields for an outcome row.
 *
 * - No call: no fields. No admitted model: only an independently known gateway arm;
 *   no serving identity or price is inferred from the arm or its declaration.
 * - A served model without both token counts: `servedModel` (and `gatewayArm` if
 *   present). No price is looked up, so no basis is claimed and the cost stays unknown.
 * - Both token counts: the cost detail and `gatewayArm`. `costUsd` is present only
 *   when a price was found; an unpriced model reads `priceBasis: 'unknown'`.
 */
export function servedOutcomeFields(call: ServedCall | undefined): ServedOutcomeFields {
  if (call === undefined) return {};
  const { model, inputTokens, outputTokens, gatewayArm } = call;
  const gatewayArmField = gatewayArm !== undefined ? { gatewayArm } : {};
  if (model === undefined || model.length === 0) return gatewayArmField;
  if (inputTokens === undefined || outputTokens === undefined) {
    return { servedModel: model, ...gatewayArmField };
  }
  const detail = servedCostDetail(gatewayArm, model, inputTokens, outputTokens);
  return {
    servedModel: model,
    ...gatewayArmField,
    priceBasis: priceBasisOf(detail),
    ...(detail.priced && { costUsd: detail.costUsd }),
  };
}
