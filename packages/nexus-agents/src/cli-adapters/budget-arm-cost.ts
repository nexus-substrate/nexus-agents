/**
 * Per-arm cost estimation for the task-class cost ceiling (#4196, #4392) and
 * the per-task budget filter (#6393).
 *
 * Extracted from `budget-router.ts` for the file cap. The ceiling estimators
 * are fail-CLOSED: `undefined` means "cannot price", and the ceiling filter
 * excludes such a candidate rather than guessing. The budget estimator keeps
 * the conservative non-$0 fallback for CLI slots and vendor arms, and is
 * fail-closed for gateway arms only.
 *
 * @module cli-adapters/budget-arm-cost
 */

import { computeTokenCost } from '../learning/token-cost-core.js';
import type { CliName, EndpointArmId, ObservedArmId, RoutingArmId } from './types.js';
import { observedArmDisplaySlot, routingArmDisplaySlot } from './types.js';
import { estimateCost } from './budget-utils.js';
import { getDefaultModelForCli, getModelPricing } from '../config/model-config-helpers.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import {
  gatewayCostGap,
  gatewayCostRates,
  isGatewayArmId,
  resolveGatewayCostDeclaration,
} from '../adapters/sdk/gateway-cost.js';
import { getGatewayCatalog } from '../adapters/sdk/gateway-catalog.js';

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
 * The model bare `priced` prices `arm` at (#4392 increment 2, step 2): the
 * caller's `modelId`, else the head of the arm's registration-time catalogue.
 * `undefined` when the arm has no catalogue — the pre-step-2 display-slot
 * path stays for that case rather than inventing a model.
 */
function gatewayPricingModel(arm: EndpointArmId, modelId: string | undefined): string | undefined {
  return modelId ?? getGatewayCatalog(arm)?.[0];
}

/**
 * Registry price of a gateway model for bare `priced`. Resolves aliases the
 * way every other pricing read does (`getDefaultRegistry().getEntry`), and is
 * fail-CLOSED: a model the registry cannot price is `undefined`, never $0 and
 * never the display slot's rate.
 */
function estimateGatewayModelCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const pricing = getDefaultRegistry().getEntry(modelId).pricing;
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
 * `priced` → the registry rate of `modelId`, else of the first model in the
 * arm's catalogue (step 2), else — no catalogue — of the display slot as
 * before. An unpriced model and UNDECLARED are both `undefined`, so a
 * configured ceiling fails CLOSED on them — before this, an undeclared gateway
 * was silently priced as opencode's default model and slipped under the ceiling.
 *
 * `arm` is any observed arm: a published {@link RoutingArmId} or a dynamic
 * `api:<endpoint>` arm (the voter gateway registers as one since step 2).
 */
export function estimateArmCostUsd(
  arm: ObservedArmId,
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env,
  modelId?: string
): number | undefined {
  if (!isGatewayArmId(arm)) {
    return estimateRegistryCostUsd(observedArmDisplaySlot(arm), inputTokens, outputTokens);
  }
  const declaration = resolveGatewayCostDeclaration(arm, env);
  // Fail-CLOSED sentinel, deliberately `undefined` and never $0: a $0 always
  // passes a ceiling, which is the misreport this declaration exists to end.
  if (declaration === undefined) return undefined;
  const rates = gatewayCostRates(declaration);
  if (rates !== 'registry') {
    return computeTokenCost({ input: inputTokens, output: outputTokens }, rates).costUsd;
  }
  const model = gatewayPricingModel(arm, modelId);
  if (model === undefined) {
    return estimateRegistryCostUsd(observedArmDisplaySlot(arm), inputTokens, outputTokens);
  }
  return estimateGatewayModelCostUsd(model, inputTokens, outputTokens);
}

/**
 * Estimate the USD cost of a task on a routing ARM for the per-task budget
 * filter (`checkBudget`, #6393). Two policies, deliberately named here so
 * neither can be swapped for the other by accident (#5122):
 *
 * - A CLI slot or vendor arm keeps `estimateCost`'s CONSERVATIVE non-$0
 *   fallback (#4168): a number is always returned, and the numbers are the
 *   ones the budget filter reported before this function existed.
 * - A GATEWAY arm is priced by its `NEXUS_GATEWAY_COST` declaration exactly
 *   as {@link estimateArmCostUsd} prices it, so UNDECLARED is `undefined`
 *   and the caller must treat it as NOT within budget. Before this the
 *   gateway took the first branch — a gateway adapter's display `name` is its
 *   slot — and an undeclared `api:custom-openai` was admitted under
 *   `maxCostUsd` at opencode's default model rate, a number that measured
 *   nothing.
 */
export function estimateBudgetArmCostUsd(
  arm: RoutingArmId,
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  if (isGatewayArmId(arm)) return estimateArmCostUsd(arm, inputTokens, outputTokens, env);
  return estimateCost(routingArmDisplaySlot(arm), inputTokens, outputTokens);
}

/**
 * Why {@link estimateBudgetArmCostUsd} returned `undefined` for `arm`, as the
 * reason carried on `BudgetRoutingResult.unpricedArms` and the log line.
 * Only a gateway arm can be unpriced there (the conservative fallback always
 * prices the rest), and only in two ways: no usable declaration (`unset`,
 * `invalid (…)`, `undeclared for …` — {@link gatewayCostGap}), or bare
 * `priced` on a model the registry cannot price — `modelId`, else the arm's
 * catalogue head, else (no catalogue) its display slot.
 */
export function describeUnpricedArm(
  arm: ObservedArmId,
  env: NodeJS.ProcessEnv = process.env,
  modelId?: string
): string {
  const gap = gatewayCostGap(arm, env);
  if (gap !== undefined) return `gateway cost ${gap}`;
  const model = isGatewayArmId(arm) ? gatewayPricingModel(arm, modelId) : undefined;
  const subject = model ?? observedArmDisplaySlot(arm);
  return `gateway cost priced at registry rates, but ${subject} has no registry pricing`;
}
