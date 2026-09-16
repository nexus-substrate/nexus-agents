/**
 * Gateway model catalogue (#4392 increment 2, step 2).
 *
 * A gateway registers as ONE `api:<endpoint>` arm fronting every model it
 * lists (`adapters/gateway-arm-adapter.ts`), so the arm id alone cannot say
 * which model a request will hit. The catalogue is the registration-time
 * record of what the arm fronts, keyed by arm id, and it exists for one
 * consumer: bare `priced` in `NEXUS_GATEWAY_COST` defers to REGISTRY pricing,
 * and `estimateArmCostUsd` needs a model to look up — before this it priced
 * the arm's display slot (opencode's default model), a number that measured
 * nothing about the gateway.
 *
 * Process-wide by design, like the adapter registry that holds the arm: set
 * once at server bootstrap (`cli-server-gateway.ts` `registerGatewayArm`),
 * read by the cost estimators, cleared when the arm is disposed. Absent is a
 * real value — "no catalogue" keeps the display-slot path — so a missing
 * entry is never synthesised.
 *
 * @module adapters/sdk/gateway-catalog
 */

import type { EndpointArmId } from '../../cli-adapters/types-core.js';

const catalogs = new Map<EndpointArmId, readonly string[]>();

/**
 * Record the model ids `arm` fronts, in the gateway's listing order (the
 * first is the arm's delegate and the default pricing model). Replaces an
 * earlier catalogue for the same arm, mirroring `registerApiArm`. Throws on an
 * empty list: an empty catalogue is not a catalogue, and storing one would
 * make `catalog[0]` an undefined pricing key.
 */
export function setGatewayCatalog(arm: EndpointArmId, modelIds: readonly string[]): void {
  if (modelIds.length === 0) {
    throw new Error(
      `Gateway catalogue for ${arm} is empty; an arm with no model is not registrable`
    );
  }
  catalogs.set(arm, [...modelIds]);
}

/** The model ids `arm` fronts, or `undefined` when no catalogue was set for it. */
export function getGatewayCatalog(arm: EndpointArmId): readonly string[] | undefined {
  return catalogs.get(arm);
}

/**
 * Forget `arm`'s catalogue. Called by the arm adapter's `dispose()`, so the
 * catalogue lives exactly as long as the arm it describes (#6403 review).
 * Absent is already a real value here, so clearing an unknown arm is a no-op.
 */
export function clearGatewayCatalog(arm: EndpointArmId): void {
  catalogs.delete(arm);
}

/** Test-only: forget every catalogue so suites do not leak into each other. */
export function _resetGatewayCatalogs(): void {
  catalogs.clear();
}
