/** Actual-model profiles and criteria for CompositeRouter's existing ranking stages. */
import { ModelToCliAdapter } from './model-to-cli-adapter.js';
import { gatewayServedSlotOf } from './gateway-slot-arm.js';
import { ceilingCostOfArm, estimateArmCostUsd } from './budget-arm-cost.js';
import {
  buildTopsisProfileForModel,
  getDefaultModelForGoogleApi,
} from '../config/model-config-helpers.js';
import type { KeyedTopsisProfile } from './topsis-helpers.js';
import type { RoutingArmId, ICliAdapter } from './types.js';
import { routingArmCliSlot } from './types.js';
import {
  getDefaultTopsisProfiles,
  DEFAULT_TOPSIS_CRITERIA,
  PLAN_BILLING_TOPSIS_CRITERIA,
  applyDifficultyCostWeighting,
  getCriteriaForTaskCategory,
} from './topsis-types.js';
import { TopsisRouter } from './topsis-router.js';
import type { BillingMode } from '../mcp/tools/delegate-to-model-types.js';
function pricedRate(rate: number | undefined): rate is number {
  return rate !== undefined && Number.isFinite(rate) && rate >= 0;
}
/** Selected instance metadata, without treating a display slot as a model. */
function actualModel(arm: RoutingArmId, adapter?: ICliAdapter): string | undefined {
  const gateway = gatewayServedSlotOf(adapter);
  if (gateway !== undefined) return gateway.modelId;
  if (adapter instanceof ModelToCliAdapter) return adapter.getModelInfo().id;
  return arm === 'api:google' ? getDefaultModelForGoogleApi() : undefined;
}

/** Bind a profile to the actual arm/model; unknown API rates or quality remain unmeasured. */
export function profileForArm(
  arm: RoutingArmId,
  adapter?: ICliAdapter
): KeyedTopsisProfile<RoutingArmId> | undefined {
  const slot = routingArmCliSlot(arm);
  if (slot === undefined) return undefined;
  const model = actualModel(arm, adapter);
  if (model === undefined) {
    const profile = getDefaultTopsisProfiles().find((p) => p.cliName === slot);
    return profile === undefined ? undefined : { ...profile, cliName: arm };
  }
  const input =
    adapter === undefined
      ? estimateArmCostUsd(arm, 1_000_000, 0)
      : ceilingCostOfArm({ arm, adapter }, 1_000_000, 0);
  const output =
    adapter === undefined
      ? estimateArmCostUsd(arm, 0, 1_000_000)
      : ceilingCostOfArm({ arm, adapter }, 0, 1_000_000);
  if (!pricedRate(input) || !pricedRate(output)) return undefined;
  const profile = buildTopsisProfileForModel(slot, model, { input, output });
  return profile === undefined ? undefined : { ...profile, cliName: arm };
}

/** Returns a TopsisRouter with task-category-aware criteria (#1491) and
 * difficulty-conditional quality/cost weighting (#4196).
 * Difficulty conditioning is api-mode ONLY: plan mode zeroes the cost weight
 * already, so conditioning there would be a silent no-op — plan mode instead
 * emits an explicit routing-decision annotation (see buildReason).
 * Only creates a new router when the criteria differ from the billing-mode default. */
export function selectTopsisRouter(
  router: TopsisRouter,
  billingMode: BillingMode,
  taskType?: string,
  reasoningComplexity?: number
): TopsisRouter {
  const mode = billingMode === 'plan' ? 'plan' : 'api';
  const defaultCriteria = mode === 'plan' ? PLAN_BILLING_TOPSIS_CRITERIA : DEFAULT_TOPSIS_CRITERIA;
  const base =
    taskType !== undefined ? getCriteriaForTaskCategory(taskType, mode) : defaultCriteria;
  // #4196: condition the quality/cost split on the canonical SharedTaskAnalyzer
  // complexity (TaskProfile.reasoningComplexity). Mid-band complexity returns
  // the same reference, keeping the default path byte-identical.
  const criteria =
    mode === 'api' && reasoningComplexity !== undefined
      ? applyDifficultyCostWeighting(base, reasoningComplexity)
      : base;
  // Only create a new router when the effective criteria differ from default
  if (criteria !== defaultCriteria) return new TopsisRouter({ criteria });
  if (mode === 'plan') return new TopsisRouter({ criteria: PLAN_BILLING_TOPSIS_CRITERIA });
  return router;
}
