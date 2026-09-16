/**
 * Per-arm cost estimation for the task-class cost ceiling (#4196, #4392).
 *
 * Extracted from `budget-router.ts` for the file cap. Both estimators are
 * fail-CLOSED: `undefined` means "cannot price", and the ceiling filter
 * excludes such a candidate rather than guessing.
 *
 * @module cli-adapters/budget-arm-cost
 */

import { computeTokenCost } from '../learning/token-cost-core.js';
import type { CliName, RoutingArmId } from './types.js';
import { routingArmDisplaySlot } from './types.js';
import { getDefaultModelForCli, getModelPricing } from '../config/model-config-helpers.js';
import {
  gatewayCostRates,
  isGatewayArmId,
  resolveGatewayCostDeclaration,
} from '../adapters/sdk/gateway-cost.js';

/**
 * Estimate the USD cost of a task on a CLI slot using CANONICAL registry
 * pricing (#4165 path: `ModelEntry.pricing` of the slot's default model).
 * Returns `undefined` when the registry has no pricing for the model, so the
 * caller can fail CLOSED on a configured ceiling (#4196 BINDING condition).
 * This deliberately differs from `resolveCliCostPer1M` (#4168), which returns
 * a conservative non-$0 fallback for budget FILTERING — here an unknown price
 * must stay `undefined` to preserve the ceiling's fail-CLOSED guarantee.
 */
export function estimateRegistryCostUsd(
  slot: CliName,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const pricing = getModelPricing(getDefaultModelForCli(slot));
  // Fail-CLOSED, and deliberately different from `resolveCliCostPer1M`'s
  // conservative fallback (#4168 vs #4196). Both policies are named at their
  // own call site precisely so neither can be swapped for the other by
  // accident; only the arithmetic is shared (#5122).
  if (pricing === undefined) return undefined;
  return computeTokenCost(
    { input: inputTokens, output: outputTokens },
    { inputPer1M: pricing.inputPer1M, outputPer1M: pricing.outputPer1M }
  ).costUsd;
}

/**
 * Estimate the USD cost of a task on a routing ARM (#4392 increment 2). A
 * vendor arm or CLI slot is priced exactly as {@link estimateRegistryCostUsd}
 * prices its display slot. A GATEWAY arm is priced by its `NEXUS_GATEWAY_COST`
 * declaration: `free`/`local` → $0, `priced:<in>,<out>` → that flat rate, bare
 * `priced` → the display slot's registry rate (per-model gateway arms are
 * step 2). UNDECLARED → `undefined`, so a configured ceiling fails CLOSED on
 * it — before this, an undeclared gateway was silently priced as opencode's
 * default model and slipped under the ceiling.
 */
export function estimateArmCostUsd(
  arm: RoutingArmId,
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  if (!isGatewayArmId(arm)) {
    return estimateRegistryCostUsd(routingArmDisplaySlot(arm), inputTokens, outputTokens);
  }
  const declaration = resolveGatewayCostDeclaration(arm, env);
  // Fail-CLOSED sentinel, deliberately `undefined` and never $0: a $0 always
  // passes a ceiling, which is the misreport this declaration exists to end.
  if (declaration === undefined) return undefined;
  const rates = gatewayCostRates(declaration);
  if (rates === 'registry') {
    return estimateRegistryCostUsd(routingArmDisplaySlot(arm), inputTokens, outputTokens);
  }
  return computeTokenCost({ input: inputTokens, output: outputTokens }, rates).costUsd;
}
