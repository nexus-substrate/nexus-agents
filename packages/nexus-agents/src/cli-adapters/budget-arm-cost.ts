/**
 * Per-arm cost estimation for the task-class cost ceiling (#4196, #4392) and
 * the per-task budget filter (#6393).
 *
 * Extracted from `budget-router.ts` for the file cap. The ceiling estimators
 * are fail-CLOSED: `undefined` means "cannot price", and the ceiling filter
 * excludes such a candidate rather than guessing. The budget estimator keeps
 * the conservative non-$0 fallback for CLI slots and vendor arms, and is
 * fail-closed for gateway arms only. {@link gatewayCostDetail} is the same
 * declaration read in the ledger's shape, for the telemetry writers (step 4).
 *
 * @module cli-adapters/budget-arm-cost
 */

import { computeTokenCost, roundToMicroUsd } from '../learning/token-cost-core.js';
import { computeCostDetail, type CostDetail } from '../learning/usage-log.js';
import type { CliName, EndpointArmId, ObservedArmId, RoutingArmId } from './types.js';
import { isCliName, observedArmDisplaySlot, routingArmDisplaySlot } from './types.js';
import { getGatewayServedSlot } from '../adapters/gateway-family-slots.js';
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
 * Mechanism A's single-model gateway arm and the env that pins the model it
 * dispatches to (`adapters/auto-adapter.ts` reads the same name). That arm
 * never gets a catalogue, so the env is the only model it can be priced at.
 */
const CUSTOM_OPENAI_ARM: EndpointArmId = 'api:custom-openai';
const CUSTOM_MODEL_ENV = 'NEXUS_CUSTOM_MODEL';

/**
 * The model bare `priced` prices `arm` at (#4392 increment 2, step 2): the
 * caller's `modelId`, else the head of the arm's registration-time catalogue,
 * else — for {@link CUSTOM_OPENAI_ARM} only — `NEXUS_CUSTOM_MODEL`. `undefined`
 * when none of those names a model, and the caller then fails CLOSED: until
 * #6404 the display slot stood in here, which priced a gateway at opencode's
 * default model — a number that measured nothing about the gateway.
 */
function gatewayPricingModel(
  arm: EndpointArmId,
  modelId: string | undefined,
  env: NodeJS.ProcessEnv
): string | undefined {
  const known = modelId ?? getGatewayCatalog(arm)?.[0];
  if (known !== undefined) return known;
  if (arm !== CUSTOM_OPENAI_ARM) return undefined;
  const pinned = env[CUSTOM_MODEL_ENV]?.trim();
  return pinned === undefined || pinned === '' ? undefined : pinned;
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
 * The gateway serving a CLI-slot arm right now (#6604 review, item 3), or
 * `undefined` for an arm that is not a slot or a slot its CLI serves. A
 * gateway-served slot is priced as its gateway is — by the `NEXUS_GATEWAY_COST`
 * declaration for the model that runs — never at the slot vendor's list
 * price; the arm is `undefined` when that model carries no gateway marker,
 * and the slot is then unpriced.
 */
function gatewayServedTarget(
  arm: ObservedArmId
): { readonly arm: EndpointArmId | undefined; readonly modelId: string } | undefined {
  return isCliName(arm) ? getGatewayServedSlot(arm) : undefined;
}

/**
 * Estimate the USD cost of a task on a routing ARM (#4392 increment 2). A
 * vendor arm or CLI slot is priced exactly as {@link estimateRegistryCostUsd}
 * prices its display slot. A GATEWAY arm is priced by its `NEXUS_GATEWAY_COST`
 * declaration: `free`/`local` → $0, `priced:<in>,<out>` → that flat rate, bare
 * `priced` → the registry rate of the model {@link gatewayPricingModel}
 * resolves. No model, an unpriced model and UNDECLARED are all `undefined`,
 * so a configured ceiling fails CLOSED on them — before this, an undeclared
 * gateway was silently priced as opencode's default model and slipped under
 * the ceiling, and until #6404 bare `priced` with no catalogue did the same.
 *
 * `arm` is any observed arm: a published {@link RoutingArmId} or a dynamic
 * `api:<endpoint>` arm (the voter gateway registers as one since step 2). A
 * CLI slot a gateway model serves is priced as that gateway (#6604).
 */
export function estimateArmCostUsd(
  arm: ObservedArmId,
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env,
  modelId?: string
): number | undefined {
  const served = gatewayServedTarget(arm);
  if (served !== undefined) {
    return served.arm === undefined
      ? undefined
      : estimateArmCostUsd(served.arm, inputTokens, outputTokens, env, served.modelId);
  }
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
  const model = gatewayPricingModel(arm, modelId, env);
  // Fail-CLOSED again: no model to price is not a licence to price the slot.
  if (model === undefined) return undefined;
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
  if (isGatewayArmId(arm) || gatewayServedTarget(arm) !== undefined) {
    return estimateArmCostUsd(arm, inputTokens, outputTokens, env);
  }
  return estimateCost(routingArmDisplaySlot(arm), inputTokens, outputTokens);
}

/**
 * Why {@link estimateBudgetArmCostUsd} returned `undefined` for `arm`, as the
 * reason carried on `BudgetRoutingResult.unpricedArms` and the log line.
 * Only a gateway arm can be unpriced there (the conservative fallback always
 * prices the rest), and only in three ways: no usable declaration (`unset`,
 * `invalid (…)`, `undeclared for …` — {@link gatewayCostGap}); bare `priced`
 * with no model to price (#6404 — no `modelId`, no catalogue, and no
 * `NEXUS_CUSTOM_MODEL` for `api:custom-openai`); or bare `priced` on a model
 * the registry cannot price.
 */
export function describeUnpricedArm(
  arm: ObservedArmId,
  env: NodeJS.ProcessEnv = process.env,
  modelId?: string
): string {
  const served = gatewayServedTarget(arm);
  if (served !== undefined) {
    return served.arm === undefined
      ? `slot served by gateway model ${served.modelId}, which carries no gateway arm to price by`
      : describeUnpricedArm(served.arm, env, served.modelId);
  }
  const gap = gatewayCostGap(arm, env);
  if (gap !== undefined) return `gateway cost ${gap}`;
  const model = isGatewayArmId(arm) ? gatewayPricingModel(arm, modelId, env) : undefined;
  if (model === undefined) {
    return `gateway cost priced without a catalogue or model: declare priced:<in>,<out> or set ${CUSTOM_MODEL_ENV}`;
  }
  return `gateway cost priced at registry rates, but ${model} has no registry pricing`;
}

/**
 * The cost a TELEMETRY WRITER records for one call a gateway served (#4392
 * increment 2, step 4) — the usage log (`withUsageRecording`) and the
 * per-decision vote rollup (`votesToCostInputs`). Both used to price the
 * MODEL id alone via {@link computeCostDetail}, so a `claude-*` id answered by
 * an undeclared gateway recorded Anthropic's list price as `priced: true`: a
 * measurement of nothing, and exactly the row a billing spot-check trusts.
 *
 * Priced by the arm's `NEXUS_GATEWAY_COST` declaration, mirroring
 * {@link estimateArmCostUsd} but in the ledger's `CostDetail` shape:
 *
 * - UNDECLARED (unset, invalid, no entry for this arm — or an endpoint that is
 *   not a gateway arm at all) → `{ costUsd: 0, priced: false }`, the documented
 *   UNMEASURED sentinel (`priceBasisOf` → `'unknown'`), never $0-as-measured.
 * - `free` / `local` → a MEASURED $0; `priced:<in>,<out>` → the flat rate,
 *   micro-USD rounded like every ledger figure. `resolvedId` is the ARM: the
 *   declaration, not a registry entry, is what supplied the number.
 * - bare `priced` → {@link computeCostDetail} on the model that answered; a
 *   model the registry cannot price stays unpriced, as it always did. A
 *   writer that holds no model id (the routing observer, #6399) passes
 *   `undefined`, and bare `priced` is then UNMEASURED too — there is nothing
 *   to look up, and the display slot is not a substitute (#6404).
 */
export function gatewayCostDetail(
  arm: EndpointArmId,
  modelId: string | undefined,
  inputTokens: number,
  outputTokens: number,
  env: NodeJS.ProcessEnv = process.env
): CostDetail {
  const unmeasured: CostDetail = { costUsd: 0, priced: false, resolvedId: modelId ?? arm };
  const declaration = resolveGatewayCostDeclaration(arm, env);
  if (declaration === undefined) return unmeasured;
  const rates = gatewayCostRates(declaration);
  if (rates === 'registry') {
    return modelId === undefined
      ? unmeasured
      : computeCostDetail(modelId, inputTokens, outputTokens);
  }
  const { costUsd } = computeTokenCost({ input: inputTokens, output: outputTokens }, rates);
  return { costUsd: roundToMicroUsd(costUsd), priced: true, resolvedId: arm };
}
